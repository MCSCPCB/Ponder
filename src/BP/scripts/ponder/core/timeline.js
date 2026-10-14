import { LIMITS } from "../constants.js";
import { cameraAt, clamp, inside, key, positions } from "./math.js";

const OPS = new Set(["show", "hide", "block", "restore", "region", "text", "outline", "controls",
  "spawn", "updateEntity", "removeEntity", "particle", "camera", "clear"]);
/** @param {any[]} instructions */
export function compileTimeline(instructions) {
  const events = [], keyframes = [];
  let order = 0;
  const walk = (list, start) => {
    if (!Array.isArray(list)) throw new Error("Instructions must be an array");
    let cursor = start;
    for (const instruction of list) {
      if (!instruction || typeof instruction !== "object") throw new Error("Invalid instruction");
      if (instruction.op === "wait") {
        if (!Number.isInteger(instruction.ticks) || instruction.ticks < 0) throw new Error("Invalid wait");
        cursor += instruction.ticks; continue;
      }
      if (instruction.op === "parallel") {
        if (!Array.isArray(instruction.branches) || !instruction.branches.length) throw new Error("Empty parallel branches");
        cursor = Math.max(cursor, ...instruction.branches.map(branch => walk(branch, cursor)));
        continue;
      }
      if (instruction.op === "keyframe") {
        keyframes.push({ tick: cursor, label: instruction.label ?? "", id: instruction.id ?? `k${keyframes.length}` });
        continue;
      }
      if (!OPS.has(instruction.op)) throw new Error(`Unknown instruction: ${instruction.op}`);
      const at = instruction.at ?? cursor, duration = instruction.duration ?? 0;
      if (!Number.isInteger(at) || at < start || !Number.isInteger(duration) || duration < 0) throw new Error("Invalid instruction timing");
      events.push({ ...instruction, at, duration, order: order++ });
      // Duration is non-blocking. Explicit waits/parallel branches express sequencing.
      if (instruction.blocking) cursor = at + duration;
      else cursor = Math.max(cursor, at);
    }
    return cursor;
  };
  const cursor = walk(instructions, 0);
  events.sort((a, b) => a.at - b.at || a.order - b.order);
  let cameraEnd = -1;
  for (const e of events.filter(e => e.op === "camera")) {
    if (e.at < cameraEnd) throw new Error("Overlapping camera instructions; wait for the previous motion");
    cameraEnd = e.at + e.duration;
  }
  const duration = Math.max(1, cursor, ...events.map(e => e.at + e.duration));
  if (duration > LIMITS.sceneTicks || events.length > LIMITS.sceneEvents) throw new Error("Timeline exceeds resource limits");
  if (!keyframes.length || keyframes[0].tick !== 0) keyframes.unshift({ tick: 0, label: "", id: "start" });
  const unique = [...new Map(keyframes.map(k => [k.tick, k])).values()].sort((a, b) => a.tick - b.tick);
  if (unique.length > LIMITS.keyframes) throw new Error("Too many keyframes");
  return { events, duration, keyframes: unique };
}
/** @param {any} scene */
export function legacyTimeline(scene) {
  return scene.stages.flatMap((stage, index) => {
    const duration = stage.duration ?? 100;
    return [
      { op: "keyframe", label: stage.title ?? stage.description, id: `step_${index}` },
      { op: "hide", ids: stage.remove ?? [] }, { op: "show", ids: stage.add ?? [] }, { op: "clear" },
      ...(stage.description ? [{
        op: "text", id: "narration", text: stage.description, target: stage.target ?? scene.focus,
        duration, color: stage.color ?? "white", side: stage.side ?? "auto", through: true,
      }] : []),
      ...(stage.instructions ?? []), { op: "wait", ticks: duration },
    ];
  });
}
/** Replay authored state, never native redstone/AI history. @param {any} scene */
export function stateAt(scene, requestedTick) {
  const tick = clamp(Math.floor(requestedTick), 0, scene.timeline.duration);
  const visible = new Set(scene.initial ?? []);
  const patches = new Map(), regions = new Map(), overlays = new Map(), entities = new Map();
  const showEntity = id => {
    const s = scene.structureById.get(id);
    if (s && ["entity", "item"].includes(s.kind))
      entities.set(id, { ...s, expires: Infinity, birth: `structure:${id}`, revision: -1 });
  };
  visible.forEach(showEntity);
  for (const e of scene.timeline.events) {
    if (e.at > tick) break;
    for (const [id, entity] of entities) if (entity.expires <= e.at) entities.delete(id);
    switch (e.op) {
      case "show": e.ids.forEach(id => { if (!visible.has(id)) showEntity(id); visible.add(id); }); break;
      case "hide": e.ids.forEach(id => { visible.delete(id); entities.delete(id); }); break;
      case "block":
        for (const p of positions(e.region ?? { from: e.position, to: e.position }))
          patches.set(key(p), { blockId: e.blockId, states: e.states ?? {} });
        break;
      case "restore":
        for (const k of patches.keys()) {
          const [x, y, z] = k.split(",").map(Number);
          if (!e.region || inside({ x, y, z }, e.region)) patches.delete(k);
        }
        break;
      case "region": regions.set(e.id, { ...scene.regions[e.id], visible: e.visible }); break;
      case "clear": e.id ? overlays.delete(e.id) : overlays.clear(); break;
      case "text": case "outline": case "controls":
        overlays.set(e.id, { ...e, expires: e.duration ? e.at + e.duration : Infinity }); break;
      case "spawn":
        entities.set(e.id, { ...e, kind: e.itemId ? "item" : "entity", birth: e.order, revision: e.order,
          expires: e.duration ? e.at + e.duration : Infinity });
        break;
      case "updateEntity":
        if (entities.has(e.id)) {
          // A later name/position change must not repeat a spawn impulse/event.
          const { impulse, event, ...before } = entities.get(e.id);
          entities.set(e.id, { ...before, ...e, op: "spawn", revision: e.order });
        }
        break;
      case "removeEntity": entities.delete(e.id); break;
    }
  }
  for (const [id, e] of overlays) if (e.expires <= tick) overlays.delete(id);
  for (const [id, e] of entities) if (e.expires <= tick) entities.delete(id);
  return { tick, visible, patches, regions, overlays, entities,
    camera: cameraAt(scene.camera, scene.timeline.events.filter(e => e.op === "camera"), tick) };
}
export function materializeBlocks(scene, state) {
  const blocks = new Map();
  for (const id of state.visible) {
    const s = scene.structureById.get(id);
    if (!s || !["block", "box"].includes(s.kind)) continue;
    for (const p of positions(s.kind === "box" ? s : { from: s.position, to: s.position }))
      blocks.set(key(p), { blockId: s.blockId, states: s.states ?? {} });
  }
  for (const [k, p] of state.patches) blocks.set(k, p);
  for (const [k] of blocks) {
    const [x, y, z] = k.split(",").map(Number);
    if ([...state.regions.values()].some(r => !r.visible && inside({ x, y, z }, r))) blocks.delete(k);
  }
  return blocks;
}
export function remainingWallTicks(scene, tick, comfy) {
  let ticks = 0;
  for (let t = Math.floor(tick); t < scene.timeline.duration; t++)
    ticks += comfy && hasTextAt(scene, t) ? 3 : 1;
  return ticks;
}
export function hasTextAt(scene, tick) {
  return [...stateAt(scene, tick).overlays.values()].some(e => e.op === "text" || e.op === "controls");
}
export class TimelineClock {
  constructor(scene, tick = 0) { this.scene = scene; this.tick = tick; this.playing = true; this.comfy = false; this.divider = 0; }
  seek(tick) { this.tick = clamp(Math.floor(tick), 0, this.scene.timeline.duration); this.divider = 0; }
  advance(hasText) {
    if (!this.playing || this.tick >= this.scene.timeline.duration) return false;
    if (++this.divider < (this.comfy && hasText ? 3 : 1)) return false;
    this.divider = 0; this.tick++; return true;
  }
  get finished() { return this.tick >= this.scene.timeline.duration; }
}
