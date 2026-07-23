import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const WORKFLOW_ENDPOINT =
  'https://test-agent.thearena.ai/api/workflows/22222756-700a-464c-b643-a8c11e92e64b/execute';
const WORKFLOW_API_KEY = 'sk-sim-amPAyUKDZNygmERaDmxwJBgkMabZvYXr';

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
 * is STILL a quoted JSON string, parse it again until we reach the plain text.
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

function looksLikeMarkdownBrief(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 80) return false;
  const hasHeading = /(^|\n)#{1,6}\s+\S/.test(trimmed) || /\*\*[^*]+\*\*/.test(trimmed);
  const hasBriefSignals = /H2|H3|Writing Instructions|Content Brief|Target Keyword|Outline/i.test(trimmed);
  return hasHeading || hasBriefSignals;
}

function extractBrief(payload: unknown): string | null {
  const strings: string[] = [];
  collectStrings(payload, strings, 0);
  if (strings.length === 0) return null;

  const markdownCandidates = strings.filter(looksLikeMarkdownBrief);
  const pool = markdownCandidates.length > 0 ? markdownCandidates : strings.filter((s) => s.trim().length > 200);
  if (pool.length === 0) return null;

  return pool.reduce((longest, current) => (current.length > longest.length ? current : longest));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  try {
    const upstream = await fetch(WORKFLOW_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-API-Key': WORKFLOW_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ keyword, client, stream: false }),
      cache: 'no-store',
    });

    const rawText = await upstream.text();

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: `The brief service returned an error (status ${upstream.status}). ${rawText.slice(0, 300)}`,
        },
        { status: 502 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = rawText;
    }

    const extracted = extractBrief(parsed);
    const rawBrief =
      extracted ??
      (typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2));

    // Unwrap double-stringified strings and decode residual \uXXXX escapes so the
    // client always receives clean, human-readable markdown.
    const brief = decodeEscapedText(unwrapJsonString(rawBrief));

    return NextResponse.json({ brief, raw: parsed });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unexpected error while contacting the brief service.';
    return NextResponse.json(
      { error: `Could not reach the brief service: ${message}` },
      { status: 500 }
    );
  }
}
