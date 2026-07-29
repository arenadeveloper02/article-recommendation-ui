import { NextResponse } from 'next/server';
import type { HistoryApiEntry } from '@/lib/types';
import { stripSentinelTokens, unwrapJsonString } from '@/lib/modelOutput';
import { decodeDisplayText } from '@/lib/textDecode';
import { getArenaEmailId } from '@/lib/arena-email';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/** Arena history workflow — returns previous runs for the session email. */
const HISTORY_ENDPOINT =
  'https://agent.thearena.ai/api/workflows/38458816-0871-4c2f-8545-39654a5530cc/execute';
const WORKFLOW_API_KEY = 'sk-sim-Vk9yj3QfVSZxJ8lulZTYK549u5ThZo9u';

interface RawHistoryItem {
  id?: unknown;
  email?: unknown;
  input?: unknown;
  output?: unknown;
}

/**
 * Defensively locates the history array in the workflow response. The
 * documented shape is { result: { history: [...] } } but we also accept any
 * nested array whose items carry input/output fields.
 */
function findHistoryArray(value: unknown, depth: number): unknown[] | null {
  if (depth > 8 || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return value;
    const first = value[0];
    if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
      const record = first as Record<string, unknown>;
      if ('output' in record || 'input' in record) return value;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.history)) return record.history;
  for (const nested of Object.values(record)) {
    const found = findHistoryArray(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

export async function GET(): Promise<NextResponse> {
  const email = await getArenaEmailId();
  if (!email) {
    return NextResponse.json({ error: 'No Arena session email available.' }, { status: 401 });
  }

  try {
    const upstream = await fetch(HISTORY_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-API-Key': WORKFLOW_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        type: 'article_recommendation',
        stream: false,
        selectedOutputs: ['buildhistory.result'],
      }),
      cache: 'no-store',
    });

    const rawText = await upstream.text();

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `The history service returned an error (status ${upstream.status}).` },
        { status: 502 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }

    const items = findHistoryArray(parsed, 0) ?? [];
    const entries: HistoryApiEntry[] = [];

    for (const item of items) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
      const record = item as RawHistoryItem;
      const input = (record.input !== null && typeof record.input === 'object'
        ? record.input
        : {}) as Record<string, unknown>;
      const rawOutput = typeof record.output === 'string' ? record.output : '';
      if (!rawOutput.trim()) continue;
      // ORDER MATTERS: unwrap double-stringified JSON first (JSON.parse natively
      // decodes \uXXXX in wrapped strings), THEN run the robust multi-pass
      // decoder so literal escapes like \u201c / \u201d / \u2026 at ANY nesting
      // depth become their real characters, THEN strip completion sentinels.
      // Stored history rows are frequently double-escaped, which the previous
      // single-pass decoder missed — that is how raw \uXXXX codes leaked into
      // the History view.
      const output = stripSentinelTokens(decodeDisplayText(unwrapJsonString(rawOutput)));
      if (!output.trim()) continue;
      entries.push({
        id: typeof record.id === 'string' && record.id ? record.id : `remote-${entries.length}`,
        keyword: typeof input.keyword === 'string' ? decodeDisplayText(input.keyword) : '',
        client: typeof input.client === 'string' ? decodeDisplayText(input.client) : '',
        output,
      });
    }

    return NextResponse.json({ entries });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: `Could not load history: ${message}` }, { status: 500 });
  }
}
