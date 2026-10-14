import { bilingual as text } from "../i18n.js";
export const PONDER_TAGS = [
  { id: "basics", title: text("基础教学", "Basics"), description: text("从结构与关键帧开始。", "Structures and tutorial keyframes."),
    iconPath: "textures/items/stick", order: 0 },
  { id: "redstone", title: text("红石", "Redstone"), description: text("真实世界中的红石信号。", "Signals in the live world."),
    iconPath: "textures/blocks/redstone_block", order: 1 },
  { id: "crafting", title: text("加工与装配", "Processing"), description: text("装配、熔炼与物品。", "Assembly, smelting and items."),
    iconPath: "textures/blocks/furnace_front_off", order: 2 },
];
