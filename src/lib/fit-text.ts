/**
 * Rough text metrics used to pick a starting font size *before* the browser has
 * measured anything — on the server, and for the frame between paint and
 * `FitText`'s own measurement. It only has to land close enough that the
 * correction is invisible; `FitText` then measures the real thing.
 *
 * It is also the no-JavaScript answer: with the estimate alone a long URL still
 * renders small enough to stay on one line, and a long headline still fits its
 * reserved box.
 */

/** Space is much narrower than a letter in both of the app's faces. */
const SPACE_EM = 0.28;
/** Hairline glyphs — mostly punctuation, plus the narrow Latin letters. */
const NARROW_EM = 0.34;
const NARROW = new Set("ijlt.,:;!|'\"`/\\()[]{}-");
/** The two Latin letters that are reliably near-square. */
const WIDE_EM = 0.85;
const WIDE = new Set("MWmw");
/** Everything else in a Latin/Cyrillic/Greek run. */
const DEFAULT_EM = 0.6;

/**
 * Code point ranges that render full-width (one whole em): CJK ideographs,
 * kana, Hangul, and the halfwidth/fullwidth forms block. Latin text mixed into
 * a Japanese or Chinese string keeps its own narrow weights.
 */
const FULL_WIDTH_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2e80, 0x303e], // CJK radicals + symbols/punctuation
  [0x3041, 0x33ff], // kana, Bopomofo, compatibility jamo, CJK squares
  [0x3400, 0x4dbf], // CJK ext. A
  [0x4e00, 0x9fff], // CJK unified ideographs
  [0xa960, 0xa97f], // Hangul Jamo ext. A
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xfe30, 0xfe4f], // CJK compatibility forms
  [0xff01, 0xff60], // fullwidth forms
  [0xffe0, 0xffe6], // fullwidth signs
  [0x20000, 0x3fffd], // CJK ext. B and beyond
];

function isFullWidth(codePoint: number): boolean {
  return FULL_WIDTH_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to);
}

/**
 * Approximate width of `text` in em, for the app's display and mono faces.
 *
 * Combining marks (Vietnamese tone marks, for example) add no advance width, so
 * they are skipped — otherwise `Việt` would be counted as wider than `Viet`.
 */
export function estimateTextWidthEm(text: string): number {
  let em = 0;
  for (const char of text.normalize("NFC")) {
    const codePoint = char.codePointAt(0) ?? 0;
    // Combining diacritical marks and their Latin-Extended/Vietnamese block.
    if (codePoint >= 0x0300 && codePoint <= 0x036f) continue;
    if (isFullWidth(codePoint)) em += 1;
    else if (char === " ") em += SPACE_EM;
    else if (NARROW.has(char)) em += NARROW_EM;
    else if (WIDE.has(char)) em += WIDE_EM;
    else em += DEFAULT_EM;
  }
  return Math.max(em, 1);
}
