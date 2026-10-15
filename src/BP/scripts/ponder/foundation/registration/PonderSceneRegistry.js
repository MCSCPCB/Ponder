import { buildScene, namespaced, validIconPath, validId, validateTitle } from "../PonderScene.js";
import { PONDER_SCENES, PONDER_TAGS } from "../../content/BasePonderPlugin.js";

/**
 * Index metadata is registered up front. A scene's storyboard runs on first
 * use (getScene), because a schematic read from a `.mcstructure` is only
 * available at a writable tick.
 */
export function createRegistry(entries, rawTags) {
  const scenes = entries.map(entry => {
    if (!validId(entry.id)) throw new Error(`Invalid scene id ${entry.id}`);
    validateTitle(entry.title, "scene title");
    return { ...entry,
      iconPath: entry.iconPath ?? "textures/ui/ponder/logo", tags: entry.tags ?? [], order: entry.order ?? 0 };
  }).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const byId = new Map(), byItem = new Map(), tags = new Map(), built = new Map();
  for (const tag of [...rawTags].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    if (!validId(tag.id) || tags.has(tag.id)) throw new Error(`Duplicate/invalid tag ${tag.id}`);
    validateTitle(tag.title, "tag title");
    if (!validIconPath(tag.iconPath) || !Number.isFinite(tag.order ?? 0)) throw new Error(`Invalid tag metadata ${tag.id}`);
    tags.set(tag.id, { ...tag, scenes: [] });
  }
  for (const scene of scenes) {
    if (byId.has(scene.id)) throw new Error(`Duplicate scene ${scene.id}`);
    if (!validIconPath(scene.iconPath)) throw new Error(`Invalid iconPath in ${scene.id}`);
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
  /** Runs the storyboard once and caches the result. */
  const getScene = id => {
    if (!built.has(id)) {
      const entry = byId.get(id);
      if (!entry) throw new Error(`Unknown scene ${id}`);
      built.set(id, buildScene(entry));
    }
    return built.get(id);
  };
  return { scenes, byId, byItem, tags, getScene };
}
export const registry = createRegistry(PONDER_SCENES, PONDER_TAGS);
export const getScenesForItem = itemId => registry.byItem.get(itemId) ?? [];
