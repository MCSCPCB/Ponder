import { EasingType, system, world } from "@minecraft/server";
import { FormCancelationReason, uiManager } from "@minecraft/server-ui";
import { LIMITS, SESSION_TAG } from "../../enums/PonderConfig.js";
import { getSceneForItem } from "../registration/PonderSceneRegistry.js";
import { raw, translate, ui } from "../registration/PonderLocalization.js";
import { add, inside, orbit } from "../VecHelper.js";
import { allocator } from "../level/StageAllocator.js";
import { assertLive, safeRemove, waitTicks } from "../level/StageJobs.js";
import { markOwned } from "../level/StageOwnership.js";
import { PonderLevelRenderer } from "../level/PonderLevelRenderer.js";
import { capturePlayer, restorePlayer } from "./PonderPlayerState.js";
import { SessionGate } from "./SessionGate.js";
import { createStageForm } from "./PonderForm.js";

/** @type {Map<string, any>} */
const sessions = new Map();
const nativeByproducts = new Set(["minecraft:item", "minecraft:xp_orb", "minecraft:falling_block"]);
const LOADING_REFRESH_TICKS = 40;
const busyMessage = () => raw(translate(ui("busy")), "\n", translate(ui("busy.maximum"), LIMITS.sessions));
let booting = false;

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
// The player can leave while the stage loads.
function actionBar(player, message) {
  if (player.isValid) player.onScreenDisplay.setActionBar(message);
}
// The structure's entrance when the form first opens: the old UI preview rose 16 px of its
// 196 px window over 0.48 s (out_quart) after 0.02 s. With the camera that is the view
// starting this share of its height higher and easing down; the wait becomes one tick.
const INTRO_RISE = 16 / 196;
const INTRO_SECONDS = 0.48;

function applyCamera(session, intro = false) {
  const { camera } = session.scene, origin = session.lease.origin, player = session.player;
  const pose = orbit(camera);
  const location = add(pose.location, origin), facingLocation = add(camera.focus, origin);
  player.camera.setFov({ fov: camera.fov });
  if (!intro) {
    player.camera.setCamera("minecraft:free", { location, facingLocation });
    return;
  }
  // Camera and aim move together, so only the position eases and the view angle stays put.
  const rise = INTRO_RISE * 2 * camera.distance * Math.tan(camera.fov * Math.PI / 360);
  const lift = { x: pose.up.x * rise, y: pose.up.y * rise, z: pose.up.z * rise };
  player.camera.setCamera("minecraft:free", { location: add(location, lift), facingLocation: add(facingLocation, lift) });
  system.runTimeout(() => {
    if (session.closed || !player.isValid) return;
    player.camera.setCamera("minecraft:free", {
      location, facingLocation, easeOptions: { easeTime: INTRO_SECONDS, easeType: EasingType.OutQuart },
    });
  }, 1);
}

/** Restore the player NOW; wait for the writer only before reclaiming world data. */
export function closeSession(session, reason = "closed") {
  if (!session || session.closed) return session?.closePromise ?? Promise.resolve();
  session.closed = true;
  session.formEpoch++;
  session.animationToken++;
  const drained = session.gate.close();
  if (session.formPending && session.player.isValid) uiManager.closeAllForms(session.player);
  restoreSafely(session.player);
  session.closePromise = (async () => {
    try {
      await drained;
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
  return closeSession(sessions.get(playerId), reason);
}
function fail(session, error) {
  if (session.closed) return;
  console.error(`[Ponder] Session ${session.player.id}: ${error?.stack ?? error}`);
  void closeSession(session, "error");
}

/** Queues a stage change. A newer change or a close stops the running one at its next write. */
function beginTransition(session, stageIndex) {
  const token = ++session.animationToken;
  const live = () => {
    assertLive(session);
    if (token !== session.animationToken) throw new Error("Transition superseded");
  };
  session.gate.invalidate();
  void session.gate.run(() => session.renderer.transition(stageIndex, token, live)).catch(error => {
    if (session.closed || token !== session.animationToken) return;
    fail(session, error);
  });
}

/** Shows the form, retrying while the client is busy with another screen. */
async function showForm(session, formState) {
  for (let attempt = 0; ; attempt++) {
    const epoch = ++session.formEpoch;
    session.formPending = true;
    let response;
    try { response = await formState.form.show(session.player); }
    finally { if (epoch === session.formEpoch) session.formPending = false; }
    // A hurt/leave/change-dimension event can win while show() is awaiting input.
    if (session.closed || epoch !== session.formEpoch) return undefined;
    if (response.canceled && response.cancelationReason === FormCancelationReason.UserBusy && attempt < LIMITS.formBusyRetries) {
      await waitTicks(10);
      if (session.closed) return undefined;
      continue;
    }
    return response;
  }
}

async function runForms(session) {
  const { scene } = session;
  let stageIndex = 0;
  let formState = createStageForm(scene, stageIndex, "forward", true);
  while (!session.closed) {
    const response = await showForm(session, formState);
    if (!response || session.closed) return;
    if (response.canceled) { void closeSession(session, "form-cancelled"); return; }

    const action = formState.buttons[response.selection]?.id;
    let nextStageIndex = stageIndex, animateProgressMode = "none";
    if (action === "close") { void closeSession(session, "button"); return; }
    if (action === "prev") {
      nextStageIndex = Math.max(0, stageIndex - 1);
      animateProgressMode = "reverse";
    } else if (action === "restart") {
      nextStageIndex = 0;
      animateProgressMode = "forward";
    } else if (action === "next") {
      nextStageIndex = Math.min(scene.stages.length - 1, stageIndex + 1);
      animateProgressMode = "forward";
    }
    const stageChanged = nextStageIndex !== stageIndex;
    stageIndex = nextStageIndex;
    formState = createStageForm(scene, stageIndex, animateProgressMode, false);
    if (stageChanged) beginTransition(session, stageIndex);
  }
}

async function start(player, scene) {
  if (!player.isValid || sessions.has(player.id)) return;
  if (!allocator.ready) {
    console.error(`[Ponder] Entry refused while recovering: ${allocator.recoveryError ?? "starting"}`);
    return;
  }
  if (allocator.full) { actionBar(player, busyMessage()); return; }
  const session = {
    player, dimension: player.dimension, scene,
    gate: new SessionGate(), closed: false, formEpoch: 0, formPending: false, animationToken: 0,
    lease: undefined, renderer: undefined,
  };
  sessions.set(player.id, session);
  // Loading only shows the action bar: the player keeps moving and keeps the HUD.
  const loading = system.runInterval(() => {
    if (session.closed) return;
    actionBar(player, translate(ui("pondering")));
  }, LOADING_REFRESH_TICKS);
  actionBar(player, translate(ui("pondering")));
  try {
    await session.gate.run(async () => {
      await allocator.allocate(session, scene);
      assertLive(session);
      session.renderer = new PonderLevelRenderer(session, scene);
      await session.renderer.buildStage(0, () => assertLive(session));
      assertLive(session);
    });
    system.clearRun(loading);
    if (session.closed) return;
    actionBar(player, "");
    capturePlayer(player);
    applyCamera(session, true);
    await runForms(session);
  } catch (error) {
    system.clearRun(loading);
    const reason = String(error?.message ?? error);
    if (reason === "noSpace") actionBar(player, translate(ui("no_space")));
    else if (reason === "busy") actionBar(player, busyMessage());
    if (reason === "noSpace" || reason === "busy") void closeSession(session, reason);
    else fail(session, error);
  }
}

export function handlePonderItemUse({ itemStack, source }) {
  if (source?.typeId !== "minecraft:player") return;
  const scene = getSceneForItem(itemStack?.typeId);
  if (!scene) return;
  void start(source, scene).catch(error => console.error(`[Ponder] Entry: ${error}`));
}

function tick() {
  for (const session of sessions.values()) {
    if (session.closed) continue;
    if (!session.player.isValid || session.player.dimension.id !== session.dimension.id)
      void closeSession(session, "invalid-player");
  }
}
export function installPonder() {
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
      if (!lease?.room || !["building", "ready"].includes(lease.phase) || entity.dimension.id !== lease.dimensionId ||
        !inside(entity.location, lease.room) || entity.hasTag(SESSION_TAG)) continue;
      if (session.dimension.getPlayers().some(p => inside(p.location, lease.safe))) continue;
      try {
        markOwned(entity, lease);
        const count = session.dimension.getEntities({ tags: [lease.tag] })
          .filter(candidate => nativeByproducts.has(candidate.typeId)).length;
        if (count > LIMITS.nativeEntities) {
          safeRemove(entity);
          if (!session.closed) void closeSession(session, "native-entity-limit");
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
