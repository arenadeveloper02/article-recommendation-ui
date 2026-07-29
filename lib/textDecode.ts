/**
 * Robust display-text decoder shared by API routes and client components.
 *
 * ROOT CAUSE of the on-screen \uXXXX artifacts: the upstream workflow
 * JSON.stringify()s already-stringified payloads one or more times, so the
 * text that reaches this app can carry LITERAL escape sequences at ANY
 * nesting depth \u2014 e.g. \u201c, \u201d, \u2018, \u2019, \u2026, \u2013, \u2014 with
 * one, two, three or more leading backslashes. Any surface that rendered
 * such text without a full multi-depth decode showed the raw escape codes,
 * most visibly while the loading/streaming view accumulated chunks.
 *
 * decodeDisplayText() is the SINGLE, global, generic decoder applied at every
 * boundary where dynamic text enters the rendering pipeline (server API
 * routes before responding, and client components on every accumulated
 * stream update). It is fully generic: it converts EVERY valid \uXXXX and
 * \u{XXXXXX} escape (any number of leading backslashes, any code point, not
 * a hardcoded character list) plus escaped whitespace/quotes and numeric
 * HTML entities (&#8220; / &#x201C;) into real characters, running repeated
 * normalization passes until the text is stable.
 *
 * CRITICAL for the LOADING/STREAMING view: the accumulated stream is decoded
 * on every chunk, and a chunk boundary can land in the MIDDLE of an escape
 * sequence (e.g. the text currently ends with "\u20"). Such a dangling
 * partial escape used to render as raw unicode text until the next chunk
 * arrived. decodeDisplayText() strips a trailing PARTIAL escape fragment
 * from its output, so in-progress escapes are hidden for one frame and then
 * rendered as the real character once the rest of the sequence streams in.
 * Complete escapes are always decoded first, so no finished character is
 * ever lost.
 *
 * Quick reference of the most common escapes this handles:
 *   \u201c \u2192 \u201c (left double quotation mark)
 *   \u201d \u2192 \u201d (right double quotation mark)
 *   \u2018 \u2192 \u2018 (left single quotation mark)
 *   \u2019 \u2192 \u2019 (right single quotation mark)
 *   \u2026 \u2192 \u2026 (horizontal ellipsis)
 *   \u2013 \u2192 \u2013 (en dash)
 *   \u2014 \u2192 \u2014 (em dash)
 * (\u2026and every other \uXXXX / \u{XXXXXX} escape \u2014 the decoder is generic,
 * not a lookup table.)
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
 * followed by 'u' and 0\u20133 hex digits) left dangling at a streaming chunk
 * boundary. Complete escapes (\u + 4 hex digits) are decoded before this
 * runs, so only genuinely incomplete fragments are ever removed \u2014 they would
 * otherwise flash as raw \u20\u2026 text in the loading view.
 */
export function stripTrailingPartialEscape(input: string): string {
  if (!input.endsWith('\\') && !/\\+u?[0-9a-fA-F]{0,3}$/.test(input)) return input;
  return input.replace(/\\+u?[0-9a-fA-F]{0,3}$/, '');
}

export function decodeDisplayText(input: string): string {
  if (!input) return input;
  let current = decodeHtmlEntities(input);
  // Each pass collapses an ARBITRARY run of leading backslashes per escape
  // (\\+ instead of a fixed 1\u20134), so single-, double-, triple- and deeper
  // nested encodings resolve generically. Multiple passes handle payloads
  // whose decoding EXPOSES further literal escapes; the loop exits as soon
  // as a pass produces no change, so already-clean text costs one scan.
  for (let pass = 0; pass < 8; pass += 1) {
    if (!current.includes('\\')) break;
    const next = current
      // ES2015-style code point escapes: \u{1F600} (any nesting depth)
      .replace(/\\+u\{([0-9a-fA-F]{1,6})\}/g, (match, hex: string) => {
        const code = parseInt(hex, 16);
        return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      })
      // Standard 4-digit escapes: \u201c, \u201d, \u2018, \u2019, \u2026,
      // \u2013, \u2014 ... (also handles surrogate pairs since consecutive
      // escapes combine naturally). Generic: ANY valid \uXXXX sequence.
      .replace(/\\+u([0-9a-fA-F]{4})/g, (_match, hex: string) =>
        String.fromCharCode(parseInt(hex, 16))
      )
      .replace(/\\+r\\+n/g, '\n')
      .replace(/\\+n/g, '\n')
      .replace(/\\+t/g, '\t')
      .replace(/\\+r/g, '\n')
      .replace(/\\+"/g, '"')
      .replace(/\\+'/g, "'")
      .replace(/\\+\//g, '/');
    if (next === current) break;
    current = next;
  }
  // Hide a dangling partial escape at the very end (streaming chunk boundary)
  // so the loading view never shows a raw \u20\u2026 fragment; the full character
  // renders on the next decode pass once the rest of the sequence arrives.
  return stripTrailingPartialEscape(current);
}
