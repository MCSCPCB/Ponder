// Shared by the pack and build tools. A stage never uses player/body coordinates.
export const TITLE_MARKER = "§0§r§1§r";
export const HIDDEN = "§0§r§0§r";
export const DISABLED = "§8§r§8§r";
export const ACTIVE = "§a§r§a§r";
export const SESSION_TAG = "ponder:owned";
export const JOURNAL_KEY = "ponder:leases_v2";
export const PLAYER_STATE_KEY = "ponder:restore_v2";
export const LIGHT_BLOCK = "minecraft:light_block_15";
export const SHELL_BLOCK = "minecraft:black_concrete";
export const TICKS_PER_SECOND = 20;
export const LIMITS = Object.freeze({
  sessions: 4, allocationAttempts: 24, safetyBuffer: 3, playerClearance: 96,
  blocks: 16384, stageVolume: 1200000, sceneTicks: 3600, sceneEvents: 512,
  keyframes: 24, annotations: 6, textCharacters: 512, textLines: 12,
  entities: 192, stageEntities: 48, nativeEntities: 128, particleEmissions: 128,
  sidebar: 6, indexPageSize: 8,
  formBusyRetries: 3,
});
export const PALETTE = Object.freeze({
  white: 0xeeeeee, black: 0x221111, red: 0xff5d6c, green: 0x8cba51,
  blue: 0x5f6caf, slow: 0x22ff22, medium: 0x0084ff, fast: 0xff55ff,
  input: 0x7fcde0, output: 0xddc166,
});
// Fixed collection indices are a protocol shared with generated JSON UI.
export const SLOTS = Object.freeze({
  previous: 0, close: 1, next: 2, replay: 3, play: 4, comfy: 5,
  back: 6, items: 7, tags: 8, header: 9, status: 10, nextUp: 11,
  sidebar: 12, keyframes: 18, cards: 42, pagePrevious: 50, pageNext: 51,
  count: 52,
});

// Fade timings follow Java: sections fade over 15 ticks, text and input windows over 5 ticks each side.
export const FADE_IN_TICKS = 15;
export const FADE_TICKS = 15;
export const TEXT_FADE_TICKS = 5;
export const DEFAULT_KEYFRAME_DELAY = 6;
export const DIRECTION_VECTORS = Object.freeze({
  none: undefined,
  up: { x: 0, y: 1, z: 0 }, down: { x: 0, y: -1, z: 0 },
  north: { x: 0, y: 0, z: -1 }, south: { x: 0, y: 0, z: 1 },
  west: { x: -1, y: 0, z: 0 }, east: { x: 1, y: 0, z: 0 },
});
