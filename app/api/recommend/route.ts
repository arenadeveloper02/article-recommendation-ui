import { NextRequest, NextResponse } from 'next/server';
import type { StreamEvent } from '@/lib/types';
import { stripSentinelTokens, unwrapJsonString } from '@/lib/modelOutput';
import { decodeDisplayText } from '@/lib/textDecode';
import { getArenaEmailId } from '@/lib/arena-email';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const WORKFLOW_ENDPOINT =
  'https://agent.thearena.ai/api/workflows/09e8e4e6-4b9c-4126-95f2-cbfcfd025f63/execute';
const WORKFLOW_API_KEY = 'sk-sim-Vk9yj3QfVSZxJ8lulZTYK549u5ThZo9u';

const TEXT_KEYS = ['chunk', 'content', 'text', 'output', 'answer', 'result', 'message'];
const SSE_FIELD_PATTERN = /^(?:data|event|id|retry):|^:/;

/** Matches standalone completion sentinels sent as their own frame payload. */
const SENTINEL_ONLY_PATTERN = /^\[?\s*(?:DONE|END|EOS|EOF|STOP|COMPLETE|FINISHED)\s*\]?$/i;

/**
 * UNICODE DECODING: this route previously used its own weaker local decoder
 * (max two passes, at most two leading backslashes per escape). Deeply
 * double/triple-escaped upstream payloads therefore leaked literal \uXXXX
 * sequences (\u201c, \u201d, \u2018, \u2019, \u2026, \u2013, \u2014 \u2026) into the streamed
 * frames the loading view renders. The route now delegates ALL decoding to
 * the single shared, generic decoder in lib/textDecode.ts (decodeDisplayText),
 * the same one used by /api/generate, /api/history and every client surface,
 * so streamed chunks, non-streamed JSON, and status frames are all decoded
 * identically before any text leaves the server. The client additionally
 * re-runs the same decoder on the accumulated stream as defense in depth.
 */

/** Heuristic detection of heartbeat/progress messages that must not pollute the answer. */
function isStatusMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 220) return false;
  return (
    /usually takes/i.test(trimmed) ||
    /\d+\s*s(?:ec(?:ond)?s?)?\s+elapsed/i.test(trimmed) ||
    /still (?:working|processing|thinking|running)/i.test(trimmed) ||
    /please wait|hang tight|working on it|processing your request|heartbeat|keep-?alive|almost (?:there|done)/i.test(
      trimmed
    )
  );
}

function isStatusEvent(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const candidates = [record.type, record.event, record.kind];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && /status|heartbeat|progress|ping|keep-?alive/i.test(candidate)) {
      return true;
    }
  }
  return false;
}

function pickStreamText(value: unknown, depth: number): string | null {
  if (depth > 6 || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = pickStreamText(item, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of TEXT_KEYS) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  for (const nested of Object.values(record)) {
    if (nested !== null && typeof nested === 'object') {
      const found = pickStreamText(nested, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

function collectStrings(value: unknown, acc: string[], depth: number): void {
  if (depth > 12) return;
  if (typeof value === 'string') {
    acc.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, acc, depth + 1);
    }
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectStrings(nested, acc, depth + 1);
    }
  }
}

function looksLikeMarkdownContent(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 80) return false;
  const hasHeading = /(^|\n)#{1,6}\s+\S/.test(trimmed) || /\*\*[^*]+\*\*/.test(trimmed);
  const hasContentSignals = /H2|H3|Recommendation|Content Brief|Target Keyword|Outline|Article/i.test(trimmed);
  return hasHeading || hasContentSignals;
}

function extractLongestContent(payload: unknown): string | null {
  const strings: string[] = [];
  collectStrings(payload, strings, 0);
  if (strings.length === 0) return null;
  const markdownCandidates = strings.filter(looksLikeMarkdownContent);
  const pool =
    markdownCandidates.length > 0 ? markdownCandidates : strings.filter((s) => s.trim().length > 200);
  if (pool.length === 0) return null;
  return pool.reduce((longest, current) => (current.length > longest.length ? current : longest));
}

export async function POST(request: NextRequest): Promise<Response> {
  let keyword = '';
  let client = '';

  try {
    const body = (await request.json()) as { keyword?: unknown; client?: unknown };
    keyword = typeof body.keyword === 'string' ? body.keyword.trim() : '';
    client = typeof body.client === 'string' ? body.client.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!keyword) {
    return NextResponse.json({ error: 'A target keyword is required.' }, { status: 400 });
  }
  if (!client) {
    return NextResponse.json({ error: 'A client or brand name is required.' }, { status: 400 });
  }

  // Email from the Arena session (set by middleware from ?emailId= into the
  // httpOnly cookie). Forwarded to the workflow per the updated API contract.
  const email = (await getArenaEmailId()) ?? '';

  try {
    const upstream = await fetch(WORKFLOW_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-API-Key': WORKFLOW_API_KEY,
        'Content-Type': 'application/json',
      },
      // Updated API contract: stream disabled and NO selectedOutputs \u2014 the
      // workflow returns the full result as plain JSON. The SSE branch below
      // is kept purely as a defensive fallback should the upstream ever
      // respond with an event stream anyway.
      body: JSON.stringify({
        keyword,
        client,
        email,
        stream: false,
      }),
      cache: 'no-store',
    });

    if (!upstream.ok) {
      const rawText = await upstream.text();
      return NextResponse.json(
        {
          error: `The recommendation service returned an error (status ${upstream.status}). ${rawText.slice(0, 300)}`,
        },
        { status: 502 }
      );
    }

    const upstreamType = upstream.headers.get('content-type') ?? '';

    // Non-streamed JSON path (the expected path with stream:false): extract the
    // best content string and return plain JSON.
    // ORDER MATTERS: unwrapJsonString first (JSON.parse natively decodes
    // escapes in double-stringified payloads), THEN the shared generic
    // multi-pass decoder (any escape, any nesting depth), THEN sentinel
    // stripping so completion markers never reach the UI.
    if (!upstreamType.includes('text/event-stream') || !upstream.body) {
      const rawText = await upstream.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = rawText;
      }
      const extracted =
        extractLongestContent(parsed) ??
        (typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2));
      return NextResponse.json({
        content: stripSentinelTokens(decodeDisplayText(unwrapJsonString(extracted))),
      });
    }

    const reader = upstream.body.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let buffer = '';
        let sawSse = false;
        // Holds a trailing PARTIAL escape sequence so escapes split across two
        // stream chunks are decoded server-side instead of leaking raw.
        let contentCarry = '';

        const send = (event: StreamEvent): void => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        const flushCarry = (): void => {
          if (!contentCarry) return;
          const decoded = stripSentinelTokens(decodeDisplayText(contentCarry));
          contentCarry = '';
          if (decoded) send({ type: 'content', text: decoded });
        };

        const emitText = (text: string, forceStatus: boolean): void => {
          if (!text) return;
          const probe = decodeDisplayText(text);
          if (forceStatus || isStatusMessage(probe)) {
            const statusText = stripSentinelTokens(probe).trim();
            if (statusText) send({ type: 'status', text: statusText });
            return;
          }
          const combined = contentCarry + text;
          contentCarry = '';
          let emitPart = combined;
          const tail = combined.match(/\\+(?:u[0-9a-fA-F]{0,3})?$/);
          if (tail && typeof tail.index === 'number' && combined.length - tail.index <= 6) {
            contentCarry = combined.slice(tail.index);
            emitPart = combined.slice(0, tail.index);
          }
          if (!emitPart) return;
          const decoded = stripSentinelTokens(decodeDisplayText(emitPart));
          if (decoded) send({ type: 'content', text: decoded });
        };

        const processData = (data: string): void => {
          const trimmed = data.trim();
          if (!trimmed || SENTINEL_ONLY_PATTERN.test(trimmed)) return;
          let parsed: unknown = null;
          let parsedOk = false;
          try {
            parsed = JSON.parse(trimmed);
            parsedOk = true;
          } catch {
            parsedOk = false;
          }
          if (parsedOk && typeof parsed === 'string') {
            emitText(unwrapJsonString(parsed), false);
            return;
          }
          if (parsedOk && parsed !== null && typeof parsed === 'object') {
            const text = pickStreamText(parsed, 0);
            if (text !== null) {
              emitText(unwrapJsonString(text), isStatusEvent(parsed));
            }
            return;
          }
          emitText(data, false);
        };

        const processEventBlock = (block: string): void => {
          const lines = block.split('\n');
          const dataLines = lines
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).replace(/^ /, ''));
          if (dataLines.length > 0) {
            sawSse = true;
            processData(dataLines.join('\n'));
            return;
          }
          if (!sawSse && block.trim() && !SSE_FIELD_PATTERN.test(block.trim())) {
            emitText(block, false);
          }
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let separatorIndex = buffer.indexOf('\n\n');
            while (separatorIndex !== -1) {
              const block = buffer.slice(0, separatorIndex);
              buffer = buffer.slice(separatorIndex + 2);
              processEventBlock(block);
              separatorIndex = buffer.indexOf('\n\n');
            }
          }
          buffer += decoder.decode();
          if (buffer.trim()) {
            processEventBlock(buffer);
          }
          flushCarry();
          send({ type: 'done' });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'The stream was interrupted.';
          send({ type: 'error', text: message });
        } finally {
          controller.close();
        }
      },
      cancel() {
        void reader.cancel();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unexpected error while contacting the recommendation service.';
    return NextResponse.json(
      { error: `Could not reach the recommendation service: ${message}` },
      { status: 500 }
    );
  }
}
