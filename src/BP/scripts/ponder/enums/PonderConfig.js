// 脚本与 RP/ui/server_form.json 共享的约定，见 docs/UI_PROTOCOL.md。
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
  entities: 192, stageEntities: 48, animatedBlocks: 64, nativeEntities: 128, particleEmissions: 128,
  sidebar: 6, indexPageSize: 8,
  formBusyRetries: 3,
});
export const PALETTE = Object.freeze({
  white: 0xeeeeee, black: 0x221111, red: 0xff5d6c, green: 0x8cba51,
  blue: 0x5f6caf, slow: 0x22ff22, medium: 0x0084ff, fast: 0xff55ff,
  input: 0x7fcde0, output: 0xddc166,
});
// 表单按钮的固定序号。JSON UI 按序号读取，两边必须同步。
export const SLOTS = Object.freeze({
  previous: 0, close: 1, next: 2, replay: 3, comfy: 4, back: 5,
  header: 6, nextUp: 7,
  sidebar: 8, // 8..13，最多 LIMITS.sidebar 个
  keyframes: 14, // 14..37，最多 LIMITS.keyframes 个，每个关键帧一个透明按钮
  cards: 38, // 38..45，索引页每页 LIMITS.indexPageSize 张卡片
  pagePrevious: 46, pageNext: 47,
  items: 48, tags: 49, // 场景页侧栏之外的索引入口，索引页和场景页共用
  count: 50,
});
// 标题里的段标记。
export const SCENE_MARKER = "|scene|";
export const ANIMATE_FORWARD = "§6§r";
export const ANIMATE_REVERSE = "§7§r";
// 关键帧按钮文本前缀，后面紧跟三位像素位置和 ^。
export const KEYFRAME_MARKER = "§0§r§2§r";
export const FINISHED_MARKER = "§5§r";
// 档位用一个字符编码，避免多位数字被当作多个格式码。
export const TIER_CODES = Object.freeze({ 4: "a", 8: "b", 12: "c", 16: "d", 24: "e" });
export const TIER_MARKER = tier => `§4§r§${TIER_CODES[tier]}§r`;

// 淡入淡出时长，取自 Java：区域 15 tick，文字窗口前后各 5 tick。
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
