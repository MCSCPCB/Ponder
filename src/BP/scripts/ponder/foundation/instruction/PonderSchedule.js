import { LIMITS, TEXT_FADE_TICKS } from "../../enums/PonderConfig.js";
import { add, cameraAt, clamp, mul } from "../VecHelper.js";

const OPS = new Set(["show", "hide", "detach", "restore", "block", "rotateSection", "moveSection", "sectionAnchor",
  "text", "controls", "outline", "line", "valueBox", "particle", "spawn", "updateEntity", "moveEntity",
  "rotateEntity", "removeEntity", "camera", "breakProgress", "blockEntity", "poi"]);
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
  // markAsFinished 只结束进度条计入的时间；场景仍播放到最后一条指令及其淡出。
  const counted = Math.max(1, finishedAt ?? cursor);
  const duration = Math.max(counted, cursor, ...events.map(e => e.at + e.duration));
  if (duration > LIMITS.sceneTicks || events.length > LIMITS.sceneEvents) throw new Error("Scene exceeds resource limits");
  const keyframes = [...new Set([0, ...marks.filter(tick => tick < counted)])].sort((a, b) => a - b)
    .map((tick, index) => ({ tick, id: `k${index}`, label: "" }));
  if (keyframes.length > LIMITS.keyframes) throw new Error("Too many keyframes");
  // Windows during which comfortable reading slows playback.
  const readingWindows = events.filter(e => e.op === "text" || e.op === "controls")
    .map(e => [e.at, e.at + e.duration + 2 * TEXT_FADE_TICKS]);
  return { events, duration, counted, keyframes, readingWindows };
}

/** Replays authored state; native redstone and AI history are never replayed. */
export function stateAt(scene, requestedTick) {
  const tick = clamp(Math.floor(requestedTick), 0, scene.timeline.duration);
  const cracks = new Map(), patches = new Map(), shown = new Map(), batches = new Map(), leaving = [], sections = new Map();
  const overlays = new Map(), entities = new Map(), cameraTracks = [], poiTracks = [];
  const breaks = [];
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
          // Java：spawnParticles 时在替换前对旧方块调用 addBlockDestroyEffects。
          if (e.particles && !air) {
            const [x, y, z] = k.split(",").map(Number);
            breaks.push({ at: e.at, position: { x, y, z }, block: current });
          }
          if (next) {
            const data = e.block ? e.block.data : current?.data;
            patches.set(k, data ? { blockId: next.blockId, states: next.states ?? {}, data } : { blockId: next.blockId, states: next.states ?? {} });
          }
        }
        break;
      case "blockEntity":
        for (const k of e.selection.keys) {
          const current = describe(k);
          if (current && current.blockId !== "minecraft:air")
            patches.set(k, { ...current, data: { ...current.data, ...e.data } });
        }
        break;
      case "breakProgress": {
        // Java：每次调用加一档，第 9 次破坏方块并清零；档位 0..8 对应 destroy_stage_0..8。
        const k = key(e.position), stage = (cracks.get(k) ?? -1) + 1;
        if (stage >= 9) {
          const before = describe(k);
          cracks.delete(k);
          patches.set(k, { blockId: "minecraft:air", states: {} });
          breaks.push({ at: e.at, position: e.position, block: before });
        } else cracks.set(k, stage);
        break;
      }
      case "moveSection": section(e.link).moves.push(e); break;
      case "rotateSection": section(e.link).rotations.push(e); break;
      case "sectionAnchor":
        if (e.rotationCenter) section(e.link).center = e.rotationCenter;
        if (e.stabilization) section(e.link).anchor = e.stabilization;
        break;
      case "text": case "controls":
        overlays.set(e.id, { ...e, expires: e.at + e.duration + 2 * TEXT_FADE_TICKS }); break;
      case "outline": case "line": case "valueBox": {
        // Java ChasingAABBOutline: the drawn box closes half the distance to its target every tick.
        const previous = overlays.get(e.id);
        overlays.set(e.id, { ...e, expires: e.at + e.duration, chaseFrom: e.chase ? previous?.box ?? previous?.chaseFrom : undefined });
        break;
      }
      case "spawn":
        entities.set(e.id, { ...e, kind: e.itemId ? "item" : "entity", birth: e.order, revision: e.order, poseAt: e.at,
          moves: [], turns: [], expires: e.duration ? e.at + e.duration : Infinity });
        break;
      case "updateEntity":
        if (entities.has(e.id)) {
          // A later name/position change must not repeat a spawn impulse or event.
          const { impulse, event, ...before } = entities.get(e.id);
          entities.set(e.id, { ...before, ...e, op: "spawn", revision: e.order, poseAt: e.pose ? e.at : before.poseAt });
        }
        break;
      case "moveEntity": entities.get(e.id)?.moves.push(e); break;
      case "rotateEntity": entities.get(e.id)?.turns.push(e); break;
      case "removeEntity": entities.delete(e.id); break;
      case "camera": cameraTracks.push(e); break;
      case "poi": poiTracks.push(e); break;
    }
  }
  for (const [id, o] of overlays) if (o.expires <= tick) overlays.delete(id);
  // Java PonderScene: the point of interest starts at (0, 4, 0) and chases each target at 25% per tick.
  let poi = { x: 0, y: 4, z: 0 }, poiTarget = poi, poiSince = 0;
  const approach = (from, to, ticks) => {
    const t = 1 - .75 ** Math.max(0, ticks);
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t };
  };
  for (const e of poiTracks) { poi = approach(poi, poiTarget, e.at - poiSince); poiTarget = e.position; poiSince = e.at; }
  poi = approach(poi, poiTarget, tick - poiSince);
  for (const [id, entity] of entities) {
    if (entity.expires <= tick) { entities.delete(id); continue; }
    let position = entity.position, yaw = entity.rotation?.y ?? 0, facing;
    for (const m of entity.moves) position = add(position, mul(m.offset, progress(m, tick)));
    for (const t of entity.turns) yaw += t.yaw * progress(t, tick);
    if (entity.pose === "dance") yaw -= 2 * (tick - entity.poseAt);
    else if (entity.pose === "poi") facing = poi;
    entities.set(id, { ...entity, position, facing, rotation: { x: entity.rotation?.x ?? 0, y: yaw } });
  }
  for (const overlay of overlays.values()) {
    if (!overlay.chaseFrom) continue;
    const t = 1 - .5 ** Math.max(0, tick - overlay.at);
    const lerpBox = (a, b) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    overlay.box = { from: lerpBox(overlay.chaseFrom.from, overlay.box.from), to: lerpBox(overlay.chaseFrom.to, overlay.box.to) };
  }
  const poses = new Map();
  for (const s of sections.values()) poses.set(s.id, {
    center: s.center, anchor: s.anchor, ...pose(s.moves, "offset", tick, "offset", "move"), ...pose(s.rotations, "rotation", tick, "rotation", "spin"),
  });
  return { tick, cracks, breaks, patches, shown, batches, leaving: leaving.filter(l => tick < l.at + l.fade), sections: poses,
    overlays, entities, poi, camera: cameraAt(scene.camera, cameraTracks, tick), describe };
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
  /** Java 在 markAsFinished 之后才把场景算作播完（触发“下一个场景”提示）。 */
  get finished() { return this.tick >= this.scene.timeline.counted; }
}
export function remainingWallTicks(scene, tick, comfy) {
  let ticks = 0;
  for (let t = Math.floor(tick); t < scene.timeline.duration; t++) ticks += comfy && hasTextAt(scene, t) ? 3 : 1;
  return ticks;
}
