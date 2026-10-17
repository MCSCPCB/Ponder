import { BlockPermutation, ItemTypes } from "@minecraft/server";
import { LIGHT_BLOCK, LIMITS, WORLD_SECTION_ENTITY } from "../../enums/PonderConfig.js";
import { add } from "../VecHelper.js";
import { job, safeRemove, waitTicks } from "./StageJobs.js";
import { markOwned } from "./StageOwnership.js";
import { assertStageClear, nativeVolume, slabs } from "./StageAllocator.js";

const STAGE_ENTITY_TAG = "ponder_stage_entity";
const TEMP_ANIMATION_TAG = "ponder_temp_animation";
// The fall itself is played on the client by animation.ponder.world_section.place (1.5
// blocks over 0.4 s, ease-out cubic); these ticks wait for it: the 0.4 s, plus two for the
// property to reach the client. The held blocks then rest at their end point, so waiting
// longer than the fall costs nothing visible.
const FALL_ANIMATION_TICKS = 10;
const HANDOFF_TICKS = 4;

const tagSegment = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "_");

/** Blocks that can be shown in hand: the block id must also be an item. */
const canHold = blockId => ItemTypes.get(blockId) !== undefined;

/** Sorted by position, so the two cells an entity holds are next to each other. */
function pairBlocks(blocks) {
  const sorted = [...blocks].sort((a, b) =>
    a.position.y - b.position.y || a.position.x - b.position.x || a.position.z - b.position.z);
  const pairs = [];
  for (let i = 0; i < sorted.length; i += 2) pairs.push([sorted[i], sorted[i + 1]]);
  return pairs;
}

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

  /** Writes block and box structures in batches; `blockId` overrides them (stage light to clear). */
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
    await this.writeStructures(structures, live, LIGHT_BLOCK);
    for (const structure of structures) {
      if (structure.kind !== "entity") continue;
      this.check(live);
      for (const entity of this.dimension.getEntities({ tags: [this.lease.tag, this.structureTag(structure.id)] })) safeRemove(entity);
    }
  }

  /** Empty stage cells hold stage light, so nothing in the scene sits in shadow at night. */
  async clearStage(live) {
    this.check(live);
    for (const entity of this.dimension.getEntities({ tags: [this.lease.tag, STAGE_ENTITY_TAG] })) safeRemove(entity);
    const box = { from: this.toStageLocation(this.scene.stageBox.from), to: this.toStageLocation(this.scene.stageBox.to) };
    const light = BlockPermutation.resolve(LIGHT_BLOCK), self = this;
    await job((function* () {
      for (const slab of slabs(box)) {
        self.check(live);
        self.dimension.fillBlocks(nativeVolume(slab), light);
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

  /**
   * Pairs the blocks (sorted by position) onto world_section entities: the mainhand holds the
   * first cell, where the entity stands, and the offhand the second, offset by properties.
   * Each entity starts hidden (`ponder:shown` = 0) until its items are equipped.
   */
  async spawnAnimatedBlockEntities(pairs, token, phase, live) {
    const batchTag = tagSegment(`ponder_temp_${this.lease.id}_${token}_${phase}`);
    const spawned = [];
    for (const [index, [main, off]] of pairs.entries()) {
      this.check(live);
      const entityTag = `${batchTag}_${index}`;
      const location = this.toStageEntityLocation(main.position);
      const entity = attempt(
        () => this.dimension.spawnEntity(WORLD_SECTION_ENTITY, location),
        `Failed to spawn temp animation entity for block "${main.blockId}" in scene "${this.scene.id}".`,
      );
      if (!entity) continue;
      const tagged = attempt(() => {
        markOwned(entity, this.lease);
        entity.addTag(TEMP_ANIMATION_TAG);
        entity.addTag(batchTag);
        entity.addTag(entityTag);
        if (off) {
          entity.setProperty("ponder:left_x", off.position.x - main.position.x);
          entity.setProperty("ponder:left_y", off.position.y - main.position.y);
          entity.setProperty("ponder:left_z", off.position.z - main.position.z);
          entity.setProperty("ponder:left_item_offset", off.blockId.startsWith("minecraft:") ? 2 : 0);
        }
        return true;
      }, `Failed to tag temp animation entity for block "${main.blockId}" in scene "${this.scene.id}".`);
      if (!tagged) {
        attempt(() => safeRemove(entity), `Failed to remove untagged temp animation entity in scene "${this.scene.id}".`);
        continue;
      }
      spawned.push({ entity, entityTag, main, off });
    }
    if (spawned.length > 0) {
      await waitTicks(1);
      for (const { entityTag, main, off } of spawned) {
        this.check(live);
        const target = `@e[type=${WORLD_SECTION_ENTITY},tag=${entityTag}]`;
        attempt(
          () => this.dimension.runCommand(`replaceitem entity ${target} slot.weapon.mainhand 0 ${main.blockId}`),
          `Failed to equip temp animation entity with item "${main.blockId}" in scene "${this.scene.id}".`,
        );
        if (off) attempt(
          () => this.dimension.runCommand(`replaceitem entity ${target} slot.weapon.offhand 0 ${off.blockId}`),
          `Failed to equip temp animation entity with item "${off.blockId}" in scene "${this.scene.id}".`,
        );
      }
    }
    return { batchTag, spawned };
  }

  /**
   * The entities never move: showing one (`ponder:shown` = 1) starts its fall on the client,
   * timed from the frame the client first sees it shown, so the fall cannot be missed or
   * start before the entity is drawn, and it rests at the end point afterwards.
   */
  async animateFalling(batch, live) {
    this.check(live);
    for (const { entity } of batch.spawned) {
      attempt(() => entity.setProperty("ponder:shown", 1), `Failed to show temp animation entity in scene "${this.scene.id}".`);
    }
    await waitTicks(FALL_ANIMATION_TICKS);
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
    // Only blocks that also exist as items can be held; the rest are simply placed.
    // A batch over the entity limit is placed as a whole, without the animation.
    const held = added.flatMap(expandStructureBlocks).filter(block => canHold(block.blockId));
    const pairs = pairBlocks(held);
    if (pairs.length === 0 || pairs.length > LIMITS.worldSectionEntities) {
      await this.renderStructures(added, live);
      return;
    }
    const batch = await this.spawnAnimatedBlockEntities(pairs, token, "fall", live);
    try {
      await this.animateFalling(batch, live);
      await this.renderStructures(added, live);
      // The client redraws a chunk some ticks after its blocks change, so the held blocks stay
      // until the real ones are surely drawn; removed after one tick they left a gap (a flash).
      await waitTicks(HANDOFF_TICKS);
    } finally { this.cleanupTempAnimationEntities(batch.batchTag); }
  }
}
