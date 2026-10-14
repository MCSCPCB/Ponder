import { LIMITS } from "../../enums/PonderConfig.js";

export const scenePage = (sceneId, context = { kind: "all" }) =>
  ({ kind: "scene", sceneId, context, tick: 0, playing: true });
const clone = value => JSON.parse(JSON.stringify(value));
export class Navigation {
  constructor(initial) { this.current = clone(initial); this.history = []; }
  push(page) {
    this.history.push(clone(this.current));
    if (this.history.length > 32) this.history.shift();
    this.current = clone(page);
  }
  back() {
    if (!this.history.length) return false;
    this.current = this.history.pop(); return true;
  }
  get canBack() { return this.history.length > 0; }
}
export function scenesInContext(registry, context = { kind: "all" }) {
  if (context.kind === "item") return registry.byItem.get(context.id) ?? [];
  if (context.kind === "tag")
    return (registry.tags.get(context.id)?.scenes ?? []).map(id => registry.byId.get(id));
  return registry.scenes;
}
export function indexEntries(registry, page) {
  if (page.kind === "items")
    return [...registry.byItem].map(([id, scenes]) => ({
      id, title: scenes[0].itemTitle ?? scenes[0].title,
      description: `${scenes.length}`, iconPath: scenes[0].iconPath,
      target: scenes.length === 1 ? scenePage(scenes[0].id, { kind: "item", id }) : { kind: "item", id, page: 0 },
    }));
  if (page.kind === "tags")
    return [...registry.tags.values()].map(tag => ({
      ...tag, title: tag.title, description: tag.description, target: { kind: "tag", id: tag.id, page: 0 },
    }));
  const context = { kind: page.kind, id: page.id };
  return scenesInContext(registry, context).map(scene => ({
    id: scene.id, title: scene.title, description: scene.description, iconPath: scene.iconPath,
    target: scenePage(scene.id, context),
  }));
}
export function pageEntries(entries, page = 0) {
  const pages = Math.max(1, Math.ceil(entries.length / LIMITS.indexPageSize));
  const index = Math.max(0, Math.min(pages - 1, page));
  return { page: index, pages, entries: entries.slice(index * LIMITS.indexPageSize, (index + 1) * LIMITS.indexPageSize) };
}
