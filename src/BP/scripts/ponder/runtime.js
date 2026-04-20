import { BlockPermutation, HudVisibility, system, world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import {
  ANIMATE_PREVIEW_MARKER,
  ANIMATE_PROGRESS_MARKER,
  BUTTON_MARKERS,
  DEFAULT_BUBBLE_SLOT,
  HEADER_TITLE_MARKER,
  MAX_SIDE_ICON_COUNT,
  OVERWORLD_ID,
  REVERSE_PROGRESS_MARKER,
  SLOT_MARKERS,
} from "./constants.js";
import { getSceneForItem, getSceneTitlePrefix, getStagePreset } from "./registry.js";

let activeSession;
const tickingAreasReady = new Set();
const DEFAULT_HEADER_ICON_PATH = "textures/ui/ponder/logo";
const PONDER_STAGE_ENTITY_TAG = "ponder_stage_entity";
const PONDER_TEMP_ANIMATION_TAG = "ponder_temp_animation";
const PONDER_FALL_ANIMATION_TICKS = 8;
const PONDER_FALL_START_HEIGHT = 1.5;

const ignoreErrors = (callback) => {
  try {
    return callback();
  } catch {
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

const normalizeEntityTagSegment = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_");

const getSceneEntityTag = (scene) =>
  `ponder_scene_${normalizeEntityTagSegment(scene?.id)}`;

const getStructureEntityTag = (scene, structureId) =>
  `ponder_structure_${normalizeEntityTagSegment(scene?.id)}_${normalizeEntityTagSegment(structureId)}`;

function hideHudElements(player) {
  ignoreErrors(() =>
    player?.onScreenDisplay?.setHudVisibility(HudVisibility.Hide),
  );
}

function restoreHudElements(player) {
  ignoreErrors(() =>
    player?.onScreenDisplay?.setHudVisibility(HudVisibility.Reset),
  );
}

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

const toStageEntityLocation = (preset, position) => ({
  x: preset.origin.x + position.x + (Number.isInteger(position.x) ? 0.5 : 0),
  y: preset.origin.y + position.y,
  z: preset.origin.z + position.z + (Number.isInteger(position.z) ? 0.5 : 0),
});

function getSceneStageEntities(dimension, scene) {
  return dimension.getEntities({
    tags: [PONDER_STAGE_ENTITY_TAG, getSceneEntityTag(scene)],
  });
}

function getStructureEntities(dimension, scene, structureId) {
  return dimension.getEntities({
    tags: [PONDER_STAGE_ENTITY_TAG, getStructureEntityTag(scene, structureId)],
  });
}

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

function renderStructure(scene, dimension, preset, structure) {
  if (structure.kind === "box") {
    fillStageBox(dimension, preset, structure.from, structure.to, structure.blockId);
    return;
  }

  if (structure.kind === "block") {
    setStageBlock(dimension, preset, structure.position, structure.blockId);
    return;
  }

  if (structure.kind !== "entity") {
    return;
  }

  const entity = ignoreErrors(
    () =>
      dimension.spawnEntity(
        structure.entityTypeId,
        toStageEntityLocation(preset, structure.position),
        structure.spawnEvent ? { spawnEvent: structure.spawnEvent } : undefined,
      ),
  );
  if (!entity) {
    return;
  }

  ignoreErrors(() => {
    entity.addTag(PONDER_STAGE_ENTITY_TAG);
    entity.addTag(getSceneEntityTag(scene));
    entity.addTag(getStructureEntityTag(scene, structure.id));
  });

  if (structure.rotation) {
    ignoreErrors(() =>
      entity.setRotation(structure.rotation),
    );
  }

  if (typeof structure.nameTag === "string") {
    ignoreErrors(() => {
      entity.nameTag = structure.nameTag;
    });
  }

  if (Array.isArray(structure.triggerEvents)) {
    for (const triggerEvent of structure.triggerEvents) {
      if (typeof triggerEvent !== "string" || triggerEvent.length <= 0) {
        continue;
      }

      ignoreErrors(() =>
        entity.triggerEvent(triggerEvent),
      );
    }
  }
}

function clearStructure(scene, dimension, preset, structure) {
  if (structure.kind === "box") {
    fillStageBox(dimension, preset, structure.from, structure.to, "minecraft:air");
    return;
  }

  if (structure.kind === "block") {
    setStageBlock(dimension, preset, structure.position, "minecraft:air");
    return;
  }

  if (structure.kind !== "entity") {
    return;
  }

  for (const entity of getStructureEntities(dimension, scene, structure.id)) {
    ignoreErrors(() => entity.remove());
  }
}

function clearStage(dimension, preset, scene) {
  fillStageBox(
    dimension,
    preset,
    { x: 0, y: 0, z: 0 },
    getStageLocalMax(preset),
    "minecraft:air",
  );

  for (const entity of getSceneStageEntities(dimension, scene)) {
    ignoreErrors(() => entity.remove());
  }
}

function ensureTickingArea(dimension, scene, preset) {
  if (tickingAreasReady.has(scene.id)) {
    return;
  }

  const absoluteMax = getStageAbsoluteMax(preset);
  ignoreErrors(() =>
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
  clearStage(dimension, preset, scene);

  for (const structureId of getActiveStructureIds(scene, stageIndex)) {
    const structure = scene.structureById.get(structureId);
    if (!structure) {
      continue;
    }

    renderStructure(scene, dimension, preset, structure);
  }
}

const waitTicks = (tickCount) =>
  new Promise((resolve) => {
    if (!Number.isFinite(tickCount) || tickCount <= 0) {
      resolve();
      return;
    }

    system.runTimeout(resolve, tickCount);
  });

const lerpNumber = (start, end, progress) => start + (end - start) * progress;

const easeOutCubic = (progress) => 1 - (1 - progress) ** 3;

const isTransitionCurrent = (session, animationToken) =>
  activeSession === session && !session?.closed && session?.animationToken === animationToken;

const getTempAnimationBatchTag = (scene, animationToken, phase) =>
  normalizeEntityTagSegment(`ponder_temp_${scene.id}_${animationToken}_${phase}`);

const getTempAnimationEntityTag = (scene, animationToken, phase, index) =>
  normalizeEntityTagSegment(`ponder_temp_${scene.id}_${animationToken}_${phase}_${index}`);

const getAnimationEntitySelector = (tags) =>
  `@e[type=entity:ponder_block,${tags.map((tag) => `tag=${tag}`).join(",")}]`;

const formatCommandNumber = (value) => Number(value.toFixed(4));

function getTempAnimationEntities(dimension, scene, batchTag) {
  const tags = [PONDER_TEMP_ANIMATION_TAG, getSceneEntityTag(scene)];
  if (batchTag) {
    tags.push(batchTag);
  }

  return dimension.getEntities({ tags });
}

function cleanupTempAnimationEntities(dimension, scene, batchTag) {
  for (const entity of getTempAnimationEntities(dimension, scene, batchTag)) {
    ignoreErrors(() => entity.remove());
  }
}

function getSceneStageStructureDiff(scene, stageIndex) {
  const stage = scene.stages[stageIndex];
  const removedStructures = [];
  const addedStructures = [];

  for (const structureId of stage.remove) {
    const structure = scene.structureById.get(structureId);
    if (structure) {
      removedStructures.push(structure);
    }
  }

  for (const structureId of stage.add) {
    const structure = scene.structureById.get(structureId);
    if (structure) {
      addedStructures.push(structure);
    }
  }

  return { removedStructures, addedStructures };
}

function expandStructureBlocks(structure) {
  if (structure.kind === "block") {
    return [
      {
        blockId: structure.blockId,
        position: structure.position,
      },
    ];
  }

  if (structure.kind !== "box") {
    return [];
  }

  const blocks = [];

  for (let x = structure.from.x; x <= structure.to.x; x += 1) {
    for (let y = structure.from.y; y <= structure.to.y; y += 1) {
      for (let z = structure.from.z; z <= structure.to.z; z += 1) {
        blocks.push({
          blockId: structure.blockId,
          position: { x, y, z },
        });
      }
    }
  }

  return blocks;
}

function getAnimatedBlockEntries(structures) {
  const animatedBlocks = [];

  for (const structure of structures) {
    for (const block of expandStructureBlocks(structure)) {
      animatedBlocks.push(block);
    }
  }

  return animatedBlocks;
}

async function spawnAnimatedBlockEntities(
  dimension,
  scene,
  preset,
  animatedBlocks,
  animationToken,
  phase,
  itemResolver,
  extraYOffset = 0,
) {
  const batchTag = getTempAnimationBatchTag(scene, animationToken, phase);
  const spawnedEntities = [];

  for (const [index, animatedBlock] of animatedBlocks.entries()) {
    const entityTag = getTempAnimationEntityTag(scene, animationToken, phase, index);
    const finalLocation = toStageLocation(preset, animatedBlock.position);
    const spawnLocation = {
      x: finalLocation.x + 0.5,
      y: finalLocation.y + extraYOffset,
      z: finalLocation.z + 0.5,
    };
    const animationEntity = ignoreErrors(
      () => dimension.spawnEntity("entity:ponder_block", spawnLocation),
    );
    if (!animationEntity) {
      continue;
    }

    ignoreErrors(() => {
      animationEntity.addTag(PONDER_TEMP_ANIMATION_TAG);
      animationEntity.addTag(getSceneEntityTag(scene));
      animationEntity.addTag(batchTag);
      animationEntity.addTag(entityTag);
    });

    spawnedEntities.push({
      entityTag,
      itemId: itemResolver(animatedBlock),
      finalLocation,
      startLocation: spawnLocation,
    });
  }

  if (spawnedEntities.length > 0) {
    await waitTicks(1);
    for (const spawnedEntity of spawnedEntities) {
      if (!spawnedEntity.itemId) {
        continue;
      }

      ignoreErrors(
        () =>
          dimension.runCommand(
            `replaceitem entity ${getAnimationEntitySelector([spawnedEntity.entityTag])} slot.weapon.mainhand 0 ${spawnedEntity.itemId}`,
          ),
      );
    }
  }

  return { batchTag, spawnedEntities };
}

function teleportAnimatedBlockEntities(dimension, spawnedEntities, locationResolver) {
  for (const spawnedEntity of spawnedEntities) {
    const nextLocation = locationResolver(spawnedEntity);
    ignoreErrors(() =>
      dimension.runCommand(
        `tp ${getAnimationEntitySelector([spawnedEntity.entityTag])} ${formatCommandNumber(spawnedEntity.finalLocation.x)} ${formatCommandNumber(nextLocation.y)} ${formatCommandNumber(spawnedEntity.finalLocation.z)}`,
      ),
    );
  }
}

async function animateFallingBlockEntities(
  session,
  dimension,
  animationToken,
  spawnedEntities,
  tickCount,
) {
  for (let tick = 0; tick < tickCount; tick += 1) {
    if (!isTransitionCurrent(session, animationToken)) {
      return false;
    }

    const progress = easeOutCubic((tick + 1) / tickCount);
    teleportAnimatedBlockEntities(dimension, spawnedEntities, ({ startLocation, finalLocation }) => ({
      x: lerpNumber(startLocation.x, finalLocation.x, progress),
      y: lerpNumber(startLocation.y, finalLocation.y, progress),
      z: lerpNumber(startLocation.z, finalLocation.z, progress),
    }));
    await waitTicks(1);
  }

  return isTransitionCurrent(session, animationToken);
}

async function animateSceneStageTransition(
  session,
  scene,
  dimension,
  preset,
  animationToken,
  targetStageIndex,
) {
  const { removedStructures, addedStructures } = getSceneStageStructureDiff(scene, targetStageIndex);
  const animatedBlocks = getAnimatedBlockEntries(addedStructures);

  if (!isTransitionCurrent(session, animationToken)) {
    return;
  }

  for (const structure of removedStructures) {
    clearStructure(scene, dimension, preset, structure);
  }

  if (animatedBlocks.length > 0) {
    const fallBatch = await spawnAnimatedBlockEntities(
      dimension,
      scene,
      preset,
      animatedBlocks,
      animationToken,
      "fall",
      ({ blockId }) => blockId,
      PONDER_FALL_START_HEIGHT,
    );
    const fallFinished = await animateFallingBlockEntities(
      session,
      dimension,
      animationToken,
      fallBatch.spawnedEntities,
      PONDER_FALL_ANIMATION_TICKS,
    );

    cleanupTempAnimationEntities(dimension, scene, fallBatch.batchTag);
    if (!fallFinished) {
      return;
    }
  }

  if (!isTransitionCurrent(session, animationToken)) {
    return;
  }

  for (const structure of addedStructures) {
    renderStructure(scene, dimension, preset, structure);
  }
}

function beginSceneStageTransition(session, scene, dimension, preset, targetStageIndex) {
  session.animationToken += 1;
  const animationToken = session.animationToken;

  system.run(() => {
    if (!isTransitionCurrent(session, animationToken)) {
      return;
    }

    cleanupTempAnimationEntities(dimension, scene);

    if (targetStageIndex <= 0) {
      buildSceneStage(scene, dimension, preset, 0);
      return;
    }

    buildSceneStage(scene, dimension, preset, targetStageIndex - 1);
    void animateSceneStageTransition(
      session,
      scene,
      dimension,
      preset,
      animationToken,
      targetStageIndex,
    );
  });
}

function createMarkedButtonLabel(id, text) {
  return `${BUTTON_MARKERS[id]}${text}`;
}

// Bedrock reliably exposes form button text to custom server_form UI, so the
// middle button carries the bubble payload while still advertising the close icon.
function createBubblePayloadLabel(text) {
  return createMarkedButtonLabel("close", text);
}

function createSceneTitlePayloadLabel(text) {
  return createMarkedButtonLabel("hidden", `${HEADER_TITLE_MARKER}${text}`);
}

function createSpecialBlockIconButtons(specialBlockIcons = []) {
  const buttons = [];

  for (
    let specialBlockIconIndex = 0;
    specialBlockIconIndex < MAX_SIDE_ICON_COUNT;
    specialBlockIconIndex += 1
  ) {
    const specialBlockIcon = specialBlockIcons[specialBlockIconIndex];
    const hasSpecialBlockIcon = Boolean(specialBlockIcon?.iconPath);

    buttons.push({
      id: "noop",
      label: specialBlockIcon?.tooltipText ?? "",
      ...(hasSpecialBlockIcon ? { iconPath: specialBlockIcon.iconPath } : {}),
    });
  }

  return buttons;
}

function createStageButtons(
  stageCount,
  stageIndex,
  stageBody,
  sceneTitle,
  sceneIconPath,
  specialBlockIcons,
) {
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
      iconPath: sceneIconPath,
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

  buttons.push({
    id: "noop",
    label: createSceneTitlePayloadLabel(sceneTitle),
  });

  buttons.push(...createSpecialBlockIconButtons(specialBlockIcons));

  return buttons;
}

function getStageProgress(stageCount, stageIndex) {
  return String(Math.round(((stageIndex + 1) * 100) / stageCount));
}

function getStageBubbleSlot(scene, stageIndex) {
  for (let currentIndex = stageIndex; currentIndex >= 0; currentIndex -= 1) {
    const bubbleSlot = scene.stages[currentIndex]?.bubbleSlot;
    if (bubbleSlot && SLOT_MARKERS[bubbleSlot]) {
      return bubbleSlot;
    }
  }

  return DEFAULT_BUBBLE_SLOT;
}

function getStageBubbleSlotMarker(scene, stageIndex) {
  const bubbleSlot = getStageBubbleSlot(scene, stageIndex);
  return SLOT_MARKERS[bubbleSlot];
}

function createStageForm(
  scene,
  stageIndex,
  animateProgressMode = "none",
  animatePreview = false,
) {
  const stageCount = scene.stages.length;
  const stage = scene.stages[stageIndex];
  const stageBody = stage.description;
  const buttons = createStageButtons(
    stageCount,
    stageIndex,
    stageBody,
    scene.title ?? "",
    scene.iconPath ?? DEFAULT_HEADER_ICON_PATH,
    scene.specialBlockIcons,
  );
  const animationMarker =
    animateProgressMode === "forward"
      ? ANIMATE_PROGRESS_MARKER
      : animateProgressMode === "reverse"
        ? REVERSE_PROGRESS_MARKER
        : "";
  const form = new ActionFormData()
    .title(
      `${getSceneTitlePrefix(scene)}${getStageProgress(stageCount, stageIndex)}${animationMarker}${animatePreview ? ANIMATE_PREVIEW_MARKER : ""}${getStageBubbleSlotMarker(scene, stageIndex)}`,
    )
    .body(scene.title ?? "");

  for (const button of buttons) {
    if (button.iconPath) {
      form.button(button.label, button.iconPath);
      continue;
    }

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
      ignoreErrors(() =>
        player.sendMessage?.(scene.messages.inUse),
      );
    }
    return;
  }

  if (!isPlayerValid(player) || player.dimension?.id !== OVERWORLD_ID) {
    ignoreErrors(() =>
      player?.sendMessage?.(scene.messages.invalidDimension),
    );
    return;
  }

  if (scene.stages.length <= 0) {
    ignoreErrors(() =>
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
    animationToken: 0,
    closed: false,
  };
  const session = activeSession;

  let dimension;
  let stageIndex = 0;
  let animateProgressMode = "forward";
  let animatePreview = true;

  try {
    dimension = world.getDimension(OVERWORLD_ID);
    ensureTickingArea(dimension, scene, preset);

    hideHudElements(player);

    let currentFormState = createStageForm(scene, stageIndex, animateProgressMode, animatePreview);
    let pendingResult = currentFormState.form.show(player);
    beginSceneStageTransition(session, scene, dimension, preset, stageIndex);

    while (isPlayerValid(player)) {
      const result = await pendingResult;

      if (result.canceled) {
        break;
      }

      const action = currentFormState.buttons[result.selection]?.id;
      let nextStageIndex = stageIndex;

      if (!action || action === "noop") {
        animateProgressMode = "none";
        animatePreview = false;
      } else if (action === "close") {
        break;
      } else if (action === "prev") {
        nextStageIndex = Math.max(0, stageIndex - 1);
        animateProgressMode = "reverse";
        animatePreview = false;
      } else if (action === "restart") {
        nextStageIndex = 0;
        animateProgressMode = "forward";
        animatePreview = false;
      } else if (action === "next") {
        nextStageIndex = Math.min(scene.stages.length - 1, stageIndex + 1);
        animateProgressMode = "forward";
        animatePreview = false;
      }

      const stageChanged = nextStageIndex !== stageIndex;
      stageIndex = nextStageIndex;
      currentFormState = createStageForm(scene, stageIndex, animateProgressMode, animatePreview);
      pendingResult = currentFormState.form.show(player);

      if (stageChanged) {
        beginSceneStageTransition(session, scene, dimension, preset, stageIndex);
      }
    }
  } finally {
    session.closed = true;
    session.animationToken += 1;

    if (dimension) {
      ignoreErrors(() =>
        cleanupTempAnimationEntities(dimension, scene),
      );
      ignoreErrors(() => clearStage(dimension, preset, scene));
    }

    restoreHudElements(player);
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
