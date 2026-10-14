import { bilingual as text } from "../../foundation/registration/PonderLocalization.js";
import { checkerFloor, defineSchematic, place } from "../../foundation/SchematicLoader.js";

const schematic = () => defineSchematic({
  size: { x: 8, y: 8, z: 8 },
  entries: [
    ...checkerFloor(8),
    place("minecraft:redstone_lamp", { x: 3, y: 1, z: 3 }),
    place("minecraft:redstone_block", { x: 2, y: 1, z: 3 }),
    place("minecraft:redstone_lamp", { x: 4, y: 1, z: 3 }),
  ],
  air: [{ from: { x: 1, y: 1, z: 1 }, to: { x: 6, y: 6, z: 6 } }],
});

function lightLamp(scene, util) {
  const vec = util.vector();
  scene.title("redstone_lamp_demo", text("点亮红石灯", "Lighting a redstone lamp"));
  scene.configureBasePlate(0, 0, 8);
  scene.showBasePlate();
  scene.idle(10);

  scene.world().showSection(util.select().position(3, 1, 3), "down");
  scene.idle(15);
  scene.overlay().showText(70)
    .text(text("红石灯需要红石信号才能点亮。", "A redstone lamp needs a signal to light up."))
    .pointAt(vec.centerOf(3, 1, 3)).placeNearTarget().attachKeyFrame();
  scene.idle(80);

  scene.world().showSection(util.select().position(2, 1, 3), "east");
  scene.idle(15);
  scene.overlay().showText(80)
    .text(text("相邻红石块持续提供电源，由游戏原生红石逻辑更新灯的状态。",
      "An adjacent redstone block supplies power. Native redstone logic updates the lamp."))
    .colored("input").pointAt(vec.centerOf(2, 1, 3)).placeNearTarget().attachKeyFrame();
  scene.idle(90);

  scene.world().showSection(util.select().position(4, 1, 3), "west");
  scene.idle(15);
  scene.overlay().showText(80)
    .text(text("红石灯是导体。暂停教学时，红石、水流和生物并不会暂停。",
      "The lamp is conductive. Pausing the tutorial does not pause redstone, fluids or mobs."))
    .colored("output").pointAt(vec.centerOf(4, 1, 3)).placeNearTarget().attachKeyFrame();
  scene.idle(90);

  scene.world().hideSection(util.select().position(2, 1, 3), "west");
  scene.idle(20);
  scene.overlay().showText(80)
    .text(text("移除电源后观察熄灭。接下来的场景展示脚本定义的区域恢复。",
      "Remove the power and watch the light go out. The next scene demonstrates region restoration."))
    .pointAt(vec.centerOf(3, 1, 3)).placeNearTarget();
  scene.idle(90);
  scene.markAsFinished();
}

function restoreBlocks(scene, util) {
  const vec = util.vector();
  scene.title("lamp_states", text("恢复与重播", "Restore and replay"));
  scene.configureBasePlate(0, 0, 8);
  scene.showBasePlate();
  scene.idle(10);
  scene.world().showSection(util.select().fromTo(2, 1, 3, 3, 1, 3), "down");
  scene.idle(15);
  scene.overlay().showText(70)
    .text(text("同一物品可以注册多个有序场景。", "An item can have several ordered scenes."))
    .pointAt(vec.centerOf(3, 1, 3)).placeNearTarget().attachKeyFrame();
  scene.idle(80);

  scene.world().setBlock(util.grid().at(3, 1, 3), { blockId: "minecraft:glass" }, true);
  scene.overlay().showText(70)
    .text(text("替换方块，再跳转到关键帧，比较脚本控制的状态。",
      "Replace a block, then seek to a keyframe to compare authored states."))
    .pointAt(vec.centerOf(3, 1, 3)).placeNearTarget().attachKeyFrame();
  scene.idle(80);

  scene.world().restoreBlocks(util.select().position(3, 1, 3));
  scene.overlay().showText(70)
    .text(text("恢复原始定义不会恢复任意历史红石状态；世界模拟重新接管。",
      "Restoring the blueprint is not a rewind of redstone history. Native simulation takes over."))
    .pointAt(vec.centerOf(3, 1, 3)).placeNearTarget();
  scene.idle(80);
  scene.markAsFinished();
}

const lampTitle = text("红石灯", "Redstone lamp");
export const redstoneLampDemo = {
  id: "redstone_lamp_demo", schematic, storyboard: lightLamp,
  title: text("点亮红石灯", "Lighting a redstone lamp"), itemTitle: lampTitle,
  description: text("真实红石信号与教学时间轴相互独立。", "Real redstone simulation and the tutorial run independently."),
  iconPath: "textures/blocks/redstone_lamp_off", entryItems: ["minecraft:redstone_lamp"], tags: ["redstone", "basics"], order: 2,
  focus: { x: 3.5, y: 1.5, z: 3.5 },
};
export const lampStatesDemo = {
  ...redstoneLampDemo, id: "lamp_states", storyboard: restoreBlocks, order: 3,
  title: text("恢复与重播", "Restore and replay"),
  description: text("同一物品关联的第二个场景。", "A second scene for the same item."),
};
