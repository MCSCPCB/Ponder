import { HudVisibility, InputPermissionCategory } from "@minecraft/server";
import { PLAYER_STATE_KEY } from "../../enums/PonderConfig.js";

export function capturePlayer(player) {
  if (player.getDynamicProperty(PLAYER_STATE_KEY)) restorePlayer(player);
  const input = {};
  for (const category of new Set(Object.values(InputPermissionCategory).filter(v => typeof v === "number")))
    input[category] = player.inputPermissions.isPermissionCategoryEnabled(category);
  const snapshot = { hidden: player.onScreenDisplay.getHiddenHudElements(), input };
  // Persist before changing anything. Rejoin/reload can restore even without a session.
  player.setDynamicProperty(PLAYER_STATE_KEY, JSON.stringify(snapshot));
  player.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, false);
  player.inputPermissions.setPermissionCategory(InputPermissionCategory.Camera, false);
  player.onScreenDisplay.setHudVisibility(HudVisibility.Hide);
  return snapshot;
}
export function restorePlayer(player) {
  if (!player?.isValid) return false;
  const raw = player.getDynamicProperty(PLAYER_STATE_KEY);
  if (!raw) return true;
  const snapshot = JSON.parse(raw);
  // Each operation is independently attempted; retain the snapshot if any fails.
  const errors = [];
  const attempt = action => { try { action(); } catch (error) { errors.push(error); } };
  attempt(() => player.camera.clear());
  attempt(() => player.camera.setFov());
  attempt(() => {
    player.onScreenDisplay.resetHudElementsVisibility();
    if (snapshot.hidden.length) player.onScreenDisplay.setHudVisibility(HudVisibility.Hide, snapshot.hidden);
  });
  // Restore aggregate permissions first, then per-input permissions.
  for (const [category, enabled] of Object.entries(snapshot.input).sort((a, b) => Number(a[0]) - Number(b[0])))
    attempt(() => player.inputPermissions.setPermissionCategory(Number(category), Boolean(enabled)));
  if (errors.length) throw new Error(`Player recovery incomplete: ${errors.join("; ")}`);
  player.setDynamicProperty(PLAYER_STATE_KEY, undefined);
  return true;
}
