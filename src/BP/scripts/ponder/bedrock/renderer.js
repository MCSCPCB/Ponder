import { BlockPermutation, ItemStack } from "@minecraft/server";
import { LIGHT_BLOCK, LIMITS } from "../constants.js";
import { add, inside, key, positions, sub, unkey } from "../core/math.js";
import { materializeBlocks } from "../core/timeline.js";
import { assertLive, job, safeRemove } from "./jobs.js";
import { AnnotationRenderer } from "./annotations.js";
import { markOwned } from "./ownership.js";
import { assertStageClear } from "./stage.js";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export class WorldRenderer {
  constructor(session, scene) {
    this.session = session; this.scene = scene; this.blocks = new Map();
    this.entities = new Map(); this.permutations = new Map(); this.lastTick = -1;
    this.explicitAir = new Set(scene.air.flatMap(b => [...positions(b)].map(key)));
    this.annotations = new AnnotationRenderer(session, scene);
  }
  permutation(descriptor) {
    const id = JSON.stringify(descriptor);
    if (!this.permutations.has(id))
      this.permutations.set(id, BlockPermutation.resolve(descriptor.blockId, descriptor.states ?? {}));
    return this.permutations.get(id);
  }
  async render(state, { reset = false, effects = false } = {}) {
    assertLive(this.session);
    assertStageClear(this.session.dimension, this.session.lease);
    const previous = this.lastTick;
    const changed = reset || previous < 0 || this.scene.timeline.events.some(e =>
      e.at > previous && e.at <= state.tick && ["show", "hide", "block", "region", "restore"].includes(e.op));
    if (changed) await this.syncBlocks(state, reset || previous < 0);
    assertLive(this.session);
    this.syncEntities(state, reset, effects);
    const tracked = new Map();
    for (const [id, record] of this.entities) {
      if (!record.entity.isValid) continue;
      const aabb = record.entity.getAABB();
      tracked.set(id, { center: sub(aabb.center, this.session.lease.origin), extent: aabb.extent });
    }
    this.annotations.render(state, tracked);
    if (effects && !reset && previous >= 0) this.particles(previous, state.tick);
    this.lastTick = state.tick;
  }
  async syncBlocks(state, reset) {
    const next = materializeBlocks(this.scene, state);
    const changes = [], all = reset
      ? [...positions(this.scene.bounds)].map(key)
      : [...new Set([...this.blocks.keys(), ...next.keys()])];
    for (const k of all) {
      const descriptor = next.get(k) ?? { blockId: this.explicitAir.has(k) ? "minecraft:air" : LIGHT_BLOCK };
      const before = this.blocks.get(k) ?? { blockId: this.explicitAir.has(k) ? "minecraft:air" : LIGHT_BLOCK };
      if (reset || !same(before, descriptor))
        changes.push({ position: add(unkey(k), this.session.lease.origin), permutation: this.permutation(descriptor) });
    }
    // Resolve ALL permutations before touching the world. Only authored changes
    // are written during playback: native redstone is not overwritten each tick.
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
      // Dead/despawned native entities do not magically respawn every tick.
      if (record && !record.entity.isValid) continue;
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
        // Seek/back rebuild the authored entity, not its past native effects.
        // Explicit replay/natural tick-zero entry opt back into one-shot effects.
        if (effects && (!reset || state.tick === 0)) {
          if (descriptor.event) record.entity.triggerEvent(descriptor.event);
          if (descriptor.impulse) record.entity.applyImpulse(descriptor.impulse);
        }
        record.authored = descriptor;
      }
      // The solid shell is the normal containment. If native effects move an
      // owned entity through it, retire that entity rather than teleport players.
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
          // A delayed writer must not replay thousands of old native emissions
          // in one script tick. Excess catch-up is intentionally discarded.
          if (emitted >= LIMITS.particleEmissions) return;
          this.session.dimension.spawnParticle(e.particleId, add(e.position, this.session.lease.origin));
          emitted++;
        }
      }
    }
  }
  dispose() {
    this.annotations.dispose();
    for (const r of this.entities.values()) safeRemove(r.entity);
    this.entities.clear();
  }
}
