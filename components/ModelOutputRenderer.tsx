"use client"

import { useMemo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ParsedModelOutput, QAItem, SourceLink } from '@/lib/types';
import { parseModelOutput } from '@/lib/modelOutput';

/**
 * Shared defensive renderer for model output. Feed it raw (already decoded)
 * model markdown and it adapts to the actual structure of the response:
 * heading sections become cards, Q&A/FAQ numbered lists become semantic
 * .faq-item blocks (question on its own line, answer below it), reference URLs
 * become a dedicated "Sources" list, and anything unparseable falls back to
 * sanitized markdown prose. Every card carries the `print-card` class so the
 * @media print stylesheet (app/globals.css) can keep it intact across PDF page
 * breaks; the SAME DOM is used for both the on-screen view and the printed PDF
 * ("print this view"), so there is no separate PDF template to drift.
 */

const PROSE_CLASSES =
  'prose prose-sm prose-slate mt-2 max-w-none break-words prose-headings:font-display prose-headings:font-semibold prose-headings:text-ink prose-a:text-indigo-600 prose-strong:text-ink prose-li:my-1 prose-th:bg-slate-50 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2';

/* ------------------------------------------------------------------------ */
/* Inline FAQ normalization.                                                 */
/*                                                                           */
/* Some model responses emit FAQ entries as a SINGLE line/paragraph where    */
/* the bold "Q:" question and the "A:" answer run together inline, e.g.:     */
/*   - **Q: How long do implants last?** A: With good care, 20+ years.      */
/* These never reach the structured QAList, so they used to render as one   */
/* run-on paragraph. splitInlineQA() rewrites such lines (and soft-wrapped   */
/* Q/A pairs) into two separate markdown blocks BEFORE rendering, and the    */
/* custom `p` renderer below tags them with .faq-q-line / .faq-a-line so     */
/* app/globals.css can style them: question on its own line, answer on a     */
/* new line 8px below with a 16px indent, and 24px between full items.      */
/* Applies to EVERY matching FAQ line in the content, not just the first.   */
/* All other markdown passes through completely untouched.                   */
/* ------------------------------------------------------------------------ */

/** A line containing BOTH a leading Q: question and an inline A: answer. */
const INLINE_QA_LINE =
  /^(\s*(?:(?:[-*+]|\d+[.)])\s+)?)((?:\*\*)?\s*Q\s*[:.].+?)\s+((?:\*\*)?A\s*[:.](?:\*\*)?\s+\S.*)$/;

/** A line that starts an answer ("A: ..." / "**A:** ..."). */
const ANSWER_START = /^\s*(?:\*\*)?A\s*[:.](?:\*\*)?\s+/;

/** A line that starts a question ("Q: ..." / "- **Q: ..."). */
const QUESTION_START = /^\s*(?:(?:[-*+]|\d+[.)])\s+)?(?:\*\*)?\s*Q\s*[:.]/;

function splitInlineQA(markdown: string): string {
  if (!markdown.includes('Q')) return markdown;
  const lines = markdown.split('\n');
  const out: string[] = [];
  let inFence = false;

  for (const line of lines) {
    // Never rewrite inside code fences.
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    // Case 1: question and answer run together on ONE line. Split them into
    // two blocks; inside list items the answer keeps the item's content
    // indentation so it stays a continuation paragraph of the same item.
    const inlineMatch = line.match(INLINE_QA_LINE);
    if (inlineMatch) {
      const prefix = inlineMatch[1];
      const question = inlineMatch[2].trim();
      const answer = inlineMatch[3].trim();
      const indent = ' '.repeat(prefix.length);
      out.push(prefix + question);
      out.push('');
      out.push(indent + answer);
      continue;
    }

    // Case 2: soft-wrapped pair — an "A:" line directly following a "Q:"
    // line inside the same paragraph (single newline). Insert a blank line so
    // markdown renders the answer as its own block instead of merging both
    // into one paragraph.
    if (ANSWER_START.test(line)) {
      const prev = out.length > 0 ? out[out.length - 1] : '';
      if (prev.trim().length > 0 && QUESTION_START.test(prev)) {
        const bullet = prev.match(/^(\s*)((?:[-*+]|\d+[.)])\s+)/);
        if (bullet) {
          out.push('');
          out.push(' '.repeat(bullet[0].length) + line.trim());
          continue;
        }
        out.push('');
      }
    }

    out.push(line);
  }

  return out.join('\n');
}

/** Recursively extracts the plain text of rendered markdown children. */
function extractPlainText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractPlainText).join('');
  if (typeof node === 'object' && 'props' in node) {
    const childProps = (node as { props?: { children?: ReactNode } }).props;
    return childProps ? extractPlainText(childProps.children) : '';
  }
  return '';
}

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
  // Tag Q/A paragraphs (produced or already present in the markdown) with
  // semantic classes so the stylesheet can render them as visually distinct
  // blocks: bold question on its own line, indented answer 8px below, and
  // 24px separation between full FAQ items. All other paragraphs render
  // exactly as before.
  p: ({ children }) => {
    const text = extractPlainText(children);
    if (/^\s*Q\s*[:.]/.test(text)) {
      return <p className="faq-q-line">{children}</p>;
    }
    if (/^\s*A\s*[:.]/.test(text)) {
      return <p className="faq-a-line">{children}</p>;
    }
    return <p>{children}</p>;
  },
};

function MarkdownBlock({ markdown }: { markdown: string }) {
  const processed = useMemo(() => splitInlineQA(markdown), [markdown]);
  return (
    <div className={PROSE_CLASSES}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents} skipHtml>
        {processed}
      </ReactMarkdown>
    </div>
  );
}

/**
 * FAQ list. Each Q&A is a distinct semantic block:
 *   <div class="faq-item">          — 24px bottom spacing + divider, break-inside: avoid
 *     <p class="faq-question">      — its own line, 15px, weight 500
 *     <div class="faq-answer">      — next line, normal weight, 8px top margin, 16px indent
 * The classes are styled in app/globals.css so the screen stylesheet and the
 * @media print stylesheet can target them independently while sharing the
 * exact same typography and spacing.
 */
function QAList({ items }: { items: QAItem[] }) {
  return (
    <div className="faq-list">
      {items.map((item) => (
        <div key={item.id} className="faq-item">
          <p className="faq-question">{item.question}</p>
          {item.answer ? (
            <div className="faq-answer">
              <MarkdownBlock markdown={item.answer} />
            </div>
          ) : (
            <p className="faq-answer text-sm italic text-slate-400">
              No answer was returned for this question.
            </p>
          )}
        </div>
      ))}
    </div>
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
    <section className="print-card rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
            <div className="print-card rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <MarkdownBlock markdown={parsed.intro} />
            </div>
          )}

          {parsed.qaItems.length > 0 && (
            <div className="print-card rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-display text-base font-semibold text-ink">Questions &amp; Answers</h3>
              <QAList items={parsed.qaItems} />
            </div>
          )}

          {parsed.sections.map((section) => (
            <section key={section.id} className="print-card rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
              {section.visuals.length > 0 && (
                <div className="print-card mt-4 rounded-lg border border-amber-200 bg-amber-50/70 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                    Visual &amp; Table Opportunities
                  </h4>
                  <ul className="mt-2 space-y-2">
                    {section.visuals.map((visual, index) => (
                      <li key={`${section.id}-visual-${index}`} className="flex items-start gap-2">
                        <span className="mt-0.5 inline-flex flex-shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                          {visual.type}
                        </span>
                        <span className="text-sm leading-snug text-amber-900">{visual.suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
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
        className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-xl bg-gradient-to-t from-white/95 to-transparent print:hidden"
        aria-hidden="true"
      />
    </div>
  );
}
