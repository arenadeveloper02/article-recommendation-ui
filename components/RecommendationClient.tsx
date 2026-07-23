"use client"

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { StreamEvent } from '@/lib/types';

type Phase = 'idle' | 'streaming' | 'done' | 'error';

interface FieldErrors {
  keyword?: string;
  client?: string;
}

interface RecommendationBadge {
  label: string;
  value: string;
}

interface RecommendationCardData {
  id: string;
  title: string;
  body: string;
  raw: string;
  badges: RecommendationBadge[];
}

interface ParsedContent {
  intro: string;
  cards: RecommendationCardData[];
}

const BADGE_LABELS = [
  'search intent',
  'intent',
  'difficulty',
  'keyword difficulty',
  'volume',
  'search volume',
  'monthly volume',
  'content type',
  'funnel stage',
  'target keyword',
  'keyword variant',
  'format',
  'word count',
];

/**
 * Client-side defense-in-depth: decodes literal \uXXXX escape sequences and
 * escaped whitespace. Applied to the FULL accumulated stream text (not per
 * chunk), so escape sequences that were split across two SSE frames (e.g.
 * `\u20` + `1c`) are still decoded correctly before rendering.
 */
function decodeEscapedText(input: string): string {
  if (!input.includes('\\')) return input;
  return input
    .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"');
}

/** Unwraps a value that is still a JSON-encoded string (double stringification upstream). */
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

function extractBadges(body: string): { badges: RecommendationBadge[]; cleaned: string } {
  const badges: RecommendationBadge[] = [];
  const kept: string[] = [];
  for (const line of body.split('\n')) {
    const match = line.match(/^\s*[-*]?\s*\*\*([^*]+?)\*\*\s*:?\s*(.+)$/);
    if (match) {
      const label = match[1].replace(/:\s*$/, '').trim();
      const value = match[2].trim();
      if (BADGE_LABELS.includes(label.toLowerCase()) && value.length > 0 && value.length <= 80) {
        badges.push({ label, value });
        continue;
      }
    }
    kept.push(line);
  }
  return { badges, cleaned: kept.join('\n').trim() };
}

function parseContent(markdown: string): ParsedContent {
  const trimmed = markdown.trim();
  if (!trimmed) return { intro: '', cards: [] };

  let parts = trimmed.split(/\n(?=##\s)/);
  let headingPattern = /^##\s+/;
  if (parts.length < 2 && !headingPattern.test(trimmed)) {
    const h3Parts = trimmed.split(/\n(?=###\s)/);
    if (h3Parts.length >= 2 || /^###\s+/.test(trimmed)) {
      parts = h3Parts;
      headingPattern = /^###\s+/;
    }
  }

  const cards: RecommendationCardData[] = [];
  const introChunks: string[] = [];

  parts.forEach((part, index) => {
    const section = part.trim();
    if (!section) return;
    const firstLineEnd = section.indexOf('\n');
    const firstLine = firstLineEnd === -1 ? section : section.slice(0, firstLineEnd);
    if (headingPattern.test(firstLine)) {
      const title = firstLine.replace(/^#{1,6}\s+/, '').trim();
      const rest = firstLineEnd === -1 ? '' : section.slice(firstLineEnd + 1);
      const { badges, cleaned } = extractBadges(rest);
      cards.push({ id: `rec-${index}`, title, body: cleaned, raw: section, badges });
    } else {
      introChunks.push(section);
    }
  });

  return { intro: introChunks.join('\n\n'), cards };
}

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

const PROSE_CLASSES =
  'prose prose-sm prose-slate max-w-none prose-headings:font-display prose-headings:font-semibold prose-headings:text-ink prose-a:text-indigo-600 prose-strong:text-ink prose-th:bg-slate-50 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2';

function ButtonSpinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export default function RecommendationClient() {
  const [keyword, setKeyword] = useState('');
  const [client, setClient] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [phase, setPhase] = useState<Phase>('idle');
  const [content, setContent] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isStreaming = phase === 'streaming';
  const canSubmit = keyword.trim().length > 0 && client.trim().length > 0;
  const parsed = useMemo(() => parseContent(content), [content]);

  useEffect(() => {
    if (!isStreaming) return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [isStreaming]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const runRequest = async (kw: string, cl: string): Promise<void> => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase('streaming');
    setContent('');
    setStatusMessage('Connecting to the recommendation agent\u2026');
    setErrorMessage('');

    try {
      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw, client: cl }),
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') ?? '';

      // Non-streamed JSON fallback (also covers server-side error responses).
      // The body is parsed with response.json() (never rendered as raw text) and the
      // content string is unwrapped + decoded in case it was double-stringified.
      if (contentType.includes('application/json')) {
        const data = (await response.json()) as { content?: string; error?: string };
        if (!response.ok || !data.content) {
          setErrorMessage(data.error ?? 'The recommendations could not be generated. Please try again.');
          setPhase('error');
          return;
        }
        setContent(decodeEscapedText(unwrapJsonString(data.content)));
        setPhase('done');
        return;
      }

      if (!response.ok || !response.body) {
        setErrorMessage(`The recommendation service returned an error (status ${response.status}).`);
        setPhase('error');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let streamError = '';

      const handleEvent = (event: StreamEvent): void => {
        if (event.type === 'content' && event.text) {
          accumulated += event.text;
          // Decode over the FULL accumulated string so escape sequences split
          // across stream chunks are still converted to real characters.
          setContent(decodeEscapedText(accumulated));
        } else if (event.type === 'status' && event.text) {
          setStatusMessage(decodeEscapedText(event.text));
        } else if (event.type === 'error') {
          streamError = event.text ?? 'The stream reported an error.';
        }
      };

      const processBuffer = (): void => {
        let separatorIndex = buffer.indexOf('\n\n');
        while (separatorIndex !== -1) {
          const rawEvent = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          for (const line of rawEvent.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              handleEvent(JSON.parse(payload) as StreamEvent);
            } catch {
              // Ignore malformed frames.
            }
          }
          separatorIndex = buffer.indexOf('\n\n');
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        processBuffer();
      }
      buffer += decoder.decode();
      processBuffer();

      if (streamError && !accumulated.trim()) {
        setErrorMessage(streamError);
        setPhase('error');
        return;
      }
      if (!accumulated.trim()) {
        setErrorMessage('The agent returned an empty response. Please try again.');
        setPhase('error');
        return;
      }
      setContent(decodeEscapedText(accumulated));
      setPhase('done');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Network error.';
      setErrorMessage(`Request failed: ${message}`);
      setPhase('error');
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isStreaming) return;
    const errors: FieldErrors = {};
    if (!keyword.trim()) errors.keyword = 'Please enter a target keyword.';
    if (!client.trim()) errors.client = 'Please enter a client or brand name.';
    setFieldErrors(errors);
    if (errors.keyword || errors.client) return;
    void runRequest(keyword.trim(), client.trim());
  };

  const handleRetry = () => {
    if (!keyword.trim() || !client.trim()) {
      setPhase('idle');
      return;
    }
    void runRequest(keyword.trim(), client.trim());
  };

  const handleGenerateMore = () => {
    if (isStreaming) return;
    handleRetry();
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(null);
    }
  };

  const inputClasses = (hasError: boolean): string =>
    `w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-50 ${
      hasError ? 'border-red-400' : 'border-slate-300 focus:border-indigo-500'
    }`;

  const showResults = isStreaming || (phase === 'done' && content.length > 0);

  return (
    <div className="w-full">
      <header className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200/70 bg-white px-3 py-1 text-xs font-medium tracking-wide text-indigo-700 shadow-sm">
          SEO Content Intelligence
        </span>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          Article Recommendation Agent
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-slate-500 sm:text-base">
          Turn a target keyword and client into writer-ready article recommendations.
        </p>
      </header>

      <div className="mx-auto mt-10 grid max-w-2xl gap-8 lg:mx-0 lg:max-w-none lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg shadow-indigo-100/60 sm:p-8 lg:sticky lg:top-8"
        >
          <h2 className="font-display text-lg font-semibold text-ink">Start a recommendation run</h2>
          <p className="mt-1 text-xs text-slate-500">Both fields are required.</p>

          <div className="mt-6 space-y-5">
            <div>
              <label htmlFor="keyword" className="mb-1.5 block text-sm font-medium text-slate-700">
                Target Keyword
              </label>
              <input
                id="keyword"
                type="text"
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value);
                  if (fieldErrors.keyword) setFieldErrors((prev) => ({ ...prev, keyword: undefined }));
                }}
                placeholder="dental implants"
                disabled={isStreaming}
                aria-invalid={Boolean(fieldErrors.keyword)}
                aria-describedby={fieldErrors.keyword ? 'keyword-error' : 'keyword-help'}
                className={inputClasses(Boolean(fieldErrors.keyword))}
              />
              {fieldErrors.keyword ? (
                <p id="keyword-error" className="mt-1.5 text-xs text-red-600">
                  {fieldErrors.keyword}
                </p>
              ) : (
                <p id="keyword-help" className="mt-1.5 text-xs text-slate-400">
                  The primary keyword you want to rank for.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="client" className="mb-1.5 block text-sm font-medium text-slate-700">
                Client / Brand
              </label>
              <input
                id="client"
                type="text"
                value={client}
                onChange={(e) => {
                  setClient(e.target.value);
                  if (fieldErrors.client) setFieldErrors((prev) => ({ ...prev, client: undefined }));
                }}
                placeholder="42 North Dental"
                disabled={isStreaming}
                aria-invalid={Boolean(fieldErrors.client)}
                aria-describedby={fieldErrors.client ? 'client-error' : 'client-help'}
                className={inputClasses(Boolean(fieldErrors.client))}
              />
              {fieldErrors.client ? (
                <p id="client-error" className="mt-1.5 text-xs text-red-600">
                  {fieldErrors.client}
                </p>
              ) : (
                <p id="client-help" className="mt-1.5 text-xs text-slate-400">
                  The client or brand the article is for.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isStreaming || !canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-300/50 transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-indigo-300 disabled:shadow-none"
            >
              {isStreaming ? (
                <>
                  <ButtonSpinner />
                  Generating{'\u2026'}
                </>
              ) : (
                'Get Recommendations'
              )}
            </button>
          </div>
        </form>

        <section aria-live="polite">
          {phase === 'idle' && (
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
              <p className="text-sm font-medium text-slate-600">Recommendations will appear here.</p>
              <p className="mt-1 text-xs text-slate-400">Enter a keyword and client, then start a run.</p>
            </div>
          )}

          {phase === 'error' && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 animate-fade-in-up">
              <h2 className="text-sm font-semibold text-red-800">Recommendation run failed</h2>
              <p className="mt-1 break-words text-sm text-red-700">{errorMessage}</p>
              <button
                type="button"
                onClick={handleRetry}
                className="mt-4 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
              >
                Retry
              </button>
            </div>
          )}

          {showResults && (
            <div className="space-y-5">
              {isStreaming && (
                <div className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm animate-fade-in-up">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-indigo-100">
                    <div className="gradient-progress h-full w-full" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-indigo-800">
                    {statusMessage || 'Generating recommendations\u2026'}
                  </p>
                  <p className="mt-1 text-xs text-indigo-400">
                    This usually takes 1{'\u2013'}2 minutes {'\u00b7'} {elapsed}s elapsed
                  </p>
                </div>
              )}

              {parsed.intro && (
                <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm animate-fade-in-up">
                  <div className={PROSE_CLASSES}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {parsed.intro}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {parsed.cards.map((card) => (
                <article
                  key={card.id}
                  className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm animate-fade-in-up"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-base font-semibold text-ink">{card.title}</h3>
                    <button
                      type="button"
                      onClick={() => void handleCopy(card.id, card.raw)}
                      className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
                    >
                      {copiedId === card.id ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  {card.badges.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {card.badges.map((badge) => (
                        <span
                          key={`${card.id}-${badge.label}`}
                          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700"
                        >
                          <span className="text-indigo-400">{badge.label}:</span> {badge.value}
                        </span>
                      ))}
                    </div>
                  )}
                  {card.body && (
                    <div className={`mt-4 ${PROSE_CLASSES}`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {card.body}
                      </ReactMarkdown>
                    </div>
                  )}
                </article>
              ))}

              {phase === 'done' && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleGenerateMore}
                    className="rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                  >
                    Generate again
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
