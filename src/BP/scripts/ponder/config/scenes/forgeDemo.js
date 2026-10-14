import { defineBlockStructure as block, defineBoxStructure as box, defineStage as step, tiledBase } from "../factories.js";
import { bilingual as text } from "../../i18n.js";
const base = tiledBase(12);
export const forgeDemoScene = {
  id: "forge_demo", title: text("熔炼工坊", "Forge walkthrough"),
  itemTitle: text("烈焰棒", "Blaze rod"),
  description: text("组合方块、教学实体、掉落物与运镜。", "Combine blocks, teaching entities, items and camera motion."),
  iconPath: "textures/blocks/furnace_front_off", entryItems: ["minecraft:blaze_rod"],
  stagePresetId: "demo_16x16x16", focus: { x: 5.5, y: 2.5, z: 5.5 },
  tags: ["crafting", "basics"], order: 1, initial: base.map(b => b.id),
  structures: [
    ...base, box("hearth", "minecraft:stone_bricks", { x: 3, y: 1, z: 3 }, { x: 7, y: 1, z: 7 }),
    block("furnace", "minecraft:furnace", { x: 5, y: 2, z: 4 }, { "minecraft:cardinal_direction": "south" }),
    block("anvil", "minecraft:anvil", { x: 7, y: 2, z: 5 }),
    box("chimney", "minecraft:bricks", { x: 4, y: 2, z: 6 }, { x: 6, y: 5, z: 6 }),
  ],
  air: [{ from: { x: 3, y: 2, z: 3 }, to: { x: 8, y: 4, z: 5 } }],
  stages: [
    step({ add: ["hearth"], target: { x: 5.5, y: 1.5, z: 5.5 },
      description: text("先搭建工坊的底座。演示区外壳和照明由会话管理。", "Start with a forge base. The session provides an enclosed, illuminated demonstration area.") }),
    step({ add: ["furnace"], color: "input", target: { x: 5.5, y: 2.5, z: 4.5 },
      description: text("熔炉的朝向由方块状态指定。回退恢复的是脚本定义的状态。", "Block states set the furnace's facing. Seeking restores authored state."),
      instructions: [{ op: "controls", id: "slot_hint", action: "slot", target: { x: 5.5, y: 2.5, z: 4.5 }, iconPath: "textures/items/iron_ingot", duration: 70, side: "left" }] }),
    step({ add: ["anvil", "chimney"], target: { x: 7.5, y: 2.5, z: 5.5 },
      description: text("显示更多区域。轮廓框的目标由脚本指定，不依赖鼠标识别。", "Reveal more of the build. Scripts choose outline targets; there is no world picking."),
      instructions: [{ op: "outline", id: "anvil_outline", region: { from: { x: 7, y: 2, z: 5 }, to: { x: 7, y: 2, z: 5 } }, color: "output", duration: 95 }] }),
    step({ color: "output", target: { x: 6, y: 3, z: 4 },
      description: text("教学掉落物有自己的生命周期。跳转不会重复触发瞬时粒子。", "Teaching items have a managed lifetime. Seeking does not replay one-shot particles."),
      instructions: [{ op: "spawn", id: "ingot", itemId: "minecraft:iron_ingot", position: { x: 6, y: 3, z: 4 }, duration: 180 },
        { op: "particle", particleId: "minecraft:basic_smoke_particle", position: { x: 5.5, y: 5.5, z: 6.5 } }] }),
    step({ target: { x: 6, y: 2, z: 4 }, description: text("包围盒可跟踪教学实体。原生物理仍然正常运行。", "An outline can track a teaching entity. Native physics continues to run."),
      instructions: [{ op: "outline", id: "item_outline", track: "ingot", color: "green", duration: 75 },
        { op: "camera", yaw: 80, duration: 80 }] }),
    step({ description: text("可以重播，或从主题索引继续探索。退出时会清理整个会话。", "Replay the lesson or explore the topic index. Exiting cleans up the session.") }),
  ],
};
