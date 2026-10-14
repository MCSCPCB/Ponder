import { defineBlockStructure as block, defineStage as step, tiledBase } from "../factories.js";
import { bilingual as text } from "../../i18n.js";
const base = tiledBase(8);
export const redstoneLampDemoScene = {
  id: "redstone_lamp_demo", title: text("点亮红石灯", "Lighting a redstone lamp"),
  itemTitle: text("红石灯", "Redstone lamp"),
  description: text("真实红石信号与教学时间轴相互独立。", "Real redstone simulation and the tutorial run independently."),
  iconPath: "textures/blocks/redstone_lamp_off", entryItems: ["minecraft:redstone_lamp"],
  stagePresetId: "demo_8x8x8", tags: ["redstone", "basics"], order: 2,
  initial: base.map(b => b.id), structures: [...base,
    block("lamp", "minecraft:redstone_lamp", { x: 3, y: 1, z: 3 }),
    block("power", "minecraft:redstone_block", { x: 2, y: 1, z: 3 }),
    block("relay", "minecraft:redstone_lamp", { x: 4, y: 1, z: 3 }),
  ],
  stages: [
    step({ add: ["lamp"], target: { x: 3.5, y: 1.5, z: 3.5 },
      description: text("红石灯需要红石信号才能点亮。", "A redstone lamp needs a signal to light up.") }),
    step({ add: ["power"], color: "input", target: { x: 2.5, y: 1.5, z: 3.5 },
      description: text("相邻红石块持续提供电源，由游戏原生红石逻辑更新灯的状态。", "An adjacent redstone block supplies power. Native redstone logic updates the lamp.") }),
    step({ add: ["relay"], color: "output", target: { x: 4.5, y: 1.5, z: 3.5 },
      description: text("红石灯是导体。暂停教学时，红石、水流和生物并不会暂停。", "The lamp is conductive. Pausing the tutorial does not pause redstone, fluids or mobs.") }),
    step({ remove: ["power"], target: { x: 3.5, y: 1.5, z: 3.5 },
      description: text("移除电源后观察熄灭。接下来的场景展示脚本定义的区域恢复。", "Remove the power and watch the light go out. The next scene demonstrates region restoration.") }),
  ],
};
export const lampStatesScene = {
  ...redstoneLampDemoScene, id: "lamp_states", order: 3,
  title: text("恢复与重播", "Restore and replay"),
  description: text("同一物品关联的第二个场景。", "A second scene for the same item."),
  stages: [
    step({ add: ["lamp", "power"], description: text("同一物品可以注册多个有序场景。", "An item can have several ordered scenes.") }),
    step({ target: { x: 3.5, y: 1.5, z: 3.5 }, description: text("替换方块，再跳转到关键帧，比较脚本控制的状态。", "Replace a block, then seek to a keyframe to compare authored states."),
      instructions: [{ op: "block", position: { x: 3, y: 1, z: 3 }, blockId: "minecraft:glass" }] }),
    step({ description: text("恢复原始定义不会恢复任意历史红石状态；世界模拟重新接管。", "Restoring the blueprint is not a rewind of redstone history. Native simulation takes over."),
      instructions: [{ op: "restore", region: { from: { x: 3, y: 1, z: 3 }, to: { x: 3, y: 1, z: 3 } } }] }),
  ],
};
