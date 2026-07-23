"use client"

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { StreamEvent } from '@/lib/types';

type Phase = 'idle' | 'streaming' | 'done' | 'error';

interface FieldErrors {
  keyword?: string;
  client?: string;
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
  const abortRef = useRef<AbortController | null>(null);

  const isStreaming = phase === 'streaming';

  useEffect(() => {
    if (!isStreaming) return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [isStreaming]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const runRequest = async (kw: string, cl: string): Promise<void> => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase('streaming');
    setContent('');
    setStatusMessage('Connecting to the recommendation agent…');
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

  const inputClasses = (hasError: boolean): string =>
    `w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-50 ${
      hasError ? 'border-red-400' : 'border-slate-300 focus:border-indigo-500'
    }`;

  return (
    <div className="w-full">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200/70 bg-white px-3 py-1 text-xs font-medium tracking-wide text-indigo-700 shadow-sm">
          SEO Content Intelligence
        </span>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          Article Recommendation Agent
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-slate-500 sm:text-base">
          Turn a target keyword and client into writer-ready article recommendations.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-10 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg shadow-indigo-100/60 sm:p-8"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="keyword" className="mb-1.5 block text-sm font-medium text-slate-700">
              Keyword
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
              aria-describedby={fieldErrors.keyword ? 'keyword-error' : undefined}
              className={inputClasses(Boolean(fieldErrors.keyword))}
            />
            {fieldErrors.keyword && (
              <p id="keyword-error" className="mt-1.5 text-xs font-medium text-red-600">
                {fieldErrors.keyword}
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
              placeholder="42 North Dental"
              disabled={isStreaming}
              aria-invalid={Boolean(fieldErrors.client)}
              aria-describedby={fieldErrors.client ? 'client-error' : undefined}
              className={inputClasses(Boolean(fieldErrors.client))}
            />
            {fieldErrors.client && (
              <p id="client-error" className="mt-1.5 text-xs font-medium text-red-600">
                {fieldErrors.client}
              </p>
            )}
          </div>
        </div>
        <button
          type="submit"
          disabled={isStreaming}
          className="mt-6 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-300/50 transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-indigo-300 disabled:shadow-none"
        >
          {isStreaming ? 'Generating recommendations…' : 'Get Recommendations'}
        </button>
      </form>

      {(isStreaming || (phase === 'done' && content.length > 0)) && (
        <section className="relative mt-8 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-lg shadow-indigo-100/60 animate-fade-in-up">
          {isStreaming && <div className="gradient-progress absolute inset-x-0 top-0 h-1" aria-hidden="true" />}
          <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">Recommendations</h2>
            {isStreaming && (
              <span
                className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700"
                role="status"
                aria-live="polite"
              >
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-600" />
                </span>
                <span className="max-w-[240px] truncate">{statusMessage || 'Working…'}</span>
                <span className="tabular-nums text-indigo-500">{elapsed}s</span>
              </span>
            )}
          </div>
          <div className="px-6 py-6 sm:px-8">
            {content.length > 0 ? (
              <article className="prose prose-slate max-w-none prose-headings:font-display prose-headings:font-semibold prose-headings:text-ink prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-a:text-indigo-600 prose-strong:text-ink prose-th:bg-slate-50 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children }) => (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {children}
                      </a>
                    ),
                  }}
                >
                  {content}
                </ReactMarkdown>
              </article>
            ) : (
              <div className="space-y-3" role="status" aria-label="Loading recommendations">
                <div className="h-5 w-2/5 rounded bg-slate-200 motion-safe:animate-pulse" />
                <div className="h-4 w-full rounded bg-slate-100 motion-safe:animate-pulse" />
                <div className="h-4 w-11/12 rounded bg-slate-100 motion-safe:animate-pulse" />
                <div className="h-4 w-4/5 rounded bg-slate-100 motion-safe:animate-pulse" />
                <div className="mt-5 h-5 w-1/3 rounded bg-slate-200 motion-safe:animate-pulse" />
                <div className="h-4 w-full rounded bg-slate-100 motion-safe:animate-pulse" />
                <div className="h-4 w-3/4 rounded bg-slate-100 motion-safe:animate-pulse" />
              </div>
            )}
          </div>
        </section>
      )}

      {phase === 'error' && (
        <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 animate-fade-in-up">
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
              <h2 className="font-display text-sm font-semibold text-red-800">Something went wrong</h2>
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
        </section>
      )}
    </div>
  );
}
