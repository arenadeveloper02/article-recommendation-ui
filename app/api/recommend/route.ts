import { NextRequest, NextResponse } from 'next/server';
import type { StreamEvent } from '@/lib/types';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const WORKFLOW_ENDPOINT =
  'https://test-agent.thearena.ai/api/workflows/22222756-700a-464c-b643-a8c11e92e64b/execute';
const WORKFLOW_API_KEY = 'sk-sim-amPAyUKDZNygmERaDmxwJBgkMabZvYXr';

const TEXT_KEYS = ['chunk', 'content', 'text', 'output', 'answer', 'result', 'message'];
const SSE_FIELD_PATTERN = /^(?:data|event|id|retry):|^:/;

/**
 * Decodes raw literal unicode escape sequences (e.g. \u2013) and common escaped
 * whitespace so they are never shown to the user as literal text.
 */
function decodeEscapedText(input: string): string {
  if (!input.includes('\\')) return input;
  return input
    .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\n')
    .replace(/\\"/g, '"');
}

/**
 * Unwraps double-stringified payloads: if a value that was already JSON.parse'd
 * is STILL a quoted JSON string (the upstream stringified it twice), parse it
 * again until we reach the plain text. This is the root fix for escaped output
 * like `\u201cdental implants\u201d \u00b7 client \u201c42 North Dental\u201d`
 * appearing in the UI.
 */
function unwrapJsonString(text: string): string {
  let current = text.trim();
  for (let i = 0; i < 3; i += 1) {
    if (current.length < 2 || !current.startsWith('"') || !current.endsWith('"')) break;
    try {
      const parsed = JSON.parse(current) as unknown;
      if (typeof parsed !== 'string') break;
      current = parsed.trim();
    } catch {
      break;
    }
  }
  return current;
}

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

  try {
    const upstream = await fetch(WORKFLOW_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-API-Key': WORKFLOW_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ keyword, client, stream: true }),
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

    // Non-streamed JSON fallback: extract the best content string and return plain JSON.
    // unwrapJsonString handles the double-stringified case where the extracted value
    // is itself a JSON-encoded string full of \uXXXX escapes.
    if (upstreamType.includes('application/json') || !upstream.body) {
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
      return NextResponse.json({ content: decodeEscapedText(unwrapJsonString(extracted)) });
    }

    const reader = upstream.body.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let buffer = '';
        let sawSse = false;

        const send = (event: StreamEvent): void => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        const emitText = (text: string, forceStatus: boolean): void => {
          const decoded = decodeEscapedText(text);
          if (!decoded) return;
          if (forceStatus || isStatusMessage(decoded)) {
            const statusText = decoded.trim();
            if (statusText) send({ type: 'status', text: statusText });
            return;
          }
          send({ type: 'content', text: decoded });
        };

        const processData = (data: string): void => {
          const trimmed = data.trim();
          if (!trimmed || trimmed === '[DONE]') return;
          let parsed: unknown = null;
          let parsedOk = false;
          try {
            parsed = JSON.parse(trimmed);
            parsedOk = true;
          } catch {
            parsedOk = false;
          }
          if (parsedOk && typeof parsed === 'string') {
            // The frame payload was a JSON string; it may STILL be a JSON-encoded
            // string if the upstream stringified twice — unwrap before emitting.
            emitText(unwrapJsonString(parsed), false);
            return;
          }
          if (parsedOk && parsed !== null && typeof parsed === 'object') {
            const text = pickStreamText(parsed, 0);
            if (text !== null) {
              // Same double-stringify guard for text fields nested inside objects.
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
          const nonEmpty = lines.filter((line) => line.trim() !== '');
          const isSseMeta = nonEmpty.length > 0 && nonEmpty.every((line) => SSE_FIELD_PATTERN.test(line));
          if (isSseMeta) {
            sawSse = true;
            return;
          }
          if (!sawSse && block.trim()) {
            // Raw chunked text stream: keep paragraph breaks intact.
            emitText(`${block}\n\n`, false);
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
            // Progressive flush for raw (non-SSE) text streams without blank lines.
            if (!sawSse && !buffer.includes('data:') && buffer.length > 512) {
              emitText(buffer, false);
              buffer = '';
            }
          }
          buffer += decoder.decode();
          if (buffer.trim()) {
            processEventBlock(buffer);
          }
          send({ type: 'done' });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'The stream was interrupted.';
          send({ type: 'error', text: message });
        } finally {
          controller.close();
        }
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
