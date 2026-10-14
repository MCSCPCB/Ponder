import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { reset, makeSession, compactScene, settle, BlockPermutation } from "./bedrock-harness.mjs";
import { scene } from "./fixtures.mjs";
const { StageAllocator } = await import("../src/BP/scripts/ponder/bedrock/stage.js");
const { WorldRenderer } = await import("../src/BP/scripts/ponder/bedrock/renderer.js");
const { stateAt } = await import("../src/BP/scripts/ponder/core/timeline.js");
const { add } = await import("../src/BP/scripts/ponder/core/math.js");
beforeEach(reset);

async function setup(overrides) {
  const definition = scene(overrides), session = makeSession(), pool = new StageAllocator();
  pool.ready = true;
  await settle(pool.allocate(session, compactScene()));
  return { definition, session, pool, renderer: new WorldRenderer(session, definition) };
}

test("ordinary ticks do not overwrite native block changes; seek deliberately rebuilds authored state", async () => {
  const { definition, session, pool, renderer } = await setup({
    air: [{ from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 3, z: 0 } }],
    instructions: [{ op: "wait", ticks: 10 }, { op: "block", position: { x: 1, y: 0, z: 1 },
      blockId: "minecraft:gold_block" }, { op: "wait", ticks: 10 }],
  });
  await settle(renderer.render(stateAt(definition, 0), { reset: true }));
  assert.equal(session.dimension.read(session.lease.origin).type.id, "minecraft:air");
  const position = add(session.lease.origin, { x: 1, y: 0, z: 1 });
  session.dimension.getBlock(position).setPermutation(BlockPermutation.resolve("minecraft:lit_redstone_lamp"));
  const writes = session.dimension.setCalls;
  await settle(renderer.render(stateAt(definition, 1), { effects: true }));
  await settle(renderer.render(stateAt(definition, 9), { effects: true }));
  assert.equal(session.dimension.setCalls, writes);
  assert.equal(session.dimension.read(position).type.id, "minecraft:lit_redstone_lamp");
  await settle(renderer.render(stateAt(definition, 10), { effects: true }));
  assert.equal(session.dimension.read(position).type.id, "minecraft:gold_block");
  await settle(renderer.render(stateAt(definition, 0), { reset: true }));
  assert.equal(session.dimension.read(position).type.id, "minecraft:stone");
  renderer.dispose(); await settle(pool.release(session.lease));
});

test("all block permutations are validated before any reset writes", async () => {
  const { definition, session, pool, renderer } = await setup({
    structures: [
      { id: "ok", kind: "block", blockId: "minecraft:stone", position: { x: 1, y: 0, z: 1 } },
      { id: "missing", kind: "block", blockId: "test:missing", position: { x: 2, y: 0, z: 1 } },
    ], initial: ["ok", "missing"],
  });
  BlockPermutation.rejected.add("test:missing");
  await assert.rejects(settle(renderer.render(stateAt(definition, 0), { reset: true })), /Unknown block/);
  assert.equal(session.dimension.setCalls, 0);
  await settle(pool.release(session.lease));
});

test("entity one-shot effects execute during playback but not seek; name updates do not repeat them", async () => {
  const { definition, session, pool, renderer } = await setup({
    instructions: [
      { op: "spawn", id: "actor", entityTypeId: "minecraft:armor_stand", position: { x: 1, y: 1, z: 1 },
        impulse: { x: .1, y: .2, z: 0 }, event: "test:once" },
      { op: "wait", ticks: 5 }, { op: "updateEntity", id: "actor", nameTag: "changed" },
      { op: "wait", ticks: 15 },
    ],
  });
  await settle(renderer.render(stateAt(definition, 0), { reset: true, effects: true }));
  const original = renderer.entities.get("actor").entity;
  assert.equal(original.impulses.length, 1); assert.deepEqual(original.events, ["test:once"]);
  await settle(renderer.render(stateAt(definition, 1), { effects: true }));
  original.location.x += .5;
  const nativeLocation = { ...original.location };
  await settle(renderer.render(stateAt(definition, 5), { effects: true }));
  assert.equal(original.impulses.length, 1); assert.equal(original.events.length, 1);
  assert.equal(original.nameTag, "changed");
  assert.deepEqual(original.location, nativeLocation, "A name update must not undo native movement");
  await settle(renderer.render(stateAt(definition, 0), { reset: true }));
  const sought = renderer.entities.get("actor").entity;
  assert.notEqual(sought, original); assert.equal(original.isValid, false);
  assert.equal(sought.impulses.length, 0); assert.equal(sought.events.length, 0);
  await settle(renderer.render(stateAt(definition, 1), { effects: true }));
  assert.equal(sought.impulses.length, 0);
  sought.remove();
  await settle(renderer.render(stateAt(definition, 2), { effects: true }));
  assert.equal(renderer.entities.get("actor").entity, sought, "Native death must not respawn every tick");
  renderer.dispose(); await settle(pool.release(session.lease));
});

test("particle catch-up is bounded to crossed ticks and seek never replays past emissions", async () => {
  const { definition, session, pool, renderer } = await setup({
    instructions: [{ op: "particle", particleId: "minecraft:basic_flame_particle",
      position: { x: 1, y: 1, z: 1 }, duration: 10, interval: 2 }, { op: "wait", ticks: 20 }],
  });
  await settle(renderer.render(stateAt(definition, 0), { reset: true }));
  renderer.particles(-1, 0);
  assert.equal(session.dimension.particles.length, 1);
  await settle(renderer.render(stateAt(definition, 5), { effects: true }));
  assert.equal(session.dimension.particles.length, 3);
  await settle(renderer.render(stateAt(definition, 5), { effects: true }));
  assert.equal(session.dimension.particles.length, 3);
  await settle(renderer.render(stateAt(definition, 10), { reset: true }));
  assert.equal(session.dimension.particles.length, 3);
  renderer.dispose(); await settle(pool.release(session.lease));
});

test("lagged particle catch-up has a hard emission budget and drops stale debt", async () => {
  const { LIMITS } = await import("../src/BP/scripts/ponder/constants.js");
  const { definition, session, pool, renderer } = await setup({
    instructions: [{ op: "particle", particleId: "minecraft:basic_flame_particle",
      position: { x: 1, y: 1, z: 1 }, duration: 100, interval: 1, count: 32 }, { op: "wait", ticks: 120 }],
  });
  await settle(renderer.render(stateAt(definition, 0), { reset: true }));
  await settle(renderer.render(stateAt(definition, 90), { effects: true }));
  assert.equal(session.dimension.particles.length, LIMITS.particleEmissions);
  await settle(renderer.render(stateAt(definition, 91), { effects: true }));
  assert.equal(session.dimension.particles.length, LIMITS.particleEmissions + 32);
  await settle(renderer.render(stateAt(definition, 91), { effects: true }));
  assert.equal(session.dimension.particles.length, LIMITS.particleEmissions + 32);
  renderer.dispose(); await settle(pool.release(session.lease));
});
