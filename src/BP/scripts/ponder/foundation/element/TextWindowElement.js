import { LIMITS, PALETTE } from "../../enums/PonderConfig.js";
import { FONT_METRICS } from "./FontMetrics.js";

// Advances in UI pixels, measured from the vanilla Bedrock default8.png atlas
// (rightmost inked column + 2; space is 4). Everything else in ASCII is 6.
// Non-ASCII glyphs have no measured source: they use 8, the half-width of a 16px cell.
const ASCII = {
  " ": 4, "!": 2, '"': 5, "'": 3, "(": 5, ")": 5, "*": 5, ",": 2, ".": 2,
  ":": 2, ";": 2, "<": 5, ">": 5, "@": 7, "~": 7, "I": 4, "[": 4, "]": 4,
  "`": 3, "f": 5, "i": 2, "l": 3, "k": 5, "t": 4, "{": 5, "|": 2, "}": 5,
};
const FORMAT = {
  "0": 0x000000, "1": 0x0000aa, "2": 0x00aa00, "3": 0x00aaaa,
  "4": 0xaa0000, "5": 0xaa00aa, "6": 0xffaa00, "7": 0xaaaaaa,
  "8": 0x555555, "9": 0x5555ff, a: 0x55ff55, b: 0x55ffff,
  c: 0xff5555, d: 0xff55ff, e: 0xffff55, f: 0xffffff,
};
export function glyphMetric(char, overrides = FONT_METRICS) {
  const code = char.codePointAt(0);
  if (overrides[code]) return overrides[code];
  const advance = ASCII[char] ?? (code < 128 ? 6 : 8);
  // Full-cell fallback never clips an unmeasured glyph. Custom atlas metrics may
  // crop transparent margins; they must come from that atlas, not advance width.
  return { advance, left: 0, width: 16 };
}
export const themeColor = (value) => typeof value === "number" ? value : PALETTE[value] ?? PALETTE.white;
export function textTokens(text, color = PALETTE.white, metrics = FONT_METRICS) {
  const tokens = [], chars = Array.from(String(text));
  let current = themeColor(color);
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === "§" && i + 1 < chars.length) {
      const code = chars[++i].toLowerCase();
      current = code === "r" ? themeColor(color) : FORMAT[code] ?? current;
      continue;
    }
    let char = chars[i];
    if ((char.codePointAt(0) ?? 0) > 0xffff) char = "?";
    tokens.push({ char, code: char.codePointAt(0), color: current, ...glyphMetric(char, metrics) });
  }
  return tokens;
}
export function wrapText(text, { width = 180, lineHeight = 9, color = PALETTE.white, metrics = FONT_METRICS } = {}) {
  if (!Number.isFinite(width) || width < 8 || width > 180) throw new Error("Text width must be 8..180");
  const tokens = textTokens(text, color, metrics);
  if (tokens.length > LIMITS.textCharacters) throw new Error(`Text exceeds ${LIMITS.textCharacters} glyphs`);
  const lines = [];
  let line = [], advance = 0;
  const flush = () => {
    while (line.at(-1)?.char === " ") line.pop();
    lines.push(line); line = []; advance = 0;
  };
  for (const token of tokens) {
    if (token.char === "\n") { flush(); continue; }
    if (advance + token.advance > width && line.length) {
      const split = line.map(g => g.char).lastIndexOf(" ");
      if (split > 0) {
        const tail = line.splice(split + 1);
        flush(); line = tail; advance = tail.reduce((n, g) => n + g.advance, 0);
      } else flush();
    }
    if (!line.length && token.char === " ") continue;
    line.push(token); advance += token.advance;
  }
  if (line.length || !lines.length) flush();
  if (lines.length > LIMITS.textLines) throw new Error(`Text exceeds ${LIMITS.textLines} lines; split the annotation`);
  const glyphs = [];
  let widest = 0;
  lines.forEach((row, y) => {
    let x = 0;
    for (const token of row) {
      if (token.char !== " ") glyphs.push({ ...token, x, y: y * lineHeight });
      x += token.advance;
    }
    widest = Math.max(widest, x);
  });
  return { glyphs, lines: lines.length, width: widest, height: lines.length * lineHeight, lineHeight };
}
export function packGlyph(g) {
  const left = clampMetric(g.left, 0, 15), width = clampMetric(g.width, 1, 16 - left);
  return (g.code & 0xffff) + left * 65536 + (width - 1) * 1048576;
}
const clampMetric = (n, low, high) => Math.max(low, Math.min(high, Math.floor(n)));
