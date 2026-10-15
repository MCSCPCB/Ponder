import { CAMERA_FOV, MAX_SIDE_ICON_COUNT, STAGE_MARGIN, STAGE_PRESETS } from "../enums/PonderConfig.js";
import { expand, orbit } from "./VecHelper.js";

export const defineBoxStructure = (id, blockId, from, to) => ({ id, kind: "box", blockId, from, to });

export const defineBlockStructure = (id, blockId, position) => ({ id, kind: "block", blockId, position });

export const defineEntityStructure = (id, entityTypeId, position, options = {}) => ({
  id,
  kind: "entity",
  entityTypeId,
  position,
  ...options,
});

export const defineStage = ({ description, add = [], remove = [], bubbleSlot }) => ({
  description,
  add,
  remove,
  ...(bubbleSlot !== undefined ? { bubbleSlot } : {}),
});

/**
 * Normalizes an authored scene and derives what the camera needs: the preset's
 * stage box sits at local (0,0,0)..(size-1), the camera orbits the focus block.
 */
export function buildScene(rawScene) {
  const preset = STAGE_PRESETS[rawScene.stagePresetId];
  // The first structure with an id wins.
  const structureById = new Map();
  for (const structure of rawScene.structures) {
    if (!structureById.has(structure.id)) structureById.set(structure.id, structure);
  }
  // Side icons without a texture take no slot.
  const specialBlockIcons = (rawScene.specialBlockIcons ?? [])
    .filter(icon => icon.iconPath)
    .slice(0, MAX_SIDE_ICON_COUNT);

  const { size } = preset;
  const focus = { x: preset.focus.x + .5, y: preset.focus.y + .5, z: preset.focus.z + .5 };
  const camera = { yaw: 35, pitch: 32, distance: 22 + Math.max(size.x, size.z), focus, fov: CAMERA_FOV };
  const stageBox = { from: { x: 0, y: 0, z: 0 }, to: { x: size.x - 1, y: size.y - 1, z: size.z - 1 } };
  const lit = litBox(stageBox, orbit(camera).location);
  return {
    ...rawScene,
    preset,
    size,
    stageBox,
    camera,
    specialBlockIcons,
    structureById,
    lit,
    // The backdrop shell is one layer around the lit box.
    room: expand(lit, 1),
  };
}

/**
 * The smallest box that holds the stage with STAGE_MARGIN cells around it and the camera
 * with the same room. It is convex and holds both, so the line of sight from the camera to
 * any part of the stage stays inside it, and every other direction ends at its shell.
 * The shell glows evenly with no shading, so how near a wall is cannot be seen.
 */
function litBox(stageBox, eye) {
  const box = expand(stageBox, STAGE_MARGIN);
  for (const k of ["x", "y", "z"]) {
    box.from[k] = Math.min(box.from[k], Math.floor(eye[k]) - STAGE_MARGIN);
    box.to[k] = Math.max(box.to[k], Math.floor(eye[k]) + STAGE_MARGIN);
  }
  return box;
}
