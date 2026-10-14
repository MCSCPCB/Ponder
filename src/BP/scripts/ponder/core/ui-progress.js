import { hasTextAt } from "./timeline.js";

export const PROGRESS_WIDTH = 224;
export const progressPixel = (scene, tick) =>
  Math.max(0, Math.min(PROGRESS_WIDTH, Math.floor(tick / scene.timeline.duration * PROGRESS_WIDTH)));
export const tickForPixel = (scene, pixel) =>
  Math.ceil(pixel / PROGRESS_WIDTH * scene.timeline.duration);

/**
 * Build-time, finite animation presets. No string-to-number coercion, dynamic
 * animation duration, or mutation of an already open ActionForm is required.
 * Adjacent presets share their suffix instead of duplicating entire timelines.
 */
export function progressSchedule(scene, comfy = false) {
  const elapsed = [0];
  for (let t = 0; t < scene.timeline.duration; t++)
    elapsed.push(elapsed.at(-1) + (comfy && hasTextAt(scene, t) ? 3 : 1));
  return Array.from({ length: PROGRESS_WIDTH + 1 }, (_, pixel) => {
    const tick = tickForPixel(scene, pixel);
    const next = tickForPixel(scene, Math.min(PROGRESS_WIDTH, pixel + 1));
    return {
      pixel, tick, seconds: (elapsed[next] - elapsed[tick]) / 20,
      remaining: (elapsed.at(-1) - elapsed[tick]) / 20,
    };
  });
}
