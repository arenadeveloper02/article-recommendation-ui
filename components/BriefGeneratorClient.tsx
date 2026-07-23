"use client"

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { BriefResult } from '@/lib/types';

const STATUS_MESSAGES = [
  'Researching competitors\u2026',
  'Analyzing content patterns\u2026',
  'Mapping search intent\u2026',
  'Drafting your brief\u2026',
  'Structuring headings and outline\u2026',
  'Running quality checks\u2026',
];

type Phase = 'idle' | 'loading' | 'error' | 'result';

export default function BriefGeneratorClient() {
  const [keyword, setKeyword] = useState('');
  const [client, setClient] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [statusIndex, setStatusIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<BriefResult | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLoading = phase === 'loading';

  useEffect(() => {
    if (!isLoading) return;
    setStatusIndex(0);
    setElapsed(0);
    const statusInterval = setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 3500);
    const elapsedInterval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => {
      clearInterval(statusInterval);
      clearInterval(elapsedInterval);
    };
  }, [isLoading]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const runGeneration = async (kw: string, cl: string) => {
    setPhase('loading');
    setErrorMessage('');
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw, client: cl }),
      });
      const data = (await response.json()) as { brief?: string; error?: string };
      if (!response.ok || !data.brief) {
        setErrorMessage(data.error ?? 'The brief could not be generated. Please try again.');
        setPhase('error');
        return;
      }
      setResult({ brief: data.brief, keyword: kw, client: cl });
      setPhase('result');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error.';
      setErrorMessage(`Request failed: ${message}`);
      setPhase('error');
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const kw = keyword.trim();
    if (!kw || isLoading) return;
    void runGeneration(kw, client.trim());
  };

  const handleRetry = () => {
    const kw = keyword.trim();
    if (!kw) {
      setPhase('idle');
      return;
    }
    void runGeneration(kw, client.trim());
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.brief);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const blob = new Blob([result.brief], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'article-brief.md';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-[820px] rounded-2xl border border-indigo-100/80 bg-white/90 p-6 shadow-xl shadow-indigo-200/40 backdrop-blur sm:p-10">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Article Recommendation Agent
        </h1>
        <p className="mt-2 text-sm text-slate-500 sm:text-base">
          Turn a target keyword into a writer-ready SEO content brief.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div>
          <label htmlFor="keyword" className="mb-1.5 block text-sm font-medium text-slate-700">
            Target Keyword
          </label>
          <input
            id="keyword"
            type="text"
            required
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Dental implants"
            disabled={isLoading}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
        </div>
        <div>
          <label htmlFor="client" className="mb-1.5 block text-sm font-medium text-slate-700">
            Client / Brand (optional)
          </label>
          <input
            id="client"
            type="text"
            value={client}
            onChange={(e) => setClient(e.target.value)}
            placeholder="42 North Dental"
            disabled={isLoading}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || keyword.trim().length === 0}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-300/50 transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-indigo-300 disabled:shadow-none"
        >
          {isLoading ? 'Generating\u2026' : 'Generate Brief'}
        </button>
      </form>

      {isLoading && (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-8 text-center animate-fade-in-up">
          <svg
            className="h-8 w-8 animate-spin text-indigo-600"
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
          <p className="text-sm font-medium text-indigo-800">{STATUS_MESSAGES[statusIndex]}</p>
          <p className="text-xs text-indigo-500">
            This usually takes 1\u20132 minutes \u00b7 {elapsed}s elapsed
          </p>
        </div>
      )}

      {phase === 'error' && (
        <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-5 animate-fade-in-up">
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
              <h2 className="text-sm font-semibold text-red-800">Brief generation failed</h2>
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

      {phase === 'result' && result && (
        <div className="mt-8 animate-fade-in-up">
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
                Keyword: {result.keyword}
              </span>
              {result.client && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
                  Client: {result.client}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                {copied ? (
                  <>
                    <svg
                      className="h-4 w-4 text-emerald-500"
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
                  'Copy Markdown'
                )}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1"
              >
                Download .md
              </button>
            </div>
          </div>

          <article className="prose prose-slate mt-6 max-w-none prose-headings:font-semibold prose-headings:text-slate-900 prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-a:text-indigo-600 prose-strong:text-slate-900 prose-th:bg-slate-50 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2">
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
              {result.brief}
            </ReactMarkdown>
          </article>
        </div>
      )}
    </div>
  );
}
