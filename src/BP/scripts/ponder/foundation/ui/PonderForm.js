import {
  ACTIVE, ANIMATE_FORWARD, ANIMATE_REVERSE, BUBBLE_SLOT_MARKER, DISABLED, FINISHED_MARKER, HIDDEN,
  KEYFRAME_MARKER, LIMITS, SCENE_MARKER, SLOTS, TIER_MARKER, TITLE_MARKER,
} from "../../enums/PonderConfig.js";
import { localize, tr } from "../registration/PonderLocalization.js";
import { indexEntries, pageEntries, scenePage, scenesInContext } from "./PonderNavigation.js";
import { keyframeX, progressStep, progressTier } from "./PonderProgressBar.js";
import { stateAt } from "../instruction/PonderSchedule.js";

const ICON = name => `textures/ui/ponder/icon_${name}`;
const EMPTY = "textures/empty";

/** 当前窗口里正在显示的第一段文字，作为说明气泡内容。 */
function bubbleOf(scene, tick, locale) {
  for (const overlay of stateAt(scene, tick).overlays.values())
    if (overlay.op === "text") return { text: localize(overlay.text, locale), slot: overlay.slot ?? "top" };
  return undefined;
}

/**
 * 固定槽位的表单数据。按钮文本是数据，动作表只在脚本里，不执行字符串。
 * @param {import("../registration/PonderSceneRegistry.js").registry} registry
 */
export function buildFormModel(registry, nav, clock, locale, { previousStep } = {}) {
  const page = nav.current, isScene = page.kind === "scene";
  const scene = isScene ? registry.getScene(page.sceneId) : undefined;
  const slots = Array.from({ length: SLOTS.count }, () => ({ text: HIDDEN, icon: EMPTY, action: undefined }));
  const put = (index, text, icon, action, { disabled = false, active = false } = {}) => {
    slots[index] = { text: `${disabled ? DISABLED : active ? ACTIVE : ""}${text}`, icon: icon ?? EMPTY, action: disabled ? undefined : action };
  };
  put(SLOTS.close, tr("close", locale), ICON("close"), { type: "close" });
  if (nav.canBack) put(SLOTS.back, tr("back", locale), ICON("back"), { type: "back" });
  put(SLOTS.items, tr("items", locale), ICON("items"), { type: "page", page: { kind: "items", page: 0 } }, { active: page.kind === "items" });
  put(SLOTS.tags, tr("tags", locale), ICON("tags"), { type: "page", page: { kind: "tags", page: 0 } }, { active: page.kind === "tags" });
  let title = `${TITLE_MARKER}`, body = "";
  if (isScene) {
    const scenes = scenesInContext(registry, page.context), index = scenes.findIndex(s => s.id === scene.id);
    for (const { slot, direction, label, icon } of [
      { slot: SLOTS.previous, direction: -1, label: "previous", icon: "prev" },
      { slot: SLOTS.next, direction: 1, label: "next", icon: "next" },
    ]) {
      const neighbour = scenes[index + direction];
      put(slot, tr(label, locale), ICON(icon), neighbour && { type: "page", page: scenePage(neighbour.id, page.context) },
        { disabled: !neighbour, active: direction > 0 && clock.finished && Boolean(neighbour) });
    }
    put(SLOTS.replay, tr("replay", locale), ICON("replay"), { type: "replay" });
    put(SLOTS.comfy, tr(clock.comfy ? "comfyOn" : "comfy", locale), ICON("comfy"), { type: "comfy" }, { active: clock.comfy });
    put(SLOTS.header, localize(scene.title, locale), scene.iconPath);
    const next = scenes[index + 1];
    if (next && scene.nextUpEnabled) put(SLOTS.nextUp, `${tr("nextUp", locale)}\n${localize(next.title, locale)}`, next.iconPath);
    const tags = [...registry.tags.values()].sort((a, b) => Number(scene.tags.includes(b.id)) - Number(scene.tags.includes(a.id)));
    tags.slice(0, LIMITS.sidebar).forEach((tag, i) => put(SLOTS.sidebar + i, localize(tag.title, locale), tag.iconPath,
      { type: "page", page: { kind: "tag", id: tag.id, page: 0 } }, { active: scene.tags.includes(tag.id) }));
    scene.timeline.keyframes.forEach((keyframe, i) => put(SLOTS.keyframes + i,
      `${KEYFRAME_MARKER}${String(keyframeX(scene, i)).padStart(3, "0")}^${tr("step", locale)} ${i + 1}`, EMPTY,
      { type: "seek", tick: keyframe.tick }));
    const bubble = bubbleOf(scene, clock.tick, locale);
    if (bubble) put(SLOTS.bubble, bubble.text, EMPTY);
    const step = progressStep(scene, clock.tick);
    const animation = previousStep === undefined || previousStep === step ? ""
      : step > previousStep ? ANIMATE_FORWARD : ANIMATE_REVERSE;
    title += `${SCENE_MARKER}${TIER_MARKER(progressTier(scene))}${step}|${animation}${clock.finished ? FINISHED_MARKER : ""}${BUBBLE_SLOT_MARKER[bubble?.slot ?? "top"]}`;
    body = scene.id;
    return { title, body, slots, scene, step };
  }
  const entries = pageEntries(indexEntries(registry, page), page.page);
  const item = page.kind === "item" ? registry.byItem.get(page.id)?.[0] : undefined;
  const heading = page.kind === "tag" ? localize(registry.tags.get(page.id)?.title, locale)
    : page.kind === "item" ? `${localize(item?.itemTitle ?? item?.title, locale)} · ${tr("scenes", locale)}` : tr(page.kind, locale);
  put(SLOTS.header, heading, page.kind === "tag" ? registry.tags.get(page.id)?.iconPath : item ? item.iconPath : ICON(page.kind === "tags" ? "tags" : "items"));
  entries.entries.forEach((entry, i) => put(SLOTS.cards + i,
    `${localize(entry.title, locale)}\n§7${localize(entry.description, locale)}`, entry.iconPath,
    { type: "page", page: entry.target, selected: entry.id }, { active: page.selected === entry.id }));
  put(SLOTS.pagePrevious, tr("pagePrevious", locale), ICON("prev"), { type: "paginate", page: entries.page - 1 }, { disabled: entries.page === 0 });
  put(SLOTS.pageNext, tr("pageNext", locale), ICON("next"), { type: "paginate", page: entries.page + 1 }, { disabled: entries.page + 1 >= entries.pages });
  title += `|index|`;
  body = `${tr("page", locale)} ${entries.page + 1} / ${entries.pages}`;
  return { title, body, slots, scene };
}
