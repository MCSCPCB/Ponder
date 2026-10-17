// 临时测试：校准 TextPrimitive 的字形尺寸。自由摄像机 + FOV 48，对着自己的视线生成。
//   /scriptevent ponder:overlay_test     字宽：8 行 3 列。每行一个缩放候选，每列一个框，框宽是
//     Java 字体画这段文字的宽度（汉字 / 小写字母 / 数字和空格）。每列报文字正好填满框的那一行。
//   /scriptevent ponder:overlay_test h   行距：8 列，每列 5 行汉字放在 5 行高的框里，报正好填满的那列。
//   /scriptevent ponder:overlay_test p   标点宽度：7 行 4 列（，、。：），每行假设一种宽度（左侧数字，
//     单位同汉字 9），每列报正好填满框的那一行；最下面一条是 24 个汉字的对照，看是否正好填满。
//   /scriptevent ponder:overlay_test clear
// 顺便看文字在框里是否上下居中。测完删掉本文件和 index.js 里的 import 即可。
import { system, TextPrimitive, world } from "@minecraft/server";
import { WINDOW_ENTITY } from "../enums/PonderConfig.js";

const TEST_TAG = "ponder:overlay_test";
// Same as TextWindowElement: plane 2 blocks out, 270 GUI px per view height at FOV 48.
const DISTANCE = 2, FOV = 48, LAYER_STEP = 0.002, SCREEN_H = 270;
const PIXEL = 2 * DISTANCE * Math.tan(FOV * Math.PI / 360) / SCREEN_H;
// Candidate glyph advances, in blocks at TextPrimitive scale 1, one per row.
// The text is too big at 0.25 now, so the right value lies above it.
const CANDIDATES = [0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55];
// Calibrated: a CJK glyph is 0.25 blocks at scale 1. `p` mode measures punctuation against it.
const GLYPH = 0.25;
// Candidate punctuation widths in font units (a CJK glyph is 9), one per row.
const PUNCT_WIDTHS = [3, 4, 5, 6, 7, 8, 9];
const PUNCT_COLUMNS = ["，，，，，，，，，，", "、、、、、、、、、、", "。。。。。。。。。。", "：：：：：：：：：："];
// Java font advances: CJK 9, space 4, other Latin 6 (digits and lowercase).
const javaWidth = s => [...s].reduce((n, ch) => n + (ch.codePointAt(0) > 0x2e80 ? 9 : ch === " " ? 4 : 6), 0);
const COLUMNS = [
  { x: -200, text: "一二三四五六七八九十" },
  { x: -70, text: "abcdefghijklmno" },
  { x: 60, text: "1 2 3 4 5 6 7 8 9" },
];
const COLOR = { red: 0.97, green: 0.97, blue: 0.9, alpha: 1 };
const texts = new Map();

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a, n) => ({ x: a.x * n, y: a.y * n, z: a.z * n });

/** forward/right/up of a view direction, and the yaw/pitch the window entities expect. */
function basis(forward) {
  const flat = Math.hypot(forward.x, forward.z) || 1;
  const right = { x: -forward.z / flat, y: 0, z: forward.x / flat };
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  return {
    forward, right, up,
    yaw: Math.atan2(-forward.x, forward.z) * 180 / Math.PI,
    pitch: -Math.asin(forward.y) * 180 / Math.PI,
  };
}

function clear(player) {
  for (const entity of player.dimension.getEntities({ tags: [TEST_TAG] })) entity.remove();
  for (const text of texts.get(player.id) ?? []) world.primitiveShapesManager.removeText(text);
  texts.delete(player.id);
  player.camera.clear();
  player.camera.setFov();
}

/** A Ponder text: no background, facing the camera as TextWindowElement does. */
function makeText(player, view, location, content, scale) {
  const text = new TextPrimitive({ dimension: player.dimension, ...location }, content);
  text.useRotation = true;
  text.rotation = { x: view.pitch, y: -view.yaw, z: 0 };
  text.depthTest = false;
  text.backfaceVisible = false;
  text.backgroundColorOverride = { red: 0, green: 0, blue: 0, alpha: 0 };
  text.scale = scale;
  text.color = COLOR;
  text.visibleTo = [player];
  return text;
}

function spawn(player, mode) {
  clear(player);
  const view = basis(player.getViewDirection());
  const eye = player.getHeadLocation();
  player.camera.setCamera("minecraft:free", { location: eye, facingLocation: add(eye, mul(view.forward, 10)) });
  player.camera.setFov({ fov: FOV });
  const pixel = layer => (DISTANCE - layer * LAYER_STEP) / DISTANCE * PIXEL;
  // GUI px from the screen centre (y down) to a world point, `layer` steps nearer the camera.
  const at = (x, y, layer) => {
    const d = DISTANCE - layer * LAYER_STEP, k = pixel(layer);
    return add(add(add(eye, mul(view.forward, d)), mul(view.right, x * k)), mul(view.up, -y * k));
  };
  /** A window whose content area is w x h px at (x, y), with the 4 px border outside it. */
  const box = (x, y, w, h) => {
    const entity = player.dimension.spawnEntity(WINDOW_ENTITY, at(x - 4, y - 4, 0));
    entity.addTag(TEST_TAG);
    entity.setProperty("ponder:yaw", view.yaw);
    entity.setProperty("ponder:pitch", view.pitch);
    entity.setProperty("ponder:pixel", pixel(0));
    entity.setProperty("ponder:width", w + 8);
    entity.setProperty("ponder:height", h + 8);
    entity.setProperty("ponder:alpha", 1);
  };
  const shown = [];
  const label = (x, y, content) => shown.push(makeText(player, view, at(x, y, 3), content, pixel(3) * 9 / 0.35));

  if (mode === "p") {
    // Punctuation widths: each row assumes one width for every mark, and each box is 10 marks
    // of that width. The row whose marks fill a box tells that mark's width.
    const scale = pixel(3) * 9 / GLYPH;
    PUNCT_WIDTHS.forEach((w, i) => {
      const y = -100 + i * 26;
      label(-225, y + 4.5, `${w}`);
      PUNCT_COLUMNS.forEach((text, j) => {
        const x = -200 + j * 110;
        box(x, y, w * 10, 9);
        shown.push(makeText(player, view, at(x + w * 5, y + 4.5, 3), text, scale));
      });
    });
    // Reference: 24 CJK glyphs in a box exactly 24 * 9 wide.
    box(-200, 90, 216, 9);
    shown.push(makeText(player, view, at(-200 + 108, 94.5, 3), "毗邻的开启电源或毗邻的充能方块都能直接点亮红石灯", scale));
  } else if (mode === "h") {
    // Line pitch: five stacked lines in a 45 px tall content area, one column per candidate.
    CANDIDATES.forEach((p, i) => {
      const x = -200 + i * 50, y = -40;
      box(x, y, 9, 45);
      shown.push(makeText(player, view, at(x + 4.5, y + 22.5, 3), "一\n二\n三\n四\n五", pixel(3) * 9 / p));
      label(x + 4.5, y + 62, String(i + 1));
    });
  } else {
    // Glyph widths: each row uses one candidate scale for all columns; each box is as wide as
    // Java's font would draw its text. The row whose text fills a box tells that column's ratio.
    CANDIDATES.forEach((c, i) => {
      const y = -110 + i * 26;
      label(-225, y + 4.5, String(i + 1));
      for (const column of COLUMNS) {
        const w = javaWidth(column.text);
        box(column.x, y, w, 9);
        shown.push(makeText(player, view, at(column.x + w / 2, y + 4.5, 3), column.text, pixel(3) * 9 / c));
      }
    });
  }
  for (const text of shown) world.primitiveShapesManager.addText(text);
  texts.set(player.id, shown);
  player.sendMessage(`§7[overlay_test] ${mode === "h" ? "行距" : "字宽"}测试已生成；/scriptevent ponder:overlay_test clear 清除`);
}

system.afterEvents.scriptEventReceive.subscribe(event => {
  if (event.id !== "ponder:overlay_test") return;
  const player = event.sourceEntity;
  if (player?.typeId !== "minecraft:player") return;
  const mode = event.message.trim();
  if (mode === "clear") { clear(player); player.sendMessage("§7[overlay_test] cleared"); return; }
  spawn(player, mode === "h" || mode === "p" ? mode : "w");
});
