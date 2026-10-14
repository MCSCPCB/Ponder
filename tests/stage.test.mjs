import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { reset, world, MockPlayer, BlockPermutation, makeSession, compactScene, settle, until, deferred } from "./bedrock-harness.mjs";
const { StageAllocator, slabs } = await import("../src/BP/scripts/ponder/bedrock/stage.js");
const { markOwned } = await import("../src/BP/scripts/ponder/bedrock/ownership.js");
const { JOURNAL_KEY, LIGHT_BLOCK, SHELL_BLOCK, LIMITS } = await import("../src/BP/scripts/ponder/constants.js");
const { inside, overlaps, volume } = await import("../src/BP/scripts/ponder/core/math.js");
beforeEach(reset);
const allocator = () => { const value = new StageAllocator(); value.ready = true; return value; };
const saved = () => JSON.parse(world.getDynamicProperty(JOURNAL_KEY));

test("scan covers every block and buffer; build has a black shell and light interior", async () => {
  const pool = allocator(), session = makeSession(), dimension = session.dimension;
  const lease = await settle(pool.allocate(session, compactScene()));
  assert.equal(saved().leases[0].phase, "ready");
  assert.equal(dimension.scans.reduce((sum, scan) => sum + volume(scan), 0), volume(lease.safe));
  assert(dimension.scans.every(scan => scan.allowUnloadedChunks === false && volume(scan) <= 4096));
  assert.equal(dimension.read(lease.room.from).type.id, SHELL_BLOCK);
  assert.equal(dimension.read(lease.room.to).type.id, SHELL_BLOCK);
  assert.equal(dimension.read(lease.origin).type.id, LIGHT_BLOCK);
  assert.deepEqual(session.player.location, { x: 0, y: 64, z: 0 });
  await settle(pool.release(lease));
  assert.equal(dimension.read(lease.origin).type.id, "minecraft:air");
  assert.equal(dimension.read(lease.room.from).type.id, "minecraft:air");
  assert.deepEqual(saved().leases, []);
  assert.equal(world.tickingAreaManager.areas.size, 0);
});

test("concurrent reservations count before await, isolate dimensions and enforce the session cap", async () => {
  const pool = allocator(), loading = deferred();
  world.tickingAreaManager.beforeCreate = () => loading.promise;
  const sessions = Array.from({ length: LIMITS.sessions }, (_, i) =>
    makeSession(world.getDimension(i % 2 ? "nether" : "overworld")));
  const pending = sessions.map(session => pool.allocate(session, compactScene()));
  assert.equal(pool.leases.size, LIMITS.sessions);
  await assert.rejects(pool.allocate(makeSession(), compactScene()), /busy/);
  for (let i = 0; i < sessions.length; i++) for (let j = 0; j < i; j++)
    if (sessions[i].dimension === sessions[j].dimension) assert(!overlaps(sessions[i].lease.safe, sessions[j].lease.safe));
  loading.resolve();
  const leases = await settle(Promise.all(pending));
  assert.equal(new Set(leases.map(lease => lease.id)).size, LIMITS.sessions);
  for (const lease of leases) {
    const range = world.getDimension(lease.dimensionId).heightRange;
    assert(lease.safe.from.y >= range.min && lease.safe.to.y < range.max);
  }
  await settle(Promise.all(leases.map(lease => pool.release(lease))));
  assert.equal(pool.leases.size, 0);
});

test("native capacity exhaustion leaves existing sessions and other packs untouched", async () => {
  const pool = allocator(), manager = world.tickingAreaManager;
  manager.areas.set("other_pack", { identifier: "other_pack" }); manager.maxAreas = 2;
  const first = makeSession(), loading = deferred();
  manager.beforeCreate = () => loading.promise;
  const pending = pool.allocate(first, compactScene());
  await assert.rejects(settle(pool.allocate(makeSession(), compactScene())), /busy/);
  assert.equal(pool.leases.size, 1);
  assert(manager.hasTickingArea(first.lease.id));
  loading.resolve(); await settle(pending);
  await settle(pool.release(first.lease));
  assert.deepEqual([...manager.areas.keys()], ["other_pack"]);
});

test("an interior obstruction in the safety buffer rejects the candidate without overwriting it", async () => {
  const pool = allocator(), session = makeSession(), manager = world.tickingAreaManager;
  let obstruction, rejected;
  manager.beforeCreate = (id, options) => {
    if (manager.creates.length !== 1) return;
    rejected = id;
    obstruction = { x: options.from.x + 1, y: options.from.y + 7, z: options.from.z + 9 };
    session.dimension.getBlock(obstruction).setPermutation(BlockPermutation.resolve("minecraft:diamond_block"));
  };
  const lease = await settle(pool.allocate(session, compactScene()));
  assert(manager.creates.length >= 2);
  assert(manager.removes.includes(rejected));
  assert(!inside(obstruction, lease.safe));
  assert.equal(session.dimension.read(obstruction).type.id, "minecraft:diamond_block");
  await settle(pool.release(lease));
  assert.equal(session.dimension.read(obstruction).type.id, "minecraft:diamond_block");
});

test("unloaded scans fail closed rather than skipping unreadable blocks", async () => {
  const pool = allocator(), session = makeSession();
  session.dimension.unloaded = true;
  await assert.rejects(settle(pool.allocate(session, compactScene())), /unloaded/);
  assert.equal(session.dimension.fillCalls, 0);
  assert.equal(pool.leases.size, 0);
  assert.equal(world.tickingAreaManager.areas.size, 0);
});

test("cancellation while the ticking area loads never builds and releases the reservation", async () => {
  const pool = allocator(), session = makeSession(), loading = deferred();
  world.tickingAreaManager.beforeCreate = () => loading.promise;
  const pending = pool.allocate(session, compactScene());
  assert.equal(saved().leases[0].phase, "reserved");
  session.closed = true;
  loading.resolve();
  await assert.rejects(settle(pending), /cancelled/);
  assert.equal(session.dimension.fillCalls, 0);
  assert.equal(world.tickingAreaManager.areas.size, 0);
  assert.equal(pool.leases.size, 0);
});

test("a partial build failure is journaled and cleaned before its lease is reusable", async () => {
  const pool = allocator(), session = makeSession();
  session.dimension.onFill = () => {
    assert.notEqual(saved().leases[0].phase, "reserved");
    if (session.dimension.fillCalls === 3) throw new Error("injected build failure");
  };
  await assert.rejects(settle(pool.allocate(session, compactScene())), /injected build failure/);
  assert(session.dimension.fillCalls > 3);
  for (const slab of slabs(session.lease.room))
    assert.equal(session.dimension.containsBlock(slab, { excludeTypes: ["minecraft:air"] }), false);
  assert.deepEqual(saved().leases, []);
  assert.equal(world.tickingAreaManager.areas.size, 0);
});

test("a player entering between build slabs stops writes and defers cleanup until clear", async () => {
  const pool = allocator(), session = makeSession(), visitor = new MockPlayer();
  session.dimension.onFill = () => { visitor.location = { ...session.lease.origin }; };
  await assert.rejects(settle(pool.allocate(session, compactScene()), { jobs: 1 }), /player is near/);
  assert.equal(session.dimension.fillCalls, 1);
  assert.equal(pool.ready, false);
  assert.equal(saved().leases[0].phase, "building");
  visitor.location = { x: 0, y: 64, z: 0 }; session.dimension.onFill = undefined;
  await settle(pool.recover());
  assert.equal(pool.ready, true);
  assert.equal(visitor.removed, 0);
  assert.equal(world.tickingAreaManager.areas.size, 0);
});

test("cleanup rechecks each slab and removes owned entities only, never players or visitors", async () => {
  const pool = allocator(), session = makeSession();
  const lease = await settle(pool.allocate(session, compactScene()));
  const owned = markOwned(session.dimension.spawnEntity("minecraft:armor_stand", lease.origin), lease);
  const visitorEntity = session.dimension.spawnEntity("minecraft:pig", lease.origin);
  const visitor = new MockPlayer(); visitor.addTag(lease.tag);
  assert.throws(() => markOwned(visitor, lease), /Players cannot/);
  let cleanupWrites = 0;
  session.dimension.onFill = () => {
    if (++cleanupWrites === 1) visitor.location = { ...lease.origin };
  };
  await assert.rejects(settle(pool.release(lease), { jobs: 1 }), /player is near/);
  assert.equal(cleanupWrites, 1);
  assert.equal(saved().leases[0].phase, "cleaning");
  assert.equal(owned.isValid, false);
  assert.equal(visitorEntity.isValid, true);
  assert.equal(visitor.removed, 0);
  assert(world.tickingAreaManager.hasTickingArea(lease.id));
  visitor.location = { x: 0, y: 64, z: 0 };
  session.dimension.onFill = undefined;
  await settle(pool.release(lease));
  assert.equal(visitor.removed, 0); assert.equal(visitorEntity.isValid, true);
});

test("script reload recovers valid journals and only removes this pack's orphaned handles", async () => {
  const pool = allocator(), session = makeSession();
  const lease = await settle(pool.allocate(session, compactScene()));
  const owned = markOwned(session.dimension.spawnEntity("ponder:text", lease.origin), lease);
  world.tickingAreaManager.areas.set("other_pack", { identifier: "other_pack" });
  world.tickingAreaManager.areas.set("ponder_eae14a5a_orphan_1", { identifier: "ponder_eae14a5a_orphan_1" });
  const replacement = new StageAllocator();
  await settle(replacement.recover());
  assert.equal(replacement.ready, true);
  assert.equal(owned.isValid, false);
  assert.deepEqual(saved().leases, []);
  assert.deepEqual([...world.tickingAreaManager.areas.keys()], ["other_pack"]);
});

test("a malformed journal does not authorize even a partially valid destructive recovery", async () => {
  const pool = allocator(), session = makeSession();
  const lease = await settle(pool.allocate(session, compactScene()));
  const invalid = { ...structuredClone(lease), id: "ponder_eae14a5a_corrupt",
    tag: "ponder:s_ponder_eae14a5a_corrupt", safe: { from: { x: 0, y: -10000, z: 0 }, to: { x: 2, y: 0, z: 2 } } };
  const journal = JSON.stringify({ version: 2, leases: [lease, invalid] });
  world.setDynamicProperty(JOURNAL_KEY, journal);
  const count = session.dimension.fillCalls, replacement = new StageAllocator();
  await settle(replacement.recover());
  assert.equal(replacement.ready, false);
  assert.equal(session.dimension.fillCalls, count);
  assert.equal(world.getDynamicProperty(JOURNAL_KEY), journal);
  assert(world.tickingAreaManager.hasTickingArea(lease.id));
});

test("duplicate identities and overlapping valid leases fail closed before any recovery writes", async () => {
  const pool = allocator(), session = makeSession();
  const lease = await settle(pool.allocate(session, compactScene()));
  const overlap = { ...structuredClone(lease), id: "ponder_eae14a5a_overlap",
    tag: "ponder:s_ponder_eae14a5a_overlap", ownerId: "another_player" };
  for (const leases of [[lease, structuredClone(lease)], [lease, overlap]]) {
    const journal = JSON.stringify({ version: 2, leases });
    world.setDynamicProperty(JOURNAL_KEY, journal);
    const writes = session.dimension.fillCalls, replacement = new StageAllocator();
    await settle(replacement.recover());
    assert.equal(replacement.ready, false);
    assert.equal(replacement.leases.size, 0, "Validate the entire journal before importing it");
    assert.equal(session.dimension.fillCalls, writes);
    assert.equal(world.getDynamicProperty(JOURNAL_KEY), journal);
    assert(world.tickingAreaManager.hasTickingArea(lease.id));
  }
});

test("a missing recovery handle waits for native capacity and retains its journal", async () => {
  const pool = allocator(), session = makeSession(), manager = world.tickingAreaManager;
  const lease = await settle(pool.allocate(session, compactScene()));
  manager.areas.delete(lease.id);
  manager.maxAreas = 1;
  manager.areas.set("other_pack", { identifier: "other_pack" });
  const journal = world.getDynamicProperty(JOURNAL_KEY), writes = session.dimension.fillCalls;
  const replacement = new StageAllocator();
  await settle(replacement.recover());
  assert.equal(replacement.ready, false);
  assert.equal(world.getDynamicProperty(JOURNAL_KEY), journal);
  assert.equal(session.dimension.fillCalls, writes);
  assert(manager.hasTickingArea("other_pack"));
  manager.maxAreas = 2;
  await settle(replacement.recover());
  assert.equal(replacement.ready, true);
  assert.deepEqual(saved().leases, []);
  assert.deepEqual([...manager.areas.keys()], ["other_pack"]);
});

test("failed native handle removal retains the journal and can be retried idempotently", async () => {
  const pool = allocator(), session = makeSession();
  const lease = await settle(pool.allocate(session, compactScene()));
  world.tickingAreaManager.failRemove = true;
  await assert.rejects(settle(pool.release(lease)), /remove failed/);
  assert.equal(pool.leases.size, 1); assert.equal(saved().leases[0].phase, "cleaning");
  world.tickingAreaManager.failRemove = false;
  const one = pool.release(lease), two = pool.release(lease);
  await settle(Promise.all([one, two]));
  assert.equal(world.tickingAreaManager.removes.filter(id => id === lease.id).length, 1);
  assert.equal(pool.leases.size, 0);
});
