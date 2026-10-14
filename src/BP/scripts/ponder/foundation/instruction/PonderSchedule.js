import { LIMITS, TEXT_FADE_TICKS } from "../../enums/PonderConfig.js";
import { add, cameraAt, clamp, mul } from "../VecHelper.js";

const OPS = new Set(["show", "hide", "detach", "restore", "block", "rotateSection", "moveSection", "sectionAnchor",
  "text", "controls", "outline", "line", "valueBox", "particle", "spawn", "updateEntity", "moveEntity",
  "rotateEntity", "removeEntity", "camera", "breakProgress"]);
const ZERO = Object.freeze({ x: 0, y: 0, z: 0 });
const progress = (event, tick) => event.duration ? clamp((tick - event.at) / event.duration, 0, 1) : Number(tick >= event.at);

/** Box covering a selection; `to` is the far face of the last block. */
export function selectionBox(selection) {
  const { from, to } = selection.getBounds();
  return { from, to: add(to, { x: 1, y: 1, z: 1 }) };
}

/**
 * Turns a recorded storyboard into events. Like Java, only idle() advances the
 * cursor, and markAsFinished() ends the counted running time.
 * @param {any[]} instructions
 */
export function compileSchedule(instructions) {
  const events = [], marks = [];
  let cursor = 0, finishedAt;
  for (const instruction of instructions) {
    if (instruction.op === "wait") {
      if (!Number.isInteger(instruction.ticks) || instruction.ticks < 0) throw new Error("Invalid idle duration");
      cursor += instruction.ticks;
    } else if (instruction.op === "keyframe") marks.push(cursor + (instruction.delay ?? 0));
    else if (instruction.op === "finish") finishedAt ??= cursor;
    else {
      if (!OPS.has(instruction.op)) throw new Error(`Unknown instruction: ${instruction.op}`);
      const event = { ...instruction, at: cursor, order: events.length };
      event.duration = Math.max(0, Math.round(event.duration ?? event.fade ?? 0));
      event.id ??= `${event.op}_${event.order}`;
      if (event.selection && ["outline", "valueBox"].includes(event.op)) event.box ??= selectionBox(event.selection);
      events.push(event);
    }
  }
  const duration = Math.max(1, finishedAt ?? cursor);
  if (duration > LIMITS.sceneTicks || events.length > LIMITS.sceneEvents) throw new Error("Scene exceeds resource limits");
  const keyframes = [...new Set([0, ...marks.filter(tick => tick < duration)])].sort((a, b) => a - b)
    .map((tick, index) => ({ tick, id: `k${index}`, label: "" }));
  if (keyframes.length > LIMITS.keyframes) throw new Error("Too many keyframes");
  // Windows during which comfortable reading slows playback.
  const readingWindows = events.filter(e => e.op === "text" || e.op === "controls")
    .map(e => [e.at, e.at + e.duration + 2 * TEXT_FADE_TICKS]);
  return { events, duration, keyframes, readingWindows };
}

/** Replays authored state; native redstone and AI history are never replayed. */
export function stateAt(scene, requestedTick) {
  const tick = clamp(Math.floor(requestedTick), 0, scene.timeline.duration);
  const patches = new Map(), shown = new Map(), batches = new Map(), leaving = [], sections = new Map();
  const overlays = new Map(), entities = new Map(), cameraTracks = [];
  const section = id => {
    if (!sections.has(id)) sections.set(id, { id, moves: [], rotations: [] });
    return sections.get(id);
  };
  const describe = k => patches.has(k) ? patches.get(k) : scene.schematic.blocks.get(k);
  const batchOf = (e, sectionId) => {
    const batch = { id: `b${e.order}`, event: e, section: sectionId, cells: [] };
    batches.set(batch.id, batch);
    return batch;
  };
  for (const e of scene.timeline.events) {
    if (e.at > tick) break;
    switch (e.op) {
      case "show": {
        const target = e.link ?? e.mergeInto ?? "base", batch = batchOf(e, target);
        for (const k of e.selection.keys) if (!shown.has(k)) { shown.set(k, batch); batch.cells.push(k); }
        if (target !== "base") section(target).center ??= e.selection.getCenter();
        break;
      }
      case "detach": {
        const batch = batchOf(e, e.link);
        for (const k of e.selection.keys) if (shown.get(k)?.section === "base") { shown.set(k, batch); batch.cells.push(k); }
        section(e.link).center ??= e.selection.getCenter();
        break;
      }
      case "hide": {
        const keys = e.link ? [...shown].filter(([, b]) => b.section === e.link).map(([k]) => k)
          : [...e.selection.keys].filter(k => shown.get(k)?.section === "base");
        const cells = new Map();
        for (const k of keys) { cells.set(k, describe(k)); shown.delete(k); }
        if (cells.size && e.at + e.duration > tick)
          leaving.push({ id: `l${e.order}`, cells, at: e.at, fade: e.duration, vec: e.to, section: e.link ?? "base" });
        break;
      }
      case "restore": for (const k of e.selection.keys) patches.delete(k); break;
      case "block":
        for (const k of e.selection.keys) {
          const current = describe(k), air = !current || current.blockId === "minecraft:air";
          if (e.onlySolid && air) continue;
          let next = e.block;
          if (!next && current) {
            const states = { ...current.states };
            if (e.modifyStates) Object.assign(states, e.modifyStates);
            for (const name of [e.cycleState, ...(e.toggleState ?? [])].filter(Boolean))
              if (name in states) states[name] = typeof states[name] === "boolean" ? !states[name] : states[name] ? 0 : 15;
            next = { blockId: current.blockId, states };
          }
          if (next) patches.set(k, { blockId: next.blockId, states: next.states ?? {} });
        }
        break;
      case "moveSection": section(e.link).moves.push(e); break;
      case "rotateSection": section(e.link).rotations.push(e); break;
      case "sectionAnchor":
        if (e.rotationCenter) section(e.link).center = e.rotationCenter;
        break;
      case "text": case "controls":
        overlays.set(e.id, { ...e, expires: e.at + e.duration + 2 * TEXT_FADE_TICKS }); break;
      case "outline": case "line": case "valueBox": {
        const previous = overlays.get(e.id);
        overlays.set(e.id, { ...e, expires: e.at + e.duration, fromBox: e.chase ? previous?.box : undefined });
        break;
      }
      case "spawn":
        entities.set(e.id, { ...e, kind: e.itemId ? "item" : "entity", birth: e.order, revision: e.order,
          moves: [], turns: [], expires: e.duration ? e.at + e.duration : Infinity });
        break;
      case "updateEntity":
        if (entities.has(e.id)) {
          // A later name/position change must not repeat a spawn impulse or event.
          const { impulse, event, ...before } = entities.get(e.id);
          entities.set(e.id, { ...before, ...e, op: "spawn", revision: e.order });
        }
        break;
      case "moveEntity": entities.get(e.id)?.moves.push(e); break;
      case "rotateEntity": entities.get(e.id)?.turns.push(e); break;
      case "removeEntity": entities.delete(e.id); break;
      case "camera": cameraTracks.push(e); break;
    }
  }
  for (const [id, o] of overlays) if (o.expires <= tick) overlays.delete(id);
  for (const [id, entity] of entities) {
    if (entity.expires <= tick) { entities.delete(id); continue; }
    let position = entity.position, yaw = entity.rotation?.y ?? 0;
    for (const m of entity.moves) position = add(position, mul(m.offset, progress(m, tick)));
    for (const t of entity.turns) yaw += t.yaw * progress(t, tick);
    entities.set(id, { ...entity, position, rotation: { x: entity.rotation?.x ?? 0, y: yaw } });
  }
  const poses = new Map();
  for (const s of sections.values()) poses.set(s.id, {
    center: s.center, ...pose(s.moves, "offset", tick, "offset", "move"), ...pose(s.rotations, "rotation", tick, "rotation", "spin"),
  });
  return { tick, patches, shown, batches, leaving: leaving.filter(l => tick < l.at + l.fade), sections: poses,
    overlays, entities, camera: cameraAt(scene.camera, cameraTracks, tick), describe };
}

/** Section value now, plus the straight-line motion still in flight for the client to interpolate. */
function pose(events, field, tick, valueName, motionName) {
  const valueAt = t => events.reduce((sum, e) => add(sum, mul(e[field], progress(e, t))), ZERO);
  let end = tick;
  for (const e of events) if (e.at <= tick && tick < e.at + e.duration) end = Math.max(end, e.at + e.duration);
  return { [valueName]: valueAt(tick), [motionName]: end > tick ? { to: valueAt(end), ticks: end - tick } : undefined };
}

export function hasTextAt(scene, tick) {
  return scene.timeline.readingWindows.some(([from, to]) => tick >= from && tick < to);
}
export class TimelineClock {
  constructor(scene, tick = 0) { this.scene = scene; this.tick = tick; this.playing = true; this.comfy = false; this.divider = 0; }
  seek(tick) { this.tick = clamp(Math.floor(tick), 0, this.scene.timeline.duration); this.divider = 0; }
  /** Comfortable reading advances one tick per three while a text window is showing. */
  advance(hasText) {
    if (!this.playing || this.tick >= this.scene.timeline.duration) return false;
    if (++this.divider < (this.comfy && hasText ? 3 : 1)) return false;
    this.divider = 0; this.tick++; return true;
  }
  get finished() { return this.tick >= this.scene.timeline.duration; }
}
export function remainingWallTicks(scene, tick, comfy) {
  let ticks = 0;
  for (let t = Math.floor(tick); t < scene.timeline.duration; t++) ticks += comfy && hasTextAt(scene, t) ? 3 : 1;
  return ticks;
}
