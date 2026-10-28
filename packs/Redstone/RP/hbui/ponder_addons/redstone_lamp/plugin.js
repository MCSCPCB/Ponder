// A Ponder plugin from another pack: redstone scenes. Ponder loads this script when it opens
// (the behavior pack registered it with ponder:register). Strings are the English defaults;
// texts/*.lang has them under redstone_lamp.ponder.<scene>.* keys.
//
// Pistons, repeaters, comparators, levers, buttons and hoppers are all drawn as full cubes here.
// Ponder's block renderer only knows cubes and redstone dust, so the scenes show how these blocks
// behave, not their real shape.
(function () {
  const P = window.Ponder;
  const LAMP = "minecraft:redstone_lamp";
  const LIT = "minecraft:lit_redstone_lamp";

  // 5x5 checker plate with a lamp in the middle.
  const lampPlate = {
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
    scene.world.setBlock([2, 1, 2], LIT);
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
    scene.world.setBlock([2, 1, 2], LIT);
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

  // A piston pointing east, a block in front of it, and a sticky piston beside them.
  const pistonPlate = {
    size: { x: 5, y: 3, z: 5 },
    fill(world) {
      for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++)
        world.setBlock(x, 0, z, (x + z) % 2 === 0 ? "minecraft:snow" : "minecraft:light_gray_terracotta");
      world.setBlock(1, 1, 2, P.block("minecraft:piston", { facing_direction: 5 }));
      world.setBlock(2, 1, 2, "minecraft:stone");
      world.setBlock(1, 1, 3, P.block("minecraft:sticky_piston", { facing_direction: 5 }));
      world.setBlock(2, 1, 3, "minecraft:slime");
      world.setBlock(2, 2, 3, "minecraft:oak_planks");
    },
  };

  function piston(scene, util) {
    scene.title("piston", "Pistons");
    scene.configureBasePlate(0, 0, 5);
    scene.showBasePlate();
    scene.idle(10);
    const head = scene.world.showIndependentSection(util.select.position(2, 1, 2), "WEST");
    scene.world.showSection(util.select.position(1, 1, 2), "EAST");
    scene.idle(15);
    scene.overlay.showText(60)
      .text("A piston pushes the block in front of it up to 12 blocks, as long as the row is not blocked")
      .pointAt(util.vector.centerOf(1, 1, 2))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(30);
    scene.world.moveSection(head, [1, 0, 0], 10);
    scene.idle(40);
    scene.world.hideIndependentSection(head, "EAST");
    scene.idle(20);
    const glued = scene.world.showIndependentSection(util.select.position(2, 1, 3), "WEST");
    scene.world.showSection(util.select.position(1, 1, 3), "EAST");
    scene.idle(10);
    // The planks on top stick to the slime, so they join its section and move with it.
    scene.world.glueBlockOnto([2, 2, 3], "DOWN", glued);
    scene.idle(15);
    scene.overlay.showText(70)
      .text("A sticky piston pulls the block back with it. Slime and honey blocks carry their neighbours along too")
      .pointAt(util.vector.centerOf(2, 1, 3))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(30);
    scene.world.moveSection(glued, [1, 0, 0], 10);
    scene.idle(20);
    scene.world.moveSection(glued, [-1, 0, 0], 10);
    scene.idle(30);
    scene.markAsFinished();
  }

  // A lever and a button, each next to a lamp.
  const inputPlate = {
    size: { x: 5, y: 3, z: 5 },
    fill(world) {
      for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++)
        world.setBlock(x, 0, z, (x + z) % 2 === 0 ? "minecraft:snow" : "minecraft:light_gray_terracotta");
      world.setBlock(1, 1, 1, P.block("minecraft:lever", { lever_direction: "up_north_south", open_bit: false }));
      world.setBlock(2, 1, 1, LAMP);
      world.setBlock(1, 1, 3, P.block("minecraft:stone_button", { facing_direction: 4, button_pressed_bit: false }));
      world.setBlock(2, 1, 3, LAMP);
    },
  };

  function inputs(scene, util) {
    scene.title("inputs", "Levers and Buttons");
    scene.configureBasePlate(0, 0, 5);
    scene.showBasePlate();
    scene.idle(10);
    scene.world.showSection(util.select.fromTo(1, 1, 1, 2, 1, 1), "DOWN");
    scene.idle(10);
    scene.overlay.showControls(util.vector.topOf(1, 1, 1), "DOWN", 30).rightClick();
    scene.idle(20);
    scene.world.toggleRedstonePower(util.select.position(1, 1, 1));
    scene.world.setBlock([2, 1, 1], LIT);
    scene.effects.indicateRedstone([2, 1, 1]);
    scene.overlay.showText(70)
      .text("A lever stays on until it is used again, and keeps powering whatever is next to it")
      .pointAt(util.vector.centerOf(1, 1, 1))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(80);
    scene.world.showSection(util.select.fromTo(1, 1, 3, 2, 1, 3), "DOWN");
    scene.idle(10);
    scene.overlay.showControls(util.vector.topOf(1, 1, 3), "DOWN", 20).rightClick();
    scene.idle(15);
    scene.world.toggleRedstonePower(util.select.position(1, 1, 3));
    scene.world.setBlock([2, 1, 3], LIT);
    scene.effects.indicateRedstone([2, 1, 3]);
    scene.overlay.showText(70)
      .text("A button gives a short pulse: stone buttons last 10 ticks, wooden ones 15, and an arrow hitting a wooden button sets it off too")
      .pointAt(util.vector.centerOf(1, 1, 3))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(40);
    scene.world.toggleRedstonePower(util.select.position(1, 1, 3));
    scene.world.setBlock([2, 1, 3], LAMP);
    scene.idle(40);
    scene.markAsFinished();
  }

  // A repeater between a redstone block and a lamp, facing east.
  const repeaterPlate = {
    size: { x: 5, y: 2, z: 5 },
    fill(world) {
      for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++)
        world.setBlock(x, 0, z, (x + z) % 2 === 0 ? "minecraft:snow" : "minecraft:light_gray_terracotta");
      world.setBlock(1, 1, 2, "minecraft:redstone_block");
      world.setBlock(2, 1, 2, P.block("minecraft:unpowered_repeater", { direction: 1, repeater_delay: 0 }));
      world.setBlock(3, 1, 2, LAMP);
    },
  };

  function repeater(scene, util) {
    scene.title("repeater", "Redstone Repeater");
    scene.configureBasePlate(0, 0, 5);
    scene.showBasePlate();
    scene.idle(10);
    scene.world.showSection(util.select.fromTo(1, 1, 2, 3, 1, 2), "DOWN");
    scene.idle(10);
    scene.world.setBlock([2, 1, 2], P.block("minecraft:powered_repeater", { direction: 1, repeater_delay: 0 }));
    scene.world.setBlock([3, 1, 2], LIT);
    scene.overlay.showText(70)
      .text("A repeater passes a signal in one direction only, and refreshes it back to full strength")
      .pointAt(util.vector.centerOf(2, 1, 2))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(80);
    scene.overlay.showControls(util.vector.topOf(2, 1, 2), "DOWN", 30).rightClick();
    scene.overlay.showRepeaterScrollInput([2, 1, 2], 40);
    scene.idle(15);
    scene.world.cycleBlockProperty([2, 1, 2], "repeater_delay", [0, 1, 2, 3]);
    scene.overlay.showText(70)
      .text("Using it adds a delay of 1, 2, 3 or 4 ticks. Locking it with another repeater from the side freezes it in place")
      .pointAt(util.vector.centerOf(2, 1, 2))
      .attachKeyFrame();
    scene.idle(80);
    scene.markAsFinished();
  }

  // A comparator reading a container, facing east towards a lamp.
  const comparatorPlate = {
    size: { x: 5, y: 2, z: 5 },
    fill(world) {
      for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++)
        world.setBlock(x, 0, z, (x + z) % 2 === 0 ? "minecraft:snow" : "minecraft:light_gray_terracotta");
      world.setBlock(1, 1, 2, "minecraft:chest");
      world.setBlock(2, 1, 2, P.block("minecraft:unpowered_comparator", { direction: 1, output_lit_bit: false, output_subtract_bit: false }));
      world.setBlock(3, 1, 2, LAMP);
    },
  };

  function comparator(scene, util) {
    scene.title("comparator", "Redstone Comparator");
    scene.configureBasePlate(0, 0, 5);
    scene.showBasePlate();
    scene.idle(10);
    scene.world.showSection(util.select.fromTo(1, 1, 2, 3, 1, 2), "DOWN");
    scene.idle(10);
    scene.overlay.showText(80)
      .text("A comparator reads the container behind it and outputs a signal from 0 to 15 depending on how full it is")
      .pointAt(util.vector.centerOf(2, 1, 2))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(40);
    scene.world.setBlock([2, 1, 2], P.block("minecraft:powered_comparator", { direction: 1, output_lit_bit: true, output_subtract_bit: false }));
    scene.world.setBlock([3, 1, 2], LIT);
    scene.overlay.showCenteredScrollInput([2, 1, 2], "UP", 40);
    scene.idle(50);
    scene.overlay.showControls(util.vector.topOf(2, 1, 2), "DOWN", 30).rightClick();
    scene.overlay.showFilterSlotInput(util.vector.topOf(2, 1, 2), "UP", 40);
    scene.idle(15);
    scene.world.cycleBlockProperty([2, 1, 2], "output_subtract_bit");
    scene.overlay.showText(80)
      .text("Using it switches to subtract mode, where the output is the rear signal minus the stronger of the two side signals")
      .pointAt(util.vector.centerOf(2, 1, 2))
      .attachKeyFrame();
    scene.idle(90);
    scene.markAsFinished();
  }

  // A hopper pointing down into a chest.
  const hopperPlate = {
    size: { x: 5, y: 3, z: 5 },
    fill(world) {
      for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++)
        world.setBlock(x, 0, z, (x + z) % 2 === 0 ? "minecraft:snow" : "minecraft:light_gray_terracotta");
      world.setBlock(2, 1, 2, "minecraft:chest");
      world.setBlock(2, 2, 2, P.block("minecraft:hopper", { facing_direction: 0, toggle_bit: false }));
    },
  };

  function hopper(scene, util) {
    scene.title("hopper", "Hopper");
    scene.configureBasePlate(0, 0, 5);
    scene.showBasePlate();
    scene.idle(10);
    scene.world.showSection(util.select.fromTo(2, 1, 2, 2, 2, 2), "DOWN");
    scene.idle(10);
    scene.overlay.showText(60)
      .text("A hopper pulls items in from above and pushes them into the container it points at")
      .pointAt(util.vector.centerOf(2, 2, 2))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(40);
    scene.effects.createItemEntity(util.vector.topOf(2, 3, 2), [0, 0, 0], "minecraft:iron_ingot");
    scene.idle(20);
    scene.effects.modifyEntitiesInside(P.ItemEntity, util.select.position(2, 3, 2), e => e.discard());
    scene.idle(10);
    scene.effects.createItemEntity(util.vector.centerOf(2, 1, 2), [0, 0.05, 0], "minecraft:iron_ingot");
    scene.overlay.showText(70)
      .text("It moves one item every 8 ticks. Powering it with redstone stops it until the signal goes away")
      .pointAt(util.vector.centerOf(2, 1, 2))
      .attachKeyFrame();
    scene.idle(80);
    scene.markAsFinished();
  }

  P.addPlugin({
    modId: "redstone_lamp",
    name: "Redstone Lamp",
    registerScenes(helper) {
      helper.forComponents(LAMP)
        .addStoryBoard(lampPlate, lamp, "redstone")
        .addStoryBoard(lampPlate, lampDelay, "redstone");
      helper.forComponents("minecraft:piston", "minecraft:sticky_piston")
        .addStoryBoard(pistonPlate, piston, "redstone");
      helper.forComponents("minecraft:lever", "minecraft:stone_button", "minecraft:wooden_button")
        .addStoryBoard(inputPlate, inputs, "redstone");
      helper.forComponents("minecraft:repeater")
        .addStoryBoard(repeaterPlate, repeater, "redstone");
      helper.forComponents("minecraft:comparator")
        .addStoryBoard(comparatorPlate, comparator, "redstone");
      helper.forComponents("minecraft:hopper")
        .addStoryBoard(hopperPlate, hopper, "redstone");
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
        .add("minecraft:piston")
        .add("minecraft:sticky_piston")
        .add("minecraft:lever")
        .add("minecraft:stone_button")
        .add("minecraft:wooden_button")
        .add("minecraft:repeater")
        .add("minecraft:comparator")
        .add("minecraft:hopper");
    },
  });
})();
