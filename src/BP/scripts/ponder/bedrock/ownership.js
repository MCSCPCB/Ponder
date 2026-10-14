import { SESSION_TAG } from "../constants.js";
import { safeRemove } from "./jobs.js";

export function markOwned(entity, lease) {
  if (entity.typeId === "minecraft:player") throw new Error("Players cannot belong to a Ponder stage");
  try { entity.addTag(SESSION_TAG); entity.addTag(lease.tag); }
  catch (error) { safeRemove(entity); throw error; }
  return entity;
}
