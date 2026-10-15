import { defineSchematic, loadSchematic, place } from "../foundation/SchematicLoader.js";

/**
 * Java DebugScenes.coordinateScene, blocksScene and sectionsScene. They exercise both schematic sources:
 *   coordinateScene - the world is read from a `.mcstructure` (structures/ponder/coordinates, converted from debug/scene_1.nbt)
 *   blocksScene     - declared by hand, matching debug/scene_2.nbt
 *   sectionsScene   - declared by hand, matching debug/scene_8.nbt
 */

/** @param {import("../foundation/PonderSceneBuilder.js").PonderSceneBuilder} scene */
function coordinateScene(scene, util) {
  scene.title("debug_coords", "Coordinate Space");
  scene.showBasePlate();
  scene.idle(10);
  scene.world().showSection(util.select().layersFrom(1), "down");

  const xAxis = util.select().fromTo(2, 1, 1, 4, 1, 1);
  const yAxis = util.select().fromTo(1, 2, 1, 1, 4, 1);
  const zAxis = util.select().fromTo(1, 1, 2, 1, 1, 4);

  scene.idle(10);
  scene.overlay().showOutlineWithText(xAxis, 20).colored("red").text("Das X axis");
  scene.idle(20);
  scene.overlay().showOutlineWithText(yAxis, 20).colored("green").text("Das Y axis");
  scene.idle(20);
  scene.overlay().showOutlineWithText(zAxis, 20).colored("blue").text("Das Z axis");
}

/** @param {import("../foundation/PonderSceneBuilder.js").PonderSceneBuilder} scene */
function sectionsScene(scene, util) {
  scene.title("debug_sections", "Sections");
  scene.showBasePlate();
  scene.idle(10);
  scene.rotateCameraY(95);

  const mergePos = util.grid().at(1, 1, 1);
  const independentPos = util.grid().at(3, 1, 1);
  const toMerge = util.select().position(1, 1, 1);
  const independent = util.select().position(3, 1, 1);
  const start = util.select().layersFrom(1).substract(toMerge).substract(independent);

  scene.world().showSection(start, "down");
  scene.idle(20);

  scene.world().showSection(toMerge, "down");
  const link = scene.world().showIndependentSection(independent, "down");

  scene.idle(20);

  scene.overlay().showText(40).colored("green")
    .text("This Section got merged to base.")
    .pointAt(util.vector().topOf(mergePos.x, mergePos.y, mergePos.z));
  scene.idle(10);
  scene.overlay().showText(40).colored("red")
    .text("This Section renders independently.")
    .pointAt(util.vector().topOf(independentPos.x, independentPos.y, independentPos.z));

  scene.idle(40);

  scene.world().hideIndependentSection(link, "down");
  scene.world().hideSection(util.select().fromTo(1, 1, 1, 1, 1, 4), "down");

  scene.idle(20);

  const hiddenReplaceArea = util.select().fromTo(2, 1, 2, 4, 1, 4)
    .substract(util.select().position(4, 1, 3))
    .substract(util.select().position(2, 1, 3));

  scene.world().hideSection(hiddenReplaceArea, "up");
  scene.idle(20);
  scene.world().setBlocks(hiddenReplaceArea, { blockId: "minecraft:black_concrete" }, false);
  scene.world().showSection(hiddenReplaceArea, "down");
  scene.idle(20);
  scene.overlay().showOutlineWithText(hiddenReplaceArea, 30).colored("blue")
    .text("Seamless substitution of blocks");

  scene.idle(40);

  const helicopter = scene.world().makeSectionIndependent(hiddenReplaceArea);
  scene.world().rotateSection(helicopter, 50, 5 * 360, 0, 60);
  scene.world().moveSection(helicopter, { x: 0, y: 4, z: 5 }, 50);
  scene.overlay().showText(30).colored("blue")
    .text("Up, up and away.")
    .independent(30);

  scene.idle(40);
  scene.world().hideIndependentSection(helicopter, "up");
}

/** @param {import("../foundation/PonderSceneBuilder.js").PonderSceneBuilder} scene */
function blocksScene(scene, util) {
  scene.title("debug_blocks", "Changing Blocks");
  scene.showBasePlate();
  scene.scaleSceneView(0.75);
  scene.idle(10);
  scene.world().showSection(util.select().layersFrom(1), "down");
  scene.idle(10);
  scene.overlay().showText(1000)
    .independent(10)
    .text("Blocks can be modified");
  scene.idle(20);
  scene.world().replaceBlocks(util.select().fromTo(1, 1, 3, 2, 2, 4), { blockId: "minecraft:white_concrete" }, true);
  scene.idle(10);
  scene.addKeyframe();
  scene.world().replaceBlocks(util.select().position(3, 1, 1),
    { blockId: "minecraft:redstone_wire", states: { redstone_signal: 15 } }, true);
  scene.rotateCameraY(180);

  for (let i = 0; i < 20; i++) {
    scene.world().incrementBlockBreakingProgress(util.grid().at(3, 1, 1));
    scene.idle(10);
  }

  scene.markAsFinished();
}

/** The snow / white concrete checkerboard every debug schematic stands on. */
function basePlate(size) {
  const entries = [];
  for (let x = 0; x < size; x++)
    for (let z = 0; z < size; z++)
      entries.push(place((x + z) % 2 ? "minecraft:white_concrete" : "minecraft:snow", { x, y: 0, z }));
  return entries;
}

/** debug/scene_2.nbt: a hay bale and a 2x2x2 block of shadow steel casing on the base plate. */
function blocksSchematic() {
  const entries = basePlate(6);
  entries.push(place("minecraft:hay_block", { x: 3, y: 1, z: 1 }, { pillar_axis: "y" }));
  // create:shadow_steel_casing has no vanilla counterpart; polished blackstone stands in for it.
  for (const x of [1, 2]) for (const y of [1, 2]) for (const z of [3, 4])
    entries.push(place("minecraft:polished_blackstone", { x, y, z }));
  return defineSchematic({ size: { x: 6, y: 3, z: 6 }, entries });
}

/** debug/scene_8.nbt: snow / white concrete checkerboard with a ring of copper casing on top. */
function sectionsSchematic() {
  const entries = basePlate(6);
  // create:copper_casing has no vanilla counterpart; the copper block stands in for it.
  for (const [x, z] of [[1, 1], [3, 1], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [3, 3], [1, 4], [2, 4], [3, 4], [4, 4]])
    entries.push(place("minecraft:copper_block", { x, y: 1, z }));
  return defineSchematic({ size: { x: 6, y: 2, z: 6 }, entries });
}

export const coordinateDemo = {
  id: "debug_coords",
  schematic: () => loadSchematic("coordinates"),
  storyboard: coordinateScene,
  title: "Coordinate Space",
  iconPath: "textures/items/compass_item", entryItems: ["minecraft:compass"], order: 0,
};

export const blocksDemo = {
  id: "debug_blocks",
  schematic: blocksSchematic,
  storyboard: blocksScene,
  title: "Changing Blocks",
  iconPath: "textures/items/compass_item", entryItems: ["minecraft:compass"], order: 1,
};

export const sectionsDemo = {
  id: "debug_sections",
  schematic: sectionsSchematic,
  storyboard: sectionsScene,
  title: "Sections",
  iconPath: "textures/items/compass_item", entryItems: ["minecraft:recovery_compass"], order: 2,
};
