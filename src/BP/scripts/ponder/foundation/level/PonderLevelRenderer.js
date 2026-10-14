import { BlockPermutation, ItemStack } from "@minecraft/server";
import { LIGHT_BLOCK, LIMITS } from "../../enums/PonderConfig.js";
import { add, inside, key, positions, sub, unkey } from "../VecHelper.js";
import { assertLive, job, safeRemove } from "./StageJobs.js";
import { OverlayRenderer } from "../element/OverlayRenderer.js";
import { markOwned } from "./StageOwnership.js";
import { assertStageClear } from "./StageAllocator.js";
import { SectionAnimator } from "./SectionAnimator.js";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const TICKS_PER_SECOND = 20;

/**
 * Draws one scene state into the leased stage: real blocks for everything at
 * rest, animated block entities for sections that are fading or moving.
 */
export class PonderLevelRenderer {
  constructor(session, scene) {
    this.session = session; this.scene = scene; this.blocks = new Map();
    this.entities = new Map(); this.permutations = new Map(); this.lastTick = -1;
    this.air = scene.schematic.air;
    this.animator = new SectionAnimator(session);
    this.overlays = new OverlayRenderer(session, scene);
  }
  permutation(descriptor) {
    const id = JSON.stringify(descriptor);
    if (!this.permutations.has(id))
      this.permutations.set(id, BlockPermutation.resolve(descriptor.blockId, descriptor.states ?? {}));
    return this.permutations.get(id);
  }
  /** What fills a cell when nothing is shown there: authored air, or the stage light. */
  empty(k) { return { blockId: this.air.has(k) ? "minecraft:air" : LIGHT_BLOCK }; }

  async render(state, { reset = false, effects = false } = {}) {
    assertLive(this.session);
    assertStageClear(this.session.dimension, this.session.lease);
    const previous = this.lastTick;
    // Batches beyond the entity budget are not animated; they appear as plain blocks.
    const animated = this.animatedBatches(state);
    const settled = this.settledBlocks(state, animated);
    // Real blocks only change when the set of settled cells does. The comparison
    // is cheap and never rewrites cells the world has since changed natively.
    await this.syncBlocks(settled, reset || previous < 0);
    assertLive(this.session);
    this.animator.sync(animated);
    this.syncEntities(state, reset, effects);
    const tracked = new Map();
    for (const [id, record] of this.entities) {
      if (!record.entity.isValid) continue;
      const aabb = record.entity.getAABB();
      tracked.set(id, { center: sub(aabb.center, this.session.lease.origin), extent: aabb.extent });
    }
    this.overlays.render(state, tracked);
    if (effects && !reset && previous >= 0) this.particles(previous, state.tick);
    this.lastTick = state.tick;
  }

  /** Cells to place as real blocks: shown, not animating, with patches applied. */
  settledBlocks(state, animated) {
    const next = new Map();
    for (const [k, batch] of state.shown) {
      if (animated.has(batch.id)) continue;
      const block = state.describe(k);
      if (block && block.blockId !== "minecraft:air") next.set(k, block);
    }
    return next;
  }

  /** A batch animates while it is fading in, or while its section is moving or turning. */
  isAnimating(batch, state) {
    const { event } = batch, fading = event.fade > 0 && state.tick < event.at + event.fade;
    const pose = state.sections.get(batch.section);
    const moving = pose && (pose.move || pose.spin || pose.offset.x || pose.offset.y || pose.offset.z ||
      pose.rotation.x || pose.rotation.y || pose.rotation.z);
    return fading || Boolean(moving);
  }

  /** Animated batches, as the entity-side description the animator sends to the client. */
  animatedBatches(state) {
    const wanted = new Map();
    let budget = LIMITS.stageEntities - this.entities.size;
    const pending = (batch, vars, cells) => {
      if (!cells.length || cells.length > budget) return;
      budget -= cells.length;
      wanted.set(batch.id, { cells, vars, signature: JSON.stringify([vars, cells.length]) });
    };
    for (const batch of state.batches.values()) {
      if (!this.isAnimating(batch, state)) continue;
      const cells = batch.cells.filter(k => state.shown.get(k) === batch).map(k => {
        const block = state.describe(k);
        return block && block.blockId !== "minecraft:air" ? { ...block, position: unkey(k) } : undefined;
      }).filter(Boolean);
      const e = batch.event, pose = state.sections.get(batch.section);
      const vars = { dur: Math.max(e.fade, 1) / TICKS_PER_SECOND, dir: 1, dx: 0, dy: 0, dz: 0 };
      // Java starts a section half a block away on the side opposite its entry direction.
      if (e.from) Object.assign(vars, { dx: -e.from.x * .5, dy: -e.from.y * .5, dz: -e.from.z * .5 });
      if (pose && batch.section !== "base") Object.assign(vars, this.poseVars(pose));
      pending(batch, vars, cells);
    }
    for (const out of state.leaving) {
      const cells = [...out.cells].filter(([, block]) => block && block.blockId !== "minecraft:air")
        .map(([k, block]) => ({ ...block, position: unkey(k) }));
      pending({ id: out.id }, { dur: Math.max(out.fade, 1) / TICKS_PER_SECOND, dir: -1,
        dx: (out.vec?.x ?? 0) * .5, dy: (out.vec?.y ?? 0) * .5, dz: (out.vec?.z ?? 0) * .5 }, cells);
    }
    return wanted;
  }

  poseVars(pose) {
    const to = pose.move?.to ?? pose.offset, spin = pose.spin?.to ?? pose.rotation;
    return {
      ox: pose.offset.x, oy: pose.offset.y, oz: pose.offset.z, mx: to.x, my: to.y, mz: to.z,
      rx: pose.rotation.x, ry: pose.rotation.y, rz: pose.rotation.z, sx: spin.x, sy: spin.y, sz: spin.z,
      mdur: Math.max(pose.move?.ticks ?? pose.spin?.ticks ?? 0, 1) / TICKS_PER_SECOND,
    };
  }

  async syncBlocks(next, reset) {
    const changes = [], all = reset
      ? [...positions(this.scene.bounds)].map(key)
      : [...new Set([...this.blocks.keys(), ...next.keys()])];
    for (const k of all) {
      const descriptor = next.get(k) ?? this.empty(k);
      const before = this.blocks.get(k) ?? this.empty(k);
      if (reset || !same(before, descriptor))
        changes.push({ position: add(unkey(k), this.session.lease.origin), permutation: this.permutation(descriptor) });
    }
    // Resolve every permutation before touching the world. Only authored
    // changes are written during playback: native redstone is never overwritten.
    const { session } = this;
    if (changes.length) await job((function* () {
      for (let i = 0; i < changes.length; i++) {
        assertLive(session);
        if (i % 128 === 0) assertStageClear(session.dimension, session.lease);
        const { position, permutation } = changes[i];
        const block = session.dimension.getBlock(position);
        if (!block) throw new Error("Loaded stage block unavailable");
        block.setPermutation(permutation);
        if (i % 128 === 127) yield;
      }
    })());
    this.blocks = next;
  }

  syncEntities(state, reset, effects) {
    if (reset) { for (const r of this.entities.values()) safeRemove(r.entity); this.entities.clear(); }
    for (const [id, r] of this.entities) {
      const next = state.entities.get(id);
      if (!next || next.birth !== r.authored.birth) { safeRemove(r.entity); this.entities.delete(id); }
    }
    for (const [id, descriptor] of state.entities) {
      let record = this.entities.get(id);
      if (record && !record.entity.isValid) continue; // Dead native entities do not respawn every tick.
      const position = add(descriptor.position, this.session.lease.origin);
      if (!record) {
        if (this.entities.size >= LIMITS.stageEntities) throw new Error("Teaching entity limit exceeded");
        const entity = descriptor.kind === "item"
          ? this.session.dimension.spawnItem(new ItemStack(descriptor.itemId, descriptor.amount ?? 1), position)
          : this.session.dimension.spawnEntity(descriptor.entityTypeId, position);
        markOwned(entity, this.session.lease);
        record = { entity, authored: undefined };
        this.entities.set(id, record);
      }
      if (!same(record.authored, descriptor)) {
        if (!record.authored || !same(record.authored.position, descriptor.position) ||
          !same(record.authored.rotation, descriptor.rotation))
          record.entity.teleport(position, descriptor.rotation ? { rotation: descriptor.rotation } : {});
        if (descriptor.nameTag !== undefined) record.entity.nameTag = descriptor.nameTag;
        // Seeking rebuilds the authored entity, not its past native effects.
        if (effects && (!reset || state.tick === 0)) {
          if (descriptor.event) record.entity.triggerEvent(descriptor.event);
          if (descriptor.impulse) record.entity.applyImpulse(descriptor.impulse);
        }
        record.authored = descriptor;
      }
      // The solid shell is the containment. An owned entity that leaves it is retired.
      if (!inside(record.entity.location, this.session.lease.room)) safeRemove(record.entity);
    }
  }

  particles(from, to) {
    assertLive(this.session);
    let emitted = 0;
    for (const e of this.scene.timeline.events) {
      if (e.op !== "particle" || e.at > to) continue;
      const interval = e.interval ?? 5;
      const start = Math.max(from + 1, e.at);
      const first = start + (interval - (start - e.at) % interval) % interval;
      for (let t = first; t <= to && t <= e.at + e.duration; t += interval) {
        for (let n = 0; n < (e.count ?? 1); n++) {
          // Catch-up after a slow writer must not replay thousands of emissions in one tick.
          if (emitted >= LIMITS.particleEmissions) return;
          this.session.dimension.spawnParticle(e.particleId, add(e.position, this.session.lease.origin));
          emitted++;
        }
      }
    }
  }

  dispose() {
    this.overlays.dispose();
    this.animator.dispose();
    for (const r of this.entities.values()) safeRemove(r.entity);
    this.entities.clear();
  }
}
