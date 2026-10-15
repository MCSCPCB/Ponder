import { buildScene } from "../PonderScene.js";
import { PONDER_SCENES } from "../../content/BasePonderPlugin.js";

/** Scenes by entry item. A later scene registered for the same item wins, as before. */
export function createRegistry(entries) {
  const byId = new Map(), byItem = new Map();
  for (const entry of entries) {
    if (byId.has(entry.id)) throw new Error(`Duplicate scene ${entry.id}`);
    const scene = buildScene(entry);
    byId.set(scene.id, scene);
    for (const itemId of scene.entryItems) byItem.set(itemId, scene);
  }
  return { byId, byItem };
}
export const registry = createRegistry(PONDER_SCENES);
export const getSceneForItem = itemId => registry.byItem.get(itemId);
