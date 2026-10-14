import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { reset, MockPlayer, InputPermissionCategory } from "./bedrock-harness.mjs";
const { capturePlayer, restorePlayer } = await import("../src/BP/scripts/ponder/bedrock/player-state.js");
const { PLAYER_STATE_KEY } = await import("../src/BP/scripts/ponder/constants.js");
beforeEach(reset);

test("capture/restore preserves hidden HUD elements and individual input permissions", () => {
  const player = new MockPlayer(), hidden = [...player.hidden], permissions = new Map(player.permissions);
  capturePlayer(player);
  assert.equal(player.permissions.get(InputPermissionCategory.Movement), false);
  assert.equal(player.permissions.get(InputPermissionCategory.Camera), false);
  assert.equal(player.hidden.length, 13);
  player.camera.setCamera("minecraft:free", {});
  assert(restorePlayer(player));
  assert.equal(player.camera.active, undefined);
  assert.deepEqual(player.hidden, hidden);
  assert.deepEqual(player.permissions, permissions);
  assert.equal(player.getDynamicProperty(PLAYER_STATE_KEY), undefined);
});

test("a failed recovery still restores independent controls and retains a retryable snapshot", () => {
  const player = new MockPlayer(), hidden = [...player.hidden], permissions = new Map(player.permissions);
  capturePlayer(player); player.failCamera = true;
  assert.throws(() => restorePlayer(player), /incomplete/);
  assert.deepEqual(player.hidden, hidden); assert.deepEqual(player.permissions, permissions);
  assert(player.getDynamicProperty(PLAYER_STATE_KEY));
  player.failCamera = false; restorePlayer(player);
  assert.equal(player.getDynamicProperty(PLAYER_STATE_KEY), undefined);
});

test("capture persists before mutation and refuses to overwrite an unrecovered snapshot", () => {
  const player = new MockPlayer(), permissions = new Map(player.permissions), hidden = [...player.hidden];
  player.failProperty = true;
  assert.throws(() => capturePlayer(player), /property/);
  assert.deepEqual(player.permissions, permissions); assert.deepEqual(player.hidden, hidden);
  player.failProperty = false; capturePlayer(player);
  const snapshot = player.getDynamicProperty(PLAYER_STATE_KEY);
  player.failCamera = true;
  assert.throws(() => capturePlayer(player), /incomplete/);
  assert.equal(player.getDynamicProperty(PLAYER_STATE_KEY), snapshot);
});

test("offline players retain recovery data until a valid spawn/rejoin", () => {
  const player = new MockPlayer(); capturePlayer(player); player.isValid = false;
  assert.equal(restorePlayer(player), false); assert(player.getDynamicProperty(PLAYER_STATE_KEY));
  player.isValid = true; assert(restorePlayer(player));
  assert.equal(player.getDynamicProperty(PLAYER_STATE_KEY), undefined);
});
