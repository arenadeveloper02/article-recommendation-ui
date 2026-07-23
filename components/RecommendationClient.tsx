"use client"

import { useEffect, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import ModelOutputRenderer from '@/components/ModelOutputRenderer';
import type { StreamEvent } from '@/lib/types';
import {
  decodeEscapedText,
  markdownToPlainText,
  sanitizeForFilename,
  stripSentinelTokens,
  unwrapJsonString,
} from '@/lib/modelOutput';

type Phase = 'idle' | 'streaming' | 'done' | 'error';

interface FieldErrors {
  keyword?: string;
  client?: string;
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
  const abortRef = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isStreaming = phase === 'streaming';
  const canSubmit = keyword.trim().length > 0 && client.trim().length > 0;

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
    setCopied(false);

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
        setContent(cleanForDisplay(unwrapJsonString(data.content)));
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

  const handleDownloadPdf = () => {
    const plain = markdownToPlainText(content);
    if (!plain) return;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 48;
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Article Recommendations', margin, y);
    y += 20;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Keyword: ${keyword.trim()}  |  Client: ${client.trim()}`, margin, y);
    y += 24;

    doc.setFontSize(10.5);
    const lines = doc.splitTextToSize(plain, maxWidth) as string[];
    for (const line of lines) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += 15;
    }
    doc.save(`recommendations-${sanitizeForFilename(keyword)}.pdf`);
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="rounded-2xl border border-indigo-100/80 bg-white/90 p-6 shadow-xl shadow-indigo-200/40 backdrop-blur sm:p-10">
        <div className="text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Article Recommendation Agent
          </h1>
          <p className="mt-2 text-sm text-slate-500 sm:text-base">
            Turn a target keyword and client into writer-ready article recommendations.
          </p>
        </div>

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
                <ButtonSpinner /> Generating\u2026
              </span>
            ) : (
              'Get Recommendations'
            )}
          </button>
        </form>
      </div>

      {isStreaming && (
        <div className="animate-fade-in-up mt-6 rounded-2xl border border-indigo-100 bg-white/90 p-6 shadow-lg shadow-indigo-100/50 backdrop-blur">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-indigo-100">
            <div className="gradient-progress h-full w-full" />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-indigo-800">{statusMessage || 'Working on your recommendations\u2026'}</p>
            <p className="text-xs text-indigo-500">{elapsed}s elapsed</p>
          </div>
          {content.trim().length > 0 && (
            <div className="mt-5">
              <ModelOutputRenderer content={content} isStreaming />
            </div>
          )}
        </div>
      )}

      {phase === 'error' && (
        <div className="animate-fade-in-up mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
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
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="animate-fade-in-up mt-6 rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-lg shadow-indigo-100/40 backdrop-blur">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span
                title={keyword.trim()}
                className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700"
              >
                Keyword: {keyword.trim()}
              </span>
              <span
                title={client.trim()}
                className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700"
              >
                Client: {client.trim()}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                {copied ? 'Copied!' : 'Copy Markdown'}
              </button>
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1"
              >
                Download PDF
              </button>
              <button
                type="button"
                onClick={handleGenerateMore}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                Regenerate
              </button>
            </div>
          </div>
          <div className="mt-5">
            <ModelOutputRenderer content={content} showSourcesFallback />
          </div>
        </div>
      )}
    </div>
  );
}
