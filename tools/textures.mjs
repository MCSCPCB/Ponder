import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { json, path, write } from "./files.mjs";

const root = "src/RP/textures/ui/ponder/";
const rgba = (rgb, alpha = 255) => [rgb >> 16 & 255, rgb >> 8 & 255, rgb & 255, alpha];
function image(name, width, height, paint, nineSlice) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
    png.data.set(paint(x, y), (y * width + x) * 4);
  write(root + name + ".png", PNG.sync.write(png));
  if (nineSlice !== undefined) json(root + name + ".json", {
    nineslice_size: nineSlice, base_size: [width, height],
  });
}
function crop(name, source, x, y, width = 16, height = 16) {
  image(name, width, height, (i, j) => {
    const offset = ((j + y) * source.width + i + x) * 4;
    return source.data.subarray(offset, offset + 4);
  });
}
function frame(name, width, height, top, bottom) {
  image(name, width, height, (x, y) => {
    const color = top.map((n, k) => Math.round(n + (bottom[k] - n) * y / (height - 1)));
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return color;
    if (x === 1 || y === 1 || x === width - 2 || y === height - 2) return rgba(0x000000, 200);
    return rgba(0x000000, 160);
  }, 2);
}
export function generateTextures() {
  // Vendored under licenses/Ponder-MIT.txt. Builds never read _sample.
  const widgets = PNG.sync.read(readFileSync(path("assets/source/ponder-widgets.png")));
  for (const [name, x, y] of [
    ["prev", 0, 32], ["close", 16, 32], ["next", 32, 32], ["replay", 64, 32],
    ["edit", 80, 32], ["comfy", 96, 32], ["back", 80, 48],
    ["attack", 0, 64], ["scroll", 16, 64], ["use", 32, 64],
  ]) crop("icon_" + name, widgets, x, y);
  const transparent = rgba(0, 0), white = rgba(0xeeeeee);
  image("icon_pause", 16, 16, (x, y) => y >= 3 && y <= 12 && (x >= 4 && x <= 6 || x >= 10 && x <= 12) ? white : transparent);
  image("icon_play", 16, 16, (x, y) => x >= 5 && x <= 12 && Math.abs(y - 7.5) <= (13 - x) / 1.5 ? white : transparent);
  image("icon_items", 16, 16, (x, y) => x >= 2 && y >= 2 && x < 14 && y < 14 && x % 5 < 3 && y % 5 < 3 ? white : transparent);
  image("icon_tags", 16, 16, (x, y) => x >= 2 && x < 13 && y >= 3 && y < 13 && x + y > 7 && !(x >= 4 && x <= 5 && y >= 5 && y <= 6) ? white : transparent);
  image("icon_touch", 16, 16, (x, y) => (x >= 6 && x <= 8 && y >= 2 && y <= 12 || x >= 4 && x <= 11 && y >= 8 && y <= 13) ? white : transparent);
  image("icon_slot", 16, 16, (x, y) => (x === 2 || x === 13) && y >= 2 && y <= 13 || (y === 2 || y === 13) && x >= 2 && x <= 13 ? white : transparent);
  image("pointer", 16, 16, (x, y) => x >= 3 && x <= 12 && Math.abs(y - 7.5) <= (12 - x) / 1.3 ? white : transparent);
  for (const [state, a, b, color] of [
    ["default", 0x60, 0x30, 0xc0c0ff], ["hover", 0xf0, 0xa0, 0xc0c0ff],
    ["pressed", 0xff, 0xdd, 0xffffff], ["disabled", 0x80, 0x20, 0x909090],
  ]) {
    frame("button_bg_" + state, 28, 28, rgba(color, a), rgba(color, b));
    frame("side_button_bg_" + state, 28, 28, rgba(color, a), rgba(color, b));
  }
  frame("header_icon_frame", 38, 38, rgba(0xc0c0ff, 0x60), rgba(0xc0c0ff, 0x30));
  frame("progress_track", 228, 9, rgba(0xc0c0ff, 0x60), rgba(0xc0c0ff, 0x30));
  frame("text_bubble_frame", 28, 18, rgba(0xeeeeee, 120), rgba(0xeeeeee, 70));
  image("progress_fill", 1, 3, (_, y) => rgba(y === 0 ? 0xd1d1f0 : 0xb0b0df, 240), 0);
  image("progress_keyframe", 2, 5, () => rgba(0xeeeeee, 150));
  image("white", 1, 1, () => rgba(0xffffff));
  image("black", 1, 1, () => rgba(0));
  image("header_streak_thick", 64, 24, (x, y) =>
    rgba(0, Math.round(160 * Math.min(1, x / 10, (63 - x) / 18) * (y === 0 || y === 23 ? .5 : 1))), [10, 1, 18, 1]);
  image("tooltip_streak", 64, 18, (x) => rgba(0, Math.round(180 * Math.min(1, (63 - x) / 22))), [1, 1, 22, 1]);
}
