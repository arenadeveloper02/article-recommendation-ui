import type {
  ModelOutputBadge,
  ModelOutputSection,
  ParsedModelOutput,
  QAItem,
  SourceLink,
  VisualOpportunity,
} from '@/lib/types';

/**
 * Shared, defensive model-output utilities. Every output surface (streamed
 * recommendations, briefs, future sections) should run raw model text through
 * these helpers so sentinel tokens, escape artifacts, and raw HTML never reach
 * the DOM, and so rendering can adapt to whatever structure the model returns.
 */

const SENTINEL_PATTERN =
  /\[\s*(?:DONE|END|EOS|EOF|STOP|COMPLETE|FINISHED)\s*\]|<\|\s*(?:im_end|endoftext|eot_id|end|done|stop)\s*\|>/gi;

/**
 * Removes completion/control sentinel tokens (e.g. [DONE], [END], <|endoftext|>)
 * ANYWHERE in the text \u2014 end of a line, appended to a URL, mid-list \u2014 not just at
 * the very end of the full response.
 */
export function stripSentinelTokens(input: string): string {
  if (!input) return input;
  return input.replace(SENTINEL_PATTERN, '').replace(/[ \t]+$/gm, '');
}

/** Decodes literal \uXXXX escape sequences and escaped whitespace in accumulated text. */
export function decodeEscapedText(input: string): string {
  if (!input.includes('\\')) return input;
  return input
    .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"');
}

/** Unwraps a value that is still a JSON-encoded string (double stringification upstream). */
export function unwrapJsonString(text: string): string {
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

/**
 * Sanitizes model markdown before rendering: strips script/style blocks entirely
 * (even unterminated ones from partial streams) and escapes any other raw HTML
 * tag opener so malformed model output cannot break the DOM structure. Markdown
 * autolinks like <https://example.com> are preserved.
 */
export function sanitizeModelMarkdown(input: string): string {
  if (!input) return input;
  return input
    .replace(/<script[\s\S]*?(?:<\/script>|$)/gi, '')
    .replace(/<style[\s\S]*?(?:<\/style>|$)/gi, '')
    .replace(/<(?=\/?[a-zA-Z])(?!https?:\/\/)/g, '&lt;');
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

export function extractBadges(body: string): { badges: ModelOutputBadge[]; cleaned: string } {
  const badges: ModelOutputBadge[] = [];
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

/**
 * Visual & table opportunity extraction. Explicit model suggestions like
 * "Visual: ...", "Table idea: ...", "Infographic: ..." are pulled out of the
 * section body into a dedicated callout. When the model returned NO explicit
 * visual/table notes for a section, relevant opportunities are inferred from
 * the section's own content (comparisons -> table, steps -> infographic,
 * statistics -> chart, long prose -> supporting image) so every substantial H2
 * section surfaces where a visual or table would help.
 */

const EXPLICIT_VISUAL_LINE =
  /^\s*[-*+]?\s*(?:\*\*)?(visual(?:\s+opportunit(?:y|ies))?|suggested\s+visuals?|image(?:\s+idea)?|table(?:\s+idea|\s+opportunity)?|chart(?:\s+idea)?|infographic(?:\s+idea)?|diagram(?:\s+idea)?)(?:\*\*)?\s*:\s*(.+)$/i;

const FAQ_TITLE = /faq|frequently asked|common questions/i;

function visualTypeFromLabel(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes('table')) return 'Table';
  if (lower.includes('chart')) return 'Chart';
  if (lower.includes('infographic')) return 'Infographic';
  if (lower.includes('diagram')) return 'Diagram';
  if (lower.includes('image')) return 'Image';
  return 'Visual';
}

function inferVisualOpportunities(title: string, body: string): VisualOpportunity[] {
  const combined = `${title}\n${body}`;
  const visuals: VisualOpportunity[] = [];
  const hasMarkdownTable = /(^|\n)\s*\|.*\|\s*(\n|$)/.test(body);
  if (
    !hasMarkdownTable &&
    /\b(vs\.?|versus|compar(?:e|ison|ing)|pros and cons|cost|price|pricing|types of|options|before and after)\b/i.test(
      combined
    )
  ) {
    visuals.push({
      type: 'Table',
      suggestion:
        'Summarize the comparison points in this section (options, costs, pros/cons) as a scannable table.',
    });
  }
  if (/\b(steps?|process|procedure|how to|timeline|stages?|phases?)\b/i.test(combined)) {
    visuals.push({
      type: 'Infographic',
      suggestion:
        'Illustrate the step-by-step process or timeline described here as a simple infographic or numbered flow graphic.',
    });
  }
  if (
    visuals.length < 2 &&
    /\d+\s*%|\b(statistics?|survey|study|studies|data shows?)\b/i.test(combined)
  ) {
    visuals.push({
      type: 'Chart',
      suggestion: 'Turn the statistics or study data mentioned in this section into a small chart or data callout.',
    });
  }
  if (visuals.length === 0 && body.trim().length > 250) {
    visuals.push({
      type: 'Image',
      suggestion: 'Add a relevant supporting image or annotated photo to break up the text in this section.',
    });
  }
  return visuals.slice(0, 2);
}

export function extractVisualOpportunities(
  title: string,
  body: string
): { visuals: VisualOpportunity[]; cleaned: string } {
  const visuals: VisualOpportunity[] = [];
  const kept: string[] = [];
  for (const line of body.split('\n')) {
    const match = line.match(EXPLICIT_VISUAL_LINE);
    if (match) {
      const suggestion = match[2].replace(/\*\*/g, '').trim();
      if (suggestion.length > 0 && suggestion.length <= 300) {
        visuals.push({ type: visualTypeFromLabel(match[1]), suggestion });
        continue;
      }
    }
    kept.push(line);
  }
  const cleaned = kept.join('\n').trim();
  if (visuals.length === 0 && !FAQ_TITLE.test(title)) {
    visuals.push(...inferVisualOpportunities(title, cleaned));
  }
  return { visuals: visuals.slice(0, 3), cleaned };
}

function trimUrl(raw: string): string {
  return raw.replace(/^</, '').replace(/>$/, '').replace(/[.,;:!?]+$/, '');
}

function addSource(sources: SourceLink[], url: string, label: string): void {
  const cleanUrl = url.trim();
  if (!cleanUrl) return;
  if (sources.some((existing) => existing.url === cleanUrl)) return;
  sources.push({ url: cleanUrl, label: label.trim() || cleanUrl });
}

/** Collects markdown links and bare URLs from a block of text into the sources list. */
function collectLinks(text: string, sources: SourceLink[]): void {
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let match: RegExpExecArray | null = linkRegex.exec(text);
  while (match !== null) {
    addSource(sources, trimUrl(match[2]), match[1]);
    match = linkRegex.exec(text);
  }
  const withoutMdLinks = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '');
  const bare = withoutMdLinks.match(/https?:\/\/[^\s<>)"']+/g) ?? [];
  for (const raw of bare) {
    const url = trimUrl(raw);
    addSource(sources, url, url);
  }
}

const BARE_URL_LINE = /^\s*(?:[-*+]|\d+[.)])?\s*<?(https?:\/\/[^\s<>]+)>?\s*$/;

/** Moves lines that consist solely of a (possibly bulleted/numbered) URL into sources. */
function extractBareUrlLines(text: string, sources: SourceLink[]): { text: string } {
  if (!text) return { text: '' };
  const kept: string[] = [];
  for (const line of text.split('\n')) {
    const match = line.match(BARE_URL_LINE);
    if (match) {
      const url = trimUrl(match[1]);
      addSource(sources, url, url);
      continue;
    }
    kept.push(line);
  }
  return { text: kept.join('\n').trim() };
}

/**
 * Detects Q&A/FAQ-style numbered lists. Returns items only when at least two
 * question-shaped entries are found, so plain numbered lists render as markdown.
 */
export function parseQAItems(text: string): QAItem[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const blocks = trimmed.split(/\n(?=\s*\d+[.)]\s)/);
  if (blocks.length < 2) return [];
  const items: QAItem[] = [];
  blocks.forEach((block, index) => {
    const blockText = block.trim();
    const numbered = blockText.match(/^\d+[.)]\s+([\s\S]*)$/);
    if (!numbered) return;
    const rest = numbered[1].trim();
    const bold = rest.match(/^\*\*([^*]+\?)\*\*\s*:?\s*([\s\S]*)$/);
    if (bold) {
      items.push({ id: `qa-${index}`, question: bold[1].trim(), answer: bold[2].trim() });
      return;
    }
    const questionEnd = rest.indexOf('?');
    if (questionEnd > 0 && questionEnd < 240) {
      items.push({
        id: `qa-${index}`,
        question: rest.slice(0, questionEnd + 1).replace(/\*\*/g, '').trim(),
        answer: rest.slice(questionEnd + 1).replace(/^\*\*\s*/, '').trim(),
      });
    }
  });
  return items.length >= 2 ? items : [];
}

const SOURCES_TITLE = /^(?:sources|references|citations|links|further reading|reference urls?)\b/i;

/** Index of the first numbered list item, or -1. Used to keep lead-in text before Q&A lists. */
function firstNumberedIndex(text: string): number {
  const match = text.match(/(^|\n)\s*\d+[.)]\s/);
  return match && typeof match.index === 'number' ? match.index : -1;
}

/**
 * Structure-aware, defensive parser for model output. Strips sentinel tokens,
 * sanitizes raw HTML, splits heading sections, extracts badge metadata, pulls
 * reference URLs (sources-titled sections, markdown links there, and bare URL
 * list lines anywhere) into a dedicated sources list, detects Q&A/FAQ-style
 * numbered lists, and attaches visual/table opportunities to every section.
 * Never throws on malformed or partially streamed input \u2014 unparseable text
 * simply lands in `intro` and renders as markdown.
 */
export function parseModelOutput(markdown: string): ParsedModelOutput {
  const cleaned = sanitizeModelMarkdown(stripSentinelTokens(markdown))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const sources: SourceLink[] = [];
  if (!cleaned) {
    return { intro: '', sections: [], qaItems: [], sources, hasContent: false };
  }

  let parts = cleaned.split(/\n(?=##\s)/);
  let headingPattern = /^##\s+/;
  if (parts.length < 2 && !headingPattern.test(cleaned)) {
    const h3Parts = cleaned.split(/\n(?=###\s)/);
    if (h3Parts.length >= 2 || /^###\s+/.test(cleaned)) {
      parts = h3Parts;
      headingPattern = /^###\s+/;
    }
  }

  const sections: ModelOutputSection[] = [];
  const introChunks: string[] = [];

  parts.forEach((part, index) => {
    const sectionText = part.trim();
    if (!sectionText) return;
    const firstLineEnd = sectionText.indexOf('\n');
    const firstLine = firstLineEnd === -1 ? sectionText : sectionText.slice(0, firstLineEnd);
    if (headingPattern.test(firstLine)) {
      const title = firstLine.replace(/^#{1,6}\s+/, '').trim();
      const rest = firstLineEnd === -1 ? '' : sectionText.slice(firstLineEnd + 1).trim();
      if (SOURCES_TITLE.test(title)) {
        collectLinks(rest, sources);
        return;
      }
      const { badges, cleaned: withoutBadges } = extractBadges(rest);
      const { text: bodyText } = extractBareUrlLines(withoutBadges, sources);
      const { visuals, cleaned: bodyWithoutVisuals } = extractVisualOpportunities(title, bodyText);
      const qaItems = parseQAItems(bodyWithoutVisuals);
      let body = bodyWithoutVisuals;
      if (qaItems.length > 0) {
        const numberedAt = firstNumberedIndex(bodyWithoutVisuals);
        body = numberedAt > 0 ? bodyWithoutVisuals.slice(0, numberedAt).trim() : '';
      }
      sections.push({ id: `section-${index}`, title, body, raw: sectionText, badges, qaItems, visuals });
    } else {
      introChunks.push(sectionText);
    }
  });

  let intro = extractBareUrlLines(introChunks.join('\n\n'), sources).text;

  let qaItems: QAItem[] = [];
  if (sections.length === 0) {
    qaItems = parseQAItems(intro);
    if (qaItems.length > 0) {
      const numberedAt = firstNumberedIndex(intro);
      intro = numberedAt > 0 ? intro.slice(0, numberedAt).trim() : '';
    }
  }

  const hasContent =
    intro.trim().length > 0 || sections.length > 0 || qaItems.length > 0 || sources.length > 0;

  return { intro: intro.trim(), sections, qaItems, sources, hasContent };
}

/**
 * Converts markdown to clean plain text for PDF export: strips heading markers,
 * bold/italic/inline-code syntax, converts links to "text (url)", and
 * normalizes list bullets. Keeps paragraph breaks intact.
 */
export function markdownToPlainText(markdown: string): string {
  return stripSentinelTokens(markdown)
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
export function sanitizeForFilename(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'untitled';
}
