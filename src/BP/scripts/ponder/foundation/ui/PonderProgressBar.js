/**
 * 进度条分档。JSON UI 的动画时长是常量，脚本无法传入，所以预置若干档，
 * 每档把条分成等长的段，每段一个固定时长的尺寸动画。
 */
export const PROGRESS_TIERS = Object.freeze([4, 8, 12, 16, 24]);
export const PROGRESS_WIDTH = 224;

/** 选能容纳全部关键帧的最小档。 */
export function progressTier(scene) {
  const needed = scene.timeline.keyframes.length;
  return PROGRESS_TIERS.find(tier => tier >= needed) ?? PROGRESS_TIERS.at(-1);
}

/**
 * 当前停在第几段（0..tier）。关键帧是进度条上的刻度：
 * 第 n 个关键帧对应第 n+1 段的终点，播完则填满。
 */
export function progressStep(scene, tick) {
  if (tick >= scene.timeline.counted) return progressTier(scene);
  const tier = progressTier(scene), { keyframes } = scene.timeline;
  let index = 0;
  for (let i = 0; i < keyframes.length; i++) if (keyframes[i].tick <= tick) index = i;
  const start = keyframes[index].tick, end = keyframes[index + 1]?.tick ?? scene.timeline.counted;
  const span = tier / keyframes.length;
  return Math.min(tier - 1, Math.floor(span * index + span * (tick - start) / Math.max(1, end - start)));
}

/** 关键帧在进度条上的横向位置（0..PROGRESS_WIDTH 像素）。 */
export const keyframeX = (scene, index) =>
  Math.round(scene.timeline.keyframes[index].tick / scene.timeline.counted * PROGRESS_WIDTH);

/**
 * Java 的 getHoveredKeyframeIndex：点击位置对应的时间，取其之前最近的关键帧；
 * 离结尾比离最后一个关键帧近一半以上时，跳到结尾。
 */
export function clickedKeyframe(scene, x) {
  const total = scene.timeline.counted, at = x / (PROGRESS_WIDTH + 4) * total;
  const { keyframes } = scene.timeline;
  const last = keyframes.at(-1).tick, toEnd = total - at, toLast = at - last;
  if (toEnd > 0 && toEnd < toLast / 2) return keyframes.length;
  let index = -1;
  for (let i = 0; i < keyframes.length; i++) { if (keyframes[i].tick > at) break; index = i; }
  return index;
}
