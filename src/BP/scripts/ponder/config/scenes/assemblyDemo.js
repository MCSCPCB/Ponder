import { defineBlockStructure as block, defineBoxStructure as box, defineStage as step, tiledBase } from "../factories.js";
import { bilingual as text } from "../../i18n.js";
const base = tiledBase(8);
export const assemblyDemoScene = {
  id: "assembly_demo", title: text("结构的装配与观察", "Assembly and observation"),
  itemTitle: text("木棍", "Stick"),
  description: text("逐步展示真实方块，并学习时间轴操作。", "Build with real blocks and explore the timeline."),
  iconPath: "textures/items/stick", entryItems: ["minecraft:stick"],
  stagePresetId: "demo_8x8x8", tags: ["basics", "crafting"], order: 0,
  initial: base.map(b => b.id),
  structures: [
    ...base, box("pillars", "minecraft:stone_bricks", { x: 2, y: 1, z: 2 }, { x: 2, y: 3, z: 4 }),
    block("table", "minecraft:crafting_table", { x: 4, y: 1, z: 3 }),
    box("roof", "minecraft:oak_planks", { x: 2, y: 4, z: 2 }, { x: 5, y: 4, z: 4 }),
  ],
  regions: { wall: { from: { x: 2, y: 1, z: 2 }, to: { x: 2, y: 3, z: 4 } } },
  stages: [
    step({ add: ["pillars"], target: { x: 2.5, y: 2, z: 3 },
      description: text("结构由真实方块构成。关键帧按钮可以回到教学中的任意步骤。", "These are real blocks. Select a keyframe to return to an earlier tutorial step."),
      instructions: [{ op: "outline", id: "wall_outline", region: { from: { x: 2, y: 1, z: 2 }, to: { x: 2, y: 3, z: 4 } }, color: "green", duration: 90 }] }),
    step({ add: ["table"], target: { x: 4.5, y: 1.5, z: 3.5 },
      description: text("工作台用于合成。右侧的舒适阅读按钮只会放慢教学时间轴。", "Use a crafting table for crafting. Comfortable reading slows the tutorial, not the world."),
      instructions: [{ op: "controls", id: "use_table", action: "use", target: { x: 4.5, y: 1.5, z: 3.5 }, iconPath: "textures/items/stick", duration: 70, side: "left" }] }),
    step({ add: ["roof"], color: "input", target: { x: 3.5, y: 4.5, z: 3.5 },
      description: text("镜头围绕结构移动，文字与指示线跟随相机构图，而玩家始终留在原地。", "The camera orbits the structure. Labels follow its framing while you stay in place."),
      instructions: [{ op: "camera", yaw: 100, duration: 80 }] }),
    step({ target: { x: 2.5, y: 2, z: 3 }, description: text("区域可以立即隐藏或恢复。这里不使用实体伪方块或平滑移动。", "Regions can be hidden or restored instantly, without fake block entities or block sliding."),
      instructions: [{ op: "region", id: "wall", visible: false }] }),
  ],
};
