import { CAMERA_FOV, LIMITS, MAX_SIDE_ICON_COUNT, STAGE_PRESETS } from "../enums/PonderConfig.js";
import { expand, volume } from "./VecHelper.js";

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
  if (!preset) throw new Error(`Unknown stage preset ${rawScene.stagePresetId} in ${rawScene.id}`);
  if (!rawScene.stages?.length) throw new Error(`Scene ${rawScene.id} has no stages`);

  const structureById = new Map();
  for (const structure of rawScene.structures) {
    if (!structureById.has(structure.id)) structureById.set(structure.id, structure);
  }
  const specialBlockIcons = (Array.isArray(rawScene.specialBlockIcons) ? rawScene.specialBlockIcons : [])
    .map(icon => ({
      iconPath: typeof icon?.iconPath === "string" ? icon.iconPath : "",
      tooltipText: typeof icon?.tooltipText === "string" ? icon.tooltipText : "",
    }))
    .filter(icon => icon.iconPath)
    .slice(0, MAX_SIDE_ICON_COUNT);

  const { size } = preset;
  const focus = { x: preset.focus.x + .5, y: preset.focus.y + .5, z: preset.focus.z + .5 };
  const camera = { yaw: 35, pitch: 32, distance: 22 + Math.max(size.x, size.z), focus, fov: CAMERA_FOV };
  const scene = {
    ...rawScene,
    preset,
    size,
    stageBox: { from: { x: 0, y: 0, z: 0 }, to: { x: size.x - 1, y: size.y - 1, z: size.z - 1 } },
    camera,
    specialBlockIcons,
    structureById,
  };
  scene.room = roomForScene(scene);
  return scene;
}

/** Room that contains the stage box and the camera pose, walled by the shell on its faces. */
export function roomForScene(scene) {
  const { camera: c, size } = scene, reach = c.distance;
  const radius = reach + 3;
  const room = {
    from: {
      x: Math.min(-4, Math.floor(c.focus.x - radius)),
      y: Math.min(-4, Math.floor(c.focus.y - .6 * reach - 4)),
      z: Math.min(-4, Math.floor(c.focus.z - radius)),
    },
    to: {
      x: Math.max(size.x + 4, Math.ceil(c.focus.x + radius)),
      y: Math.max(size.y + 4, Math.ceil(c.focus.y + Math.max(.6 * reach, Math.sin(c.pitch * Math.PI / 180) * reach) + 5)),
      z: Math.max(size.z + 4, Math.ceil(c.focus.z + radius)),
    },
  };
  if (volume(expand(room, LIMITS.safetyBuffer)) > LIMITS.stageVolume) throw new Error("Camera/stage envelope exceeds volume budget");
  return room;
}
