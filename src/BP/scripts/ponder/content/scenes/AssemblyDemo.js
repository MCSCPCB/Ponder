import { bilingual as text } from "../../foundation/registration/PonderLocalization.js";
import { checkerFloor, defineSchematic, fill, place } from "../../foundation/SchematicLoader.js";

const schematic = () => defineSchematic({
  size: { x: 8, y: 8, z: 8 },
  entries: [
    ...checkerFloor(8),
    fill("minecraft:stone_bricks", { x: 2, y: 1, z: 2 }, { x: 2, y: 3, z: 4 }),
    place("minecraft:crafting_table", { x: 4, y: 1, z: 3 }),
    fill("minecraft:oak_planks", { x: 2, y: 4, z: 2 }, { x: 5, y: 4, z: 4 }),
  ],
  air: [{ from: { x: 1, y: 1, z: 1 }, to: { x: 6, y: 6, z: 6 } }],
});

/** @param {import("../../foundation/PonderSceneBuilder.js").PonderSceneBuilder} scene */
function storyboard(scene, util) {
  scene.title("assembly_demo", text("结构的装配与观察", "Assembly and observation"));
  scene.configureBasePlate(0, 0, 8);
  scene.showBasePlate();
  scene.idle(10);

  scene.world().showSection(util.select().fromTo(2, 1, 2, 2, 3, 4), "down");
  scene.idle(15);
  scene.overlay().showText(70)
    .text(text("结构由真实方块构成。关键帧按钮可以回到教学中的任意步骤。",
      "These are real blocks. Select a keyframe to return to an earlier tutorial step."))
    .pointAt(util.vector().centerOf(2, 2, 3)).placeNearTarget().attachKeyFrame();
  scene.overlay().showOutline("green", "wall", util.select().fromTo(2, 1, 2, 2, 3, 4), 90);
  scene.idle(80);

  scene.world().showSection(util.select().position(4, 1, 3), "down");
  scene.idle(15);
  scene.overlay().showText(70)
    .text(text("工作台用于合成。右侧的舒适阅读按钮只会放慢教学时间轴。",
      "Use a crafting table for crafting. Comfortable reading slows the tutorial, not the world."))
    .pointAt(util.vector().topOf(4, 1, 3)).placeNearTarget().attachKeyFrame();
  scene.overlay().showControls(util.vector().topOf(4, 1, 3), "left", 70).rightClick();
  scene.idle(80);

  scene.world().showSection(util.select().fromTo(2, 4, 2, 5, 4, 4), "down");
  scene.rotateCameraY(65);
  scene.idle(20);
  scene.overlay().showText(70)
    .text(text("镜头围绕结构移动，文字与指示线跟随相机构图，而玩家始终留在原地。",
      "The camera orbits the structure. Labels follow its framing while you stay in place."))
    .colored("input").pointAt(util.vector().topOf(3, 4, 3)).placeNearTarget().attachKeyFrame();
  scene.idle(80);

  scene.world().hideSection(util.select().fromTo(2, 1, 2, 2, 3, 4), "up");
  scene.idle(20);
  scene.overlay().showText(70)
    .text(text("区域可以隐藏或恢复，隐藏时同样带有淡出动画。",
      "Sections can be hidden and restored; hiding fades out too."))
    .pointAt(util.vector().centerOf(2, 2, 3)).placeNearTarget();
  scene.idle(80);
  scene.markAsFinished();
}

export const assemblyDemo = {
  id: "assembly_demo", schematic, storyboard,
  title: text("结构的装配与观察", "Assembly and observation"), itemTitle: text("木棍", "Stick"),
  description: text("逐步展示真实方块，并学习时间轴操作。", "Build with real blocks and explore the timeline."),
  iconPath: "textures/items/stick", entryItems: ["minecraft:stick"], tags: ["basics", "crafting"], order: 0,
  focus: { x: 3.5, y: 2, z: 3.5 },
};
