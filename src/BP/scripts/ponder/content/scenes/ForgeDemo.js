import { bilingual as text } from "../../foundation/registration/PonderLocalization.js";
import { checkerFloor, defineSchematic, fill, place } from "../../foundation/SchematicLoader.js";

const schematic = () => defineSchematic({
  size: { x: 12, y: 12, z: 12 },
  entries: [
    ...checkerFloor(12),
    fill("minecraft:stone_bricks", { x: 3, y: 1, z: 3 }, { x: 7, y: 1, z: 7 }),
    place("minecraft:furnace", { x: 5, y: 2, z: 4 }, { "minecraft:cardinal_direction": "south" }),
    place("minecraft:anvil", { x: 7, y: 2, z: 5 }),
    fill("minecraft:bricks", { x: 4, y: 2, z: 6 }, { x: 6, y: 5, z: 6 }),
  ],
  air: [{ from: { x: 1, y: 1, z: 1 }, to: { x: 10, y: 8, z: 10 } }],
});

function storyboard(scene, util) {
  const vec = util.vector();
  scene.title("forge_demo", text("熔炼工坊", "Forge walkthrough"));
  scene.configureBasePlate(0, 0, 12);
  scene.showBasePlate();
  scene.idle(10);

  scene.world().showSection(util.select().fromTo(3, 1, 3, 7, 1, 7), "down");
  scene.idle(15);
  scene.overlay().showText(70)
    .text(text("先搭建工坊的底座。演示区外壳和照明由会话管理。",
      "Start with a forge base. The session provides an enclosed, illuminated demonstration area."))
    .pointAt(vec.centerOf(5, 1, 5)).placeNearTarget().attachKeyFrame();
  scene.idle(80);

  scene.world().showSection(util.select().position(5, 2, 4), "down");
  scene.idle(15);
  scene.overlay().showText(70)
    .text(text("熔炉的朝向由方块状态指定。回退恢复的是脚本定义的状态。",
      "Block states set the furnace's facing. Seeking restores authored state."))
    .colored("input").pointAt(vec.centerOf(5, 2, 4)).placeNearTarget().attachKeyFrame();
  scene.overlay().showControls(vec.centerOf(5, 2, 4), "left", 70).showing("textures/items/iron_ingot");
  scene.idle(80);

  scene.world().showSection(util.select().position(7, 2, 5), "down");
  scene.world().showSection(util.select().fromTo(4, 2, 6, 6, 5, 6), "down");
  scene.idle(15);
  scene.overlay().showText(95)
    .text(text("显示更多区域。轮廓框的目标由脚本指定，不依赖鼠标识别。",
      "Reveal more of the build. Scripts choose outline targets; there is no world picking."))
    .pointAt(vec.centerOf(7, 2, 5)).placeNearTarget().attachKeyFrame();
  scene.overlay().showOutline("output", "anvil", util.select().position(7, 2, 5), 95);
  scene.idle(105);

  scene.world().createItemEntity(vec.of(6, 3, 4), vec.of(0, 0, 0), "minecraft:iron_ingot");
  scene.effects().emitParticles(vec.of(5.5, 5.5, 6.5), scene.effects().simpleParticleEmitter("minecraft:basic_smoke_particle", vec.of(0, .1, 0)), 1, 30);
  scene.overlay().showText(70)
    .text(text("教学掉落物有自己的生命周期。跳转不会重复触发瞬时粒子。",
      "Teaching items have a managed lifetime. Seeking does not replay one-shot particles."))
    .colored("output").pointAt(vec.of(6, 3, 4)).placeNearTarget().attachKeyFrame();
  scene.idle(80);

  scene.overlay().chaseBoundingBoxOutline("green", "ingot_box", { from: vec.of(5.8, 2, 3.8), to: vec.of(6.2, 2.4, 4.2) }, 75);
  scene.rotateCameraY(45);
  scene.overlay().showText(75)
    .text(text("包围盒可跟踪教学实体。原生物理仍然正常运行。",
      "An outline can track a teaching entity. Native physics continues to run."))
    .pointAt(vec.of(6, 2, 4)).placeNearTarget();
  scene.idle(85);
  scene.markAsFinished();
}

export const forgeDemo = {
  id: "forge_demo", schematic, storyboard,
  title: text("熔炼工坊", "Forge walkthrough"), itemTitle: text("烈焰棒", "Blaze rod"),
  description: text("组合方块、教学实体、掉落物与运镜。", "Combine blocks, teaching entities, items and camera motion."),
  iconPath: "textures/blocks/furnace_front_off", entryItems: ["minecraft:blaze_rod"], tags: ["crafting", "basics"], order: 1,
  focus: { x: 5.5, y: 2.5, z: 5.5 },
};
