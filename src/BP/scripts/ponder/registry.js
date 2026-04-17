import {
  BUBBLE_SLOT_IDS,
  DEFAULT_SCENE_MESSAGES,
  PROGRESS_MARKER,
  TITLE_MARKER,
} from "./constants.js";
import { SUPPORTED_PROGRESS_STAGE_COUNTS } from "./config/progressPresets.js";
import { STAGE_PRESETS } from "./config/presets.js";
import { PONDER_SCENES } from "./config/scenes/index.js";

const VALID_BUBBLE_SLOTS = new Set(BUBBLE_SLOT_IDS);

function normalizeScene(rawScene) {
  const structureById = new Map();

  for (const structure of rawScene.structures) {
    if (structureById.has(structure.id)) {
      console.warn(`Duplicate structure id "${structure.id}" in scene "${rawScene.id}"`);
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
    structureById,
  };
}

function createSceneIndexes(rawScenes) {
  const scenes = [];
  const sceneByItem = new Map();

  for (const rawScene of rawScenes) {
    const scene = normalizeScene(rawScene);
    scenes.push(scene);

    for (const itemId of scene.entryItems) {
      if (sceneByItem.has(itemId)) {
        console.warn(
          `Duplicate entry item "${itemId}" mapped by scenes "${sceneByItem.get(itemId).id}" and "${scene.id}"`,
        );
      }

      sceneByItem.set(itemId, scene);
    }
  }

  return { scenes, sceneByItem };
}

function validateScene(scene) {
  if (!STAGE_PRESETS[scene.stagePresetId]) {
    console.warn(`Missing stage preset "${scene.stagePresetId}" for scene "${scene.id}"`);
  }

  if (!SUPPORTED_PROGRESS_STAGE_COUNTS.has(scene.stages.length)) {
    console.warn(
      `Scene "${scene.id}" uses ${scene.stages.length} stages, but the bundled progress presets currently support ${[...SUPPORTED_PROGRESS_STAGE_COUNTS].join(" and ")} stages.`,
    );
  }

  if (scene.entryItems.length <= 0) {
    console.warn(`Scene "${scene.id}" has no entryItems`);
  }

  if (scene.stages.length <= 0) {
    console.warn(`Scene "${scene.id}" has no stages`);
  }

  for (const [stageIndex, stage] of scene.stages.entries()) {
    if (stage.bubbleSlot !== undefined && !VALID_BUBBLE_SLOTS.has(stage.bubbleSlot)) {
      console.warn(
        `Scene "${scene.id}" stage ${stageIndex + 1} uses invalid bubbleSlot "${stage.bubbleSlot}". Expected one of ${BUBBLE_SLOT_IDS.join(", ")}.`,
      );
    }

    for (const structureId of [...stage.add, ...stage.remove]) {
      if (!scene.structureById.has(structureId)) {
        console.warn(
          `Scene "${scene.id}" stage ${stageIndex + 1} references unknown structure id "${structureId}"`,
        );
      }
    }
  }
}

const { scenes: SCENES, sceneByItem: ENTRY_SCENE_BY_ITEM } = createSceneIndexes(PONDER_SCENES);
for (const scene of SCENES) {
  validateScene(scene);
}

export const getSceneForItem = (itemId) => ENTRY_SCENE_BY_ITEM.get(itemId);
export const getStagePreset = (scene) => STAGE_PRESETS[scene.stagePresetId];
export const getSceneTitlePrefix = (scene) => {
  const preset = getStagePreset(scene);
  return `${TITLE_MARKER}${preset?.uiTitleMarker ?? ""}${PROGRESS_MARKER}`;
};
