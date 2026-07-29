/**
 * Robust display-text decoder shared by API routes and client components.
 *
 * Model/workflow payloads sometimes leak LITERAL escape sequences into the
 * text that reaches the UI — e.g. \u201c, \u201d, \u2018, \u2019, \u2026,
 * \u2013, \u2014 — instead of the real characters (left/right curly quotes,
 * apostrophes, ellipsis, en/em dashes). This happens when the upstream
 * JSON.stringify()s an already-stringified payload one or more times,
 * producing single-, double-, triple- or even quadruple-escaped sequences.
 *
 * decodeDisplayText() runs multiple normalization passes until the text is
 * stable, converting every \uXXXX escape (any nesting depth, up to 4 leading
 * backslashes per pass across 6 passes) plus escaped whitespace/quotes and
 * numeric HTML entities (&#8220; / &#x201C;) into their actual character
 * values, so the UI always shows the real characters and never the raw
 * escape codes.
 *
 * CRITICAL for the LOADING/STREAMING view: the accumulated stream is decoded
 * on every chunk, and a chunk boundary can land in the MIDDLE of an escape
 * sequence (e.g. the text currently ends with "\u20"). Such a dangling
 * partial escape used to render as raw unicode text until the next chunk
 * arrived. decodeDisplayText() now strips a trailing PARTIAL escape fragment
 * from its output, so in-progress escapes are hidden for one frame and then
 * rendered as the real character once the rest of the sequence streams in.
 * Complete escapes are always decoded first, so no finished character is
 * ever lost.
 *
 * Quick reference of the most common escapes this handles:
 *   \u201c → \u201c (left double quotation mark)
 *   \u201d → \u201d (right double quotation mark)
 *   \u2018 → \u2018 (left single quotation mark)
 *   \u2019 → \u2019 (right single quotation mark)
 *   \u2026 → \u2026 (horizontal ellipsis)
 *   \u2013 → \u2013 (en dash)
 *   \u2014 → \u2014 (em dash)
 * (…and every other \uXXXX / \u{XXXXXX} escape, not just these.)
 */

/** Decodes numeric HTML entities (&#8220; / &#x201C;) into real characters. */
function decodeHtmlEntities(input: string): string {
  if (!input.includes('&#')) return input;
  return input
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (match, hex: string) => {
      const code = parseInt(hex, 16);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    })
    .replace(/&#(\d{1,7});/g, (match, dec: string) => {
      const code = parseInt(dec, 10);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    });
}

/**
 * Removes a trailing PARTIAL escape fragment (a backslash run optionally
 * followed by 'u' and 0–3 hex digits) left dangling at a streaming chunk
 * boundary. Complete escapes (\u + 4 hex digits) are decoded before this
 * runs, so only genuinely incomplete fragments are ever removed — they would
 * otherwise flash as raw \u20… text in the loading view.
 */
export function stripTrailingPartialEscape(input: string): string {
  if (!input.endsWith('\\') && !/\\+u?[0-9a-fA-F]{0,3}$/.test(input)) return input;
  return input.replace(/\\+u?[0-9a-fA-F]{0,3}$/, '');
}

export function decodeDisplayText(input: string): string {
  if (!input) return input;
  let current = decodeHtmlEntities(input);
  for (let pass = 0; pass < 6; pass += 1) {
    if (!current.includes('\\')) break;
    const next = current
      // ES2015-style code point escapes: \u{1F600} (any nesting depth)
      .replace(/\\{1,4}u\{([0-9a-fA-F]{1,6})\}/g, (match, hex: string) => {
        const code = parseInt(hex, 16);
        return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      })
      // Standard 4-digit escapes: \u201c, \u201d, \u2018, \u2019, \u2026,
      // \u2013, \u2014 ... (also handles surrogate pairs since consecutive
      // escapes combine naturally, and 1–4 leading backslashes per pass so
      // deeply double/triple-escaped payloads fully resolve)
      .replace(/\\{1,4}u([0-9a-fA-F]{4})/g, (_match, hex: string) =>
        String.fromCharCode(parseInt(hex, 16))
      )
      .replace(/\\{1,4}r\\{1,4}n/g, '\n')
      .replace(/\\{1,4}n/g, '\n')
      .replace(/\\{1,4}t/g, '\t')
      .replace(/\\{1,4}r/g, '\n')
      .replace(/\\{1,4}"/g, '"')
      .replace(/\\{1,4}'/g, "'")
      .replace(/\\{1,4}\//g, '/');
    if (next === current) break;
    current = next;
  }
  // Hide a dangling partial escape at the very end (streaming chunk boundary)
  // so the loading view never shows a raw \u20… fragment; the full character
  // renders on the next decode pass once the rest of the sequence arrives.
  return stripTrailingPartialEscape(current);
}
