// The vanilla scenes: redstone (lamps, pistons, levers and buttons, repeaters, comparators,
// hoppers) and mining (ores, moss, TNT). Each part below is one scene group; the plugin gives
// them all to Ponder. Strings are the English defaults; texts/*.lang has them under
// vanilla.ponder.* keys.
(function () {
  const P = window.Ponder, parts = [];

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
      world.setBlock(1, 1, 2, P.block("minecraft:piston", { facing_direction: 4 }));
      world.setBlock(2, 1, 2, "minecraft:stone");
      world.setBlock(1, 1, 3, P.block("minecraft:sticky_piston", { facing_direction: 4 }));
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
      world.setBlock(2, 1, 2, P.block("minecraft:unpowered_repeater", { "minecraft:cardinal_direction": "west", repeater_delay: 0 }));
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
    scene.world.setBlock([2, 1, 2], P.block("minecraft:powered_repeater", { "minecraft:cardinal_direction": "west", repeater_delay: 0 }));
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
      world.setBlock(2, 1, 2, P.block("minecraft:unpowered_comparator", { "minecraft:cardinal_direction": "west", output_lit_bit: false, output_subtract_bit: false }));
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
    scene.world.setBlock([2, 1, 2], P.block("minecraft:powered_comparator", { "minecraft:cardinal_direction": "west", output_lit_bit: true, output_subtract_bit: false }));
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

  parts.push({
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

(function () {
  const P = window.Ponder, M = P.Mat;
  const SHEET = "pack://textures/particle/particles.png?filtering=point";

  // 5x5 checker plate; `extra` places the scene's own blocks.
  const plate = (height, extra) => ({
    size: { x: 5, y: height, z: 5 },
    fill(world) {
      for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++)
        world.setBlock(x, 0, z, (x + z) % 2 === 0 ? "minecraft:snow" : "minecraft:light_gray_terracotta");
      extra(world);
    },
  });

  // SuspendedTownParticle with HappyVillagerProvider's white: bone meal's green sparkles. It flies
  // through blocks. The sprite is the one Bedrock's villager_happy particle uses.
  class HappyVillagerParticle extends P.Particle {
    constructor(world, x, y, z, xSpeed, ySpeed, zSpeed) {
      super(world, x, y, z, xSpeed, ySpeed, zSpeed);
      this.halfWidth = 0.01; this.height = 0.02;
      this.quadSize *= Math.random() * 0.6 + 0.5;
      this.xd *= 0.02; this.yd *= 0.02; this.zd *= 0.02;
      this.lifetime = P.int(20 / (Math.random() * 0.8 + 0.2));
    }
    tick() {
      this.xo = this.x; this.yo = this.y; this.zo = this.z;
      if (this.lifetime-- <= 0) { this.removed = true; return; }
      this.move(this.xd, this.yd, this.zd);
      this.xd *= 0.99; this.yd *= 0.99; this.zd *= 0.99;
    }
    move(x, y, z) { this.x += x; this.y += y; this.z += z; }
    sprite() { return { src: SHEET, u: 16, v: 40, size: 8, texSize: 128 }; }
  }
  const happyVillager = { make: (w, x, y, z, mx, my, mz) => new HappyVillagerParticle(w, x, y, z, mx, my, mz) };

  // HugeExplosionParticle: a still puff that plays the explosion frames over its life. The frames
  // are Bedrock's large_explosion flipbook, 16 frames of 8 px from (0, 80).
  class ExplosionParticle extends P.Particle {
    constructor(world, x, y, z, size) {
      super(world, x, y, z, 0, 0, 0);
      this.lifetime = 6 + P.int(Math.random() * 4);
      this.rCol = this.gCol = this.bCol = Math.random() * 0.6 + 0.4;
      this.quadSize = 2 * (1 - size * 0.5);
    }
    tick() {
      this.xo = this.x; this.yo = this.y; this.zo = this.z;
      if (this.age++ >= this.lifetime) this.removed = true;
    }
    sprite() { return { src: SHEET, u: Math.min(15, P.int(this.age * 16 / this.lifetime)) * 8, v: 80, size: 8, texSize: 128 }; }
  }
  const explosion = { make: (w, x, y, z) => new ExplosionParticle(w, x, y, z, Math.random()) };
  // HugeExplosionSeedParticle: six puffs a tick, up to 4 blocks from the centre.
  const explosionEmitter = (w, x, y, z) => w.addParticle(explosion,
    x + (Math.random() - Math.random()) * 4, y + (Math.random() - Math.random()) * 4, z + (Math.random() - Math.random()) * 4, 0, 0, 0);

  // ParticleUtils.spawnParticles above a block, as bone meal on a spreading block does.
  const growthEmitter = (w, x, y, z) => {
    const g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.6;
    w.addParticle(happyVillager, x + (Math.random() * 2 - 1) * 3, y + Math.random(), z + (Math.random() * 2 - 1) * 3, g() * 0.02, g() * 0.02, g() * 0.02);
  };

  // PrimedTnt and TntRenderer: hops up when lit, falls, and swells over its last 10 ticks.
  class PrimedTnt extends P.PonderEntity {
    constructor(world, x, y, z) {
      super(world, x, y, z);
      const a = Math.random() * Math.PI * 2;
      this.setDeltaMovement([-Math.sin(a) * 0.02, 0.2, -Math.cos(a) * 0.02]);
      this.halfWidth = 0.49; this.height = 0.98;
      this.fuse = 80;
    }
    tick() {
      super.tick();
      this.xo = this.x; this.yo = this.y; this.zo = this.z;
      this.yd -= 0.04;
      this.move(this.xd, this.yd, this.zd);
      this.xd *= 0.98; this.yd *= 0.98; this.zd *= 0.98;
      if (this.onGround) { this.xd *= 0.7; this.zd *= 0.7; }
      if (--this.fuse <= 0) this.discard();
    }
    render(base, pt, blockPx) {
      let m = M.translate(base, P.lerp(pt, this.xo, this.x), P.lerp(pt, this.yo, this.y) + 0.5, P.lerp(pt, this.zo, this.z));
      const left = this.fuse - pt + 1;
      let s = 1;
      if (left < 10) { const f = Math.pow(P.clamp(1 - left / 10, 0, 1), 4); s = 1 + f * 0.3; m = M.scale(m, s, s, s); }
      const centre = M.apply(m, 0, 0, 0);
      return [{ depth: centre[2], draw: d => P.drawBlockCube(d, m, "minecraft:tnt", blockPx * s) }];
    }
  }
  // A block of the plugin's own, drawn from vanilla textures: the stone a blast leaves behind.
  // No such block exists in the game; scenes place it like any other.
  P.registerBlockModel("vanilla:scorched_stone", () => {
    const stone = "pack://textures/blocks/stone.png?filtering=point";
    return { shape: "cube", opaque: true, tint: [0.45, 0.4, 0.38],
      faces: { up: stone, down: stone, north: stone, south: stone, west: stone, east: stone } };
  });

  const orePlate = plate(2, world => world.setBlock(2, 1, 2, "minecraft:iron_ore"));

  function mining(scene, util) {
    scene.title("mining", "Mining Ores");
    scene.configureBasePlate(0, 0, 5);
    scene.showBasePlate();
    scene.idle(10);
    scene.world.showSection(util.select.position(2, 1, 2), "DOWN");
    scene.idle(15);
    scene.overlay.showControls(util.vector.topOf(2, 1, 2), "DOWN", 40).leftClick().withItem("minecraft:stone_pickaxe");
    scene.idle(10);
    for (let i = 0; i < 10; i++) {
      scene.world.incrementBlockBreakingProgress([2, 1, 2]);
      scene.idle(3);
    }
    scene.effects.createItemEntity(util.vector.centerOf(2, 1, 2), [0, 0.2, 0], "minecraft:raw_iron");
    scene.overlay.showText(70)
      .sharedText("drops", P.itemName("minecraft:raw_iron"))
      .pointAt(util.vector.centerOf(2, 1, 2))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(80);
    scene.overlay.showText(70)
      .text("Iron ore needs a stone pickaxe or better. Mined with anything weaker, it drops nothing")
      .pointAt(util.vector.centerOf(2, 1, 2))
      .placeNearTarget();
    scene.idle(80);
    scene.markAsFinished();
  }

  const mossPlate = plate(2, world => {
    for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) world.setBlock(x, 1, z, "minecraft:stone");
    world.setBlock(2, 1, 2, "minecraft:moss_block");
  });

  function moss(scene, util) {
    scene.title("moss", "Spreading Moss");
    scene.configureBasePlate(0, 0, 5);
    scene.showBasePlate();
    scene.idle(10);
    scene.world.showSection(util.select.layer(1), "DOWN");
    scene.idle(15);
    scene.overlay.showControls(util.vector.topOf(2, 1, 2), "DOWN", 30).rightClick().withItem("minecraft:bone_meal");
    scene.idle(20);
    scene.effects.emitParticles(util.vector.topOf(2, 1, 2), growthEmitter, 4, 10);
    const near = [[1, 2], [3, 2], [2, 1], [2, 3], [1, 1], [3, 3], [1, 3], [3, 1], [0, 2], [4, 2], [2, 0], [2, 4]];
    near.forEach(([x, z], i) => {
      if (i % 4 === 0) scene.idle(4);
      scene.world.setBlock([x, 1, z], "minecraft:moss_block");
    });
    scene.overlay.showText(80)
      .text("Bone meal on a moss block turns stone, dirt and similar blocks around it into moss")
      .pointAt(util.vector.topOf(2, 1, 2))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(90);
    scene.markAsFinished();
  }

  const tntPlate = plate(3, world => {
    for (let x = 1; x < 4; x++) for (let z = 1; z < 4; z++) world.setBlock(x, 1, z, "minecraft:stone");
    world.setBlock(2, 2, 2, "minecraft:tnt");
  });

  // Lights the TNT at `pos`, waits out the fuse, then blows up the stone around it.
  function ignite(scene, util, pos) {
    scene.world.setBlock(pos, null);
    scene.effects.createEntity(world => new PrimedTnt(world, pos[0] + 0.5, pos[1], pos[2] + 0.5));
    scene.idle(80);
    scene.effects.emitParticles(util.vector.centerOf(pos[0], pos[1], pos[2]), explosionEmitter, 6, 4);
    scene.world.setBlocks(util.select.fromTo(1, 1, 1, 3, 2, 3), null, true);
    scene.world.setBlock([2, 0, 2], "vanilla:scorched_stone");
    [[0.15, 0.3, 0], [-0.15, 0.3, 0.05], [0, 0.35, -0.15]].forEach(motion =>
      scene.effects.createItemEntity(util.vector.centerOf(2, 1, 2), motion, "minecraft:cobblestone"));
  }

  function tnt(scene, util) {
    scene.title("tnt", "TNT");
    scene.configureBasePlate(0, 0, 5);
    scene.showBasePlate();
    scene.idle(10);
    scene.world.showSection(util.select.fromTo(1, 1, 1, 3, 2, 3), "DOWN");
    scene.idle(15);
    scene.overlay.showControls(util.vector.topOf(2, 2, 2), "DOWN", 30).rightClick().withItem("minecraft:flint_and_steel");
    scene.idle(20);
    scene.overlay.showText(70)
      .text("Flint and steel, fire or a redstone signal lights TNT. It hops up and explodes 4 seconds later")
      .pointAt(util.vector.centerOf(2, 2, 2))
      .placeNearTarget()
      .attachKeyFrame();
    ignite(scene, util, [2, 2, 2]);
    scene.idle(20);
    scene.overlay.showText(70)
      .text("The blast breaks the blocks around it, and only some of them drop as items")
      .pointAt(util.vector.topOf(2, 0, 2))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(80);
    scene.markAsFinished();
  }

  const leverTntPlate = plate(3, world => {
    for (let x = 1; x < 4; x++) for (let z = 1; z < 4; z++) world.setBlock(x, 1, z, "minecraft:stone");
    world.setBlock(2, 2, 2, "minecraft:tnt");
    world.setBlock(1, 2, 2, P.block("minecraft:lever", { lever_direction: "up_north_south", open_bit: false }));
  });

  // Shown for levers after the Redstone pack's "inputs" scene.
  function leverTnt(scene, util) {
    scene.title("lever_tnt", "Lighting TNT with Redstone");
    scene.configureBasePlate(0, 0, 5);
    scene.showBasePlate();
    scene.idle(10);
    scene.world.showSection(util.select.fromTo(1, 1, 1, 3, 2, 3), "DOWN");
    scene.idle(15);
    scene.overlay.showControls(util.vector.topOf(1, 2, 2), "DOWN", 30).rightClick();
    scene.idle(20);
    scene.world.toggleRedstonePower(util.select.position(1, 2, 2));
    scene.effects.indicateRedstone([2, 2, 2]);
    scene.overlay.showText(70)
      .text("A lever, or any other signal reaching the TNT, lights it as well")
      .pointAt(util.vector.centerOf(2, 2, 2))
      .placeNearTarget()
      .attachKeyFrame();
    ignite(scene, util, [2, 2, 2]);
    scene.idle(40);
    scene.markAsFinished();
  }

  parts.push({
    registerScenes(helper) {
      helper.forComponents("minecraft:iron_ore", "minecraft:deepslate_iron_ore")
        .addStoryBoard(orePlate, mining, "mining");
      helper.forComponents("minecraft:moss_block")
        .addStoryBoard(mossPlate, moss, "mining");
      helper.forComponents("minecraft:tnt")
        .addStoryBoard(tntPlate, tnt, "mining", "redstone");
            helper.forComponents("minecraft:lever")
        .addStoryBoard(leverTntPlate, leverTnt, entry => entry
          .highlightTag("redstone")
          .orderAfter("vanilla", "inputs"));
    },
    registerTags(helper) {
      helper.registerTag("mining")
        .title("Mining")
        .description("Ways to break blocks and gather what they drop")
        .item("minecraft:iron_pickaxe", true, false)
        .addToIndex()
        .register();
      helper.addToTag("mining")
        .add("minecraft:iron_ore")
        .add("minecraft:moss_block")
        .add("minecraft:tnt");
      helper.addToTag("redstone")
        .add("minecraft:tnt");
    },
    registerSharedText(helper) {
      helper.registerSharedText("drops", "Once broken, the block drops %1$s");
    },
    // The deepslate ore shares the scene but is left out of the item index.
    indexExclusions(helper) {
      helper.exclude("minecraft:deepslate_iron_ore");
    },
  });
})();

  // One plugin for both groups: each method asks every part, in order (redstone's tag first, so
  // mining can add TNT to it).
  const plugin = { modId: "vanilla", name: "Minecraft" };
  ["registerScenes", "registerTags", "registerSharedText", "indexExclusions"].forEach(method => {
    plugin[method] = helper => parts.forEach(part => { if (part[method]) part[method](helper); });
  });
  P.addPlugin(plugin);
})();
