import { SESSION_TAG } from "../../enums/PonderConfig.js";
import { safeRemove } from "./StageJobs.js";

export function markOwned(entity, lease) {
  if (entity.typeId === "minecraft:player") throw new Error("Players cannot belong to a Ponder stage");
  try { entity.addTag(SESSION_TAG); entity.addTag(lease.tag); }
  catch (error) { safeRemove(entity); throw error; }
  return entity;
}
