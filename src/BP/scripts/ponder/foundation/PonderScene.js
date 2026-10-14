import { LIMITS } from "../enums/PonderConfig.js";
import { expand, volume } from "./VecHelper.js";
import { compileSchedule, stateAt } from "./instruction/PonderSchedule.js";
import { PonderSceneBuilder } from "./PonderSceneBuilder.js";
import { createSceneBuildingUtil } from "./SceneBuildingUtil.js";
import { cameraAt } from "./VecHelper.js";
import { localize } from "./registration/PonderLocalization.js";

const identifier = /^[a-z][a-z0-9_]{0,47}$/;
export const validId = id => typeof id === "string" && identifier.test(id);
export const namespaced = id => typeof id === "string" && /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(id);
export const validIconPath = path => typeof path === "string" && /^textures\/[a-zA-Z0-9_/.-]+$/.test(path) && !path.includes("..");
export function validateTitle(value, label) {
  if (!["en_US", "zh_CN"].every(locale => typeof localize(value, locale) === "string" && localize(value, locale).trim()))
    throw new Error(`Missing localized ${label}`);
}

/**
 * Builds a scene from its registration entry: the schematic provides the world,
 * the storyboard records the instructions that reveal and change it.
 *
 * entry = { id, schematic, storyboard, entryItems, tags, order, iconPath, itemTitle, description }
 * `schematic` is a { size, blocks, air } table or a function returning one, so a
 * `.mcstructure` can be read lazily at a writable tick.
 */
export function buildScene(entry) {
  if (!validId(entry.id)) throw new Error(`Invalid scene id: ${entry.id}`);
  if (!Array.isArray(entry.entryItems) || !entry.entryItems.length) throw new Error(`Scene ${entry.id} requires entryItems`);
  const schematic = typeof entry.schematic === "function" ? entry.schematic() : entry.schematic;
  const { size } = schematic;
  if (![size.x, size.y, size.z].every(n => Number.isInteger(n) && n >= 1 && n <= 32)) throw new Error("Scene size must be 1..32");
  const data = { basePlate: { xOffset: 0, zOffset: 0, size: Math.max(size.x, size.z) }, nextUpEnabled: true };
  const builder = new PonderSceneBuilder(data);
  entry.storyboard(builder, createSceneBuildingUtil(schematic));
  validateTitle(data.title, "scene title");
  if (entry.itemTitle) validateTitle(entry.itemTitle, "item title");
  const timeline = compileSchedule(builder.finish());
  const bounds = { from: { x: 0, y: 0, z: 0 }, to: { x: size.x - 1, y: size.y - 1, z: size.z - 1 } };
  const focus = entry.focus ?? { x: size.x / 2, y: Math.max(1, size.y / 3), z: size.z / 2 };
  const camera = { yaw: 35, pitch: 32, distance: 22 + Math.max(size.x, size.z), focus, ...entry.camera };
  if (![camera.yaw, camera.pitch, camera.distance].every(Number.isFinite) || camera.distance < 8 || camera.distance > 64 || Math.abs(camera.pitch) > 75)
    throw new Error("Invalid camera (distance 8..64, pitch -75..75)");
  const scene = {
    id: entry.id, title: data.title, itemTitle: entry.itemTitle ?? data.title, description: entry.description ?? data.title,
    iconPath: entry.iconPath ?? "textures/ui/ponder/logo", entryItems: entry.entryItems, tags: entry.tags ?? [],
    order: entry.order ?? 0, nextUpEnabled: data.nextUpEnabled, textScale: entry.textScale ?? 0.055,
    schematic, size, bounds, focus, camera, timeline, basePlate: data.basePlate,
  };
  if (!validIconPath(scene.iconPath)) throw new Error("Invalid scene iconPath");
  scene.contentBounds = contentBounds(schematic) ?? bounds;
  scene.room = roomForScene(scene);
  validatePeaks(scene);
  return scene;
}

function contentBounds(schematic) {
  const from = { x: Infinity, y: Infinity, z: Infinity }, to = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const k of schematic.blocks.keys()) {
    const p = k.split(",").map(Number);
    ["x", "y", "z"].forEach((axis, i) => { from[axis] = Math.min(from[axis], p[i]); to[axis] = Math.max(to[axis], p[i]); });
  }
  return schematic.blocks.size ? { from, to } : undefined;
}

/** Resource peaks happen when events begin or end, so check those ticks only. */
function validatePeaks(scene) {
  const checks = new Set([0, scene.timeline.duration]);
  for (const e of scene.timeline.events) { checks.add(e.at); checks.add(e.at + e.duration); }
  for (const t of checks) {
    const state = stateAt(scene, Math.min(t, scene.timeline.duration));
    if (state.overlays.size > LIMITS.annotations) throw new Error(`Too many simultaneous annotations at tick ${t}`);
    if (state.entities.size > LIMITS.stageEntities) throw new Error("Too many teaching entities");
    if (state.shown.size > LIMITS.blocks) throw new Error("Too many visible blocks");
  }
}

/** Room that contains the scene, every camera pose reached and the annotation plane. */
export function roomForScene(scene) {
  const tracks = scene.timeline.events.filter(e => e.op === "camera");
  const poses = [scene.camera, ...tracks.map(e => cameraAt(scene.camera, tracks, e.at + e.duration))];
  const from = { x: -4, y: -4, z: -4 }, to = { x: scene.size.x + 4, y: scene.size.y + 4, z: scene.size.z + 4 };
  const reach = Math.max(...poses.map(c => c.distance));
  const minPitch = Math.min(0, ...poses.map(c => c.pitch)), maxPitch = Math.max(0, ...poses.map(c => c.pitch));
  for (const c of poses) {
    const radius = reach + 3;
    from.x = Math.min(from.x, Math.floor(c.focus.x - radius));
    from.z = Math.min(from.z, Math.floor(c.focus.z - radius));
    from.y = Math.min(from.y, Math.floor(c.focus.y - Math.max(.6 * reach, -Math.sin(minPitch * Math.PI / 180) * reach) - 4));
    to.x = Math.max(to.x, Math.ceil(c.focus.x + radius));
    to.z = Math.max(to.z, Math.ceil(c.focus.z + radius));
    to.y = Math.max(to.y, Math.ceil(c.focus.y + Math.max(.6 * reach, Math.sin(maxPitch * Math.PI / 180) * reach) + 5));
  }
  const room = { from, to };
  if (volume(expand(room, LIMITS.safetyBuffer)) > LIMITS.stageVolume) throw new Error("Camera/stage envelope exceeds volume budget");
  return room;
}
