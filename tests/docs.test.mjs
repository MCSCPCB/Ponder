import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRegistry } from "../src/BP/scripts/ponder/registry.js";
import { PONDER_TAGS } from "../src/BP/scripts/ponder/config/tags.js";
import { stateAt, materializeBlocks } from "../src/BP/scripts/ponder/core/timeline.js";
import { layoutAnnotations, overlaps2D } from "../src/BP/scripts/ponder/core/annotations.js";

const doc = readFileSync(new URL("../docs/SCENE_API.md", import.meta.url), "utf8");
const match = doc.match(/<!-- test:scene-api -->\s*```js\r?\n([\s\S]*?)\r?\n```/);
assert(match, "Keep the runnable scene example in the author guide");
const { quickStartScene } = await import(`data:text/javascript;base64,${Buffer.from(match[1]).toString("base64")}`);
const scene = createRegistry([quickStartScene], PONDER_TAGS).scenes[0];

test("the documented scene is executable and has the promised keyframes and restore behavior", () => {
  assert.equal(scene.timeline.duration, 240);
  assert.deepEqual(scene.timeline.keyframes.map(k => k.tick), [0, 80, 160]);
  const blocks = tick => materializeBlocks(scene, stateAt(scene, tick));
  assert.equal(blocks(0).get("3,1,3").blockId, "minecraft:redstone_lamp");
  assert(!blocks(0).has("2,1,3"));
  assert.equal(blocks(80).get("2,1,3").blockId, "minecraft:redstone_block");
  assert(!blocks(160).has("2,1,3"));
  assert.equal(blocks(240).get("3,1,3").blockId, "minecraft:redstone_lamp");
});

test("the documented scene's labels fit throughout playback in both supported languages", () => {
  for (const locale of ["zh_CN", "en_US"]) for (let tick = 0; tick <= scene.timeline.duration; tick++) {
    const layout = layoutAnnotations(scene, stateAt(scene, tick), locale);
    for (const panel of layout.panels) {
      const { rect, text } = panel;
      assert(rect.x >= layout.area.x && rect.y >= layout.area.y, `${locale}:${tick}`);
      assert(rect.x + rect.w <= layout.area.x + layout.area.w + 1e-9, `${locale}:${tick}`);
      assert(rect.y + rect.h <= layout.area.y + layout.area.h + 1e-9, `${locale}:${tick}`);
      assert(text.lines <= 12);
    }
    for (let i = 0; i < layout.panels.length; i++)
      for (let j = i + 1; j < layout.panels.length; j++)
        assert(!overlaps2D(layout.panels[i].rect, layout.panels[j].rect), `${locale}:${tick}`);
  }
});
