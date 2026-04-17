import { BlockPermutation, world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import {
  ANIMATE_PREVIEW_MARKER,
  ANIMATE_PROGRESS_MARKER,
  BUTTON_MARKERS,
  OVERWORLD_ID,
  REVERSE_PROGRESS_MARKER,
  SLOT_MARKERS,
} from "./constants.js";
import { getSceneForItem, getSceneTitlePrefix, getStagePreset } from "./registry.js";

let activeSession;
const tickingAreasReady = new Set();

const warnOnError = (message, callback) => {
  try {
    return callback();
  } catch (error) {
    console.warn(`${message}: ${error}`);
    return undefined;
  }
};

const isPlayerValid = (player) => {
  try {
    return player?.typeId === "minecraft:player";
  } catch {
    return false;
  }
};

const getPlayerKey = (player) => {
  try {
    return player?.id ?? player?.name;
  } catch {
    return undefined;
  }
};

const getStageLocalMax = (preset) => ({
  x: preset.size.x - 1,
  y: preset.size.y - 1,
  z: preset.size.z - 1,
});

const getStageAbsoluteMax = (preset) => {
  const localMax = getStageLocalMax(preset);
  return {
    x: preset.origin.x + localMax.x,
    y: preset.origin.y + localMax.y,
    z: preset.origin.z + localMax.z,
  };
};

const toStageLocation = (preset, position) => ({
  x: preset.origin.x + position.x,
  y: preset.origin.y + position.y,
  z: preset.origin.z + position.z,
});

function setStageBlock(dimension, preset, position, blockId) {
  const block = dimension.getBlock(toStageLocation(preset, position));
  if (!block) {
    return;
  }

  block.setPermutation(BlockPermutation.resolve(blockId));
}

function fillStageBox(dimension, preset, from, to, blockId) {
  for (let x = from.x; x <= to.x; x += 1) {
    for (let y = from.y; y <= to.y; y += 1) {
      for (let z = from.z; z <= to.z; z += 1) {
        setStageBlock(dimension, preset, { x, y, z }, blockId);
      }
    }
  }
}

function renderStructure(dimension, preset, structure) {
  if (structure.kind === "box") {
    fillStageBox(dimension, preset, structure.from, structure.to, structure.blockId);
    return;
  }

  if (structure.kind === "block") {
    setStageBlock(dimension, preset, structure.position, structure.blockId);
  }
}

function clearStructure(dimension, preset, structure) {
  if (structure.kind === "box") {
    fillStageBox(dimension, preset, structure.from, structure.to, "minecraft:air");
    return;
  }

  if (structure.kind === "block") {
    setStageBlock(dimension, preset, structure.position, "minecraft:air");
  }
}

function clearStage(dimension, preset) {
  fillStageBox(
    dimension,
    preset,
    { x: 0, y: 0, z: 0 },
    getStageLocalMax(preset),
    "minecraft:air",
  );
}

function ensureTickingArea(dimension, scene, preset) {
  if (tickingAreasReady.has(scene.id)) {
    return;
  }

  const absoluteMax = getStageAbsoluteMax(preset);
  warnOnError("Failed to add ticking area", () =>
    dimension.runCommand(
      `tickingarea add ${preset.origin.x} ${preset.origin.y} ${preset.origin.z} ${absoluteMax.x} ${absoluteMax.y} ${absoluteMax.z} ${scene.tickingAreaName} true`,
    ),
  );
  tickingAreasReady.add(scene.id);
}

function getActiveStructureIds(scene, stageIndex) {
  const activeStructureIds = new Set();

  for (let currentIndex = 0; currentIndex <= stageIndex; currentIndex += 1) {
    const stage = scene.stages[currentIndex];

    for (const structureId of stage.add) {
      activeStructureIds.add(structureId);
    }

    for (const structureId of stage.remove) {
      activeStructureIds.delete(structureId);
    }
  }

  return activeStructureIds;
}

function buildSceneStage(scene, dimension, preset, stageIndex) {
  clearStage(dimension, preset);

  for (const structureId of getActiveStructureIds(scene, stageIndex)) {
    const structure = scene.structureById.get(structureId);
    if (!structure) {
      continue;
    }

    renderStructure(dimension, preset, structure);
  }
}

function syncSceneStage(scene, dimension, preset, previousStageIndex, nextStageIndex) {
  if (previousStageIndex === undefined || previousStageIndex === null) {
    buildSceneStage(scene, dimension, preset, nextStageIndex);
    return;
  }

  const previousStructureIds = getActiveStructureIds(scene, previousStageIndex);
  const nextStructureIds = getActiveStructureIds(scene, nextStageIndex);

  for (const structureId of previousStructureIds) {
    if (nextStructureIds.has(structureId)) {
      continue;
    }

    const structure = scene.structureById.get(structureId);
    if (!structure) {
      continue;
    }

    clearStructure(dimension, preset, structure);
  }

  for (const structureId of nextStructureIds) {
    const structure = scene.structureById.get(structureId);
    if (!structure) {
      continue;
    }

    renderStructure(dimension, preset, structure);
  }
}

function createStageBody(stage) {
  return stage.description;
}

function createMarkedButtonLabel(id, text) {
  return `${BUTTON_MARKERS[id]}${text}`;
}

// Bedrock reliably exposes form button text to custom server_form UI, so the
// middle button carries the bubble payload while still advertising the close icon.
function createBubblePayloadLabel(text) {
  return createMarkedButtonLabel("close", text);
}

function createStageButtons(stageCount, stageIndex, stageBody) {
  const buttons = [
    {
      id: stageIndex > 0 ? "prev" : "noop",
      label:
        stageIndex > 0
          ? createMarkedButtonLabel("prev", "Previous")
          : createMarkedButtonLabel("hidden", ""),
    },
    {
      id: "close",
      label: createBubblePayloadLabel(stageBody),
    },
  ];

  if (stageIndex < stageCount - 1) {
    buttons.push({
      id: "next",
      label: createMarkedButtonLabel("next", stageIndex === 0 ? "Begin" : "Next"),
    });
  } else {
    buttons.push({
      id: "restart",
      label: createMarkedButtonLabel("restart", "Replay"),
    });
  }

  return buttons;
}

function getStageProgress(stageCount, stageIndex) {
  if (stageCount <= 0) {
    return "0";
  }

  return String(Math.round(((stageIndex + 1) * 100) / stageCount));
}

function getStageBubbleSlotMarker(stageIndex) {
  if (stageIndex % 2 === 0) {
    return SLOT_MARKERS.top;
  }

  return SLOT_MARKERS.middle;
}

function createStageForm(scene, stageIndex, animateProgressMode = "none", animatePreview = false) {
  const stageCount = scene.stages.length;
  const stage = scene.stages[stageIndex];
  const stageBody = createStageBody(stage);
  const buttons = createStageButtons(stageCount, stageIndex, stageBody);
  const animationMarker =
    animateProgressMode === "forward"
      ? ANIMATE_PROGRESS_MARKER
      : animateProgressMode === "reverse"
        ? REVERSE_PROGRESS_MARKER
        : "";
  const form = new ActionFormData()
    .title(
      `${getSceneTitlePrefix(scene)}${getStageProgress(stageCount, stageIndex)}${animationMarker}${animatePreview ? ANIMATE_PREVIEW_MARKER : ""}${getStageBubbleSlotMarker(stageIndex)}`,
    )
    .body(stageBody);

  for (const button of buttons) {
    form.button(button.label);
  }

  return { form, buttons };
}

async function runPonderScene(player, scene) {
  const playerKey = getPlayerKey(player);
  if (!playerKey) {
    return;
  }

  if (activeSession) {
    if (activeSession.playerKey !== playerKey) {
      warnOnError("Failed to notify player", () =>
        player.sendMessage?.(scene.messages.inUse),
      );
    }
    return;
  }

  if (!isPlayerValid(player) || player.dimension?.id !== OVERWORLD_ID) {
    warnOnError("Failed to notify player", () =>
      player?.sendMessage?.(scene.messages.invalidDimension),
    );
    return;
  }

  if (scene.stages.length <= 0) {
    warnOnError("Failed to notify player", () =>
      player.sendMessage?.(scene.messages.missingStages),
    );
    return;
  }

  const preset = getStagePreset(scene);
  if (!preset) {
    return;
  }

  activeSession = {
    playerKey,
  };

  let dimension;
  let stageIndex = 0;
  let renderedStageIndex;
  let animateProgressMode = "forward";
  let animatePreview = true;

  try {
    dimension = world.getDimension(OVERWORLD_ID);
    ensureTickingArea(dimension, scene, preset);

    syncSceneStage(scene, dimension, preset, renderedStageIndex, stageIndex);
    renderedStageIndex = stageIndex;

    let currentFormState = createStageForm(
      scene,
      stageIndex,
      animateProgressMode,
      animatePreview,
    );
    let pendingResult = currentFormState.form.show(player);

    while (isPlayerValid(player)) {
      const result = await pendingResult;

      if (result.canceled) {
        break;
      }

      const action = currentFormState.buttons[result.selection]?.id;
      if (!action || action === "noop") {
        animateProgressMode = "none";
        animatePreview = false;
      } else if (action === "close") {
        break;
      } else if (action === "prev") {
        stageIndex = Math.max(0, stageIndex - 1);
        animateProgressMode = "reverse";
        animatePreview = false;
      } else if (action === "restart") {
        stageIndex = 0;
        animateProgressMode = "forward";
        animatePreview = false;
      } else if (action === "next") {
        stageIndex = Math.min(scene.stages.length - 1, stageIndex + 1);
        animateProgressMode = "forward";
        animatePreview = false;
      }

      currentFormState = createStageForm(
        scene,
        stageIndex,
        animateProgressMode,
        animatePreview,
      );
      pendingResult = currentFormState.form.show(player);
      syncSceneStage(scene, dimension, preset, renderedStageIndex, stageIndex);
      renderedStageIndex = stageIndex;
    }
  } finally {
    if (dimension) {
      warnOnError("Failed to clear demo stage", () => clearStage(dimension, preset));
    }

    activeSession = undefined;
  }
}

export function handlePonderItemUse({ itemStack, source }) {
  if (!isPlayerValid(source)) {
    return;
  }

  const scene = getSceneForItem(itemStack?.typeId);
  if (!scene) {
    return;
  }

  void runPonderScene(source, scene);
}
