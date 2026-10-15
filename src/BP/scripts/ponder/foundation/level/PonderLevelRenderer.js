import { BlockPermutation } from "@minecraft/server";
import { add } from "../VecHelper.js";
import { job, safeRemove, waitTicks } from "./StageJobs.js";
import { markOwned } from "./StageOwnership.js";
import { assertStageClear, nativeVolume, slabs } from "./StageAllocator.js";

const STAGE_ENTITY_TAG = "ponder_stage_entity";
const TEMP_ANIMATION_TAG = "ponder_temp_animation";
const FALL_ANIMATION_TICKS = 8;
const FALL_START_HEIGHT = 1.5;

const tagSegment = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "_");
const lerpNumber = (start, end, progress) => start + (end - start) * progress;
const easeOutCubic = progress => 1 - (1 - progress) ** 3;
const formatCommandNumber = value => Number(value.toFixed(4));

function attempt(action, errorMessage) {
  try {
    return action();
  } catch (error) {
    console.error(errorMessage, error);
    return undefined;
  }
}

function expandStructureBlocks(structure) {
  if (structure.kind === "block") return [{ blockId: structure.blockId, position: structure.position }];
  if (structure.kind !== "box") return [];
  const blocks = [];
  for (let x = structure.from.x; x <= structure.to.x; x += 1)
    for (let y = structure.from.y; y <= structure.to.y; y += 1)
      for (let z = structure.from.z; z <= structure.to.z; z += 1)
        blocks.push({ blockId: structure.blockId, position: { x, y, z } });
  return blocks;
}

/**
 * Draws the scene's stages into the leased stage box. Every world write runs in a
 * job and checks `live()` first, so a closing session never writes into a room
 * that is being restored.
 */
export class PonderLevelRenderer {
  constructor(session, scene) {
    this.session = session;
    this.scene = scene;
    this.dimension = session.dimension;
    this.lease = session.lease;
  }

  toStageLocation(position) { return add(this.lease.origin, position); }

  toStageEntityLocation(position) {
    const location = this.toStageLocation(position);
    return {
      x: location.x + (Number.isInteger(position.x) ? 0.5 : 0),
      y: location.y,
      z: location.z + (Number.isInteger(position.z) ? 0.5 : 0),
    };
  }

  structureTag(structureId) { return `ponder_structure_${tagSegment(structureId)}`; }

  check(live) {
    live();
    assertStageClear(this.dimension, this.lease);
  }

  activeStructureIds(stageIndex) {
    const active = new Set();
    for (let index = 0; index <= stageIndex; index += 1) {
      const stage = this.scene.stages[index];
      for (const id of stage.add) active.add(id);
      for (const id of stage.remove) active.delete(id);
    }
    return active;
  }

  stageDiff(stageIndex) {
    const stage = this.scene.stages[stageIndex], byId = this.scene.structureById;
    return {
      removed: stage.remove.map(id => byId.get(id)).filter(Boolean),
      added: stage.add.map(id => byId.get(id)).filter(Boolean),
    };
  }

  /** Writes block and box structures in batches; `blockId` overrides them (air to clear). */
  async writeStructures(structures, live, blockId) {
    const self = this, resolved = new Map();
    const permutation = id => {
      if (!resolved.has(id)) resolved.set(id, BlockPermutation.resolve(id));
      return resolved.get(id);
    };
    await job((function* () {
      for (const structure of structures) {
        if (structure.kind === "box") {
          const box = { from: self.toStageLocation(structure.from), to: self.toStageLocation(structure.to) };
          for (const slab of slabs(box)) {
            self.check(live);
            self.dimension.fillBlocks(nativeVolume(slab), permutation(blockId ?? structure.blockId));
            yield;
          }
        } else if (structure.kind === "block") {
          self.check(live);
          self.dimension.getBlock(self.toStageLocation(structure.position))
            ?.setPermutation(permutation(blockId ?? structure.blockId));
          yield;
        }
      }
    })());
  }

  spawnStructureEntity(structure) {
    const entity = this.dimension.spawnEntity(structure.entityTypeId, this.toStageEntityLocation(structure.position));
    markOwned(entity, this.lease);
    if (typeof structure.spawnEvent === "string" && structure.spawnEvent.length > 0) entity.triggerEvent(structure.spawnEvent);
    entity.addTag(STAGE_ENTITY_TAG);
    entity.addTag(this.structureTag(structure.id));
    if (structure.rotation) entity.setRotation(structure.rotation);
    if (typeof structure.nameTag === "string") entity.nameTag = structure.nameTag;
    if (Array.isArray(structure.triggerEvents)) {
      for (const triggerEvent of structure.triggerEvents) {
        if (typeof triggerEvent === "string" && triggerEvent.length > 0) entity.triggerEvent(triggerEvent);
      }
    }
  }

  async renderStructures(structures, live) {
    await this.writeStructures(structures, live);
    for (const structure of structures) {
      if (structure.kind !== "entity") continue;
      this.check(live);
      this.spawnStructureEntity(structure);
    }
  }

  async clearStructures(structures, live) {
    await this.writeStructures(structures, live, "minecraft:air");
    for (const structure of structures) {
      if (structure.kind !== "entity") continue;
      this.check(live);
      for (const entity of this.dimension.getEntities({ tags: [this.lease.tag, this.structureTag(structure.id)] })) safeRemove(entity);
    }
  }

  /** The stage box is the scene's own space: cleared cells are air, never stage light. */
  async clearStage(live) {
    this.check(live);
    for (const entity of this.dimension.getEntities({ tags: [this.lease.tag, STAGE_ENTITY_TAG] })) safeRemove(entity);
    const box = { from: this.toStageLocation(this.scene.stageBox.from), to: this.toStageLocation(this.scene.stageBox.to) };
    const air = BlockPermutation.resolve("minecraft:air"), self = this;
    await job((function* () {
      for (const slab of slabs(box)) {
        self.check(live);
        self.dimension.fillBlocks(nativeVolume(slab), air);
        yield;
      }
    })());
  }

  async buildStage(stageIndex, live) {
    await this.clearStage(live);
    const byId = this.scene.structureById;
    await this.renderStructures([...this.activeStructureIds(stageIndex)].map(id => byId.get(id)).filter(Boolean), live);
  }

  cleanupTempAnimationEntities(batchTag) {
    const tags = [TEMP_ANIMATION_TAG, this.lease.tag];
    if (batchTag) tags.push(batchTag);
    for (const entity of this.dimension.getEntities({ tags })) {
      attempt(() => safeRemove(entity), `Failed to remove temp animation entity in scene "${this.scene.id}".`);
    }
  }

  async spawnAnimatedBlockEntities(animatedBlocks, token, phase, live) {
    const batchTag = tagSegment(`ponder_temp_${this.lease.id}_${token}_${phase}`);
    const spawned = [];
    for (const [index, animatedBlock] of animatedBlocks.entries()) {
      this.check(live);
      const entityTag = `${batchTag}_${index}`;
      const finalLocation = this.toStageLocation(animatedBlock.position);
      const startLocation = { x: finalLocation.x + 0.5, y: finalLocation.y + FALL_START_HEIGHT, z: finalLocation.z + 0.5 };
      const entity = attempt(
        () => this.dimension.spawnEntity("entity:ponder_block", startLocation),
        `Failed to spawn temp animation entity for block "${animatedBlock.blockId}" in scene "${this.scene.id}".`,
      );
      if (!entity) continue;
      const tagged = attempt(() => {
        markOwned(entity, this.lease);
        entity.addTag(TEMP_ANIMATION_TAG);
        entity.addTag(batchTag);
        entity.addTag(entityTag);
        return true;
      }, `Failed to tag temp animation entity for block "${animatedBlock.blockId}" in scene "${this.scene.id}".`);
      if (!tagged) {
        attempt(() => safeRemove(entity), `Failed to remove untagged temp animation entity in scene "${this.scene.id}".`);
        continue;
      }
      spawned.push({ entityTag, itemId: animatedBlock.blockId, finalLocation, startLocation });
    }
    if (spawned.length > 0) {
      await waitTicks(1);
      for (const entry of spawned) {
        this.check(live);
        attempt(
          () => this.dimension.runCommand(`replaceitem entity @e[type=entity:ponder_block,tag=${entry.entityTag}] slot.weapon.mainhand 0 ${entry.itemId}`),
          `Failed to equip temp animation entity with item "${entry.itemId}" in scene "${this.scene.id}".`,
        );
      }
    }
    return { batchTag, spawned };
  }

  async animateFalling(spawned, live) {
    for (let tick = 0; tick < FALL_ANIMATION_TICKS; tick += 1) {
      this.check(live);
      const progress = easeOutCubic((tick + 1) / FALL_ANIMATION_TICKS);
      for (const { entityTag, startLocation, finalLocation } of spawned) {
        const y = lerpNumber(startLocation.y, finalLocation.y, progress);
        attempt(
          () => this.dimension.runCommand(`tp @e[type=entity:ponder_block,tag=${entityTag}] ${formatCommandNumber(finalLocation.x)} ${formatCommandNumber(y)} ${formatCommandNumber(finalLocation.z)}`),
          `Failed to move temp animation entity "${entityTag}".`,
        );
      }
      await waitTicks(1);
    }
    this.check(live);
  }

  /** Rebuilds up to the previous stage, then lets the target stage's blocks fall into place. */
  async transition(stageIndex, token, live) {
    this.cleanupTempAnimationEntities();
    if (stageIndex <= 0) {
      await this.buildStage(0, live);
      return;
    }
    await this.buildStage(stageIndex - 1, live);
    const { removed, added } = this.stageDiff(stageIndex);
    await this.clearStructures(removed, live);
    const animatedBlocks = added.flatMap(expandStructureBlocks);
    if (animatedBlocks.length > 0) {
      const batch = await this.spawnAnimatedBlockEntities(animatedBlocks, token, "fall", live);
      try { await this.animateFalling(batch.spawned, live); }
      finally { this.cleanupTempAnimationEntities(batch.batchTag); }
    }
    await this.renderStructures(added, live);
  }
}
