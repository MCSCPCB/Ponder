import { BlockPermutation, BlockVolume, world } from "@minecraft/server";
import { JOURNAL_KEY, LIGHT_BLOCK, LIMITS, SHELL_BLOCK } from "../constants.js";
import { add, distance, expand, inside, overlaps } from "../core/math.js";
import { assertLive, job, safeRemove } from "./jobs.js";

/** Slabs keep individual native volume operations below 4096 blocks. */
export function* slabs(bounds) {
  for (let x = bounds.from.x; x <= bounds.to.x; x += 16)
    for (let z = bounds.from.z; z <= bounds.to.z; z += 16)
      for (let y = bounds.from.y; y <= bounds.to.y; y += 16)
        yield { from: { x, y, z }, to: { x: Math.min(x + 15, bounds.to.x),
          y: Math.min(y + 15, bounds.to.y), z: Math.min(z + 15, bounds.to.z) } };
}
const nativeVolume = b => new BlockVolume(b.from, b.to);
const absolute = (b, origin) => ({ from: add(b.from, origin), to: add(b.to, origin) });
const center = b => ({ x: (b.from.x + b.to.x) / 2, y: (b.from.y + b.to.y) / 2, z: (b.from.z + b.to.z) / 2 });
const LEASE_PREFIX = "ponder_eae14a5a_";

export function nearbyPlayer(dimension, safe) {
  const p = center(safe), radius = distance(safe.from, safe.to) / 2 + LIMITS.playerClearance;
  return dimension.getPlayers().some(player => distance(player.location, p) <= radius);
}
/** Recheck between native writes; initial allocation checks are not a lock on players. */
export function assertStageClear(dimension, lease) {
  if (nearbyPlayer(dimension, lease.safe))
    throw new Error("A player is near the stage; world writes/cleanup deferred");
}

export class StageAllocator {
  constructor() {
    this.leases = new Map();
    this.ready = false;
    this.serial = 0;
    this.recoveryError = undefined;
    this.releasing = new Map();
  }
  persist() {
    // In-memory reservations count against capacity immediately, but a reservation
    // without coordinates has neither a ticking area nor anything to recover.
    const data = JSON.stringify({ version: 2, leases: [...this.leases.values()].filter(l => l.room) });
    if (data.length > 30000) throw new Error("Lease journal exceeds dynamic-property budget");
    world.setDynamicProperty(JOURNAL_KEY, data);
  }
  get manager() {
    const manager = world.tickingAreaManager;
    if (!manager?.createTickingArea) throw new Error("unavailable");
    return manager;
  }
  async recover() {
    this.ready = false;
    try {
      const raw = world.getDynamicProperty(JOURNAL_KEY);
      const recovered = new Map(this.leases);
      if (raw !== undefined) {
        if (typeof raw !== "string") throw new Error("Invalid lease journal");
        const saved = JSON.parse(raw);
        if (saved?.version !== 2) throw new Error("Invalid lease journal");
        // Validate the complete set first: Map insertion would otherwise hide a
        // duplicate ID and destructive cleanup could run before a later failure.
        this.validateLeases(saved.leases);
        for (const lease of saved.leases) recovered.set(lease.id, lease);
      }
      this.validateLeases([...recovered.values()].filter(lease => lease.room));
      this.leases = recovered;
      for (const lease of [...this.leases.values()]) await this.release(lease);
      // Only remove our own orphaned ticking-area handles, never another pack's.
      for (const area of this.manager.getAllTickingAreas()) {
        if (area.identifier.startsWith(LEASE_PREFIX) && !this.leases.has(area.identifier))
          this.manager.removeTickingArea(area.identifier);
      }
      this.ready = true; this.recoveryError = undefined;
    } catch (error) {
      this.recoveryError = error;
      console.error(`[Ponder] Recovery deferred; journal retained: ${error}`);
    }
  }
  validateLeases(leases) {
    if (!Array.isArray(leases) || leases.length > LIMITS.sessions) throw new Error("Invalid lease journal");
    const ids = new Set(), owners = new Set(), previous = [];
    for (const lease of leases) {
      if (!this.validLease(lease)) throw new Error("Invalid lease bounds; manual recovery required");
      if (ids.has(lease.id) || owners.has(lease.ownerId))
        throw new Error("Duplicate lease identity; manual recovery required");
      if (previous.some(other => other.dimensionId === lease.dimensionId && overlaps(other.safe, lease.safe)))
        throw new Error("Overlapping leases; manual recovery required");
      ids.add(lease.id); owners.add(lease.ownerId); previous.push(lease);
    }
  }
  validLease(lease) {
    if (!lease || !/^ponder_eae14a5a_[a-z0-9_]{1,64}$/.test(lease.id) || !["reserved", "building", "ready", "cleaning"].includes(lease.phase))
      return false;
    if (lease.tag !== `ponder:s_${lease.id}` || typeof lease.ownerId !== "string" || !lease.ownerId || lease.ownerId.length > 128) return false;
    if (!["minecraft:overworld", "minecraft:nether", "minecraft:the_end"].includes(lease.dimensionId)) return false;
    for (const b of [lease.room, lease.safe]) {
      if (!b || !["x", "y", "z"].every(k => Number.isInteger(b.from?.[k]) && Number.isInteger(b.to?.[k]) && b.from[k] <= b.to[k])) return false;
      const count = ["x", "y", "z"].reduce((n, k) => n * (b.to[k] - b.from[k] + 1), 1);
      if (count > LIMITS.stageVolume || count < 1) return false;
      if ([b.from.x, b.from.z, b.to.x, b.to.z].some(n => Math.abs(n) > 1000000)) return false;
    }
    if (!lease.origin || !["x", "y", "z"].every(k => Number.isInteger(lease.origin[k]))) return false;
    const expectedSafe = expand(lease.room, LIMITS.safetyBuffer);
    if (!["x", "y", "z"].every(k => lease.safe.from[k] === expectedSafe.from[k] && lease.safe.to[k] === expectedSafe.to[k])) return false;
    const height = world.getDimension(lease.dimensionId).heightRange;
    return lease.safe.from.y >= height.min && lease.safe.to.y < height.max &&
      inside(lease.room.from, lease.safe) && inside(lease.room.to, lease.safe) &&
      inside(lease.origin, lease.room);
  }
  occupied(dimension, safe, ignoredId) {
    if ([...this.leases.values()].some(l => l.id !== ignoredId && l.safe && l.dimensionId === dimension.id && overlaps(l.safe, safe))) return true;
    if (nearbyPlayer(dimension, safe)) return true;
    // Do not erase someone's remote entities, even if the blocks are all air.
    return dimension.getEntities({ location: safe.from, volume: {
      x: safe.to.x - safe.from.x + 1, y: safe.to.y - safe.from.y + 1, z: safe.to.z - safe.from.z + 1,
    } }).length > 0;
  }
  async allocate(session, scene) {
    if (!this.ready) throw new Error("recovering");
    if (this.leases.size >= LIMITS.sessions) throw new Error("busy");
    const dimension = session.dimension, manager = this.manager;
    const height = dimension.heightRange;
    const localSafe = expand(scene.room, LIMITS.safetyBuffer);
    const lowOrigin = height.min + 1 - localSafe.from.y;
    const highOrigin = height.max - 2 - localSafe.to.y;
    if (lowOrigin > highOrigin) throw new Error("noSpace");
    // Reserve before the first await. This is the allocation lock for concurrent users.
    const serial = ++this.serial;
    const id = `${LEASE_PREFIX}${Date.now().toString(36)}_${serial.toString(36)}`;
    const lease = { id, ownerId: session.player.id, dimensionId: dimension.id, phase: "reserved",
      tag: `ponder:s_${id}`, origin: undefined, room: undefined, safe: undefined };
    this.leases.set(id, lease);
    session.lease = lease;
    try {
      for (let attempt = 0; attempt < LIMITS.allocationAttempts; attempt++) {
        assertLive(session);
        const n = serial * 29 + attempt;
        const yFactors = [1, .72, .45, .2];
        const origin = {
          x: 32768 + (n % 64) * 192,
          y: Math.floor(lowOrigin + (highOrigin - lowOrigin) * yFactors[attempt % yFactors.length]),
          z: 32768 + Math.floor(n / 64) * 192,
        };
        const room = absolute(scene.room, origin), safe = absolute(localSafe, origin);
        Object.assign(lease, { origin, room, safe });
        if (this.occupied(dimension, safe, id)) continue;
        const options = { dimension, from: safe.from, to: safe.to };
        if (!manager.hasCapacity(options)) throw new Error("busy");
        // Write-ahead journal covers a crash immediately after native creation.
        this.persist();
        await manager.createTickingArea(id, options);
        assertLive(session);
        const empty = await job((function* () {
          for (const slab of slabs(safe)) {
            assertLive(session);
            if (dimension.containsBlock(nativeVolume(slab), { excludeTypes: ["minecraft:air"] }, false)) return false;
            yield;
          }
          return true;
        })());
        if (!empty || this.occupied(dimension, safe, id)) {
          manager.removeTickingArea(id);
          continue;
        }
        lease.phase = "building"; this.persist();
        await this.build(session, lease);
        assertLive(session);
        lease.phase = "ready"; this.persist();
        return lease;
      }
      throw new Error("noSpace");
    } catch (error) {
      try { await this.release(lease); }
      catch (cleanupError) {
        this.ready = false; this.recoveryError = cleanupError;
        console.error(`[Ponder] Allocation cleanup deferred: ${cleanupError}`);
      }
      throw error;
    }
  }
  async build(session, lease) {
    const dimension = session.dimension, b = lease.room;
    // Resolve before writing: a missing block ID cannot leave a partially built room.
    const light = BlockPermutation.resolve(LIGHT_BLOCK), shell = BlockPermutation.resolve(SHELL_BLOCK);
    await job((function* () {
      for (const slab of slabs(b)) {
        assertLive(session);
        assertStageClear(dimension, lease);
        dimension.fillBlocks(nativeVolume(slab), light); yield;
      }
      for (const axis of ["x", "y", "z"]) {
        for (const value of [b.from[axis], b.to[axis]]) {
          const face = { from: { ...b.from, [axis]: value }, to: { ...b.to, [axis]: value } };
          for (const slab of slabs(face)) {
            assertLive(session); assertStageClear(dimension, lease);
            dimension.fillBlocks(nativeVolume(slab), shell); yield;
          }
        }
      }
    })());
  }
  async release(lease) {
    if (!lease) return;
    if (this.releasing.has(lease.id)) return this.releasing.get(lease.id);
    const pending = this.releaseExclusive(lease);
    this.releasing.set(lease.id, pending);
    try { await pending; } finally { this.releasing.delete(lease.id); }
  }
  async releaseExclusive(lease) {
    if (!lease || !this.leases.has(lease.id)) return;
    // Unplaced reservations have no world content and must never be cleared.
    if (!lease.room) { this.leases.delete(lease.id); this.persist(); return; }
    const manager = this.manager;
    const dimension = world.getDimension(lease.dimensionId);
    if (lease.phase !== "reserved") {
      if (!this.validLease(lease)) throw new Error("Invalid lease; refusing destructive cleanup");
      // A visitor teleported into the owned room must not lose the floor under them.
      assertStageClear(dimension, lease);
      if (!manager.hasTickingArea(lease.id)) {
        const options = { dimension, from: lease.safe.from, to: lease.safe.to };
        if (!manager.hasCapacity(options)) throw new Error("busy");
        await manager.createTickingArea(lease.id, options);
      }
      lease.phase = "cleaning"; this.persist();
      assertStageClear(dimension, lease);
      for (const entity of dimension.getEntities({ tags: [lease.tag] })) safeRemove(entity);
      await job((function* () {
        for (const slab of slabs(lease.room)) {
          assertStageClear(dimension, lease);
          dimension.fillBlocks(nativeVolume(slab), "minecraft:air"); yield;
        }
      })());
      // Only explicit ownership tags are destructive authority. Never sweep all
      // entities in the volume: another add-on may have teleported one here.
      for (const entity of dimension.getEntities({ tags: [lease.tag] }))
        safeRemove(entity);
    }
    if (manager.hasTickingArea(lease.id)) manager.removeTickingArea(lease.id);
    this.leases.delete(lease.id); this.persist();
  }
}
export const allocator = new StageAllocator();
