import {
  DEFAULT_SCENE_MESSAGES,
  MAX_SIDE_ICON_COUNT,
  PROGRESS_MARKER,
  TITLE_MARKER,
} from "./constants.js";
import { STAGE_PRESETS } from "./config/presets.js";
import { PONDER_SCENES } from "./config/scenes/index.js";

function normalizeScene(rawScene) {
  const structureById = new Map();
  const rawSpecialBlockIcons = Array.isArray(rawScene.specialBlockIcons)
    ? rawScene.specialBlockIcons
    : [];
  const specialBlockIcons = rawSpecialBlockIcons
    .map((specialBlockIcon) => ({
      iconPath:
        typeof specialBlockIcon?.iconPath === "string" ? specialBlockIcon.iconPath : "",
      tooltipText:
        typeof specialBlockIcon?.tooltipText === "string"
          ? specialBlockIcon.tooltipText
          : "",
    }))
    .filter((specialBlockIcon) => specialBlockIcon.iconPath)
    .slice(0, MAX_SIDE_ICON_COUNT);

  for (const structure of rawScene.structures) {
    if (structureById.has(structure.id)) {
      continue;
    }

    structureById.set(structure.id, structure);
  }

  return {
    ...rawScene,
    messages: {
      ...DEFAULT_SCENE_MESSAGES,
      ...rawScene.messages,
    },
    specialBlockIcons,
    structureById,
  };
}

function createSceneIndexes(rawScenes) {
  const sceneByItem = new Map();

  for (const rawScene of rawScenes) {
    const scene = normalizeScene(rawScene);
    for (const itemId of scene.entryItems) {
      sceneByItem.set(itemId, scene);
    }
  }

  return sceneByItem;
}

const ENTRY_SCENE_BY_ITEM = createSceneIndexes(PONDER_SCENES);

export const getSceneForItem = (itemId) => ENTRY_SCENE_BY_ITEM.get(itemId);
export const getStagePreset = (scene) => STAGE_PRESETS[scene.stagePresetId];
export const getSceneTitlePrefix = (scene) => {
  const preset = getStagePreset(scene);
  return `${TITLE_MARKER}${preset.uiTitleMarker}${PROGRESS_MARKER}`;
};
