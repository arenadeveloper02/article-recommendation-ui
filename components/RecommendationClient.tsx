"use client"

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { jsPDF } from 'jspdf';
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

/**
 * Converts markdown to clean plain text for the PDF export: strips heading
 * markers, bold/italic/inline-code syntax, converts links to "text (url)",
 * and normalizes list bullets. Keeps paragraph breaks intact.
 */
function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^\s*[-*+]\s+/gm, '\u2022 ')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Filesystem-safe slug: lowercase, hyphens instead of spaces/special chars. */
function sanitizeForFilename(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'untitled';
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

  /**
   * Builds a clean, writer-friendly PDF from the currently displayed cards
   * using jsPDF (fully client-side — no backend changes). Layout: a document
   * header with the keyword/client, then each recommendation as its own
   * separated block (title, meta badges line, plain-text body). Interactive
   * UI elements (buttons, hover states) are never included.
   */
  const handleDownloadPdf = () => {
    if (isStreaming || parsed.cards.length === 0) return;

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 48;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const ensureSpace = (needed: number): void => {
      if (y + needed > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    };

    // Document header: what the recommendations were generated for.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(20, 27, 51);
    doc.text('Article Recommendations', margin, y);
    y += 22;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(100, 100, 100);
    const kwLabel = keyword.trim() || 'n/a';
    const clLabel = client.trim() || 'n/a';
    doc.text(`Target keyword: ${kwLabel}    Client: ${clLabel}`, margin, y);
    y += 14;
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
    y += 12;

    doc.setDrawColor(190, 190, 200);
    doc.setLineWidth(0.8);
    doc.line(margin, y, pageWidth - margin, y);
    y += 24;

    parsed.cards.forEach((card, index) => {
      // Card title.
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(20, 27, 51);
      const titleLines = doc.splitTextToSize(`${index + 1}. ${card.title}`, contentWidth) as string[];
      ensureSpace(titleLines.length * 17 + 8);
      doc.text(titleLines, margin, y);
      y += titleLines.length * 17 + 4;

      // Meta line: intent, difficulty, search volume, word count, etc.
      if (card.badges.length > 0) {
        const metaText = card.badges.map((badge) => `${badge.label}: ${badge.value}`).join('    ');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(90, 90, 110);
        const metaLines = doc.splitTextToSize(metaText, contentWidth) as string[];
        ensureSpace(metaLines.length * 13 + 8);
        doc.text(metaLines, margin, y);
        y += metaLines.length * 13 + 8;
      }

      // Rationale / body as clean plain text (markdown syntax stripped).
      const bodyText = markdownToPlainText(card.body);
      if (bodyText) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        doc.setTextColor(45, 45, 55);
        const bodyLines = doc.splitTextToSize(bodyText, contentWidth) as string[];
        for (const line of bodyLines) {
          ensureSpace(15);
          doc.text(line, margin, y);
          y += 15;
        }
        y += 8;
      }

      // Separator between recommendation blocks.
      if (index < parsed.cards.length - 1) {
        ensureSpace(24);
        doc.setDrawColor(220, 220, 228);
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageWidth - margin, y);
        y += 22;
      }
    });

    const fileName = `article-recommendations-${sanitizeForFilename(keyword)}-${sanitizeForFilename(client)}.pdf`;
    doc.save(fileName);
  };

  const inputClasses = (hasError: boolean): string =>
    `w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-50 ${
      hasError ? 'border-red-400' : 'border-slate-300 focus:border-indigo-500'
    }`;

  const showResults = isStreaming || (phase === 'done' && content.length > 0);
  const canDownloadPdf = !isStreaming && parsed.cards.length > 0;

  return (
    <div className="w-full">
      <header className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200/70 bg-white px-3 py-1 text-xs font-medium tracking-wide text-indigo-700 shadow-sm">
          SEO Content Intelligence
        </span>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          Article Recommendation Agent
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-500 sm:text-base">
          Enter a target keyword and client to get writer-ready article recommendations with intent,
          difficulty, and formatting guidance.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="mx-auto mt-8 w-full max-w-3xl rounded-2xl border border-indigo-100/80 bg-white/90 p-6 shadow-xl shadow-indigo-200/40 backdrop-blur sm:p-8"
      >
        <div className="grid gap-4 sm:grid-cols-2">
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
              className={inputClasses(Boolean(fieldErrors.keyword))}
            />
            {fieldErrors.keyword && <p className="mt-1.5 text-xs text-red-600">{fieldErrors.keyword}</p>}
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
              className={inputClasses(Boolean(fieldErrors.client))}
            />
            {fieldErrors.client && <p className="mt-1.5 text-xs text-red-600">{fieldErrors.client}</p>}
          </div>
        </div>
        <button
          type="submit"
          disabled={isStreaming || !canSubmit}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-300/50 transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-indigo-300 disabled:shadow-none"
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
      </form>

      {phase === 'error' && (
        <div className="mx-auto mt-8 max-w-3xl rounded-xl border border-red-200 bg-red-50 p-5 animate-fade-in-up">
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

      {showResults && (
        <section className="mx-auto mt-10 w-full max-w-5xl animate-fade-in-up">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-display text-xl font-semibold text-ink">
              {isStreaming ? 'Generating recommendations\u2026' : 'Your recommendations'}
            </h2>
            <div className="flex flex-wrap gap-2">
              {parsed.cards.length > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={!canDownloadPdf}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-indigo-300"
                >
                  <svg
                    className="h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                    <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                  </svg>
                  Download as PDF
                </button>
              )}
              {phase === 'done' && (
                <button
                  type="button"
                  onClick={handleGenerateMore}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  Regenerate
                </button>
              )}
            </div>
          </div>

          {isStreaming && (
            <div className="mt-4 rounded-xl border border-indigo-100 bg-white/80 p-4">
              <div className="gradient-progress h-1.5 w-full rounded-full" />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-indigo-800">{statusMessage}</p>
                <p className="text-xs text-indigo-500">{elapsed}s elapsed</p>
              </div>
            </div>
          )}

          {parsed.intro && (
            <div className={`mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${PROSE_CLASSES}`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {parsed.intro}
              </ReactMarkdown>
            </div>
          )}

          {parsed.cards.length > 0 && (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {parsed.cards.map((card) => (
                <article
                  key={card.id}
                  className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm animate-fade-in-up"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-lg font-semibold text-ink">{card.title}</h3>
                    <button
                      type="button"
                      onClick={() => void handleCopy(card.id, card.raw)}
                      className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    >
                      {copiedId === card.id ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  {card.badges.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {card.badges.map((badge) => (
                        <span
                          key={`${card.id}-${badge.label}`}
                          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
                        >
                          <span className="font-semibold">{badge.label}:</span> {badge.value}
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
            </div>
          )}

          {parsed.cards.length === 0 && !parsed.intro && content && (
            <div className={`mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${PROSE_CLASSES}`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {content}
              </ReactMarkdown>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
