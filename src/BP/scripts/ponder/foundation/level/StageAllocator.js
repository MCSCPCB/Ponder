import { BlockPermutation, BlockVolume, StructureSaveMode, world } from "@minecraft/server";
import {
  BACKDROP_BLOCK, CLOUD_BAND, JOURNAL_KEY, LIGHT_BLOCK, LIMITS, STAGE_BASE, STAGE_MAX_COORD,
} from "../../enums/PonderConfig.js";
import { add, distance, expand, overlaps } from "../VecHelper.js";
import { assertLive, job, safeRemove } from "./StageJobs.js";

/** Slabs keep individual native volume operations below 4096 blocks. */
export function* slabs(bounds, step = 16) {
  for (let x = bounds.from.x; x <= bounds.to.x; x += step)
    for (let z = bounds.from.z; z <= bounds.to.z; z += step)
      for (let y = bounds.from.y; y <= bounds.to.y; y += step)
        yield { from: { x, y, z }, to: { x: Math.min(x + step - 1, bounds.to.x),
          y: Math.min(y + step - 1, bounds.to.y), z: Math.min(z + step - 1, bounds.to.z) } };
}
export const nativeVolume = b => new BlockVolume(b.from, b.to);
const absolute = (b, origin) => ({ from: add(b.from, origin), to: add(b.to, origin) });
const center = b => ({ x: (b.from.x + b.to.x) / 2, y: (b.from.y + b.to.y) / 2, z: (b.from.z + b.to.z) / 2 });
const LEASE_PREFIX = "ponder_eae14a5a_";
const SNAPSHOT_PREFIX = "ponder:snap_";
// Structures are saved at most 64 blocks tall, inside the native structure size limit.
const SNAPSHOT_STEP = 64;
const GRID = 8, SPACING = 192;
// World content has been replaced in these phases, so release must put the snapshot back.
const BUILT = ["building", "ready", "cleaning"];

/**
 * Candidate origin heights, highest first: high air is the emptiest. In the overworld the
 * stage stays clear of the cloud band, which draws through any block shell: above it first,
 * then below it.
 */
function originHeights(dimension, localSafe) {
  const height = dimension.heightRange;
  const lowest = height.min + 1 - localSafe.from.y, highest = height.max - 2 - localSafe.to.y;
  const ranges = dimension.id === "minecraft:overworld"
    ? [[Math.max(lowest, CLOUD_BAND.to + 1 - localSafe.from.y), highest],
      [lowest, Math.min(highest, CLOUD_BAND.from - 1 - localSafe.to.y)]]
    : [[lowest, highest]];
  const heights = [];
  for (const [low, high] of ranges) {
    if (low > high) continue;
    for (const factor of [1, .72, .45, .2]) heights.push(Math.floor(low + (high - low) * factor));
  }
  return [...new Set(heights)];
}

/** Snapshot structures of a lease, from the origin-relative corners kept in the journal. */
function snapshotsOf(lease) {
  return lease.origin ? lease.snapshots.map(([x, y, z], i) => ({
    id: `${SNAPSHOT_PREFIX}${lease.id}_${i}`, from: add(lease.origin, { x, y, z }),
  })) : [];
}

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
  get full() { return this.leases.size >= LIMITS.sessions; }
  persist() {
    // In-memory reservations count against capacity immediately, but a reservation
    // without coordinates has neither a ticking area nor anything to recover.
    world.setDynamicProperty(JOURNAL_KEY, JSON.stringify([...this.leases.values()].filter(l => l.room)));
  }
  get manager() { return world.tickingAreaManager; }
  /** Puts back every stage a crash or /reload left in the world, then removes our leftovers. */
  async recover() {
    this.ready = false;
    try {
      const raw = world.getDynamicProperty(JOURNAL_KEY);
      for (const lease of raw === undefined ? [] : JSON.parse(raw)) this.leases.set(lease.id, lease);
      for (const lease of [...this.leases.values()]) await this.release(lease);
      // Only remove our own orphaned handles, never another pack's.
      for (const area of this.manager.getAllTickingAreas()) {
        if (area.identifier.startsWith(LEASE_PREFIX) && !this.leases.has(area.identifier))
          this.manager.removeTickingArea(area.identifier);
      }
      const kept = new Set([...this.leases.values()].flatMap(l => snapshotsOf(l).map(s => s.id)));
      for (const id of world.structureManager.getWorldStructureIds()) {
        if (id.startsWith(SNAPSHOT_PREFIX) && !kept.has(id)) world.structureManager.delete(id);
      }
      this.ready = true; this.recoveryError = undefined;
    } catch (error) {
      // The journal stays; the next attempt retries the stages that could not be put back.
      this.recoveryError = error;
      console.error(`[Ponder] Recovery deferred; journal retained: ${error}`);
    }
  }
  /** Other leases, nearby players, entities and bedrock all rule a candidate out. */
  occupied(dimension, safe, ignoredId) {
    if ([...this.leases.values()].some(l => l.id !== ignoredId && l.safe && l.dimensionId === dimension.id && overlaps(l.safe, safe))) return true;
    if (nearbyPlayer(dimension, safe)) return true;
    // Do not erase someone's remote entities.
    return dimension.getEntities({ location: safe.from, volume: {
      x: safe.to.x - safe.from.x + 1, y: safe.to.y - safe.from.y + 1, z: safe.to.z - safe.from.z + 1,
    } }).length > 0;
  }
  async allocate(session, scene) {
    if (!this.ready) throw new Error("recovering");
    if (this.full) throw new Error("busy");
    const dimension = session.dimension, manager = this.manager;
    const localSafe = expand(scene.room, LIMITS.safetyBuffer);
    const heights = originHeights(dimension, localSafe);
    if (!heights.length) throw new Error("noSpace");
    // Reserve before the first await. This is the allocation lock for concurrent users.
    const serial = ++this.serial;
    const id = `${LEASE_PREFIX}${Date.now().toString(36)}_${serial.toString(36)}`;
    const lease = { id, dimensionId: dimension.id, phase: "reserved",
      tag: `ponder:s_${id}`, origin: undefined, room: undefined, safe: undefined, snapshots: [] };
    this.leases.set(id, lease);
    session.lease = lease;
    try {
      for (let attempt = 0; attempt < LIMITS.allocationAttempts; attempt++) {
        assertLive(session);
        // A fixed GRID x GRID block of cells from STAGE_BASE outwards; the index wraps.
        const cell = (serial * 29 + attempt) % (GRID * GRID);
        const origin = {
          x: STAGE_BASE + (cell % GRID) * SPACING,
          y: heights[attempt % heights.length],
          z: STAGE_BASE + Math.floor(cell / GRID) * SPACING,
        };
        const room = absolute(scene.room, origin), safe = absolute(localSafe, origin);
        if ([safe.from.x, safe.from.z, safe.to.x, safe.to.z].some(n => Math.abs(n) > STAGE_MAX_COORD)) continue;
        Object.assign(lease, { origin, room, safe, snapshots: [] });
        if (this.occupied(dimension, safe, id)) continue;
        const options = { dimension, from: safe.from, to: safe.to };
        if (!manager.hasCapacity(options)) throw new Error("busy");
        // Write-ahead journal covers a crash immediately after native creation.
        this.persist();
        await manager.createTickingArea(id, options);
        assertLive(session);
        // Bedrock in the room could not be put back.
        const bedrock = await job((function* () {
          for (const slab of slabs(room)) {
            assertLive(session);
            if (dimension.containsBlock(nativeVolume(slab), { includeTypes: ["minecraft:bedrock"] }, false)) return true;
            yield;
          }
          return false;
        })());
        if (bedrock || this.occupied(dimension, safe, id)) {
          manager.removeTickingArea(id);
          continue;
        }
        await this.snapshot(session, lease);
        assertLive(session);
        lease.phase = "building"; this.persist();
        await this.build(session, lease, scene);
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
  /**
   * Saves what the world had in the room (the lit box and its shell), so release can put it
   * back exactly. The journal keeps each piece's corner relative to the origin and derives
   * the structure id from the index.
   */
  async snapshot(session, lease) {
    const dimension = session.dimension, o = lease.origin;
    const pieces = [...slabs(lease.room, SNAPSHOT_STEP)];
    lease.snapshots = pieces.map(({ from }) => [from.x - o.x, from.y - o.y, from.z - o.z]);
    lease.phase = "snapshot"; this.persist();
    const ids = snapshotsOf(lease).map(s => s.id);
    await job((function* () {
      for (const [i, piece] of pieces.entries()) {
        assertLive(session); assertStageClear(dimension, lease);
        if (world.structureManager.get(ids[i])) world.structureManager.delete(ids[i]);
        world.structureManager.createFromWorld(ids[i], dimension, piece.from, piece.to,
          { includeBlocks: true, includeEntities: false, saveMode: StructureSaveMode.World });
        yield;
      }
    })());
  }
  /**
   * The six shell faces go in first, so nothing flows or falls into the room while it is
   * cleared; then the lit box is filled from the top down, so loose blocks above are gone
   * before anything under them is.
   */
  async build(session, lease, scene) {
    const dimension = session.dimension, b = lease.room, lit = absolute(scene.lit, lease.origin);
    // Resolve before writing: a missing block ID cannot leave a partially built room.
    const light = BlockPermutation.resolve(LIGHT_BLOCK), shell = BlockPermutation.resolve(BACKDROP_BLOCK);
    const faces = ["x", "y", "z"].flatMap(axis => [b.from[axis], b.to[axis]]
      .map(value => ({ from: { ...b.from, [axis]: value }, to: { ...b.to, [axis]: value } })));
    const layers = [];
    for (let y = lit.to.y; y >= lit.from.y; y -= 16)
      layers.push({ from: { ...lit.from, y: Math.max(lit.from.y, y - 15) }, to: { ...lit.to, y } });
    await job((function* () {
      for (const [boxes, permutation] of [[faces, shell], [layers, light]]) {
        for (const box of boxes) {
          for (const slab of slabs(box)) {
            assertLive(session); assertStageClear(dimension, lease);
            dimension.fillBlocks(nativeVolume(slab), permutation); yield;
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
    const manager = this.manager, structures = world.structureManager;
    const dimension = world.getDimension(lease.dimensionId);
    const snapshots = snapshotsOf(lease);
    if (BUILT.includes(lease.phase)) {
      // Without every snapshot the world cannot be put back; keep the journal and the area.
      if (!snapshots.length || snapshots.some(s => !structures.get(s.id)))
        throw new Error("Stage snapshot missing; manual recovery required");
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
        for (const snapshot of snapshots) {
          assertStageClear(dimension, lease);
          structures.place(snapshot.id, dimension, snapshot.from, { includeBlocks: true, includeEntities: false });
          yield;
        }
      })());
      // Only explicit ownership tags are destructive authority. Never sweep all
      // entities in the volume: another add-on may have teleported one here.
      for (const entity of dimension.getEntities({ tags: [lease.tag] }))
        safeRemove(entity);
    }
    for (const snapshot of snapshots) if (structures.get(snapshot.id)) structures.delete(snapshot.id);
    if (manager.hasTickingArea(lease.id)) manager.removeTickingArea(lease.id);
    this.leases.delete(lease.id); this.persist();
  }
}
export const allocator = new StageAllocator();
