import { add, clamp, dot, mul, orbit, sub } from "../VecHelper.js";
import { themeColor, wrapText } from "./TextWindowElement.js";
import { localize, sharedText } from "../registration/PonderLocalization.js";

export const CAMERA_FOV = 48;
export const overlaps2D = (a, b, gap = 0) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap &&
  a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

export function projection(camera) {
  const basis = orbit(camera), depth = camera.distance * .82;
  return {
    ...basis, depth,
    project(point) {
      const delta = sub(point, basis.location);
      const z = Math.max(.1, dot(delta, basis.forward));
      return { x: dot(delta, basis.right) * depth / z, y: dot(delta, basis.up) * depth / z };
    },
    point(x, y, towardsCamera = 0) {
      return add(add(basis.location, mul(basis.forward, depth - towardsCamera)),
        add(mul(basis.right, x), mul(basis.up, y)));
    },
  };
}
export function corners(box, blockBox = true) {
  const high = blockBox ? add(box.to, { x: 1, y: 1, z: 1 }) : box.to;
  return [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({
    x: i & 1 ? high.x : box.from.x,
    y: i & 2 ? high.y : box.from.y,
    z: i & 4 ? high.z : box.from.z,
  }));
}
export function boxEdges(box, blockBox = true) {
  const points = corners(box, blockBox), edges = [];
  for (let i = 0; i < 8; i++)
    for (const bit of [1, 2, 4]) if (!(i & bit)) edges.push([points[i], points[i | bit]]);
  return edges;
}
function projectedBounds(box, view) {
  const points = corners(box).map(p => view.project(p));
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
/** Java fades text in and out over five ticks with a squared curve. */
export function fadeAlpha(age, remaining, fade = 5) {
  const edge = Math.min(age, remaining);
  return edge >= fade ? 1 : Math.max(0, edge / fade) ** 2;
}
const outlineAlpha = (annotation, tick) => annotation.duration ? fadeAlpha(tick - annotation.at, annotation.expires - tick, 3) * .95 : .95;
/** 值输入框：第一 tick 是点，之后直接膨胀到 expands（Java HighlightValueBoxInstruction）。 */
function valueBoxAt(annotation, tick) {
  const c = annotation.location, e = tick > annotation.at ? annotation.expands : { x: 0, y: 0, z: 0 };
  return { from: { x: c.x - e.x, y: c.y - e.y, z: c.z - e.z }, to: { x: c.x + e.x, y: c.y + e.y, z: c.z + e.z } };
}
/** 操作提示窗口里的前缀文字（Java 的 sneak_and / ctrl_and）；没有前缀时为空。 */
export function controlText(annotation, locale) {
  return annotation.sneaking ? sharedText("sneak_and", locale) : annotation.ctrl ? sharedText("ctrl_and", locale) : "";
}
/**
 * Labels live on a world-space camera plane, not in screen/GUI-scaled slots.
 * Score candidates relative to the target and projected structure. Use a 4:3
 * composition envelope; wider displays simply reveal more of the room.
 */
export function layoutAnnotations(scene, state, locale, tracked = new Map()) {
  const view = projection(state.camera), scale = scene.textScale;
  const halfH = view.depth * Math.tan(CAMERA_FOV * Math.PI / 360);
  const halfW = halfH * 4 / 3;
  const area = { x: -halfW + .7, y: -halfH + 3.2, w: halfW * 2 - 1.4, h: halfH * 2 - 6.4 };
  const structure = projectedBounds(scene.contentBounds ?? scene.bounds, view);
  const occupied = [], panels = [], outlines = [];
  for (const annotation of state.overlays.values()) {
    const entityBox = tracked.get(annotation.track);
    if (annotation.op === "outline" || annotation.op === "valueBox") {
      const box = entityBox ? { from: sub(entityBox.center, entityBox.extent), to: add(entityBox.center, entityBox.extent) }
        : annotation.op === "valueBox" ? valueBoxAt(annotation, state.tick) : annotation.box;
      if (box) outlines.push({ annotation, edges: boxEdges(box, false), alpha: outlineAlpha(annotation, state.tick) });
      continue;
    }
    if (annotation.op === "line") {
      outlines.push({ annotation, edges: [[annotation.start, annotation.end]], alpha: outlineAlpha(annotation, state.tick) });
      continue;
    }
    const target = entityBox?.center ?? annotation.target ?? scene.focus;
    const anchor = view.project(target);
    const content = annotation.op === "controls" ? controlText(annotation, locale) : localize(annotation.text, locale);
    const text = wrapText(content, { width: annotation.maxWidth ?? 180, color: annotation.color });
    // Java InputWindowElement：图标 24、物品 24，有任一项时窗口高 24。没有调用 leftClick 等就没有图标。
    const hasIcon = annotation.op === "controls" && Boolean(annotation.action || annotation.iconPath);
    const iconUnits = annotation.op === "controls" ? 24 * (Number(hasIcon) + Number(Boolean(annotation.itemId))) : 0;
    const width = ((content ? text.width : 0) + 12 + iconUnits) * scale;
    const height = Math.max(content ? text.height + 10 : 0, iconUnits ? 24 : 0) * scale;
    const gap = 7 * scale, candidates = [];
    const sides = annotation.side === "auto" || !annotation.side
      ? (anchor.x < 0 ? ["left", "right", "top", "bottom"] : ["right", "left", "top", "bottom"])
      : [annotation.side, ...["left", "right", "top", "bottom"].filter(s => s !== annotation.side)];
    sides.forEach((side, preference) => {
      for (const shift of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
        let x, y;
        if (side === "left" || side === "right") {
          x = side === "left" ? structure.x - gap - width : structure.x + structure.w + gap;
          y = anchor.y - height / 2 + shift * (height + gap);
        } else {
          x = anchor.x - width / 2 + shift * (width + gap);
          y = side === "top" ? structure.y + structure.h + gap : structure.y - gap - height;
        }
        x = clamp(x, area.x, Math.max(area.x, area.x + area.w - width));
        y = clamp(y, area.y, Math.max(area.y, area.y + area.h - height));
        const rect = { x, y, w: width, h: height };
        const collisions = occupied.filter(r => overlaps2D(rect, r, gap)).length;
        const touchesStructure = overlaps2D(rect, structure, gap);
        const score = collisions * 10000 + Number(touchesStructure) * 100 +
          Math.hypot(x + width / 2 - anchor.x, y + height / 2 - anchor.y) + preference * .6;
        candidates.push({ rect, score, side });
      }
    });
    // Java never rejects a text window; when nothing is free it simply overlaps, so take the best candidate.
    const chosen = candidates.sort((a, b) => a.score - b.score)[0], rect = chosen.rect;
    occupied.push(rect);
    const attachment = {
      x: clamp(anchor.x, rect.x, rect.x + rect.w),
      y: clamp(anchor.y, rect.y, rect.y + rect.h),
    };
    // Content-aware attachment and elbow, instead of a fixed-length pointer.
    const elbow = { x: (anchor.x + attachment.x) / 2, y: attachment.y };
    const age = state.tick - annotation.at;
    const remaining = annotation.expires - state.tick;
    const alpha = fadeAlpha(age, remaining);
    panels.push({ annotation, text, rect, side: chosen.side, alpha: Math.max(0, alpha),
      color: themeColor(annotation.color), target, iconUnits,
      center: view.point(rect.x + rect.w / 2, rect.y + rect.h / 2),
      textOrigin: view.point(rect.x + (6 + iconUnits) * scale, rect.y + rect.h - 5 * scale, .035),
      line: [target, view.point(elbow.x, elbow.y, -.025), view.point(attachment.x, attachment.y, -.025)] });
  }
  return { view, panels, outlines, area };
}
