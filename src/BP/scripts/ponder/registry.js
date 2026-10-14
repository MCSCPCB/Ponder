import { normalizeScene, namespaced, validIconPath, validId, validateTitle } from "./core/scene.js";
import { STAGE_PRESETS } from "./config/presets.js";
import { PONDER_SCENES } from "./config/scenes/index.js";
import { PONDER_TAGS } from "./config/tags.js";

export function createRegistry(rawScenes, rawTags, presets = {}) {
  const scenes = rawScenes.map(s => normalizeScene(s, presets)).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const byId = new Map(), byItem = new Map(), tags = new Map();
  for (const tag of [...rawTags].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    if (!validId(tag.id) || tags.has(tag.id)) throw new Error(`Duplicate/invalid tag ${tag.id}`);
    validateTitle(tag.title, "tag title");
    if (!validIconPath(tag.iconPath) || !Number.isFinite(tag.order ?? 0)) throw new Error(`Invalid tag metadata ${tag.id}`);
    tags.set(tag.id, { ...tag, scenes: [] });
  }
  for (const scene of scenes) {
    if (byId.has(scene.id)) throw new Error(`Duplicate scene ${scene.id}`);
    byId.set(scene.id, scene);
    for (const itemId of new Set(scene.entryItems)) {
      if (!namespaced(itemId)) throw new Error("Invalid entry item");
      if (!byItem.has(itemId)) byItem.set(itemId, []);
      byItem.get(itemId).push(scene);
    }
    for (const tagId of new Set(scene.tags)) {
      if (!tags.has(tagId)) throw new Error(`Unknown tag ${tagId} in ${scene.id}`);
      tags.get(tagId).scenes.push(scene.id);
    }
  }
  return { scenes, byId, byItem, tags };
}
export const registry = createRegistry(PONDER_SCENES, PONDER_TAGS, STAGE_PRESETS);
export const getScenesForItem = itemId => registry.byItem.get(itemId) ?? [];
