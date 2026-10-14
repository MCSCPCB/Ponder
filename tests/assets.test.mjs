import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { check } from "../tools/check.mjs";
import { measureAtlas } from "../tools/measure-font.mjs";
import { readJson } from "../tools/files.mjs";

test("generated packs, manifests, references and UI slots are internally consistent", () => check());
test("font measurement crops actual alpha coverage and preserves blank cells", () => {
  const png = new PNG({ width: 256, height: 256 });
  for (let y = 3; y < 14; y++) for (let x = 2; x < 12; x++) png.data[(y * 256 + x) * 4 + 3] = 255;
  assert.deepEqual(measureAtlas(png, 0x4e)[0x4e00], { left: 2, width: 10, advance: 6 });
  assert.equal(measureAtlas(png, 0x4e)[0x4e01], undefined);
  assert.throws(() => measureAtlas({ width: 257, height: 256 }, 0));
});
test("bottom geometry uses centers so the progress track top is H-31", () => {
  const ui = readJson("src/RP/ui/ponder.generated.json"), controls = Object.assign({}, ...ui.root.controls);
  assert.equal(controls.progress.anchor_to, "center");
  assert.equal(controls.progress.offset[1] - controls.progress.size[1] / 2, -31);
  assert.deepEqual(["previous@ponder.button", "close@ponder.button", "next@ponder.button"].map(k => controls[k].offset[0]), [-28, 0, 28]);
});
test("the sidebar viewport reserves space for the right-expanding tooltip", () => {
  const ui = readJson("src/RP/ui/ponder.generated.json"), controls = Object.assign({}, ...ui.root.controls);
  const sidebar = controls["sidebar@common.scrolling_panel"];
  const tooltip = Object.assign({}, ...ui.button_hover.controls).tooltip;
  const required = ui.button.size[0] + ui["side_button@ponder.button"].$tooltip_offset[0] + tooltip.max_size[0] + 3;
  assert(sidebar.size[0] >= required, "A scrolling viewport clips overflow regardless of tooltip layer");
  assert.deepEqual(sidebar.max_size, ["100% - 36px", "100%"]);
});
test("opacity uses multiplicative controller color rather than overlay tint", () => {
  const rc = readJson("src/RP/render_controllers/ponder.render_controllers.json").render_controllers;
  for (const controller of Object.values(rc)) {
    assert(controller.color.a);
    assert.equal(controller.overlay_color, undefined);
  }
});
