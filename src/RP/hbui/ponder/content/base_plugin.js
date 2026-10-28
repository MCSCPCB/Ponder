// The built-in plugin, Java's BasePonderPlugin, plus the redstone lamp example scenes. Strings are
// the English defaults; RP/texts/*.lang has them under ponder.ponder.<scene>.* keys.
(function () {
  const P = window.Ponder;
  const LAMP = "minecraft:redstone_lamp";

  // 5x5 checker plate with a lamp in the middle (Java scenes load this from an .nbt).
  const schematic = {
    size: { x: 5, y: 3, z: 5 },
    fill(world) {
      for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++)
        world.setBlock(x, 0, z, (x + z) % 2 === 0 ? "minecraft:snow" : "minecraft:light_gray_terracotta");
      world.setBlock(2, 1, 2, LAMP);
      world.setBlock(1, 1, 2, "minecraft:redstone_block");
      world.setBlock(2, 2, 2, "minecraft:redstone_wire");
    },
  };

  function lamp(scene, util) {
    scene.title("redstone_lamp", "Redstone Lamp");
    scene.configureBasePlate(0, 0, 5);
    scene.showBasePlate();
    scene.idle(10);
    scene.world.showSection(util.select.position(2, 1, 2), "DOWN");
    scene.idle(10);
    scene.overlay.showText(70)
      .text("Redstone Lamps stay dark on their own and light up as soon as they receive a redstone signal")
      .pointAt(util.vector.centerOf(2, 1, 2))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(80);
    scene.world.showSection(util.select.position(1, 1, 2), "EAST");
    scene.idle(10);
    scene.world.setBlock([2, 1, 2], "minecraft:lit_redstone_lamp");
    scene.overlay.showText(70)
      .text("An active power source or a powered block next to the lamp lights it directly")
      .pointAt(util.vector.centerOf(1, 1, 2))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(80);
    scene.world.showSection(util.select.position(2, 2, 2), "DOWN");
    scene.idle(10);
    scene.overlay.showText(70)
      .text("Redstone Dust, Repeaters and Comparators pointing into the lamp light it too, including dust on top of it")
      .pointAt(util.vector.of(2.5, 2.1, 2.5))
      .attachKeyFrame();
    scene.idle(80);
    scene.markAsFinished();
  }

  function lampDelay(scene, util) {
    scene.title("redstone_lamp_delay", "Redstone Lamp Timing");
    scene.configureBasePlate(0, 0, 5);
    scene.showBasePlate();
    scene.idle(10);
    scene.world.showSection(util.select.fromTo(1, 1, 2, 2, 1, 2), "DOWN");
    scene.idle(10);
    scene.world.setBlock([2, 1, 2], "minecraft:lit_redstone_lamp");
    scene.idle(20);
    scene.world.setBlock([1, 1, 2], "minecraft:air");
    scene.idle(4);
    scene.world.setBlock([2, 1, 2], LAMP);
    scene.overlay.showText(80)
      .text("Once the signal is gone, the lamp takes 4 game ticks to turn off. It conducts redstone, so a powered lamp can drive adjacent components")
      .pointAt(util.vector.centerOf(2, 1, 2))
      .attachKeyFrame();
    scene.idle(90);
    scene.rotateCameraY(90);
    scene.idle(20);
    scene.markAsFinished();
  }

  P.addPlugin({
    modId: "ponder",
    name: "Ponder",
    registerScenes(helper) {
      helper.forComponents(LAMP)
        .addStoryBoard(schematic, lamp, "ponder:redstone")
        .addStoryBoard(schematic, lampDelay, "ponder:redstone");
    },
    registerTags(helper) {
      helper.registerTag("redstone")
        .title("Redstone")
        .description("Components which help with redstone engineering")
        .item("minecraft:redstone", true, false)
        .addToIndex()
        .register();
      helper.addToTag("redstone")
        .add(LAMP)
        .add("minecraft:redstone_block")
        .add("minecraft:repeater")
        .add("minecraft:comparator");
    },
    registerSharedText(helper) {
      helper.registerSharedText("sneak_and", "Sneak +");
      helper.registerSharedText("ctrl_and", "Ctrl +");
    },
  });
})();
