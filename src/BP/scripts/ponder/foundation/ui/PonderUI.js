import { InputMode, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, uiManager } from "@minecraft/server-ui";
import { LIMITS, SESSION_TAG } from "../../enums/PonderConfig.js";
import { registry, getScenesForItem } from "../registration/PonderSceneRegistry.js";
import { localeFor, tr } from "../registration/PonderLocalization.js";
import { add, inside, orbit } from "../VecHelper.js";
import { hasTextAt, stateAt, TimelineClock } from "../instruction/PonderSchedule.js";
import { CAMERA_FOV } from "../element/OverlayLayout.js";
import { SessionGate } from "./SessionGate.js";
import { Navigation, scenePage } from "./PonderNavigation.js";
import { buildFormModel } from "./PonderForm.js";
import { allocator } from "../level/StageAllocator.js";
import { assertLive, safeRemove, waitTicks } from "../level/StageJobs.js";
import { capturePlayer, restorePlayer } from "./PonderPlayerState.js";
import { PonderLevelRenderer } from "../level/PonderLevelRenderer.js";
import { markOwned } from "../level/StageOwnership.js";

/** @type {Map<string, any>} */
const sessions = new Map();
const pendingEntries = new Map();
const nativeByproducts = new Set(["minecraft:item", "minecraft:xp_orb", "minecraft:falling_block"]);
let installed = false, booting = false;
const message = (player, text) => { try { if (player.isValid) player.sendMessage(`§7[Ponder] §r${text}`); } catch {} };
const inputMode = player => {
  try {
    const mode = player.inputInfo.lastInputMode;
    return mode === InputMode.Touch ? "touch" : mode === InputMode.Gamepad ? "gamepad" : "keyboard";
  } catch { return "keyboard"; }
};
function restoreSafely(player) {
  try { restorePlayer(player); }
  catch (error) { console.error(`[Ponder] Player state retained for recovery (${player.id}): ${error}`); }
}
async function boot() {
  if (booting || sessions.size) return;
  booting = true;
  try {
    for (const player of world.getAllPlayers()) restoreSafely(player);
    await allocator.recover();
  } catch (error) { console.error(`[Ponder] Startup recovery: ${error}`); }
  finally { booting = false; }
}
function applyCamera(session, camera) {
  // Close can win at any await boundary, including a completed seek render.
  // Never reapply the free camera after the player's snapshot was restored.
  assertLive(session);
  const signature = JSON.stringify(camera);
  if (signature === session.cameraSignature) return;
  const pose = orbit(camera), origin = session.lease.origin;
  session.player.camera.setCamera("minecraft:free", {
    location: add(pose.location, origin), facingLocation: add(camera.focus, origin),
  });
  session.cameraSignature = signature;
}
function snapshotNavigation(session) {
  if (session.nav.current.kind !== "scene" || !session.clock) return;
  Object.assign(session.nav.current, {
    tick: session.clock.tick, playing: session.clock.playing, comfy: session.clock.comfy,
  });
}
async function loadPage(session, { naturalStart = false } = {}) {
  assertLive(session);
  const page = session.nav.current;
  if (page.kind !== "scene") return; // Keep a paused view behind the index.
  const scene = registry.getScene(page.sceneId);
  if (session.scene?.id !== scene.id || !session.renderer) {
    message(session.player, tr("loading", session.locale));
    session.player.camera.clear();
    session.cameraSignature = undefined;
    session.renderer?.dispose(); session.renderer = undefined;
    await allocator.release(session.lease);
    session.lease = undefined;
    assertLive(session);
    await allocator.allocate(session, scene);
    assertLive(session);
    session.scene = scene;
    session.renderer = new PonderLevelRenderer(session, scene);
  }
  const clock = new TimelineClock(scene, page.tick ?? 0);
  clock.comfy = page.comfy ?? session.comfy;
  clock.playing = page.playing !== false;
  session.clock = clock;
  const state = stateAt(scene, clock.tick);
  await session.renderer.render(state, { reset: true, effects: naturalStart && clock.tick === 0 });
  assertLive(session);
  session.player.camera.setFov({ fov: CAMERA_FOV });
  applyCamera(session, state.camera);
  if (naturalStart && clock.tick === 0) session.renderer.particles(-1, 0);
}
/** Restore the player NOW; wait for the writer only before reclaiming world data. */
export function closeSession(session, reason = "closed") {
  if (!session || session.closed) return session?.closePromise ?? Promise.resolve();
  session.closed = true;
  session.formEpoch++;
  const drained = session.gate.close();
  if (session.formPending) {
    try { if (session.player.isValid) uiManager.closeAllForms(session.player); }
    catch (error) { console.warn(`[Ponder] Form close (${reason}): ${error}`); }
  }
  restoreSafely(session.player);
  session.closePromise = (async () => {
    try {
      await drained;
      session.renderer?.dispose();
      await allocator.release(session.lease);
    } catch (error) {
      // Journal and ownership tags survive. Do not pretend an area is reusable.
      allocator.ready = false;
      allocator.recoveryError = error;
      console.error(`[Ponder] Cleanup deferred (${reason}): ${error}`);
    } finally {
      if (sessions.get(session.player.id) === session) sessions.delete(session.player.id);
    }
  })();
  return session.closePromise;
}
function closePlayer(playerId, reason) {
  // beforeEvents entry is deferred to a writable tick; damage/leave can win
  // before a Session exists, not just while an allocation/form is awaiting.
  pendingEntries.delete(playerId);
  return closeSession(sessions.get(playerId), reason);
}
function fail(session, error) {
  if (session.closed) return;
  console.error(`[Ponder] Session ${session.player.id}: ${error?.stack ?? error}`);
  const key = ["noSpace", "busy", "recovering", "unavailable"].includes(error?.message) ? error.message : "error";
  void closeSession(session, "error");
  message(session.player, tr(key, session.locale));
}
async function perform(session, action) {
  assertLive(session);
  snapshotNavigation(session);
  switch (action.type) {
    case "close": void closeSession(session, "button"); return;
    case "back":
      if (session.nav.back()) await loadPage(session);
      break;
    case "page":
      if (action.selected) session.nav.current.selected = action.selected;
      session.nav.push(action.page);
      await loadPage(session, { naturalStart: true });
      break;
    case "paginate": session.nav.current.page = action.page; break;
    case "seek":
      session.clock.seek(action.tick);
      await session.renderer.render(stateAt(session.scene, session.clock.tick), { reset: true });
      applyCamera(session, stateAt(session.scene, session.clock.tick).camera);
      break;
    case "replay":
      session.clock.seek(0); session.clock.playing = true;
      await session.renderer.render(stateAt(session.scene, 0), { reset: true, effects: true });
      applyCamera(session, session.scene.camera);
      session.renderer.particles(-1, 0);
      break;
    case "comfy":
      session.comfy = session.clock.comfy = !session.clock.comfy;
      session.clock.divider = 0;
      break;
  }
}
async function showForm(session) {
  if (session.closed) return;
  const epoch = ++session.formEpoch;
  for (let attempt = 0; attempt <= LIMITS.formBusyRetries; attempt++) {
    if (session.closed || epoch !== session.formEpoch) return;
    snapshotNavigation(session);
    const model = buildFormModel(registry, session.nav, session.clock, session.locale, { previousStep: session.shownStep });
    session.shownStep = model.step;
    const form = new ActionFormData().title(model.title).body(model.body);
    for (const slot of model.slots) form.button(slot.text, slot.icon);
    session.formPending = true;
    let response;
    try { response = await form.show(session.player); }
    finally { if (epoch === session.formEpoch) session.formPending = false; }
    // A hurt/leave/change-dimension event can win while show() is awaiting input.
    if (session.closed || epoch !== session.formEpoch) return;
    if (response.canceled) {
      if (response.cancelationReason === FormCancelationReason.UserBusy && attempt < LIMITS.formBusyRetries) {
        await waitTicks(10); continue;
      }
      void closeSession(session, "form-cancelled"); return;
    }
    const action = model.slots[response.selection]?.action;
    if (!action) { await waitTicks(1); continue; }
    if (action.type === "close") { void closeSession(session, "button"); return; }
    session.navigating = true;
    session.gate.invalidate();
    try { await session.gate.run(() => perform(session, action)); }
    finally { session.navigating = false; }
    if (!session.closed) {
      await waitTicks(1);
      return showForm(session);
    }
    return;
  }
  void closeSession(session, "form-busy");
}
async function start(player, itemId) {
  if (!player.isValid) return;
  const scenes = getScenesForItem(itemId);
  if (!scenes.length || sessions.has(player.id)) return;
  const locale = localeFor(player);
  if (!allocator.ready) {
    message(player, tr(allocator.recoveryError?.message === "unavailable" ? "unavailable" : "recovering", locale));
    return;
  }
  const session = {
    player, dimension: player.dimension, locale, inputMode: inputMode(player),
    nav: new Navigation(scenePage(scenes[0].id, { kind: "item", id: itemId })),
    gate: new SessionGate(), closed: false, comfy: false, formEpoch: 0, formPending: false,
    tickBusy: false, navigating: true, lease: undefined, scene: undefined, renderer: undefined, clock: undefined,
  };
  sessions.set(player.id, session);
  try {
    await session.gate.run(async () => {
      capturePlayer(player);
      await loadPage(session, { naturalStart: true });
    });
    session.navigating = false;
    if (!session.closed) void showForm(session).catch(error => fail(session, error));
  } catch (error) { fail(session, error); }
}
export function handlePonderItemUse(event) {
  const player = event.source ?? event.player, itemId = event.itemStack?.typeId;
  if (player?.typeId !== "minecraft:player" || !getScenesForItem(itemId).length) return false;
  // Keep cancelling held block interactions, but require a fresh press to enter
  // again after hurt/close. itemUse events do not carry isFirstEvent.
  if (event.isFirstEvent === false || sessions.has(player.id) || pendingEntries.has(player.id)) return true;
  const ticket = {};
  pendingEntries.set(player.id, ticket);
  system.run(() => {
    if (pendingEntries.get(player.id) !== ticket) return;
    pendingEntries.delete(player.id);
    void start(player, itemId).catch(error => console.error(`[Ponder] Entry: ${error}`));
  });
  return true;
}
function tick() {
  for (const session of sessions.values()) {
    if (session.closed || session.navigating || !session.renderer) continue;
    if (!session.player.isValid || session.player.dimension.id !== session.dimension.id) {
      void closeSession(session, "invalid-player"); continue;
    }
    if (session.nav.current.kind !== "scene") continue;
    // Teaching time follows server ticks, not the number of finished write jobs.
    // While a writer is busy we accumulate time; its successor materializes the
    // newest authored state. Native simulation is never paused/replayed.
    session.clock.advance(hasTextAt(session.scene, session.clock.tick));
    if (session.tickBusy) continue;
    session.tickBusy = true;
    void session.gate.run(async () => {
      assertLive(session);
      const state = stateAt(session.scene, session.clock.tick);
      await session.renderer.render(state, { effects: true });
      assertLive(session);
      applyCamera(session, state.camera);
    }).catch(error => fail(session, error)).finally(() => { session.tickBusy = false; });
  }
}
export function installPonder() {
  if (installed) return;
  installed = true;
  world.afterEvents.itemUse.subscribe(handlePonderItemUse);
  world.beforeEvents.playerInteractWithBlock.subscribe(event => {
    if (handlePonderItemUse(event)) event.cancel = true;
  });
  world.afterEvents.entityHurt.subscribe(event => {
    if (event.damage > 0) void closePlayer(event.hurtEntity.id, "hurt");
  });
  world.afterEvents.entityDie.subscribe(event => { void closePlayer(event.deadEntity.id, "death"); });
  world.afterEvents.playerLeave.subscribe(event => { void closePlayer(event.playerId, "leave"); });
  world.afterEvents.playerDimensionChange.subscribe(event => { void closePlayer(event.player.id, "dimension"); });
  world.afterEvents.playerSpawn.subscribe(event => {
    void closePlayer(event.player.id, "spawn");
    system.run(() => restoreSafely(event.player));
  });
  world.afterEvents.entitySpawn.subscribe(event => {
    const entity = event.entity;
    // Track new native byproducts, never Loaded entities or arbitrary visitors.
    if (event.cause === "Loaded" || !nativeByproducts.has(entity.typeId)) return;
    for (const session of sessions.values()) {
      const lease = session.lease;
      if (!lease?.room || lease.phase === "reserved" || entity.dimension.id !== lease.dimensionId ||
        !inside(entity.location, lease.room) || entity.hasTag(SESSION_TAG)) continue;
      if (session.dimension.getPlayers().some(p => inside(p.location, lease.safe))) continue;
      try {
        markOwned(entity, lease);
        const count = session.dimension.getEntities({ tags: [lease.tag] })
          .filter(candidate => nativeByproducts.has(candidate.typeId)).length;
        if (count > LIMITS.nativeEntities) {
          safeRemove(entity);
          if (!session.closed) {
            message(session.player, tr("resourceLimit", session.locale));
            void closeSession(session, "native-entity-limit");
          }
        }
      } catch (error) { console.warn(`[Ponder] Byproduct ownership: ${error}`); }
      break;
    }
  });
  world.afterEvents.worldLoad.subscribe(() => { if (!allocator.ready) void boot(); });
  system.run(() => { if (!allocator.ready) void boot(); });
  system.runInterval(tick, 1);
  system.runInterval(() => {
    if (!allocator.ready && !sessions.size) void boot();
    for (const player of world.getAllPlayers()) if (!sessions.has(player.id)) restoreSafely(player);
  }, 200);
}
