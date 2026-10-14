import test from "node:test";
import assert from "node:assert/strict";
import { registry, createRegistry } from "../src/BP/scripts/ponder/registry.js";
import { normalizeScene } from "../src/BP/scripts/ponder/core/scene.js";
import { compileTimeline, hasTextAt, materializeBlocks, remainingWallTicks, stateAt, TimelineClock } from "../src/BP/scripts/ponder/core/timeline.js";
import { progressPixel, progressSchedule } from "../src/BP/scripts/ponder/core/ui-progress.js";
import { buildFormModel, progressToken } from "../src/BP/scripts/ponder/core/form.js";
import { Navigation, indexEntries, pageEntries, scenePage } from "../src/BP/scripts/ponder/core/navigation.js";
import { layoutAnnotations, overlaps2D } from "../src/BP/scripts/ponder/core/annotations.js";
import { SessionGate } from "../src/BP/scripts/ponder/core/lifecycle.js";
import { wrapText, textTokens, packGlyph } from "../src/BP/scripts/ponder/core/text.js";
import { cameraAt, inside, orbit } from "../src/BP/scripts/ponder/core/math.js";
import { LIMITS, SLOTS, HIDDEN } from "../src/BP/scripts/ponder/constants.js";
import { rawScene, scene, deferred } from "./fixtures.mjs";

test("registered items have sorted scenes and localized/tagged metadata", () => {
  assert.equal(registry.scenes.length, 4);
  assert.deepEqual(registry.byItem.get("minecraft:redstone_lamp").map(s => s.id), ["redstone_lamp_demo", "lamp_states"]);
  assert(registry.tags.get("redstone").scenes.includes("lamp_states"));
});
test("item-index cards and multi-scene headers use configured localized item titles", () => {
  const entries = indexEntries(registry, { kind: "items" });
  assert.deepEqual(entries.find(entry => entry.id === "minecraft:stick").title, { zh_CN: "木棍", en_US: "Stick" });
  const nav = new Navigation({ kind: "item", id: "minecraft:redstone_lamp", page: 0 });
  const zh = buildFormModel(registry, nav, undefined, "zh_CN");
  const en = buildFormModel(registry, nav, undefined, "en_US");
  assert.equal(zh.slots[SLOTS.header].text, "红石灯 · 场景");
  assert.equal(en.slots[SLOTS.header].text, "Redstone lamp · Scenes");
  assert.equal(zh.slots[SLOTS.header].icon, "textures/blocks/redstone_lamp_off");
});
test("registration rejects duplicates, bad icons/items, unknown tags and absent titles", () => {
  for (const value of [
    { id: "bad space" }, { iconPath: "textures/../outside" }, { entryItems: ["minecraft:"] },
    { title: "" }, { tags: ["missing"] }, { initial: ["missing"] },
    { structures: [{ id: "x", kind: "item", entityTypeId: "minecraft:pig", position: { x: 1, y: 1, z: 1 } }] },
  ]) assert.throws(() => createRegistry([rawScene(value)], []), JSON.stringify(value));
  assert.throws(() => createRegistry([rawScene(), rawScene()], []), /Duplicate/);
  assert.throws(() => createRegistry([rawScene()], [{ id: "topic", title: "Topic", iconPath: "../outside" }]), /metadata/);
});
test("scene validation enforces bounds, colors, entity references and resource limits", () => {
  for (const instructions of [
    [{ op: "block", blockId: "minecraft:stone", position: { x: 20, y: 0, z: 0 } }],
    [{ op: "text", id: "label", text: "x", color: -1 }],
    [{ op: "outline", id: "label", track: "unknown" }],
    [{ op: "updateEntity", id: "unknown", nameTag: "x" }],
    [{ op: "spawn", id: "player", entityTypeId: "minecraft:player", position: { x: 1, y: 1, z: 1 } }],
    [{ op: "wait", ticks: LIMITS.sceneTicks + 1 }],
    Array.from({ length: 5 }, () => ({ op: "particle", particleId: "minecraft:basic_flame_particle",
      position: { x: 1, y: 1, z: 1 }, duration: 10, count: 32 })),
  ]) assert.throws(() => scene({ instructions }));
});
test("parallel branches join after their waits; durations alone do not block", () => {
  const timeline = compileTimeline([
    { op: "parallel", branches: [
      [{ op: "wait", ticks: 10 }, { op: "block", blockId: "minecraft:glass" }],
      [{ op: "text", duration: 8 }, { op: "wait", ticks: 20 }],
    ] },
    { op: "keyframe", id: "joined" }, { op: "camera", duration: 5, blocking: true }, { op: "wait", ticks: 2 },
  ]);
  assert.equal(timeline.keyframes[1].tick, 20);
  assert.equal(timeline.duration, 27);
  assert.deepEqual(timeline.events.map(e => e.at), [0, 10, 20]);
  assert.throws(() => compileTimeline([{ op: "wait", ticks: -1 }]));
  assert.throws(() => compileTimeline([{ op: "camera", duration: 10 }, { op: "camera", at: 2, duration: 10 }]), /Overlapping/);
});
test("seek reconstructs authored blocks, region visibility and restore independently of history", () => {
  const s = scene({ regions: { part: { from: { x: 1, y: 0, z: 1 }, to: { x: 1, y: 0, z: 1 } } },
    instructions: [
      { op: "block", position: { x: 1, y: 0, z: 1 }, blockId: "minecraft:glass", at: 4 },
      { op: "region", id: "part", visible: false, at: 8 },
      { op: "region", id: "part", visible: true, at: 12 },
      { op: "restore", at: 16 }, { op: "wait", ticks: 10 },
    ] });
  const at = t => materializeBlocks(s, stateAt(s, t));
  assert.equal(at(4).get("1,0,1").blockId, "minecraft:glass");
  assert.equal(at(9).size, 0);
  assert.equal(at(12).get("1,0,1").blockId, "minecraft:glass");
  assert.equal(at(20).get("1,0,1").blockId, "minecraft:stone");
  assert.deepEqual(at(4), at(4));
  assert.equal(at(-4).get("1,0,1").blockId, "minecraft:stone");
});
test("entity lifetime and revision do not repeat inherited one-shot events", () => {
  const s = scene({ instructions: [
    { op: "spawn", id: "pig", entityTypeId: "minecraft:pig", position: { x: 1, y: 1, z: 1 },
      impulse: { x: 0, y: .1, z: 0 }, event: "minecraft:entity_spawned", duration: 10 },
    { op: "updateEntity", id: "pig", nameTag: "Changed", at: 4 }, { op: "wait", ticks: 20 },
  ] });
  assert(stateAt(s, 0).entities.get("pig").impulse);
  assert.equal(stateAt(s, 4).entities.get("pig").impulse, undefined);
  assert.equal(stateAt(s, 4).entities.get("pig").event, undefined);
  assert.equal(stateAt(s, 10).entities.size, 0);
  assert.equal(stateAt(s, 2).entities.size, 1);
});
test("comfy advances once per three ticks only during authored text", () => {
  const s = scene({ instructions: [{ op: "text", id: "note", text: "Read", duration: 4 }, { op: "wait", ticks: 8 }] });
  const clock = new TimelineClock(s); clock.comfy = true;
  for (let i = 0; i < 11; i++) clock.advance(hasTextAt(s, clock.tick));
  assert.equal(clock.tick, 3);
  clock.advance(true);
  assert.equal(clock.tick, 4);
  clock.advance(hasTextAt(s, 4));
  assert.equal(clock.tick, 5);
  clock.playing = false; clock.advance(false);
  assert.equal(clock.tick, 5);
  assert.equal(remainingWallTicks(s, 0, true), 16);
  clock.seek(100); assert(clock.finished);
});
test("every progress token selects a valid preset; 224 is reserved for completion", () => {
  for (const s of registry.scenes) {
    const clock = new TimelineClock(s);
    for (let t = 0; t < s.timeline.duration; t++) {
      clock.seek(t);
      assert(progressPixel(s, t) <= 223);
      assert.match(progressToken(s, clock), /:run:0:\d+$/);
    }
    assert.equal(progressPixel(s, s.timeline.duration), 224);
    for (const comfy of [false, true]) {
      const schedule = progressSchedule(s, comfy);
      assert.equal(schedule.length, 225);
      const total = schedule.reduce((sum, entry) => sum + entry.seconds, 0);
      assert(Math.abs(total - remainingWallTicks(s, 0, comfy) / 20) < 1e-8);
      assert.equal(schedule.at(-1).remaining, 0);
    }
  }
});
test("wrapped text handles measured widths, formatting, CJK, long words and line bounds", () => {
  const text = wrapText("AAA BBB 中文\n§c红色§rABC", { width: 30 });
  assert(text.width <= 30);
  assert(text.lines >= 3);
  assert.equal(text.lineHeight, 9);
  assert(text.glyphs.some(g => g.color === 0xff5555));
  assert.equal(textTokens("😀")[0].char, "?");
  assert.equal(wrapText("AAAA", { width: 8, metrics: { 65: { advance: 4, left: 1, width: 6 } } }).lines, 2);
  assert.throws(() => wrapText("中文".repeat(257)), /glyphs/);
  assert.throws(() => wrapText("a\n".repeat(13)), /lines/);
});
test("packed glyph round-trips every metric boundary within an exact 24-bit integer", () => {
  for (let left = 0; left < 16; left++) for (let width = 1; width <= 16 - left; width++) {
    const packed = packGlyph({ code: 0x4e2d, left, width });
    assert.equal(packed % 65536, 0x4e2d);
    assert.equal(Math.floor(packed / 65536) % 16, left);
    assert.equal(Math.floor(packed / 1048576) + 1, width);
    assert(packed <= 16777215);
  }
});
test("all sample ticks/locales fit world composition with non-overlapping labels", () => {
  let checked = 0;
  for (const s of registry.scenes) for (const locale of ["zh_CN", "en_US"])
    for (let t = 0; t <= s.timeline.duration; t++) {
      const state = stateAt(s, t), layout = layoutAnnotations(s, state, locale);
      assert(inside(orbit(state.camera).location, s.room));
      for (const panel of layout.panels) {
        assert(inside(panel.center, s.room), `${s.id}:${t} frame outside room`);
        assert(inside(panel.textOrigin, s.room));
        for (const p of panel.line) assert(inside(p, s.room));
        for (const other of layout.panels) if (panel !== other) assert(!overlaps2D(panel.rect, other.rect));
      }
      checked++;
    }
  assert.equal(checked, 3408);
});
test("camera envelope includes chained partial moves and their intermediate poses", () => {
  const s = scene({ instructions: [
    { op: "camera", focus: { x: 4, y: 8, z: 4 }, yaw: 90, duration: 20, blocking: true },
    { op: "camera", pitch: -50, duration: 20, blocking: true },
  ] });
  for (let t = 0; t <= 40; t++) assert(inside(orbit(stateAt(s, t).camera).location, s.room));
  assert.equal(stateAt(s, 40).camera.focus.y, 8);
  assert.deepEqual(cameraAt(s.camera, [], 20), s.camera);
});
test("navigation restores source, pagination, selection and paused tick", () => {
  const nav = new Navigation({ kind: "items", page: 2, selected: "minecraft:stick" });
  nav.push(scenePage("assembly_demo")); nav.current.tick = 77; nav.current.playing = false;
  nav.push({ kind: "tags", page: 0 });
  assert(nav.back()); assert.equal(nav.current.tick, 77); assert.equal(nav.current.playing, false);
  assert(nav.back()); assert.equal(nav.current.selected, "minecraft:stick");
  assert.equal(nav.current.page, 2); assert(!nav.back());
  assert.equal(pageEntries(Array.from({ length: 19 }), 99).page, 2);
  assert.equal(indexEntries(registry, { kind: "items" }).length, 3);
});
test("forms use fixed safe slots, real keyframe actions and disabled boundaries", () => {
  const s = registry.scenes[0], nav = new Navigation(scenePage(s.id, { kind: "item", id: "minecraft:stick" }));
  const clock = new TimelineClock(s);
  const form = buildFormModel(registry, nav, clock, "zh_CN");
  assert.equal(form.slots.length, SLOTS.count);
  assert.equal(form.slots[SLOTS.previous].action, undefined);
  assert.equal(form.slots[SLOTS.next].action, undefined);
  assert.equal(form.slots[SLOTS.back].text, HIDDEN);
  assert.deepEqual(form.slots[SLOTS.keyframes + 1].action, { type: "seek", tick: s.timeline.keyframes[1].tick });
  assert(form.slots[SLOTS.items].action.page.kind === "items");
  clock.seek(s.timeline.duration);
  assert(buildFormModel(registry, nav, clock, "en_US").title.endsWith("|done|"));
});
test("session gate serializes writers and invalidates queued/stale work without blocking close", async () => {
  const gate = new SessionGate(), barrier = deferred(), writes = [];
  const first = gate.run(async () => { writes.push("start"); await barrier.promise; writes.push("finish"); });
  await Promise.resolve();
  const second = gate.run(() => writes.push("stale"));
  const token = gate.token(), drained = gate.close();
  assert(!gate.current(token));
  barrier.resolve();
  await Promise.all([first, second, drained]);
  assert.deepEqual(writes, ["start", "finish"]);
  await gate.run(() => writes.push("late"));
  assert.equal(writes.length, 2);
});
test("a failed writer does not poison later recovery work", async () => {
  const gate = new SessionGate();
  await assert.rejects(gate.run(() => { throw new Error("write"); }), /write/);
  assert.equal(await gate.run(() => 4), 4);
});
