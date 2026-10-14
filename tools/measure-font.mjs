import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { write } from "./files.mjs";

/** Measure the actual alpha coverage, not a guessed ASCII advance table. */
export function measureAtlas(png, page) {
  if (png.width !== png.height || png.width % 16 || png.width < 256)
    throw new Error("Unicode atlas must be square, at least 256px, and divided into 16×16 cells");
  const cell = png.width / 16, unit = cell / 16, result = {};
  for (let index = 0; index < 256; index++) {
    let first = cell, last = -1;
    const ox = (index % 16) * cell, oy = Math.floor(index / 16) * cell;
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++)
      if (png.data[((oy + y) * png.width + ox + x) * 4 + 3] > 0) {
        first = Math.min(first, x); last = Math.max(last, x);
      }
    const code = page * 256 + index;
    if (last < 0 || code === 32) continue;
    // Packed geometry has 1/16-cell resolution. Round outwards, never clip ink.
    const left = Math.floor(first / unit), right = Math.ceil((last + 1) / unit);
    result[code] = { advance: (right - left) / 2 + 1, left, width: right - left };
  }
  return result;
}
export function measureDirectory(directory) {
  const metrics = {}, files = readdirSync(directory).filter(f => /^glyph_[0-9a-f]{2}\.png$/i.test(f)).sort();
  if (!files.length) throw new Error("No glyph_00.png … glyph_FF.png files found");
  for (const file of files)
    Object.assign(metrics, measureAtlas(PNG.sync.read(readFileSync(resolve(directory, file))), parseInt(file.slice(6, 8), 16)));
  return { metrics, pages: files.length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) {
    console.error("Usage: node tools/measure-font.mjs <matching-resource-pack/font-directory>");
    process.exitCode = 1;
  } else {
    const { metrics, pages } = measureDirectory(resolve(process.argv[2]));
    write("src/BP/scripts/ponder/config/fontMetrics.js",
      "// Measured from user-supplied Unicode atlases. Re-measure when the active font changes.\n" +
      "// Advance = measured ink width / 2 + 1 UI pixel; validate spacing in the target client.\n" +
      `export const FONT_METRICS = ${JSON.stringify(metrics)};\n`);
    console.log(`Measured ${Object.keys(metrics).length} glyphs from ${pages} pages. Run npm run verify and compare in game.`);
  }
}
