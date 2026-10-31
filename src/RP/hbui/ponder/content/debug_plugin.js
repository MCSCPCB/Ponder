// DebugPonderPlugin with the one DebugScenes scene that needs only vanilla blocks: coordinateScene
// on the spyglass. Java has no lang entries for it; the English below is all it shows.
(function () {
  const P = window.Ponder;

  // debug/scene_1.nbt: a 6x6 snow block and white concrete checker plate, and stained glass axes
  // from (1, 1, 1): red along X, lime along Y, blue along Z. Java's snow_block is Bedrock's snow.
  const scene1 = {
    size: { x: 6, y: 5, z: 6 },
    fill(world) {
      for (let x = 0; x < 6; x++) for (let z = 0; z < 6; z++)
        world.setBlock(x, 0, z, (x + z) % 2 === 0 ? "minecraft:snow" : "minecraft:white_concrete");
      world.setBlock(1, 1, 1, "minecraft:white_stained_glass");
      for (let i = 2; i <= 4; i++) {
        world.setBlock(i, 1, 1, "minecraft:red_stained_glass");
        world.setBlock(1, i, 1, "minecraft:lime_stained_glass");
        world.setBlock(1, 1, i, "minecraft:blue_stained_glass");
      }
    },
  };

  function coordinateScene(scene, util) {
    scene.title("debug_coords", "Coordinate Space");
    scene.showBasePlate();
    scene.idle(10);
    scene.world().showSection(util.select().layersFrom(1), "DOWN");

    const xAxis = util.select().fromTo(2, 1, 1, 4, 1, 1);
    const yAxis = util.select().fromTo(1, 2, 1, 1, 4, 1);
    const zAxis = util.select().fromTo(1, 1, 2, 1, 1, 4);

    scene.idle(10);
    scene.overlay().showOutlineWithText(xAxis, 20)
      .colored(P.Palette.RED)
      .text("Das X axis");
    scene.idle(20);
    scene.overlay().showOutlineWithText(yAxis, 20)
      .colored(P.Palette.GREEN)
      .text("Das Y axis");
    scene.idle(20);
    scene.overlay().showOutlineWithText(zAxis, 20)
      .colored(P.Palette.BLUE)
      .text("Das Z axis");
  }

  P.addPlugin({
    getModId() { return "ponder"; },
    registerScenes(helper) {
      helper.addStoryBoard("minecraft:spyglass", scene1, coordinateScene).highlightAllTags();
    },
  });
})();
