import { SESSION_TAG } from "../../enums/PonderConfig.js";
import { safeRemove } from "./StageJobs.js";

/** Tags an entity as part of the stage; one that cannot be tagged is removed, never left behind. */
export function markOwned(entity, lease) {
  try { entity.addTag(SESSION_TAG); entity.addTag(lease.tag); }
  catch (error) { safeRemove(entity); throw error; }
  return entity;
}
