"use client"

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ParsedModelOutput, QAItem, SourceLink } from '@/lib/types';
import { parseModelOutput } from '@/lib/modelOutput';

/**
 * Shared defensive renderer for model output. Feed it raw (already decoded)
 * model markdown and it adapts to the actual structure of the response:
 * heading sections become cards, Q&A/FAQ numbered lists become question/answer
 * entries, reference URLs become a dedicated truncated "Sources" list, and
 * anything unparseable falls back to sanitized markdown prose. Content taller
 * than the panel scrolls internally with a visible affordance.
 */

const PROSE_CLASSES =
  'prose prose-sm prose-slate mt-2 max-w-none break-words prose-headings:font-display prose-headings:font-semibold prose-headings:text-ink prose-a:text-indigo-600 prose-strong:text-ink prose-li:my-1 prose-th:bg-slate-50 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2';

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={typeof href === 'string' ? href : undefined}
      className="break-all"
    >
      {children}
    </a>
  ),
};

function MarkdownBlock({ markdown }: { markdown: string }) {
  return (
    <div className={PROSE_CLASSES}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents} skipHtml>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function QAList({ items }: { items: QAItem[] }) {
  return (
    <ol className="mt-3 space-y-3">
      {items.map((item) => (
        <li key={item.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <h4 className="text-sm font-semibold leading-snug text-ink">{item.question}</h4>
          {item.answer ? (
            <MarkdownBlock markdown={item.answer} />
          ) : (
            <p className="mt-1 text-sm italic text-slate-400">No answer was returned for this question.</p>
          )}
        </li>
      ))}
    </ol>
  );
}

function SourcesSection({
  sources,
  showFallback,
  fallbackText,
}: {
  sources: SourceLink[];
  showFallback: boolean;
  fallbackText: string;
}) {
  if (sources.length === 0 && !showFallback) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-display text-base font-semibold text-ink">Sources</h3>
      {sources.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {sources.map((source, index) => (
            <li key={`${source.url}-${index}`} className="flex min-w-0 items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-400" aria-hidden="true" />
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                title={source.url}
                className="block min-w-0 max-w-full truncate text-sm text-indigo-600 hover:underline"
              >
                {source.label && source.label !== source.url ? source.label : source.url}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm italic text-slate-400">{fallbackText}</p>
      )}
    </section>
  );
}

interface ModelOutputRendererProps {
  content: string;
  isStreaming?: boolean;
  showSourcesFallback?: boolean;
  sourcesFallbackText?: string;
}

export default function ModelOutputRenderer({
  content,
  isStreaming = false,
  showSourcesFallback = false,
  sourcesFallbackText = 'No sources returned for this recommendation.',
}: ModelOutputRendererProps) {
  const parsed = useMemo<ParsedModelOutput>(() => parseModelOutput(content), [content]);

  if (!parsed.hasContent) {
    if (isStreaming) return null;
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
        The response could not be parsed into readable content. Please try generating again.
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="scroll-panel max-h-[70vh] overflow-y-auto overscroll-contain pr-1">
        <div className="space-y-5 pb-6">
          {parsed.intro && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <MarkdownBlock markdown={parsed.intro} />
            </div>
          )}

          {parsed.qaItems.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-display text-base font-semibold text-ink">Questions &amp; Answers</h3>
              <QAList items={parsed.qaItems} />
            </div>
          )}

          {parsed.sections.map((section) => (
            <section key={section.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-display text-base font-semibold leading-snug text-ink">{section.title}</h3>
              {section.badges.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {section.badges.map((badge) => (
                    <span
                      key={`${section.id}-${badge.label}`}
                      className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700"
                    >
                      <span className="text-indigo-400">{badge.label}:</span> {badge.value}
                    </span>
                  ))}
                </div>
              )}
              {section.qaItems.length > 0 ? (
                <>
                  {section.body && <MarkdownBlock markdown={section.body} />}
                  <QAList items={section.qaItems} />
                </>
              ) : section.body ? (
                <MarkdownBlock markdown={section.body} />
              ) : (
                <p className="mt-2 text-sm italic text-slate-400">No details were returned for this section.</p>
              )}
            </section>
          ))}

          <SourcesSection
            sources={parsed.sources}
            showFallback={showSourcesFallback && !isStreaming}
            fallbackText={sourcesFallbackText}
          />
        </div>
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-xl bg-gradient-to-t from-white/95 to-transparent"
        aria-hidden="true"
      />
    </div>
  );
}
