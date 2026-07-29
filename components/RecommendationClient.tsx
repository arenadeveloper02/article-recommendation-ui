"use client"

import { useEffect, useMemo, useRef, useState } from 'react';
import ModelOutputRenderer from '@/components/ModelOutputRenderer';
import type { HistoryApiEntry, HistoryEntry, StreamEvent } from '@/lib/types';
import {
  decodeEscapedText,
  sanitizeForFilename,
  stripSentinelTokens,
  unwrapJsonString,
} from '@/lib/modelOutput';

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

/** Realistic runtime range from historical runs (replaces raw \"Xs elapsed\"). */
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
 * sequences and sentinel tokens split across SSE frames are still handled. */
function cleanForDisplay(text: string): string {
  return stripSentinelTokens(decodeEscapedText(text));
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

  // History persistence: session entries live in in-memory React state ONLY
  // (browser storage is unavailable in this environment), so they RESET on
  // page reload. For persistence across sessions a backend/database would be
  // needed. Additionally, earlier runs saved for this Arena email are fetched
  // from the history workflow via /api/history and merged into the list.
  const [sessionHistory, setSessionHistory] = useState<HistoryEntry[]>([]);
  const [remoteEntries, setRemoteEntries] = useState<HistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isStreaming = phase === 'streaming';
  const canSubmit = keyword.trim().length > 0 && client.trim().length > 0;

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

      if (streamError && !finalContent.trim()) {
        setErrorMessage(streamError);
        setPhase('error');
        return;
      }
      if (!finalContent.trim()) {
        setErrorMessage('The agent returned an empty response. Please try again.');
        setPhase('error');
        return;
      }
      setContent(finalContent);
      recordHistory(kw, cl, finalContent);
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

  const handleGenerateAgain = () => {
    if (isStreaming) return;
    handleRetry();
  };

  const handleViewEntry = (entry: HistoryEntry): void => {
    if (isStreaming) return;
    setViewingEntry(entry);
    setContent(entry.content);
    setActiveRun({ keyword: entry.keyword, client: entry.client });
    setErrorMessage('');
    setCopied(false);
    setPhase('done');
    setView('generator');
  };

  const handleCopy = async () => {
    if (!content.trim()) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  /**
   * "Print this view" PDF: prints the EXACT DOM the user is looking at. The
   * @media print stylesheet in app/globals.css isolates #print-area, removes
   * UI chrome/scrollbars, keeps cards / table rows / .faq-item blocks intact
   * across page breaks, and sets a fixed A4 page. document.fonts.ready is
   * awaited so the self-hosted Poppins faces are embedded in the PDF.
   */
  const handleDownloadPdf = async (): Promise<void> => {
    if (!content.trim()) return;
    const previousTitle = document.title;
    document.title = `recommendations-${sanitizeForFilename(activeRun.keyword) || 'article'}`;
    try {
      await document.fonts.ready;
    } catch {
      // Font Loading API unavailable; print with whatever is already loaded.
    }
    window.print();
    document.title = previousTitle;
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="rounded-2xl border border-indigo-100/80 bg-white/90 p-6 shadow-xl shadow-indigo-200/40 backdrop-blur sm:p-10">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Article Recommendation Agent
            </h1>
            <p className="mt-2 text-sm text-slate-500 sm:text-base">
              Turn a target keyword and client into writer-ready article recommendations.
            </p>
          </div>
          <div
            className="flex shrink-0 rounded-xl border border-indigo-100 bg-indigo-50/70 p-1"
            role="tablist"
            aria-label="Views"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === 'generator'}
              onClick={() => setView('generator')}
              className={
                view === 'generator'
                  ? 'rounded-lg bg-white px-4 py-2 text-xs font-semibold text-indigo-700 shadow-sm'
                  : 'rounded-lg px-4 py-2 text-xs font-semibold text-slate-500 transition hover:text-indigo-600'
              }
            >
              Generator
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'history'}
              onClick={openHistory}
              className={
                view === 'history'
                  ? 'rounded-lg bg-white px-4 py-2 text-xs font-semibold text-indigo-700 shadow-sm'
                  : 'rounded-lg px-4 py-2 text-xs font-semibold text-slate-500 transition hover:text-indigo-600'
              }
            >
              History
              {mergedHistory.length > 0 && (
                <span className="ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {mergedHistory.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {view === 'generator' ? (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
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
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50"
              />
              {fieldErrors.keyword && <p className="mt-1 text-xs text-red-600">{fieldErrors.keyword}</p>}
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
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50"
              />
              {fieldErrors.client && <p className="mt-1 text-xs text-red-600">{fieldErrors.client}</p>}
            </div>
            <button
              type="submit"
              disabled={isStreaming || !canSubmit}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-300/50 transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-indigo-300 disabled:shadow-none"
            >
              {isStreaming ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <ButtonSpinner /> {'Generating\u2026'}
                </span>
              ) : (
                'Get Recommendations'
              )}
            </button>
          </form>
        ) : (
          <div className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">Previous runs</h2>
              <button
                type="button"
                onClick={() => void loadRemoteHistory()}
                disabled={historyLoading}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {historyLoading ? 'Refreshing\u2026' : 'Refresh'}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Runs from this session plus earlier runs saved for your Arena email. Session entries
              reset on page reload.
            </p>

            {historyLoading && mergedHistory.length === 0 && (
              <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-8 text-sm font-medium text-indigo-700">
                <ButtonSpinner /> {'Loading your history\u2026'}
              </div>
            )}

            {historyError && !historyLoading && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {historyError}
              </div>
            )}

            {!historyLoading && mergedHistory.length === 0 && !historyError && (
              <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-12 text-center">
                <p className="text-sm font-medium text-slate-600">No previous runs yet</p>
                <p className="mt-1 text-sm text-slate-400">
                  Generate your first recommendation to see it here.
                </p>
              </div>
            )}

            {mergedHistory.length > 0 && (
              <ul className="mt-5 space-y-4">
                {mergedHistory.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-sm font-semibold text-ink">
                          {extractTitle(entry.content)}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700">
                            {entry.keyword || 'Unknown keyword'}
                          </span>
                          {entry.client && (
                            <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                              {entry.client}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-slate-400">
                          {entry.timestamp ? formatTimestamp(entry.timestamp) : 'Earlier run'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleViewEntry(entry)}
                        disabled={isStreaming}
                        className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-indigo-300"
                      >
                        View
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {view === 'generator' && isStreaming && (
        <div className="animate-fade-in-up mt-6 rounded-2xl border border-indigo-100 bg-white/90 p-6 shadow-lg shadow-indigo-100/50 backdrop-blur">
          {/* Segmented progress: one segment per pipeline stage. Completed
              segments are solid; the current one animates. */}
          <div className="flex gap-1.5">
            {STAGES.map((stage, index) => (
              <div key={stage.label} className="h-1.5 flex-1 overflow-hidden rounded-full bg-indigo-100">
                {index < stageIndex ? (
                  <div className="h-full w-full rounded-full bg-indigo-600" />
                ) : index === stageIndex ? (
                  <div className="gradient-progress h-full w-full rounded-full" />
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-indigo-800">{`${STAGES[stageIndex].label}\u2026`}</p>
            <p className="text-xs text-indigo-500">
              Stage {stageIndex + 1} of {STAGES.length} &middot; {RUNTIME_ESTIMATE}
            </p>
          </div>
          {statusMessage && <p className="mt-1 text-xs text-slate-400">{statusMessage}</p>}

          {/* Rotating tip relevant to the keyword/client while waiting. */}
          <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-400">
              While you wait
            </p>
            <p className="mt-1 text-sm text-indigo-800">{tips[tipIndex % tips.length]}</p>
          </div>

          {content.trim().length > 0 && (
            <div className="mt-5">
              <ModelOutputRenderer content={content} isStreaming />
            </div>
          )}
        </div>
      )}

      {view === 'generator' && phase === 'error' && (
        <div className="animate-fade-in-up mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 shadow-lg shadow-red-100/50">
          <h2 className="text-sm font-semibold text-red-800">Recommendation generation failed</h2>
          <p className="mt-1 break-words text-sm text-red-700">{errorMessage}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-3 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2"
          >
            Retry
          </button>
        </div>
      )}

      {view === 'generator' && phase === 'done' && content.trim().length > 0 && (
        <div id="print-area" className="animate-fade-in-up mt-6">
          <div className="print-header hidden">
            <h1 className="font-display text-2xl font-bold text-ink">Article Recommendations</h1>
            <p className="mt-1 text-sm text-slate-600">
              Keyword: {activeRun.keyword} &middot; Client: {activeRun.client}
            </p>
          </div>
          <div className="rounded-2xl border border-indigo-100 bg-white/90 p-6 shadow-lg shadow-indigo-100/50 backdrop-blur">
            <div className="print-hide flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
                  Keyword: {activeRun.keyword}
                </span>
                {activeRun.client && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
                    Client: {activeRun.client}
                  </span>
                )}
                {viewingEntry && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                    History &middot; read-only
                    {viewingEntry.timestamp ? ` \u00b7 ${formatTimestamp(viewingEntry.timestamp)}` : ''}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  {copied ? 'Copied!' : 'Copy Markdown'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownloadPdf()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1"
                >
                  Download PDF
                </button>
                {!viewingEntry && (
                  <button
                    type="button"
                    onClick={handleGenerateAgain}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    Generate again
                  </button>
                )}
              </div>
            </div>
            <div className="mt-5">
              <ModelOutputRenderer content={content} showSourcesFallback />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
