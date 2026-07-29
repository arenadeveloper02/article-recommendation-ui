/**
 * Robust display-text decoder shared by API routes and client components.
 *
 * Model/workflow payloads sometimes leak LITERAL escape sequences into the
 * text that reaches the UI — e.g. \u201c, \u201d, \u2026 — instead of the real
 * characters (\u201c = \u201c left curly quote, \u2026 = ellipsis). This happens when the
 * upstream JSON.stringify()s an already-stringified payload one or more times,
 * producing single-, double-, or even triple-escaped sequences.
 *
 * decodeDisplayText() runs multiple normalization passes until the text is
 * stable, converting every \uXXXX escape (any nesting depth up to 4 passes)
 * plus escaped whitespace/quotes into their actual character values, so the
 * UI always shows the real characters and never the raw escape codes.
 */
export function decodeDisplayText(input: string): string {
  if (!input) return input;
  let current = input;
  for (let pass = 0; pass < 4; pass += 1) {
    if (!current.includes('\\')) break;
    const next = current
      // ES2015-style code point escapes: \u{1F600}
      .replace(/\\{1,2}u\{([0-9a-fA-F]{1,6})\}/g, (match, hex: string) => {
        const code = parseInt(hex, 16);
        return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      })
      // Standard 4-digit escapes: \u201c, \u201d, \u2026, \u2019 ... (also
      // handles surrogate pairs since consecutive escapes combine naturally)
      .replace(/\\{1,2}u([0-9a-fA-F]{4})/g, (_match, hex: string) =>
        String.fromCharCode(parseInt(hex, 16))
      )
      .replace(/\\{1,2}r\\{1,2}n/g, '\n')
      .replace(/\\{1,2}n/g, '\n')
      .replace(/\\{1,2}t/g, '\t')
      .replace(/\\{1,2}r/g, '\n')
      .replace(/\\{1,2}"/g, '"')
      .replace(/\\{1,2}\//g, '/');
    if (next === current) break;
    current = next;
  }
  return current;
}
