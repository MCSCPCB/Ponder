import {
  ACTIVE, ANIMATE_FORWARD, ANIMATE_REVERSE, DISABLED, FINISHED_MARKER, HIDDEN,
  KEYFRAME_MARKER, LIMITS, SCENE_MARKER, SLOTS, TIER_MARKER, TITLE_MARKER,
} from "../../enums/PonderConfig.js";
import { localize, raw, translate, ui } from "../registration/PonderLocalization.js";
import { indexEntries, itemName, pageEntries, scenePage, scenesInContext } from "./PonderNavigation.js";
import { keyframeX, progressStep, progressTier } from "./PonderProgressBar.js";

const ICON = name => `textures/ui/ponder/icon_${name}`;
const EMPTY = "textures/empty";

/**
 * 固定槽位的表单数据。按钮文本是数据，动作表只在脚本里，不执行字符串。
 * 固定界面文字以 Java 的 lang 键交给客户端翻译；场景文字由脚本按语言给出。
 * @param {import("../registration/PonderSceneRegistry.js").registry} registry
 */
export function buildFormModel(registry, nav, clock, locale, { previousStep } = {}) {
  const page = nav.current, isScene = page.kind === "scene";
  const scene = isScene ? registry.getScene(page.sceneId) : undefined;
  const slots = Array.from({ length: SLOTS.count }, () => ({ text: HIDDEN, icon: EMPTY, action: undefined }));
  const put = (index, text, icon, action, { disabled = false, active = false } = {}) => {
    slots[index] = { text: raw(disabled ? DISABLED : active ? ACTIVE : "", text), icon: icon ?? EMPTY, action: disabled ? undefined : action };
  };
  put(SLOTS.close, translate(ui("close")), ICON("close"), { type: "close" });
  if (nav.canBack) put(SLOTS.back, translate(ui("think_back")), ICON("back"), { type: "back" });
  put(SLOTS.items, translate(ui("index_title")), ICON("items"), { type: "page", page: { kind: "items", page: 0 } }, { active: page.kind === "items" });
  put(SLOTS.tags, translate(ui("welcome")), ICON("tags"), { type: "page", page: { kind: "tags", page: 0 } }, { active: page.kind === "tags" });
  let title = `${TITLE_MARKER}`, body = "";
  if (isScene) {
    const scenes = scenesInContext(registry, page.context), index = scenes.findIndex(s => s.id === scene.id);
    for (const { slot, direction, label, icon } of [
      { slot: SLOTS.previous, direction: -1, label: "previous", icon: "prev" },
      { slot: SLOTS.next, direction: 1, label: "next", icon: "next" },
    ]) {
      const neighbour = scenes[index + direction];
      put(slot, translate(ui(label)), ICON(icon), neighbour && { type: "page", page: scenePage(neighbour.id, page.context) },
        { disabled: !neighbour, active: direction > 0 && clock.finished && Boolean(neighbour) });
    }
    put(SLOTS.replay, translate(ui("replay")), ICON("replay"), { type: "replay" });
    put(SLOTS.comfy, translate(ui("slow_text")), ICON("comfy"), { type: "comfy" }, { active: clock.comfy });
    put(SLOTS.header, localize(scene.title, locale), scene.iconPath);
    const next = scenes[index + 1];
    if (next && scene.nextUpEnabled) put(SLOTS.nextUp, raw(translate(ui("next_up")), "\n", localize(next.title, locale)), next.iconPath);
    const tags = [...registry.tags.values()].sort((a, b) => Number(scene.tags.includes(b.id)) - Number(scene.tags.includes(a.id)));
    tags.slice(0, LIMITS.sidebar).forEach((tag, i) => put(SLOTS.sidebar + i, localize(tag.title, locale), tag.iconPath,
      { type: "page", page: { kind: "tag", id: tag.id, page: 0 } }, { active: scene.tags.includes(tag.id) }));
    scene.timeline.keyframes.forEach((keyframe, i) => put(SLOTS.keyframes + i,
      `${KEYFRAME_MARKER}${String(keyframeX(scene, i)).padStart(3, "0")}`, EMPTY,
      { type: "seek", tick: keyframe.tick }));
    const step = progressStep(scene, clock.tick);
    const animation = previousStep === undefined || previousStep === step ? ""
      : step > previousStep ? ANIMATE_FORWARD : ANIMATE_REVERSE;
    title += `${SCENE_MARKER}${TIER_MARKER(progressTier(scene))}${step}|${animation}${clock.finished ? FINISHED_MARKER : ""}`;
    return { title, body, slots, scene, step };
  }
  const entries = pageEntries(indexEntries(registry, page), page.page);
  const item = page.kind === "item" ? registry.byItem.get(page.id)?.[0] : undefined;
  const heading = page.kind === "tag" ? localize(registry.tags.get(page.id)?.title, locale)
    : page.kind === "item" ? itemName(page.id)
    : translate(ui(page.kind === "tags" ? "welcome" : "index_title"));
  put(SLOTS.header, heading, page.kind === "tag" ? registry.tags.get(page.id)?.iconPath : item ? item.iconPath : ICON(page.kind === "tags" ? "tags" : "items"));
  // A card shows its title: the item name for an item, the registered title for a tag or scene.
  const cardTitle = value => value?.translate || value?.rawtext ? value : localize(value, locale);
  entries.entries.forEach((entry, i) => put(SLOTS.cards + i, cardTitle(entry.title), entry.iconPath,
    { type: "page", page: entry.target, selected: entry.id }, { active: page.selected === entry.id }));
  put(SLOTS.pagePrevious, "", ICON("prev"), { type: "paginate", page: entries.page - 1 }, { disabled: entries.page === 0 });
  put(SLOTS.pageNext, "", ICON("next"), { type: "paginate", page: entries.page + 1 }, { disabled: entries.page + 1 >= entries.pages });
  title += `|index|`;
  // Java PonderIndexScreen: "Page n/m" only when the index paginates.
  if (entries.pages > 1) body = `Page ${entries.page + 1}/${entries.pages}`;
  return { title, body, slots, scene };
}
