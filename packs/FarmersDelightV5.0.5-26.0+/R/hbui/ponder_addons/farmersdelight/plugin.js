// Added 2026-10-29 for the Ponder example (not part of Farmer's Delight 5.0.5): the cooking pot
// and its heat source, after the Farmer's Book. The pot and the stove are this pack's own blocks;
// Ponder draws them from ponder_blocks.json, which tools/adapter writes next to this file.
// Strings are the English defaults; texts/*.lang has them under farmersdelight.ponder.* keys.
(function () {
  const P = window.Ponder;
  const POT = P.block("farmersdelight:cooking_pot", { "minecraft:cardinal_direction": "south" });
  // Facing north, the side the scene's camera sees.
  const stove = working => P.block("farmersdelight:stove", { "minecraft:cardinal_direction": "north", "farmersdelight:is_working": working });

  // 5x5 checker plate, a stove in the middle and the pot on it.
  const potPlate = {
    size: { x: 5, y: 3, z: 5 },
    fill(world) {
      for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++)
        world.setBlock(x, 0, z, (x + z) % 2 === 0 ? "minecraft:snow" : "minecraft:light_gray_terracotta");
      world.setBlock(2, 1, 2, stove(false));
      world.setBlock(2, 2, 2, POT);
    },
  };

  function cookingPot(scene, util) {
    scene.title("cooking_pot", "Cooking Pot");
    scene.configureBasePlate(0, 0, 5);
    scene.showBasePlate();
    scene.idle(10);
    scene.world.showSection(util.select.position(2, 1, 2), "DOWN");
    scene.idle(10);
    scene.world.showSection(util.select.position(2, 2, 2), "DOWN");
    scene.idle(15);
    scene.overlay.showText(70)
      .text("The Cooking Pot is used for cooking and storing food")
      .pointAt(util.vector.centerOf(2, 2, 2))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(80);
    scene.overlay.showText(80)
      .text("To prepare food, it needs a heat source below it: fire, lava, a campfire or a lit Stove. Bubbles or smoke above the pot show that it is heated")
      .pointAt(util.vector.centerOf(2, 1, 2))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(90);
    const front = util.vector.blockSurface([2, 1, 2], "NORTH");
    scene.overlay.showControls(front, "RIGHT", 30).rightClick().withItem("minecraft:flint_and_steel");
    scene.idle(20);
    scene.world.modifyBlock([2, 1, 2], () => stove(true), false);
    scene.overlay.showText(70)
      .text("Flint and Steel lights the Stove, which then heats the pot above it")
      .pointAt(front)
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(80);
    scene.overlay.showControls(front, "RIGHT", 30).rightClick().withItem("minecraft:iron_shovel");
    scene.idle(20);
    scene.world.modifyBlock([2, 1, 2], () => stove(false), false);
    scene.overlay.showText(70)
      .text("A shovel or a water bucket puts a lit Stove out")
      .pointAt(front)
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(80);
    scene.markAsFinished();
  }

  P.addPlugin({
    modId: "farmersdelight",
    name: "Farmer's Delight",
    registerScenes(helper) {
      helper.forComponents("farmersdelight:cooking_pot", "farmersdelight:stove")
        .addStoryBoard(potPlate, cookingPot);
    },
  });
})();
