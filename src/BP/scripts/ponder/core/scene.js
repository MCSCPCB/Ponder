import { LIMITS, PALETTE } from "../constants.js";
import { cameraAt, expand, inside, volume } from "./math.js";
import { compileTimeline, legacyTimeline, materializeBlocks, stateAt } from "./timeline.js";
import { wrapText } from "./text.js";
import { localize } from "../i18n.js";

const identifier = /^[a-z][a-z0-9_]{0,47}$/;
export const validId = id => typeof id === "string" && identifier.test(id);
export const namespaced = id => typeof id === "string" && /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(id);
export const validIconPath = path => typeof path === "string" && /^textures\/[a-zA-Z0-9_/.-]+$/.test(path) && !path.includes("..");
export function validateTitle(value, label) {
  if (!["en_US", "zh_CN"].every(locale => typeof localize(value, locale) === "string" && localize(value, locale).trim()))
    throw new Error(`Missing localized ${label}`);
}
function states(value) {
  if (!value) return;
  if (Array.isArray(value) || typeof value !== "object" ||
    Object.values(value).some(v => !["boolean", "string", "number"].includes(typeof v) || typeof v === "number" && !Number.isFinite(v)))
    throw new Error("Invalid block states");
}
function entity(value) {
  if (!namespaced(value.itemId ?? value.entityTypeId)) throw new Error("Invalid entity/item identifier");
  if (["minecraft:player", "minecraft:ender_dragon", "minecraft:wither", "minecraft:tnt", "minecraft:ender_crystal"].includes(value.entityTypeId))
    throw new Error("Destructive/player entities are not allowed in isolated stages");
  if (value.amount !== undefined && (!Number.isInteger(value.amount) || value.amount < 1 || value.amount > 64))
    throw new Error("Item amount must be 1..64");
  if (value.kind === "entity" && !namespaced(value.entityTypeId) || value.kind === "item" && !namespaced(value.itemId))
    throw new Error("Entity kind does not match its identifier");
}
export function vector(v, label, integer = false) {
  if (!v || !["x", "y", "z"].every(k => Number.isFinite(v[k]) && (!integer || Number.isInteger(v[k]))))
    throw new Error(`Invalid ${label}`);
}
export function box(b, label, bounds) {
  if (!b) throw new Error(`Missing ${label}`);
  vector(b.from, label, true); vector(b.to, label, true);
  if (["x", "y", "z"].some(k => b.to[k] < b.from[k])) throw new Error(`Reversed ${label}`);
  if (bounds && (!inside(b.from, bounds) || !inside(b.to, bounds))) throw new Error(`${label} outside scene bounds`);
}
function camera(c) {
  if (![c.yaw, c.pitch, c.distance].every(Number.isFinite) || c.distance < 8 || c.distance > 64 || Math.abs(c.pitch) > 75)
    throw new Error("Invalid camera (distance 8..64, pitch -75..75)");
  vector(c.focus, "camera focus");
}
/** @param {any} raw @param {any} presets */
export function normalizeScene(raw, presets = {}) {
  if (!validId(raw.id)) throw new Error(`Invalid scene id: ${raw.id}`);
  validateTitle(raw.title, "scene title");
  if (raw.itemTitle !== undefined) validateTitle(raw.itemTitle, "item title");
  const preset = presets[raw.stagePresetId] ?? {};
  const size = raw.size ?? preset.size;
  vector(size, "scene size", true);
  if (Object.values(size).some(n => n < 1 || n > 32)) throw new Error("Scene size must be 1..32");
  const bounds = { from: { x: 0, y: 0, z: 0 }, to: { x: size.x - 1, y: size.y - 1, z: size.z - 1 } };
  const focus = raw.focus ?? preset.focus ?? { x: size.x / 2, y: size.y / 3, z: size.z / 2 };
  vector(focus, "focus");
  const initialCamera = { yaw: 35, pitch: 32, distance: 22 + Math.max(size.x, size.z),
    focus, ...raw.camera };
  camera(initialCamera);
  const structures = [...(raw.structures ?? [])];
  if (raw.basePlate) structures.unshift({ ...raw.basePlate, id: "base_plate", kind: "box" });
  const structureById = new Map();
  for (const s of structures) {
    if (!validId(s.id) || structureById.has(s.id)) throw new Error(`Invalid/duplicate structure ${s.id}`);
    if (s.kind === "box") box(s, s.id, bounds);
    else if (s.kind === "block" || s.kind === "entity" || s.kind === "item") {
      vector(s.position, s.id, s.kind === "block");
      if (!inside(s.position, expand(bounds, s.kind === "block" ? 0 : 1))) throw new Error(`${s.id} outside bounds`);
    } else throw new Error(`Unknown structure kind ${s.kind}`);
    if (["box", "block"].includes(s.kind)) {
      if (!namespaced(s.blockId)) throw new Error(`Missing/invalid blockId: ${s.id}`);
      states(s.states);
    } else entity(s);
    structureById.set(s.id, s);
  }
  const initial = [...(raw.basePlate ? ["base_plate"] : []), ...(raw.initial ?? [])];
  const scene = { ...raw, size, focus, bounds, camera: initialCamera, structures, structureById, initial,
    regions: raw.regions ?? {}, air: raw.air ?? [], order: raw.order ?? 0,
    tags: raw.tags ?? [], iconPath: raw.iconPath ?? "textures/ui/ponder/logo",
    textScale: raw.textScale ?? 0.055 };
  if (!Number.isFinite(scene.textScale) || scene.textScale < .02 || scene.textScale > .1) throw new Error("Invalid text scale");
  if (!validIconPath(scene.iconPath)) throw new Error("Invalid scene iconPath");
  if (!Number.isFinite(scene.order)) throw new Error("Invalid scene order");
  // Avoid laying text around unused air in a generously sized scene volume.
  const contentPoints = structures.flatMap(s => s.kind === "box" ? [s.from, s.to] : [s.position]);
  scene.contentBounds = raw.visibleBounds ?? (contentPoints.length ? {
    from: Object.fromEntries(["x", "y", "z"].map(k => [k, Math.floor(Math.min(...contentPoints.map(p => p[k])))])),
    to: Object.fromEntries(["x", "y", "z"].map(k => [k, Math.ceil(Math.max(...contentPoints.map(p => p[k])))])),
  } : bounds);
  box(scene.contentBounds, "visible bounds", bounds);
  for (const [id, r] of Object.entries(scene.regions)) box(r, `region ${id}`, bounds);
  scene.air.forEach(b => box(b, "air region", bounds));
  const timeline = compileTimeline(raw.instructions ?? legacyTimeline(scene));
  const hasStructure = id => { if (!structureById.has(id)) throw new Error(`Unknown structure ${id}`); };
  initial.forEach(hasStructure);
  const entityIds = new Set(structures.filter(s => ["entity", "item"].includes(s.kind)).map(s => s.id));
  for (const e of timeline.events) {
    if (["show", "hide"].includes(e.op)) {
      if (!Array.isArray(e.ids)) throw new Error("show/hide requires ids");
      e.ids.forEach(hasStructure);
    }
    if (["text", "controls", "outline", "spawn", "updateEntity", "removeEntity", "region"].includes(e.op) && !validId(e.id))
      throw new Error(`Invalid event id: ${e.id}`);
    if (e.region) box(e.region, e.op, bounds);
    if (e.position) {
      vector(e.position, e.op, e.op === "block");
      if (!inside(e.position, expand(bounds, e.op === "block" ? 0 : 1))) throw new Error("Event position outside scene");
    }
    if (e.op === "block" && (!e.position && !e.region || !namespaced(e.blockId))) throw new Error("Invalid block event");
    states(e.states);
    if (e.op === "region" && (!scene.regions[e.id] || typeof e.visible !== "boolean")) throw new Error(`Invalid region ${e.id}`);
    if (e.op === "camera") camera({ ...initialCamera, ...e });
    if (e.target) { vector(e.target, "annotation target"); if (!inside(e.target, expand(bounds, 2))) throw new Error("Annotation target outside scene"); }
    if (e.op === "spawn") {
      if (!e.position || (!e.entityTypeId && !e.itemId)) throw new Error("Invalid spawn");
      entity(e);
      entityIds.add(e.id);
    }
    if (e.op === "particle") {
      if (!namespaced(e.particleId) || !e.position) throw new Error("Invalid particle");
      if (![e.interval ?? 5, e.count ?? 1].every(n => Number.isInteger(n) && n >= 1 && n <= 32))
        throw new Error("Particle count/interval must be 1..32");
    }
    if (e.iconPath && !validIconPath(e.iconPath)) throw new Error("Invalid annotation iconPath");
    if (e.color !== undefined && !(typeof e.color === "number" && Number.isInteger(e.color) && e.color >= 0 && e.color <= 0xffffff) &&
      !(typeof e.color === "string" && Object.hasOwn(PALETTE, e.color))) throw new Error("Invalid annotation color");
    if (e.through !== undefined && typeof e.through !== "boolean") throw new Error("Invalid through flag");
    if (e.side && !["auto", "left", "right", "top", "bottom"].includes(e.side)) throw new Error("Invalid annotation side");
    if (e.op === "outline" && !e.region && !e.track) throw new Error("Outline needs a region or tracked entity");
    if (e.width !== undefined && (!Number.isFinite(e.width) || e.width < .005 || e.width > .15)) throw new Error("Invalid outline width");
    if (e.op === "controls" && !["use", "attack", "scroll", "slot"].includes(e.action)) throw new Error("Unknown control action");
    if (e.op === "text") {
      for (const locale of ["zh_CN", "en_US"])
        if (!localize(e.text, locale)) throw new Error("Empty annotation text");
        else wrapText(localize(e.text, locale), { width: e.maxWidth ?? 180 });
    }
    if (e.rotation && !["x", "y"].every(k => Number.isFinite(e.rotation[k]))) throw new Error("Invalid entity rotation");
    if (e.impulse) vector(e.impulse, "entity impulse");
  }
  for (const e of timeline.events) {
    if (e.track && !entityIds.has(e.track)) throw new Error(`Unknown tracked entity ${e.track}`);
    if (["updateEntity", "removeEntity"].includes(e.op) && !entityIds.has(e.id)) throw new Error(`Unknown teaching entity ${e.id}`);
  }
  if (!Array.isArray(raw.entryItems) || !raw.entryItems.length) throw new Error("Scene requires entryItems");
  scene.timeline = timeline;
  // Validate resource peaks at changes/expirations, not just the final scene.
  const checks = new Set([0, ...timeline.events.flatMap(e => [e.at, e.at + e.duration])]);
  for (const t of checks) {
    const state = stateAt(scene, t);
    if (materializeBlocks(scene, state).size > LIMITS.blocks) throw new Error("Too many scripted blocks");
    if (state.overlays.size > LIMITS.annotations) throw new Error("Too many simultaneous annotations");
    if (state.entities.size > LIMITS.stageEntities) throw new Error("Too many teaching entities");
    const emissions = timeline.events.filter(e => e.op === "particle" && e.at <= t && e.at + e.duration >= t)
      .reduce((total, e) => total + (e.count ?? 1), 0);
    if (emissions > LIMITS.particleEmissions) throw new Error("Too many simultaneous particle emissions");
  }
  scene.room = roomForScene(scene);
  return scene;
}
export function roomForScene(scene) {
  const tracks = scene.timeline.events.filter(e => e.op === "camera");
  const cameras = [scene.camera, ...tracks.map(e => cameraAt(scene.camera, tracks, e.at + e.duration))];
  const from = { x: -4, y: -4, z: -4 }, to = { x: scene.size.x + 4, y: scene.size.y + 4, z: scene.size.z + 4 };
  const maxDistance = Math.max(...cameras.map(c => c.distance));
  const minPitch = Math.min(0, ...cameras.map(c => c.pitch));
  const maxPitch = Math.max(0, ...cameras.map(c => c.pitch));
  for (const c of cameras) {
    // Include interpolated poses and the whole annotation plane. A pitch-only
    // instruction inherits the preceding focus, not the scene's initial focus.
    const radius = maxDistance + 3;
    from.x = Math.min(from.x, Math.floor(c.focus.x - radius));
    from.z = Math.min(from.z, Math.floor(c.focus.z - radius));
    from.y = Math.min(from.y, Math.floor(c.focus.y - Math.max(.6 * maxDistance, -Math.sin(minPitch * Math.PI / 180) * maxDistance) - 4));
    to.x = Math.max(to.x, Math.ceil(c.focus.x + radius));
    to.z = Math.max(to.z, Math.ceil(c.focus.z + radius));
    to.y = Math.max(to.y, Math.ceil(c.focus.y + Math.max(.6 * maxDistance, Math.sin(maxPitch * Math.PI / 180) * maxDistance) + 5));
  }
  const room = { from, to };
  if (volume(expand(room, LIMITS.safetyBuffer)) > LIMITS.stageVolume) throw new Error("Camera/stage envelope exceeds volume budget");
  return room;
}
