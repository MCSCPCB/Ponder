import { ACTIVE, DISABLED, HIDDEN, LIMITS, SLOTS, TITLE_MARKER } from "../../enums/PonderConfig.js";
import { localize, tr } from "../registration/PonderLocalization.js";
import { indexEntries, pageEntries, scenePage, scenesInContext } from "./PonderNavigation.js";
import { progressPixel } from "./PonderProgressBar.js";
export { progressPixel } from "./PonderProgressBar.js";

const UI_ICON = name => `textures/ui/ponder/icon_${name}`;
export const progressToken = (scene, clock) =>
  `${scene.id}:${clock.playing && !clock.finished ? "run" : "hold"}:${clock.comfy ? 1 : 0}:${progressPixel(scene, clock.tick)}`;

/** Fixed-slot form payload. Button text is data; actions never execute strings. */
export function buildFormModel(registry, nav, clock, locale) {
  const page = nav.current, isScene = page.kind === "scene", scene = isScene ? registry.getScene(page.sceneId) : undefined;
  const slots = Array.from({ length: SLOTS.count }, () => ({ text: HIDDEN, icon: "textures/empty", action: undefined }));
  const put = (index, text, icon, action, { disabled = false, active = false } = {}) =>
    slots[index] = { text: `${disabled ? DISABLED : active ? ACTIVE : ""}${text}`, icon: icon ?? "textures/empty", action: disabled ? undefined : action };
  put(SLOTS.close, tr("close", locale), UI_ICON("close"), { type: "close" });
  put(SLOTS.back, tr("back", locale), UI_ICON("back"), { type: "back" }, { disabled: !nav.canBack });
  if (!nav.canBack) slots[SLOTS.back].text = HIDDEN;
  put(SLOTS.items, tr("items", locale), UI_ICON("items"), { type: "page", page: { kind: "items", page: 0 } }, { active: page.kind === "items" });
  put(SLOTS.tags, tr("tags", locale), UI_ICON("tags"), { type: "page", page: { kind: "tags", page: 0 } }, { active: page.kind === "tags" });
  let body = tr("hint", locale), token = "index";
  if (isScene) {
    const scenes = scenesInContext(registry, page.context), index = scenes.findIndex(s => s.id === scene.id);
    const neighbour = direction => scenes[index + direction];
    for (const { slot, direction, label } of [
      { slot: SLOTS.previous, direction: -1, label: "previous" },
      { slot: SLOTS.next, direction: 1, label: "next" },
    ]) {
      const next = neighbour(direction);
      put(slot, tr(label, locale), UI_ICON(direction < 0 ? "prev" : "next"),
        next && { type: "page", page: scenePage(next.id, page.context) },
        { disabled: !next, active: direction > 0 && clock.finished });
    }
    put(SLOTS.replay, tr("replay", locale), UI_ICON("replay"), { type: "replay" });
    put(SLOTS.play, tr(clock.playing && !clock.finished ? "pause" : "play", locale),
      UI_ICON(clock.playing && !clock.finished ? "pause" : "play"), { type: "play" });
    put(SLOTS.comfy, tr(clock.comfy ? "comfyOn" : "comfy", locale), UI_ICON("comfy"), { type: "comfy" }, { active: clock.comfy });
    put(SLOTS.header, localize(scene.title, locale), scene.iconPath);
    const next = neighbour(1);
    put(SLOTS.nextUp, next ? `${tr("nextUp", locale)}\n${localize(next.title, locale)}` : tr("done", locale), next?.iconPath);
    const tags = [...registry.tags.values()].sort((a, b) => Number(scene.tags.includes(b.id)) - Number(scene.tags.includes(a.id)));
    tags.slice(0, LIMITS.sidebar).forEach((tag, i) => put(SLOTS.sidebar + i, localize(tag.title, locale), tag.iconPath,
      { type: "page", page: { kind: "tag", id: tag.id, page: 0 } }, { active: scene.tags.includes(tag.id) }));
    scene.timeline.keyframes.forEach((keyframe, i) => put(SLOTS.keyframes + i,
      `${tr("step", locale)} ${i + 1}${localize(keyframe.label, locale) ? ` · ${localize(keyframe.label, locale)}` : ""}`,
      "textures/empty", { type: "seek", tick: keyframe.tick }));
    token = progressToken(scene, clock);
    if (!clock.playing) body = tr("native", locale);
  } else {
    const entries = pageEntries(indexEntries(registry, page), page.page);
    const item = page.kind === "item" ? registry.byItem.get(page.id)?.[0] : undefined;
    const title = page.kind === "tag" ? localize(registry.tags.get(page.id)?.title, locale)
      : page.kind === "item" ? `${localize(item?.itemTitle ?? item?.title, locale)} · ${tr("scenes", locale)}` : tr(page.kind, locale);
    put(SLOTS.header, title, page.kind === "tag" ? registry.tags.get(page.id)?.iconPath
      : item ? item.iconPath : UI_ICON(page.kind === "tags" ? "tags" : "items"));
    entries.entries.forEach((entry, i) => put(SLOTS.cards + i,
      `${localize(entry.title, locale)}\n§7${localize(entry.description, locale)}`, entry.iconPath,
      { type: "page", page: entry.target, selected: entry.id }, { active: page.selected === entry.id }));
    put(SLOTS.pagePrevious, tr("pagePrevious", locale), UI_ICON("prev"), { type: "paginate", page: entries.page - 1 }, { disabled: entries.page === 0 });
    put(SLOTS.pageNext, tr("pageNext", locale), UI_ICON("next"), { type: "paginate", page: entries.page + 1 }, { disabled: entries.page + 1 >= entries.pages });
    body = `${tr("page", locale)} ${entries.page + 1} / ${entries.pages}`;
  }
  put(SLOTS.status, token, "textures/empty");
  return {
    title: `${TITLE_MARKER}|${page.kind}|${scene?.id ?? ""}|${token}|${isScene && clock.finished ? "done|" : ""}`,
    body, subtitle: tr(isScene ? "ponder" : "scenes", locale), slots, scene,
  };
}
