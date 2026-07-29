"use client"

import { useEffect, useMemo, useRef, useState } from 'react';
import ModelOutputRenderer from '@/components/ModelOutputRenderer';
import type { HistoryApiEntry, HistoryEntry, StreamEvent } from '@/lib/types';
import { stripSentinelTokens, unwrapJsonString } from '@/lib/modelOutput';
import { decodeDisplayText } from '@/lib/textDecode';

type Phase = 'idle' | 'streaming' | 'done' | 'error';
type View = 'generator' | 'history';

interface FieldErrors {
  keyword?: string;
  client?: string;
}

interface ActiveRun {
  keyword: string;
  client: string;
}

/**
 * Pipeline stages shown while the agent works. Timings are estimates from
 * typical run durations; a stage's segment fills once the elapsed time passes
 * its window, and the LAST stage holds until the response actually arrives.
 */
const STAGES: { label: string; seconds: number }[] = [
  { label: 'Connecting to the recommendation agent', seconds: 6 },
  { label: 'Researching the client\u2019s market & competitors', seconds: 24 },
  { label: 'Analyzing keyword demand & search intent', seconds: 30 },
  { label: 'Scoring topic opportunities', seconds: 30 },
  { label: 'Drafting article recommendations', seconds: 60 },
];

/** Realistic runtime range from historical runs. */
const RUNTIME_ESTIMATE = 'Usually takes 90\u2013150s';
const TIP_ROTATE_MS = 7000;

/** Rotating tips personalized to the active keyword/client while waiting. */
function buildTips(keyword: string, client: string): string[] {
  return [
    `Articles targeting \u201c${keyword}\u201d perform best when every H2 maps to one distinct search intent.`,
    `Mentioning ${client}\u2019s differentiators early in the intro strengthens E-E-A-T signals.`,
    `FAQ sections built from \u201cPeople Also Ask\u201d questions around \u201c${keyword}\u201d are strong featured-snippet targets.`,
    `Comparison tables (options, costs, pros & cons) make \u201c${keyword}\u201d content more scannable and link-worthy.`,
    `Internal links from ${client}\u2019s existing service pages help the new \u201c${keyword}\u201d article rank faster.`,
    `Original data points or expert quotes give \u201c${keyword}\u201d articles an edge over templated competitors.`,
  ];
}

/** Extracts the H1/first heading of a generated output for history previews. */
function extractTitle(content: string): string {
  for (const line of content.split('\n')) {
    const heading = line.match(/^\s*#{1,3}\s+(.+)$/);
    if (heading) return heading[1].replace(/\*\*/g, '').trim();
    const bold = line.match(/^\s*\*\*([^*]+)\*\*\s*$/);
    if (bold) return bold[1].trim();
  }
  const firstLine = content.split('\n').find((line) => line.trim().length > 0);
  if (!firstLine) return 'Untitled recommendation';
  const cleaned = firstLine.replace(/[#*_>-]/g, '').trim();
  if (!cleaned) return 'Untitled recommendation';
  return cleaned.length > 110 ? `${cleaned.slice(0, 110)}\u2026` : cleaned;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function makeEntryId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

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

/** Full-text cleanup applied to the ACCUMULATED stream (not per chunk) so escape
 * sequences (e.g. literal \u201c, \u201d, \u2026) and sentinel tokens split
 * across SSE frames are still decoded to their REAL character values before
 * anything reaches the DOM. */
function cleanForDisplay(text: string): string {
  return stripSentinelTokens(decodeDisplayText(text));
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
  const [copied, setCopied] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [view, setView] = useState<View>('generator');
  const [activeRun, setActiveRun] = useState<ActiveRun>({ keyword: '', client: '' });
  const [viewingEntry, setViewingEntry] = useState<HistoryEntry | null>(null);

  // History persistence: session entries live in in-memory React state ONLY,
  // so they RESET on page reload. Earlier runs saved for this Arena email are
  // fetched from the history workflow via /api/history and merged in.
  const [sessionHistory, setSessionHistory] = useState<HistoryEntry[]>([]);
  const [remoteEntries, setRemoteEntries] = useState<HistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isStreaming = phase === 'streaming';

  /** Current stage derived from elapsed seconds; the last stage holds. */
  const stageIndex = useMemo(() => {
    let cumulative = 0;
    for (let i = 0; i < STAGES.length; i += 1) {
      cumulative += STAGES[i].seconds;
      if (elapsed < cumulative) return i;
    }
    return STAGES.length - 1;
  }, [elapsed]);

  const tips = useMemo(() => {
    const kw = activeRun.keyword || 'your keyword';
    const cl = activeRun.client || 'the client';
    return buildTips(kw, cl);
  }, [activeRun]);

  /** Session entries first (already newest-first), then remote entries that
   * are not duplicates of a session run. */
  const mergedHistory = useMemo<HistoryEntry[]>(() => {
    const remote = (remoteEntries ?? []).filter(
      (r) => !sessionHistory.some((s) => s.content.trim() === r.content.trim())
    );
    return [...sessionHistory, ...remote];
  }, [sessionHistory, remoteEntries]);

  useEffect(() => {
    if (!isStreaming) return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [isStreaming]);

  useEffect(() => {
    if (!isStreaming) return;
    setTipIndex(0);
    const timer = setInterval(() => setTipIndex((prev) => prev + 1), TIP_ROTATE_MS);
    return () => clearInterval(timer);
  }, [isStreaming]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const recordHistory = (kw: string, cl: string, text: string): void => {
    const entry: HistoryEntry = {
      id: makeEntryId(),
      keyword: kw,
      client: cl,
      timestamp: new Date().toISOString(),
      content: text,
      source: 'session',
    };
    setSessionHistory((prev) => [entry, ...prev]);
  };

  const loadRemoteHistory = async (): Promise<void> => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const response = await fetch('/api/history');
      const data = (await response.json()) as { entries?: HistoryApiEntry[]; error?: string };
      if (!response.ok || !data.entries) {
        setHistoryError(data.error ?? 'Your previous runs could not be loaded.');
        setRemoteEntries([]);
        return;
      }
      setRemoteEntries(
        data.entries.map((item) => ({
          id: item.id,
          keyword: item.keyword,
          client: item.client,
          timestamp: null,
          content: item.output,
          source: 'remote' as const,
        }))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error.';
      setHistoryError(`Your previous runs could not be loaded: ${message}`);
      setRemoteEntries([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistory = (): void => {
    setView('history');
    setViewingEntry(null);
    if (remoteEntries === null && !historyLoading) void loadRemoteHistory();
  };

  const runRequest = async (kw: string, cl: string): Promise<void> => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setView('generator');
    setViewingEntry(null);
    setActiveRun({ keyword: kw, client: cl });
    setPhase('streaming');
    setContent('');
    setStatusMessage('');
    setErrorMessage('');
    setCopied(false);

    try {
      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw, client: cl }),
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') ?? '';

      // JSON path (the expected path now that the workflow runs non-streamed;
      // also covers server-side error responses).
      if (contentType.includes('application/json')) {
        const data = (await response.json()) as { content?: string; error?: string };
        if (!response.ok || !data.content) {
          setErrorMessage(data.error ?? 'The recommendations could not be generated. Please try again.');
          setPhase('error');
          return;
        }
        const cleaned = cleanForDisplay(unwrapJsonString(data.content));
        setContent(cleaned);
        recordHistory(kw, cl, cleaned);
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
          setContent(cleanForDisplay(accumulated));
        } else if (event.type === 'status' && event.text) {
          setStatusMessage(cleanForDisplay(event.text));
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

      const finalContent = cleanForDisplay(accumulated);
      if (!finalContent.trim()) {
        setErrorMessage(
          streamError || 'The agent returned an empty response. Please try again.'
        );
        setPhase('error');
        return;
      }
      setContent(finalContent);
      recordHistory(kw, cl, finalContent);
      setPhase('done');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Network error.';
      setErrorMessage(`Request failed: ${message}`);
      setPhase('error');
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (isStreaming) return;
    const kw = keyword.trim();
    const cl = client.trim();
    const errors: FieldErrors = {};
    if (!kw) errors.keyword = 'Please enter a target keyword.';
    if (!cl) errors.client = 'Please enter a client or brand name.';
    setFieldErrors(errors);
    if (errors.keyword || errors.client) return;
    void runRequest(kw, cl);
  };

  const handleRetry = (): void => {
    const kw = keyword.trim();
    const cl = client.trim();
    if (!kw || !cl) {
      setPhase('idle');
      return;
    }
    void runRequest(kw, cl);
  };

  const handleCancel = (): void => {
    if (abortRef.current) abortRef.current.abort();
    setPhase('idle');
    setContent('');
    setStatusMessage('');
  };

  const handleCopy = async (text: string): Promise<void> => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handlePrint = async (): Promise<void> => {
    // Ensure the self-hosted Poppins faces bundled by next/font are loaded so
    // the SAME on-screen fonts are embedded in the printed PDF.
    try {
      await document.fonts.ready;
    } catch {
      // Printing proceeds even if the font readiness check fails.
    }
    window.print();
  };

  const stagesDone = Math.min(stageIndex, STAGES.length - 1);
  const progressPercent = Math.min(95, Math.round(((stagesDone + 0.5) / STAGES.length) * 100));

  const renderResultPanel = (entry: { keyword: string; client: string; text: string; timestamp: string | null }) => (
    <div id="print-area" className="mt-6">
      <div className="print-header hidden">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
          Article Recommendations
        </p>
        <h2 className="mt-1 font-display text-xl font-semibold text-ink">
          {entry.keyword}
          {entry.client ? ` \u2014 ${entry.client}` : ''}
        </h2>
        {entry.timestamp && (
          <p className="mt-1 text-xs text-slate-500">Generated {formatTimestamp(entry.timestamp)}</p>
        )}
      </div>
      <ModelOutputRenderer content={entry.text} showSourcesFallback />
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="print-hide mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">Arena SEO Tools</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Article Recommendation Agent
          </h1>
          <p className="mt-2 max-w-xl text-sm text-slate-500">
            Turn a target keyword and client into writer-ready article recommendations.
          </p>
        </div>
        <nav className="flex gap-2" aria-label="Views">
          <button
            type="button"
            onClick={() => {
              setView('generator');
              setViewingEntry(null);
            }}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
              view === 'generator'
                ? 'bg-indigo-600 text-white shadow-ds-sm'
                : 'border border-slate-300 bg-white text-slate-700 hover:border-indigo-300 hover:text-indigo-700'
            }`}
          >
            Generator
          </button>
          <button
            type="button"
            onClick={openHistory}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
              view === 'history'
                ? 'bg-indigo-600 text-white shadow-ds-sm'
                : 'border border-slate-300 bg-white text-slate-700 hover:border-indigo-300 hover:text-indigo-700'
            }`}
          >
            History
          </button>
        </nav>
      </header>

      {view === 'generator' && (
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-ds-md backdrop-blur sm:p-8">
          <form onSubmit={handleSubmit} className="print-hide space-y-5" noValidate>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="keyword" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Target Keyword
                </label>
                <input
                  id="keyword"
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="Dental implants"
                  disabled={isStreaming}
                  aria-invalid={Boolean(fieldErrors.keyword)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50"
                />
                {fieldErrors.keyword && (
                  <p className="mt-1.5 text-xs font-medium text-red-600">{fieldErrors.keyword}</p>
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
                  onChange={(e) => setClient(e.target.value)}
                  placeholder="42 North Dental"
                  disabled={isStreaming}
                  aria-invalid={Boolean(fieldErrors.client)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50"
                />
                {fieldErrors.client && (
                  <p className="mt-1.5 text-xs font-medium text-red-600">{fieldErrors.client}</p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-400">{RUNTIME_ESTIMATE}</p>
              <button
                type="submit"
                disabled={isStreaming}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-ds-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-indigo-300 disabled:shadow-none"
              >
                {isStreaming ? (
                  <>
                    <ButtonSpinner />
                    Generating\u2026
                  </>
                ) : (
                  'Generate Recommendations'
                )}
              </button>
            </div>
          </form>

          {isStreaming && (
            <div className="print-hide mt-8 rounded-xl border border-indigo-100 bg-indigo-50/60 p-5 animate-fade-in-up">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-indigo-800">
                  Working on \u201c{activeRun.keyword}\u201d for {activeRun.client}
                </p>
                <span className="text-xs font-medium tabular-nums text-indigo-500">{elapsed}s elapsed</span>
              </div>

              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-indigo-100">
                <div
                  className="gradient-progress h-full rounded-full transition-all duration-1000"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <ul className="mt-4 space-y-2">
                {STAGES.map((stage, index) => {
                  const isDone = index < stageIndex;
                  const isCurrent = index === stageIndex;
                  return (
                    <li key={stage.label} className="flex items-center gap-2.5 text-sm">
                      {isDone ? (
                        <svg
                          className="h-4 w-4 flex-shrink-0 text-emerald-500"
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
                      ) : isCurrent ? (
                        <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-indigo-600">
                          <ButtonSpinner />
                        </span>
                      ) : (
                        <span className="h-2 w-2 flex-shrink-0 rounded-full bg-indigo-200" aria-hidden="true" />
                      )}
                      <span
                        className={
                          isCurrent
                            ? 'font-medium text-indigo-800'
                            : isDone
                              ? 'text-indigo-600'
                              : 'text-indigo-400'
                        }
                      >
                        {stage.label}
                      </span>
                    </li>
                  );
                })}
              </ul>

              {statusMessage && (
                <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-xs text-indigo-600">{statusMessage}</p>
              )}

              <p className="mt-4 border-t border-indigo-100 pt-3 text-xs italic text-indigo-500">
                Tip: {tips[tipIndex % tips.length]}
              </p>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {isStreaming && content.trim().length > 0 && (
            <div className="mt-6 animate-fade-in-up">
              <p className="print-hide mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Live preview
              </p>
              <ModelOutputRenderer content={content} isStreaming />
            </div>
          )}

          {phase === 'error' && (
            <div className="print-hide mt-8 rounded-xl border border-red-200 bg-red-50 p-5 animate-fade-in-up">
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
                  <h2 className="text-sm font-semibold text-red-800">Generation failed</h2>
                  <p className="mt-1 break-words text-sm text-red-700">{errorMessage}</p>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="mt-3 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2"
                  >
                    Retry
                  </button>
                </div>
              </div>
            </div>
          )}

          {phase === 'done' && content.trim().length > 0 && (
            <div className="mt-8 animate-fade-in-up">
              <div className="print-hide flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
                    Keyword: {activeRun.keyword}
                  </span>
                  {activeRun.client && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
                      Client: {activeRun.client}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopy(content)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    {copied ? 'Copied!' : 'Copy Markdown'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePrint()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1"
                  >
                    Download PDF
                  </button>
                </div>
              </div>
              {renderResultPanel({
                keyword: activeRun.keyword,
                client: activeRun.client,
                text: content,
                timestamp: new Date().toISOString(),
              })}
            </div>
          )}
        </div>
      )}

      {view === 'history' && (
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-ds-md backdrop-blur sm:p-8">
          {viewingEntry ? (
            <div className="animate-fade-in-up">
              <div className="print-hide flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => setViewingEntry(null)}
                  className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  \u2190 Back to history
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopy(viewingEntry.content)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    {copied ? 'Copied!' : 'Copy Markdown'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePrint()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1"
                  >
                    Download PDF
                  </button>
                </div>
              </div>
              <div className="print-hide mt-4 flex flex-wrap items-center gap-2">
                {viewingEntry.keyword && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
                    Keyword: {viewingEntry.keyword}
                  </span>
                )}
                {viewingEntry.client && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
                    Client: {viewingEntry.client}
                  </span>
                )}
                {viewingEntry.timestamp && (
                  <span className="text-xs text-slate-400">{formatTimestamp(viewingEntry.timestamp)}</span>
                )}
              </div>
              {renderResultPanel({
                keyword: viewingEntry.keyword,
                client: viewingEntry.client,
                text: viewingEntry.content,
                timestamp: viewingEntry.timestamp,
              })}
            </div>
          ) : (
            <div className="animate-fade-in-up">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-lg font-semibold text-ink">Previous runs</h2>
                <button
                  type="button"
                  onClick={() => void loadRemoteHistory()}
                  disabled={historyLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {historyLoading && <ButtonSpinner />}
                  Refresh
                </button>
              </div>

              {historyLoading && mergedHistory.length === 0 && (
                <div className="mt-6 flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-6 text-sm text-indigo-700">
                  <ButtonSpinner />
                  Loading your previous runs\u2026
                </div>
              )}

              {historyError && (
                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {historyError}
                </p>
              )}

              {!historyLoading && mergedHistory.length === 0 && !historyError && (
                <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No runs yet. Generate your first recommendation from the Generator tab.
                </p>
              )}

              {mergedHistory.length > 0 && (
                <ul className="mt-5 space-y-3">
                  {mergedHistory.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => setViewingEntry(entry)}
                        className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-300 hover:shadow-ds-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      >
                        <p className="line-clamp-2 text-sm font-semibold text-ink">
                          {extractTitle(entry.content)}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {entry.keyword && (
                            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700">
                              {entry.keyword}
                            </span>
                          )}
                          {entry.client && (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                              {entry.client}
                            </span>
                          )}
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
                            {entry.source === 'session' ? 'This session' : 'Saved'}
                          </span>
                          {entry.timestamp && (
                            <span className="text-[11px] text-slate-400">{formatTimestamp(entry.timestamp)}</span>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
