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
      if (contentType.includes('application/json')) {
        const data = (await response.json()) as { content?: string; error?: string };
        if (!response.ok || !data.content) {
          setErrorMessage(data.error ?? 'The recommendations could not be generated. Please try again.');
          setPhase('error');
          return;
        }
        setContent(data.content);
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
          setContent(accumulated);
        } else if (event.type === 'status' && event.text) {
          setStatusMessage(event.text);
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
        {/* ── Input form ─────────────────────────────────────────── */}
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
                <p id="keyword-error" className="mt-1.5 text-xs font-medium text-red-600">
                  {fieldErrors.keyword}
                </p>
              ) : (
                <p id="keyword-help" className="mt-1.5 text-xs text-slate-400">
                  e.g. best running shoes for flat feet
                </p>
              )}
            </div>

            <div>
              <label htmlFor="client" className="mb-1.5 block text-sm font-medium text-slate-700">
                Client
              </label>
              <input
                id="client"
                type="text"
                value={client}
                onChange={(e) => {
                  setClient(e.target.value);
                  if (fieldErrors.client) setFieldErrors((prev) => ({ ...prev, client: undefined }));
                }}
                placeholder="e.g. 42 North Dental"
                disabled={isStreaming}
                aria-invalid={Boolean(fieldErrors.client)}
                aria-describedby={fieldErrors.client ? 'client-error' : 'client-help'}
                className={inputClasses(Boolean(fieldErrors.client))}
              />
              {fieldErrors.client ? (
                <p id="client-error" className="mt-1.5 text-xs font-medium text-red-600">
                  {fieldErrors.client}
                </p>
              ) : (
                <p id="client-help" className="mt-1.5 text-xs text-slate-400">
                  The brand or client these articles will be written for.
                </p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={isStreaming || !canSubmit}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-300/50 transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-indigo-300 disabled:shadow-none"
          >
            {isStreaming ? (
              <>
                <ButtonSpinner />
                Generating\u2026
              </>
            ) : (
              'Get Recommendations'
            )}
          </button>
          {!canSubmit && !isStreaming && (
            <p className="mt-2 text-center text-xs text-slate-400">
              Fill in both fields to enable the button.
            </p>
          )}
        </form>

        {/* ── Results ────────────────────────────────────────────── */}
        <section aria-label="Recommendation results" className="min-w-0">
          {phase === 'idle' && (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300/80 bg-white/60 px-8 py-12 text-center animate-fade-in-up">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                <svg
                  className="h-6 w-6"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M10 2a6 6 0 00-3.815 10.631c.362.298.591.72.649 1.176l.093.74a1.5 1.5 0 001.489 1.313h3.168a1.5 1.5 0 001.489-1.313l.093-.74c.058-.457.287-.878.65-1.176A6 6 0 0010 2zM8.5 17.5a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3z" />
                </svg>
              </div>
              <h2 className="mt-4 font-display text-lg font-semibold text-ink">No recommendations yet</h2>
              <p className="mt-2 max-w-sm text-sm text-slate-500">
                Enter a target keyword and client on the left, then press{' '}
                <span className="font-medium text-slate-700">Get Recommendations</span>. Results stream in
                live as the agent works.
              </p>
              <p className="mt-4 text-xs text-slate-400">
                Example: keyword \u201cdental implants\u201d \u00b7 client \u201c42 North Dental\u201d
              </p>
            </div>
          )}

          {phase === 'error' && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 animate-fade-in-up">
              <div className="flex items-start gap-3">
                <svg
                  className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="flex-1">
                  <h2 className="text-sm font-semibold text-red-800">Recommendation run failed</h2>
                  <p className="mt-1 break-words text-sm text-red-700">{errorMessage}</p>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="mt-3 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
                  >
                    Retry
                  </button>
                </div>
              </div>
            </div>
          )}

          {showResults && (
            <div className="animate-fade-in-up">
              {isStreaming && <div className="gradient-progress h-1 rounded-full" aria-hidden="true" />}
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="font-display text-lg font-semibold text-ink">Recommendations</h2>
                {isStreaming ? (
                  <span
                    className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="relative flex h-2 w-2" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75 motion-safe:animate-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-600" />
                    </span>
                    <span className="max-w-[240px] truncate">{statusMessage || 'Working\u2026'}</span>
                    <span className="tabular-nums text-indigo-500">{elapsed}s</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleCopy('all', content)}
                    className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 sm:self-auto"
                  >
                    {copiedId === 'all' ? 'Copied!' : 'Copy all (Markdown)'}
                  </button>
                )}
              </div>

              {parsed.intro && (
                <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-indigo-100/50 sm:p-6">
                  <article className={PROSE_CLASSES}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {parsed.intro}
                    </ReactMarkdown>
                  </article>
                </div>
              )}

              {parsed.cards.length > 0 && (
                <div className="mt-4 grid gap-4">
                  {parsed.cards.map((card) => (
                    <article
                      key={card.id}
                      className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-indigo-100/50 transition hover:border-indigo-200 hover:shadow-md sm:p-6"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-display text-base font-semibold leading-snug text-ink">
                          {card.title}
                        </h3>
                        <button
                          type="button"
                          onClick={() => void handleCopy(card.id, card.raw)}
                          className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
                          aria-label={`Copy recommendation: ${card.title}`}
                        >
                          {copiedId === card.id ? (
                            <>
                              <svg
                                className="h-3.5 w-3.5 text-emerald-500"
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                aria-hidden="true"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              Copied!
                            </>
                          ) : (
                            'Copy'
                          )}
                        </button>
                      </div>
                      {card.badges.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {card.badges.map((badge) => (
                            <span
                              key={`${card.id}-${badge.label}`}
                              className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700"
                            >
                              <span className="text-indigo-400">{badge.label}:</span>
                              {badge.value}
                            </span>
                          ))}
                        </div>
                      )}
                      {card.body && (
                        <div className={`mt-3 ${PROSE_CLASSES}`}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {card.body}
                          </ReactMarkdown>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}

              {isStreaming && !parsed.intro && parsed.cards.length === 0 && (
                <div
                  className="mt-4 space-y-3 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-indigo-100/50"
                  role="status"
                  aria-label="Loading recommendations"
                >
                  <div className="h-5 w-2/5 rounded bg-slate-200 motion-safe:animate-pulse" />
                  <div className="h-4 w-full rounded bg-slate-100 motion-safe:animate-pulse" />
                  <div className="h-4 w-11/12 rounded bg-slate-100 motion-safe:animate-pulse" />
                  <div className="h-4 w-4/5 rounded bg-slate-100 motion-safe:animate-pulse" />
                  <div className="mt-5 h-5 w-1/3 rounded bg-slate-200 motion-safe:animate-pulse" />
                  <div className="h-4 w-full rounded bg-slate-100 motion-safe:animate-pulse" />
                  <div className="h-4 w-3/4 rounded bg-slate-100 motion-safe:animate-pulse" />
                </div>
              )}

              {phase === 'done' && (
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleGenerateMore}
                    className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-1"
                  >
                    <svg
                      className="h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Generate more
                  </button>
                  <p className="text-xs text-slate-400">
                    Runs the agent again for \u201c{keyword.trim()}\u201d \u2014 tweak the form fields first to refine.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
