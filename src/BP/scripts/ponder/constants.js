export const OVERWORLD_ID = "minecraft:overworld";
/*注释
//同一个使用相同
// TITLE_MARKER，
// PROGRESS_MARKER，
// ANIMATE_PROGRESS_MARKER，
// REVERSE_PROGRESS_MARKER，
// ANIMATE_PREVIEW_MARKER，
// HEADER_TITLE_MARKER，
// SLOT_MARKERS，
// DEFAULT_BUBBLE_SLOT，
// BUBBLE_SLOT_IDS，
// BUTTON_MARKERS，
// MAX_SIDE_ICON_COUNT
*/
export const TITLE_MARKER = "§0§r§1§r";
export const PROGRESS_MARKER = "§2§r";
export const ANIMATE_PROGRESS_MARKER = "§6§r";
export const REVERSE_PROGRESS_MARKER = "§7§r";
export const ANIMATE_PREVIEW_MARKER = "§8§r";
export const HEADER_TITLE_MARKER = "§a§r§0§r";
export const SLOT_MARKERS = {
  top: "§9§r§0§r",
  middle: "§9§r§1§r",
  bottom: "§9§r§2§r",
};
export const DEFAULT_BUBBLE_SLOT = "top";
export const BUBBLE_SLOT_IDS = Object.freeze(Object.keys(SLOT_MARKERS));
export const BUTTON_MARKERS = {
  hidden: "§3§r§0§r",
  prev: "§3§r§1§r",
  next: "§3§r§2§r",
  restart: "§3§r§3§r",
  close: "§3§r§4§r",
};
export const MAX_SIDE_ICON_COUNT = 6;
export const DEFAULT_SCENE_MESSAGES = {
  inUse: "The Ponder demo is already in use.",
  invalidDimension: "This demo currently only works in the overworld.",
  missingStages: "This Ponder demo has no configured stages.",
};
