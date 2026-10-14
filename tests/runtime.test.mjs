import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { reset, world, system, MockPlayer, forms, uiManager, until, settle, step, deferred, microtasks } from "./bedrock-harness.mjs";
const { allocator } = await import("../src/BP/scripts/ponder/bedrock/stage.js");
const { WorldRenderer } = await import("../src/BP/scripts/ponder/bedrock/renderer.js");
const { PLAYER_STATE_KEY, SLOTS, LIMITS } = await import("../src/BP/scripts/ponder/constants.js");
let version = 0, runtime;
beforeEach(async () => {
  reset();
  allocator.leases.clear(); allocator.releasing.clear();
  allocator.ready = false; allocator.serial = 0; allocator.recoveryError = undefined;
  runtime = await import(`../src/BP/scripts/ponder/runtime.js?test=${++version}`);
  runtime.installPonder();
  await until(() => allocator.ready);
});
afterEach(async () => {
  for (const player of world.players) {
    player.location = { x: 0, y: 64, z: 0 }; player.failCamera = false;
    world.afterEvents.playerLeave.emit({ playerId: player.id });
  }
  await until(() => allocator.leases.size === 0 && system.jobs.size === 0);
  await microtasks();
});
const activeForm = player => forms.findLast(form => form.player === player && !form.settled);
const token = player => activeForm(player).slots[SLOTS.status].text;
async function open(player = new MockPlayer(), itemId = "minecraft:stick") {
  const count = forms.length;
  assert(runtime.handlePonderItemUse({ source: player, itemStack: { typeId: itemId } }));
  await until(() => forms.length > count && activeForm(player));
  return player;
}
async function click(player, selection) {
  const count = forms.length; activeForm(player).answer({ canceled: false, selection });
  await until(() => forms.length > count && activeForm(player));
}
const hurt = player => world.afterEvents.entityHurt.emit({ hurtEntity: player, damage: 1 });

test("registered block interactions enter once without moving the player; other items keep vanilla behavior", async () => {
  const player = new MockPlayer(), position = { ...player.location };
  const event = { player, itemStack: { typeId: "minecraft:stick" }, isFirstEvent: true, cancel: false };
  world.beforeEvents.playerInteractWithBlock.emit(event);
  assert.equal(event.cancel, true);
  runtime.handlePonderItemUse({ source: player, itemStack: { typeId: "minecraft:stick" } });
  await until(() => activeForm(player));
  assert.equal(forms.length, 1); assert.equal(allocator.leases.size, 1);
  assert.deepEqual(player.location, position);
  assert.equal(player.camera.active.preset, "minecraft:free");
  const vanilla = { player, itemStack: { typeId: "minecraft:dirt" }, cancel: false };
  world.beforeEvents.playerInteractWithBlock.emit(vanilla);
  assert.equal(vanilla.cancel, false);
});

test("held block-use repeats remain cancelled but cannot reopen a closed session", async () => {
  const player = await open();
  hurt(player);
  await until(() => allocator.leases.size === 0);
  const repeated = { player, itemStack: { typeId: "minecraft:stick" }, isFirstEvent: false, cancel: false };
  world.beforeEvents.playerInteractWithBlock.emit(repeated);
  assert.equal(repeated.cancel, true, "Do not leak repeated interaction into the real world");
  for (let i = 0; i < 8; i++) await step();
  assert.equal(allocator.leases.size, 0);
  assert.equal(player.getDynamicProperty(PLAYER_STATE_KEY), undefined);
  assert.equal(forms.length, 1);
  world.beforeEvents.playerInteractWithBlock.emit({ ...repeated, isFirstEvent: true });
  await until(() => forms.length === 2 && activeForm(player));
});

test("a slow world writer does not slow teaching time and the next write catches up", async t => {
  const player = await open(), originalRender = WorldRenderer.prototype.render;
  const waiting = deferred(), rendered = [];
  let stalled = false;
  WorldRenderer.prototype.render = async function (state, options) {
    rendered.push(state.tick);
    if (!stalled) { stalled = true; await waiting.promise; }
    return originalRender.call(this, state, options);
  };
  t.after(() => { WorldRenderer.prototype.render = originalRender; waiting.resolve(); });
  await until(() => stalled);
  for (let i = 0; i < 20; i++) await step();
  assert.equal(rendered.length, 1, "There must never be concurrent world writers");
  waiting.resolve();
  await until(() => rendered.length >= 2);
  assert(rendered[1] - rendered[0] >= 20, "Clock follows server ticks, not completed writes");
});

test("hurt or dimension change before the deferred entry cancels that entry", async () => {
  const player = new MockPlayer(), original = new Map(player.permissions);
  for (const cancel of [
    () => hurt(player),
    () => world.afterEvents.playerDimensionChange.emit({ player }),
  ]) {
    runtime.handlePonderItemUse({ source: player, itemStack: { typeId: "minecraft:stick" } });
    cancel();
    await step(); await step();
    assert.equal(allocator.leases.size, 0);
    assert.equal(forms.length, 0);
    assert.deepEqual(player.permissions, original);
  }
  await open(player);
});

test("runaway native byproducts restore the player and retain explicit cleanup ownership", async () => {
  const player = await open(), lease = [...allocator.leases.values()][0], dimension = player.dimension;
  const visitor = dimension.spawnEntity("minecraft:pig", lease.origin);
  const byproducts = Array.from({ length: LIMITS.nativeEntities + 1 }, () =>
    dimension.spawnEntity("minecraft:item", lease.origin));
  assert.equal(byproducts.at(-1).isValid, false);
  assert.equal(player.camera.active, undefined);
  assert.equal(player.getDynamicProperty(PLAYER_STATE_KEY), undefined);
  await until(() => allocator.leases.size === 0);
  assert(byproducts.every(entity => !entity.isValid));
  assert.equal(visitor.isValid, true, "Unowned visitors are never garbage-collected");
});

test("hurt restores controls synchronously even when allocation is still awaiting chunk loading", async () => {
  const player = new MockPlayer(), original = new Map(player.permissions), hidden = [...player.hidden], loading = deferred();
  world.tickingAreaManager.beforeCreate = () => loading.promise;
  runtime.handlePonderItemUse({ source: player, itemStack: { typeId: "minecraft:stick" } });
  await until(() => allocator.leases.size === 1);
  assert(player.getDynamicProperty(PLAYER_STATE_KEY));
  hurt(player);
  assert.deepEqual(player.permissions, original); assert.deepEqual(player.hidden, hidden);
  assert.equal(player.camera.active, undefined);
  assert.equal(player.getDynamicProperty(PLAYER_STATE_KEY), undefined);
  loading.resolve();
  await until(() => allocator.leases.size === 0);
  assert.equal(forms.length, 0); assert.equal(player.dimension.fillCalls, 0);
});

test("a late form selection cannot reopen a hurt session or affect the next session", async () => {
  const player = await open(), originalCount = forms.length, old = activeForm(player);
  uiManager.resolveOnClose = false;
  hurt(player);
  assert.equal(player.camera.active, undefined);
  assert(uiManager.closed.includes(player.id));
  await until(() => allocator.leases.size === 0);
  await open(player);
  const current = activeForm(player), currentCamera = player.camera.active;
  old.answer({ canceled: false, selection: SLOTS.close });
  await step();
  assert.equal(forms.length, originalCount + 1);
  assert.equal(activeForm(player), current);
  assert.deepEqual(player.camera.active, currentCamera);
});

test("hurt between seek rendering and camera application must not relock the restored camera", async t => {
  const player = await open(), originalRender = WorldRenderer.prototype.render;
  let armed = true;
  WorldRenderer.prototype.render = async function (...args) {
    const result = await originalRender.apply(this, args);
    if (armed && args[1]?.reset) { armed = false; hurt(player); }
    return result;
  };
  t.after(() => { WorldRenderer.prototype.render = originalRender; });
  activeForm(player).answer({ canceled: false, selection: SLOTS.keyframes + 3 });
  await until(() => allocator.leases.size === 0);
  assert.equal(armed, false);
  assert.equal(player.camera.active, undefined);
  assert.equal(player.getDynamicProperty(PLAYER_STATE_KEY), undefined);
  assert.equal(forms.length, 1);
});

test("two simultaneous players have isolated forms, clocks and leases; one exit does not restore the other", async () => {
  const a = new MockPlayer(), b = new MockPlayer(world.getDimension("nether"));
  await Promise.all([open(a), open(b, "minecraft:redstone_lamp")]);
  assert.equal(allocator.leases.size, 2);
  const otherCamera = b.camera.active;
  const otherLease = [...allocator.leases.values()].find(l => l.ownerId === b.id);
  hurt(a);
  assert.equal(a.camera.active, undefined);
  assert.deepEqual(b.camera.active, otherCamera);
  await until(() => allocator.leases.size === 1);
  assert(allocator.leases.has(otherLease.id));
  assert(b.getDynamicProperty(PLAYER_STATE_KEY));
  assert(activeForm(b));
});

test("pause, keyframe seek, indexes and back retain authored progress and navigation history", async () => {
  const player = await open();
  await click(player, SLOTS.play);
  assert.match(token(player), /:hold:0:/);
  await click(player, SLOTS.keyframes + 2);
  assert.match(token(player), /:hold:0:112$/);
  await click(player, SLOTS.items);
  assert.equal(token(player), "index");
  for (let i = 0; i < 10; i++) await step();
  await click(player, SLOTS.back);
  assert.match(token(player), /:hold:0:112$/);
  await click(player, SLOTS.comfy);
  assert.match(token(player), /:hold:1:112$/);
  await click(player, SLOTS.play);
  assert.match(token(player), /:run:1:/);
});

test("dimension change and death close immediately; offline recovery waits until spawn", async () => {
  const player = await open();
  player.dimension = world.getDimension("nether");
  world.afterEvents.playerDimensionChange.emit({ player });
  assert.equal(player.camera.active, undefined);
  await until(() => allocator.leases.size === 0);
  await open(player);
  world.afterEvents.entityDie.emit({ deadEntity: player });
  assert.equal(player.camera.active, undefined);
  await until(() => allocator.leases.size === 0);
  await open(player);
  player.isValid = false;
  world.afterEvents.playerLeave.emit({ playerId: player.id });
  assert(player.getDynamicProperty(PLAYER_STATE_KEY));
  await until(() => allocator.leases.size === 0);
  player.isValid = true;
  world.afterEvents.playerSpawn.emit({ player, initialSpawn: true });
  await until(() => !player.getDynamicProperty(PLAYER_STATE_KEY));
  assert.equal(player.camera.active, undefined);
  assert.equal(player.permissions.get(2), true);
});

test("failed immediate restoration is retried without discarding the original snapshot", async () => {
  const player = await open();
  player.failCamera = true; hurt(player);
  assert(player.getDynamicProperty(PLAYER_STATE_KEY));
  assert.equal(player.permissions.get(2), true);
  await until(() => allocator.leases.size === 0);
  player.failCamera = false;
  await until(() => !player.getDynamicProperty(PLAYER_STATE_KEY));
  assert.equal(player.camera.active, undefined);
});

test("busy-form retries are bounded, and a rejected form restores the session", async () => {
  const player = await open();
  for (let i = 0; i < 3; i++) {
    const count = forms.length;
    activeForm(player).answer({ canceled: true, cancelationReason: "UserBusy" });
    await until(() => forms.length > count);
  }
  activeForm(player).answer({ canceled: true, cancelationReason: "UserBusy" });
  await until(() => allocator.leases.size === 0);
  assert.equal(forms.length, 4); assert.equal(player.camera.active, undefined);
  await open(player);
  activeForm(player).fail(new Error("injected form failure"));
  await until(() => allocator.leases.size === 0);
  assert.equal(player.camera.active, undefined);
});
