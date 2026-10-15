// 脚本与 RP/ui/server_form.json 共享的约定，两边必须同步。
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
export const BUTTON_MARKERS = {
  hidden: "§3§r§0§r",
  prev: "§3§r§1§r",
  next: "§3§r§2§r",
  restart: "§3§r§3§r",
  close: "§3§r§4§r",
};
export const MAX_SIDE_ICON_COUNT = 6;

// 舞台尺寸预设。uiTitleMarker 选中 server_form.json 里对应的进度条分档。
// focus 是摄像机注视的方块（局部坐标），摄像机对准它的中心。
export const STAGE_PRESETS = {
  demo_8x8x8: {
    uiTitleMarker: "§4§r§1§r",
    size: { x: 8, y: 8, z: 8 },
    focus: { x: 3, y: 3, z: 3 },
  },
  demo_16x16x16: {
    uiTitleMarker: "§4§r§2§r",
    size: { x: 16, y: 16, z: 16 },
    focus: { x: 7, y: 4, z: 7 },
  },
  demo_2x3x2: {
    uiTitleMarker: "§4§r§3§r",
    size: { x: 2, y: 3, z: 2 },
    focus: { x: 0, y: 1, z: 0 },
  },
  /*注释
  demo_XxYxZ: {
    uiTitleMarker: "SIZE_MARKER",
    size: { x: X, y: Y, z: Z }, // 舞台宽、高、深
    focus: { x: FOCUS_X, y: FOCUS_Y, z: FOCUS_Z }, // 摄像机注视的方块，相对舞台
  },
  */
};

export const SESSION_TAG = "ponder:owned";
export const JOURNAL_KEY = "ponder:leases_v3";
export const PLAYER_STATE_KEY = "ponder:restore_v2";
export const LIGHT_BLOCK = "minecraft:light_block_15";
export const SHELL_BLOCK = "minecraft:white_concrete";
// 舞台网格的起点，致敬边境之地起始坐标 12,550,821 的尾数。
export const STAGE_BASE = 100821;
// 舞台的任何一格都不超过这个坐标，避免远距离精度问题。
export const STAGE_MAX_COORD = 125508;
export const CAMERA_FOV = 48;
export const LIMITS = Object.freeze({
  // 同时进行的思索数量上限。
  sessions: 4,
  allocationAttempts: 24, safetyBuffer: 3, playerClearance: 96,
  stageVolume: 1200000, nativeEntities: 128,
  formBusyRetries: 3,
});
