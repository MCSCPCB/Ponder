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
    scene.world().showSection(util.select().position(2, 1, 2), "DOWN");
    scene.idle(10);
    scene.overlay().showText(70)
      .text("Redstone Lamps stay dark on their own and light up as soon as they receive a redstone signal")
      .pointAt(util.vector().centerOf(2, 1, 2))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(80);
    scene.world().showSection(util.select().position(1, 1, 2), "EAST");
    scene.idle(10);
    scene.world().setBlock([2, 1, 2], LIT);
    scene.overlay().showText(70)
      .text("An active power source or a powered block next to the lamp lights it directly")
      .pointAt(util.vector().centerOf(1, 1, 2))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(80);
    scene.world().showSection(util.select().position(2, 2, 2), "DOWN");
    scene.idle(10);
    scene.overlay().showText(70)
      .text("Redstone Dust, Repeaters and Comparators pointing into the lamp light it too, including dust on top of it")
      .pointAt(util.vector().of(2.5, 2.1, 2.5))
      .attachKeyFrame();
    scene.idle(80);
    scene.markAsFinished();
  }

  function lampDelay(scene, util) {
    scene.title("redstone_lamp_delay", "Redstone Lamp Timing");
    scene.configureBasePlate(0, 0, 5);
    scene.showBasePlate();
    scene.idle(10);
    scene.world().showSection(util.select().fromTo(1, 1, 2, 2, 1, 2), "DOWN");
    scene.idle(10);
    scene.world().setBlock([2, 1, 2], LIT);
    scene.idle(20);
    scene.world().setBlock([1, 1, 2], "minecraft:air");
    scene.idle(4);
    scene.world().setBlock([2, 1, 2], LAMP);
    scene.overlay().showText(80)
      .text("Once the signal is gone, the lamp takes 4 game ticks to turn off. It conducts redstone, so a powered lamp can drive adjacent components")
      .pointAt(util.vector().centerOf(2, 1, 2))
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
    const head = scene.world().showIndependentSection(util.select().position(2, 1, 2), "WEST");
    scene.world().showSection(util.select().position(1, 1, 2), "EAST");
    scene.idle(15);
    scene.overlay().showText(60)
      .text("A piston pushes the block in front of it up to 12 blocks, as long as the row is not blocked")
      .pointAt(util.vector().centerOf(1, 1, 2))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(30);
    scene.world().moveSection(head, [1, 0, 0], 10);
    scene.idle(40);
    scene.world().hideIndependentSection(head, "EAST");
    scene.idle(20);
    const glued = scene.world().showIndependentSection(util.select().position(2, 1, 3), "WEST");
    scene.world().showSection(util.select().position(1, 1, 3), "EAST");
    scene.idle(10);
    // The planks on top stick to the slime, so they join its section and move with it.
    scene.world().glueBlockOnto([2, 2, 3], "DOWN", glued);
    scene.idle(15);
    scene.overlay().showText(70)
      .text("A sticky piston pulls the block back with it. Slime and honey blocks carry their neighbours along too")
      .pointAt(util.vector().centerOf(2, 1, 3))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(30);
    scene.world().moveSection(glued, [1, 0, 0], 10);
    scene.idle(20);
    scene.world().moveSection(glued, [-1, 0, 0], 10);
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
    scene.world().showSection(util.select().fromTo(1, 1, 1, 2, 1, 1), "DOWN");
    scene.idle(10);
    scene.overlay().showControls(util.vector().topOf(1, 1, 1), "DOWN", 30).rightClick();
    scene.idle(20);
    scene.world().toggleRedstonePower(util.select().position(1, 1, 1));
    scene.world().setBlock([2, 1, 1], LIT);
    scene.effects().indicateRedstone([2, 1, 1]);
    scene.overlay().showText(70)
      .text("A lever stays on until it is used again, and keeps powering whatever is next to it")
      .pointAt(util.vector().centerOf(1, 1, 1))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(80);
    scene.world().showSection(util.select().fromTo(1, 1, 3, 2, 1, 3), "DOWN");
    scene.idle(10);
    scene.overlay().showControls(util.vector().topOf(1, 1, 3), "DOWN", 20).rightClick();
    scene.idle(15);
    scene.world().toggleRedstonePower(util.select().position(1, 1, 3));
    scene.world().setBlock([2, 1, 3], LIT);
    scene.effects().indicateRedstone([2, 1, 3]);
    scene.overlay().showText(70)
      .text("A button gives a short pulse: stone buttons last 10 ticks, wooden ones 15, and an arrow hitting a wooden button sets it off too")
      .pointAt(util.vector().centerOf(1, 1, 3))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(40);
    scene.world().toggleRedstonePower(util.select().position(1, 1, 3));
    scene.world().setBlock([2, 1, 3], LAMP);
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
    scene.world().showSection(util.select().fromTo(1, 1, 2, 3, 1, 2), "DOWN");
    scene.idle(10);
    scene.world().setBlock([2, 1, 2], P.block("minecraft:powered_repeater", { "minecraft:cardinal_direction": "west", repeater_delay: 0 }));
    scene.world().setBlock([3, 1, 2], LIT);
    scene.overlay().showText(70)
      .text("A repeater passes a signal in one direction only, and refreshes it back to full strength")
      .pointAt(util.vector().centerOf(2, 1, 2))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(80);
    scene.overlay().showControls(util.vector().topOf(2, 1, 2), "DOWN", 30).rightClick();
    scene.overlay().showRepeaterScrollInput([2, 1, 2], 40);
    scene.idle(15);
    scene.world().cycleBlockProperty([2, 1, 2], "repeater_delay", [0, 1, 2, 3]);
    scene.overlay().showText(70)
      .text("Using it adds a delay of 1, 2, 3 or 4 ticks. Locking it with another repeater from the side freezes it in place")
      .pointAt(util.vector().centerOf(2, 1, 2))
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
    scene.world().showSection(util.select().fromTo(1, 1, 2, 3, 1, 2), "DOWN");
    scene.idle(10);
    scene.overlay().showText(80)
      .text("A comparator reads the container behind it and outputs a signal from 0 to 15 depending on how full it is")
      .pointAt(util.vector().centerOf(2, 1, 2))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(40);
    scene.world().setBlock([2, 1, 2], P.block("minecraft:powered_comparator", { "minecraft:cardinal_direction": "west", output_lit_bit: true, output_subtract_bit: false }));
    scene.world().setBlock([3, 1, 2], LIT);
    scene.overlay().showCenteredScrollInput([2, 1, 2], "UP", 40);
    scene.idle(50);
    scene.overlay().showControls(util.vector().topOf(2, 1, 2), "DOWN", 30).rightClick();
    scene.overlay().showFilterSlotInput(util.vector().topOf(2, 1, 2), "UP", 40);
    scene.idle(15);
    scene.world().cycleBlockProperty([2, 1, 2], "output_subtract_bit");
    scene.overlay().showText(80)
      .text("Using it switches to subtract mode, where the output is the rear signal minus the stronger of the two side signals")
      .pointAt(util.vector().centerOf(2, 1, 2))
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
    scene.world().showSection(util.select().fromTo(2, 1, 2, 2, 2, 2), "DOWN");
    scene.idle(10);
    scene.overlay().showText(60)
      .text("A hopper pulls items in from above and pushes them into the container it points at")
      .pointAt(util.vector().centerOf(2, 2, 2))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(40);
    scene.world().createItemEntity(util.vector().topOf(2, 3, 2), [0, 0, 0], "minecraft:iron_ingot");
    scene.idle(20);
    scene.world().modifyEntitiesInside(P.ItemEntity, util.select().position(2, 3, 2), e => e.discard());
    scene.idle(10);
    scene.world().createItemEntity(util.vector().centerOf(2, 1, 2), [0, 0.05, 0], "minecraft:iron_ingot");
    scene.overlay().showText(70)
      .text("It moves one item every 8 ticks. Powering it with redstone stops it until the signal goes away")
      .pointAt(util.vector().centerOf(2, 1, 2))
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
    scene.world().showSection(util.select().position(2, 1, 2), "DOWN");
    scene.idle(15);
    scene.overlay().showControls(util.vector().topOf(2, 1, 2), "DOWN", 40).leftClick().withItem("minecraft:stone_pickaxe");
    scene.idle(10);
    for (let i = 0; i < 10; i++) {
      scene.world().incrementBlockBreakingProgress([2, 1, 2]);
      scene.idle(3);
    }
    scene.world().createItemEntity(util.vector().centerOf(2, 1, 2), [0, 0.2, 0], "minecraft:raw_iron");
    scene.overlay().showText(70)
      .sharedText("drops", P.itemName("minecraft:raw_iron"))
      .pointAt(util.vector().centerOf(2, 1, 2))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(80);
    scene.overlay().showText(70)
      .text("Iron ore needs a stone pickaxe or better. Mined with anything weaker, it drops nothing")
      .pointAt(util.vector().centerOf(2, 1, 2))
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
    scene.world().showSection(util.select().layer(1), "DOWN");
    scene.idle(15);
    scene.overlay().showControls(util.vector().topOf(2, 1, 2), "DOWN", 30).rightClick().withItem("minecraft:bone_meal");
    scene.idle(20);
    scene.effects().emitParticles(util.vector().topOf(2, 1, 2), growthEmitter, 4, 10);
    const near = [[1, 2], [3, 2], [2, 1], [2, 3], [1, 1], [3, 3], [1, 3], [3, 1], [0, 2], [4, 2], [2, 0], [2, 4]];
    near.forEach(([x, z], i) => {
      if (i % 4 === 0) scene.idle(4);
      scene.world().setBlock([x, 1, z], "minecraft:moss_block");
    });
    scene.overlay().showText(80)
      .text("Bone meal on a moss block turns stone, dirt and similar blocks around it into moss")
      .pointAt(util.vector().topOf(2, 1, 2))
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
    scene.world().setBlock(pos, null);
    scene.world().createEntity(world => new PrimedTnt(world, pos[0] + 0.5, pos[1], pos[2] + 0.5));
    scene.idle(80);
    scene.effects().emitParticles(util.vector().centerOf(pos[0], pos[1], pos[2]), explosionEmitter, 6, 4);
    scene.world().setBlocks(util.select().fromTo(1, 1, 1, 3, 2, 3), null, true);
    scene.world().setBlock([2, 0, 2], "vanilla:scorched_stone");
    [[0.15, 0.3, 0], [-0.15, 0.3, 0.05], [0, 0.35, -0.15]].forEach(motion =>
      scene.world().createItemEntity(util.vector().centerOf(2, 1, 2), motion, "minecraft:cobblestone"));
  }

  function tnt(scene, util) {
    scene.title("tnt", "TNT");
    scene.configureBasePlate(0, 0, 5);
    scene.showBasePlate();
    scene.idle(10);
    scene.world().showSection(util.select().fromTo(1, 1, 1, 3, 2, 3), "DOWN");
    scene.idle(15);
    scene.overlay().showControls(util.vector().topOf(2, 2, 2), "DOWN", 30).rightClick().withItem("minecraft:flint_and_steel");
    scene.idle(20);
    scene.overlay().showText(70)
      .text("Flint and steel, fire or a redstone signal lights TNT. It hops up and explodes 4 seconds later")
      .pointAt(util.vector().centerOf(2, 2, 2))
      .placeNearTarget()
      .attachKeyFrame();
    ignite(scene, util, [2, 2, 2]);
    scene.idle(20);
    scene.overlay().showText(70)
      .text("The blast breaks the blocks around it, and only some of them drop as items")
      .pointAt(util.vector().topOf(2, 0, 2))
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
    scene.world().showSection(util.select().fromTo(1, 1, 1, 3, 2, 3), "DOWN");
    scene.idle(15);
    scene.overlay().showControls(util.vector().topOf(1, 2, 2), "DOWN", 30).rightClick();
    scene.idle(20);
    scene.world().toggleRedstonePower(util.select().position(1, 2, 2));
    scene.effects().indicateRedstone([2, 2, 2]);
    scene.overlay().showText(70)
      .text("A lever, or any other signal reaching the TNT, lights it as well")
      .pointAt(util.vector().centerOf(2, 2, 2))
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

(function () {
  const P = window.Ponder;

  // A test of what Ponder draws besides plain blocks: mobs, a parrot and a minecart, a bed, a
  // banner, a waterlogged slab, and water against glass and leaves.
  const entityPlate = {
    size: { x: 7, y: 3, z: 7 },
    fill(world) {
      for (let x = 0; x < 7; x++) for (let z = 0; z < 7; z++)
        world.setBlock(x, 0, z, (x + z) % 2 === 0 ? "minecraft:snow" : "minecraft:light_gray_terracotta");
      world.setBlock(1, 1, 1, P.block("minecraft:bed", { direction: 2, head_piece_bit: true }, { nbt: { id: "Bed", color: 11 } }));
      world.setBlock(1, 1, 2, P.block("minecraft:bed", { direction: 2, head_piece_bit: false }, { nbt: { id: "Bed", color: 11 } }));
      world.setBlock(5, 1, 1, P.block("minecraft:standing_banner", { ground_sign_direction: 0 },
        { nbt: { id: "Banner", Base: 15, Patterns: [{ Color: 1, Pattern: "cre" }], Type: 0 } }));
      world.setBlock(1, 1, 5, P.block("minecraft:smooth_stone_slab", { "minecraft:vertical_half": "bottom" }, { liquid: P.block("minecraft:water", { liquid_depth: 0 }) }));
      world.setBlock(2, 1, 5, P.block("minecraft:water", { liquid_depth: 0 }));
      world.setBlock(3, 1, 5, "minecraft:glass");
      world.setBlock(2, 1, 4, "minecraft:oak_leaves");
    },
  };

  // A mob walking straight ahead for `ticks` ticks, its own tick setting its speed first.
  const walker = ticks => e => {
    const tick = e.tick.bind(e);
    e.tick = () => { if (e.tickCount < ticks) e.xd = 0.05; tick(); };
  };

  function entities(scene, util) {
    scene.title("entities", "Entities, Beds and Banners");
    scene.configureBasePlate(0, 0, 7);
    scene.showBasePlate();
    scene.idle(10);
    scene.world().showSection(util.select().fromTo(0, 1, 0, 6, 2, 6), "DOWN");
    scene.idle(10);
    const birb = scene.special().createBirb(util.vector().topOf(3, 1, 5), P.ParrotPose.FacePointOfInterestPose);
    scene.special().createCart(util.vector().topOf(5, 0, 5), 90, (world, x, y, z) => new P.ClientEntity(world, "minecraft:chest_minecart", x, y, z));
    scene.world().createClientEntity("minecraft:sheep", [3.5, 1, 3], 0);
    scene.world().createClientEntity("minecraft:cat", [5.5, 1, 3], 0);
    scene.world().createClientEntity("minecraft:cow", [0.5, 1, 6], 270, walker(60));
    scene.idle(10);
    scene.overlay().showText(80)
      .text("Mobs are drawn from their Bedrock models, animations and render controllers")
      .pointAt(util.vector().centerOf(3, 1, 3))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(90);
    scene.special().changeBirbPose(birb, P.ParrotPose.FlappyPose);
    scene.special().moveParrot(birb, [0, 1, 0], 20);
    scene.idle(30);
    scene.overlay().showText(80)
      .text("Beds and banners take their colour and patterns from their block entity data")
      .pointAt(util.vector().centerOf(1, 1, 1))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(40);
    scene.world().modifyBlockEntityNBT(util.select().position(5, 1, 1), P.BannerBlockEntity, nbt => { nbt.getList("patterns").push({ color: "yellow", pattern: "minecraft:border" }); });
    scene.idle(50);
    scene.overlay().showText(80)
      .text("Water fills waterlogged blocks; its side against glass or leaves shows water_overlay")
      .pointAt(util.vector().centerOf(2, 1, 5))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(90);
    scene.markAsFinished();
  }

  parts.push({
    registerScenes(helper) {
      helper.forComponents("minecraft:lead").addStoryBoard(entityPlate, entities);
    },
  });
})();

(function () {
  const P = window.Ponder;
  const plate = fill => ({ size: { x: 7, y: 5, z: 7 }, fill(world) {
    for (let x = 0; x < 7; x++) for (let z = 0; z < 7; z++) world.setBlock(x, 0, z, "minecraft:smooth_stone");
    fill(world);
  } });
  const reveal = (scene, util, id, title) => {
    scene.title(id, title); scene.configureBasePlate(0, 0, 7); scene.showBasePlate();
    scene.idle(10); scene.world().showSection(util.select().layersFrom(1), "DOWN"); scene.idle(20);
  };
  const text = (scene, message, pos) => {
    scene.overlay().showText(80).text(message).pointAt(pos).placeNearTarget().attachKeyFrame();
    scene.idle(90);
  };
  const details = plate(world => {
    [[1, 1, "chest"], [3, 1, "purple_shulker_box"], [5, 1, "campfire"], [1, 3, "standing_sign"],
      [3, 3, "bell"], [5, 3, "lectern"], [1, 5, "enchanting_table"], [3, 5, "decorated_pot"], [5, 5, "piglin_head"]]
      .forEach(([x, z, id]) => world.setBlock(x, 1, z, P.block("minecraft:" + id, { facing_direction: 1 })));
    world.setBlock(5, 0, 5, "minecraft:redstone_block");
  });
  function blockDetails(scene, util) {
    reveal(scene, util, "block_details", "Block Details");
    scene.world().modifyBlockEntity([1, 1, 1], P.ChestBlockEntity, e => e.startOpen());
    scene.world().modifyBlockEntity([3, 1, 1], P.ShulkerBoxBlockEntity, e => e.startOpen());
    scene.world().modifyBlockEntity([5, 1, 1], P.CampfireBlockEntity, e => { e.setItem(0, "minecraft:potato"); e.setItem(2, "minecraft:cod"); });
    scene.world().modifyBlockEntity([1, 1, 3], P.SignBlockEntity, e => {
      e.setText({ messages: ['"Ponder"', '"Hello!"'], color: "blue", has_glowing_text: true });
      e.setText({ messages: ['"Back"'], color: "red", has_glowing_text: false }, false);
    });
    scene.world().modifyBlockEntityNBT(util.select().position(5, 1, 3), P.LecternBlockEntity, nbt => { nbt.Book = { id: "minecraft:written_book", count: 1 }; });
    scene.world().modifyBlockEntityNBT(util.select().position(3, 1, 5), P.DecoratedPotBlockEntity, nbt => {
      nbt.sherds = ["angler", "archer", "arms_up", "heart"].map(name => "minecraft:" + name + "_pottery_sherd");
    });
    text(scene, "Containers open, food rests on the campfire, and the sign has writing on both sides", [1.5, 1.8, 1.5]);
    scene.world().modifyBlockEntity([3, 1, 3], P.BellBlockEntity, e => e.onHit("NORTH"));
    scene.world().modifyBlockEntity([3, 1, 5], P.DecoratedPotBlockEntity, e => e.wobble("POSITIVE"));
    scene.world().modifyBlockEntity([1, 1, 1], P.ChestBlockEntity, e => e.stopOpen());
    scene.world().modifyBlockEntity([3, 1, 1], P.ShulkerBoxBlockEntity, e => e.stopOpen());
    scene.rotateCameraY(90);
    text(scene, "The bell swings, the pot wobbles, and the powered head moves its ears", [3.5, 1.5, 3.5]);
    scene.markAsFinished();
  }
  const effects = plate(world => {
    for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) world.setBlock(x, 0, z, "minecraft:iron_block");
    world.setBlock(1, 1, 1, "minecraft:beacon"); world.setBlock(1, 2, 1, "minecraft:blue_stained_glass");
    world.setBlock(3, 1, 1, P.block("minecraft:trial_spawner", { trial_spawner_state: 2 }, { nbt: { PonderJavaData: { spawn_data: { entity: { id: "minecraft:blaze" } } } } }));
    world.setBlock(5, 1, 1, "minecraft:vault"); world.setBlock(1, 1, 4, "minecraft:end_portal");
    world.setBlock(3, 1, 4, P.block("minecraft:end_gateway", {}, { nbt: { Age: 300 } }));
    world.setBlock(5, 1, 3, P.block("minecraft:suspicious_sand", { brushed_progress: 3 }));
    world.setBlock(1, 1, 6, "minecraft:conduit"); world.setBlock(5, 1, 5, "minecraft:mob_spawner");
  });
  function blockEffects(scene, util) {
    scene.getScene().entityTypes.push("minecraft:blaze", "minecraft:pig");
    reveal(scene, util, "block_effects", "Light and Moving Parts");
    scene.world().modifyBlockEntity([5, 1, 1], P.VaultBlockEntity, e => e.getSharedData().setDisplayItem("minecraft:diamond"));
    scene.world().modifyBlockEntityNBT(util.select().position(5, 1, 3), P.BrushableBlockEntity, nbt => { nbt.item = { id: "minecraft:emerald", count: 1 }; nbt.hit_direction = 3; });
    text(scene, "Glass colours the beacon beam; spawners, the vault and suspicious sand display their contents", [3.5, 1.5, 1.5]);
    scene.world().setBlock([3, 1, 6], P.block("minecraft:moving_block", {}, { nbt: {
      movingBlock: { name: "minecraft:piston_arm_collision", states: { facing_direction: 1 } },
      PonderJavaData: { facing: 1, source: false, extending: true, progress: 0 },
    } }), false);
    text(scene, "Portal surfaces move independently of the camera; the piston head extends into place", [3.5, 1.5, 4.5]);
    scene.markAsFinished();
  }
  const water = plate(world => {
    for (let x = 0; x < 7; x++) for (let z = 1; z < 6; z++) world.setBlock(x, 1, z, "minecraft:water");
    world.setBlock(1, 1, 0, P.block("minecraft:smooth_stone_slab", { "minecraft:vertical_half": "bottom" }, { liquid: P.block("minecraft:water") }));
    world.setBlock(3, 1, 0, P.block("minecraft:oak_stairs", { weirdo_direction: 2 }, { liquid: P.block("minecraft:water") }));
    world.setBlock(5, 1, 0, "minecraft:bamboo");
  });
  function boats(scene, util) {
    reveal(scene, util, "boats", "Boats and Water");
    scene.world().createClientEntity("minecraft:boat", [1.5, 1.5, 3], 0, e => { e.noGravity = true; e.paddles = [true, true]; });
    scene.world().createClientEntity("minecraft:chest_boat", [3.5, 1.5, 3], 0, e => { e.noGravity = true; });
    scene.world().createClientEntity("minecraft:boat", [5.5, 1.5, 3], 0, e => { e.noGravity = true; e.variant = 7; });
    text(scene, "Boats keep water outside the hull; bamboo rafts and chest boats have their own shapes", [1.5, 2, 3]);
    scene.rotateCameraY(90);
    text(scene, "Slabs and stairs keep their shape underwater; Identify follows their actual outline", [3.5, 1.5, 0.5]);
    scene.markAsFinished();
  }
  function equipment(scene, util) {
    scene.getScene().entityTypes.push("minecraft:diamond_helmet", "minecraft:diamond_chestplate", "minecraft:diamond_leggings", "minecraft:diamond_boots", "minecraft:diamond_sword", "minecraft:shield");
    reveal(scene, util, "equipment", "Equipment and Materials");
    const zombie = scene.world().createClientEntity("minecraft:zombie", [2, 1, 3], 180, e => {
      for (const [slot, piece] of [["head", "helmet"], ["chest", "chestplate"], ["legs", "leggings"], ["feet", "boots"]])
        e.setItemSlot(slot, { id: "minecraft:diamond_" + piece, components: { "minecraft:trim": { pattern: "minecraft:sentry", material: "minecraft:gold" } } });
      e.setItemSlot("mainhand", { id: "minecraft:diamond_sword", enchanted: true });
      e.setItemSlot("offhand", { id: "minecraft:shield", components: { "minecraft:base_color": "blue", "minecraft:banner_patterns": [{ pattern: "minecraft:cross", color: "white" }] } });
    });
    text(scene, "Armour and held items follow the wearer; the sword carries an enchantment glint", [2, 2.5, 3]);
    scene.world().modifyEntity(zombie, e => { e.yRot = 270; e.yHeadRot = 270; });
    text(scene, "Trim stays on the armour and the shield keeps its pattern while the wearer turns", [2, 2, 3]);
    scene.world().modifyEntity(zombie, e => e.discard());
    scene.world().createClientEntity("minecraft:spider", [2, 1, 3], 180);
    scene.world().createClientEntity("minecraft:creeper", [5, 1, 4], 180, e => e.setQuery("is_powered", 1));
    text(scene, "Spider eyes glow and charged creepers shimmer", [5, 2, 4]);
    scene.markAsFinished();
  }
  function items(scene, util) {
    reveal(scene, util, "item_details", "Items and Particles");
    const stacks = [P.block("minecraft:oak_stairs", { weirdo_direction: 2 }), "minecraft:blue_bed",
      { id: "minecraft:diamond_sword", enchanted: true }, { id: "minecraft:potion", components: { "minecraft:potion_contents": { potion: "minecraft:swiftness" } } },
      { id: "minecraft:leather_chestplate", components: { "minecraft:dyed_color": 0x2277ff } }, { id: "minecraft:shield", components: { "minecraft:base_color": "blue", "minecraft:banner_patterns": [{ pattern: "minecraft:border", color: "yellow" }] } }];
    stacks.forEach((item, i) => scene.world().createItemEntity([1.5 + i % 3 * 2, 2, 2 + Math.floor(i / 3) * 2], [0, 0, 0], item));
    text(scene, "Dropped blocks keep their shape, items have thickness, and dyed layers keep their colour", [3.5, 1.5, 3]);
    [P.ParticleTypes.HEART, P.ParticleTypes.NOTE, P.ParticleTypes.END_ROD].forEach((particle, i) =>
      scene.effects().emitParticles([1.5 + i * 2, 1.5, 3], scene.effects().simpleParticleEmitter(particle, [0, 0.1, 0]), 1, 8));
    scene.world().createClientEntity("minecraft:xp_orb", [3.5, 1.4, 3.5], 0, e => { e.noGravity = true; });
    text(scene, "Hearts rise, notes change colour, and end rods fade as they drift", [3.5, 1.5, 3]);
    [P.ParticleTypes.PORTAL, P.ParticleTypes.TOTEM_OF_UNDYING, P.dustTransition(0xff4444, 0x4488ff, 1)].forEach((particle, i) =>
      scene.effects().emitParticles([1.5 + i * 2, 2.5, 3], scene.effects().simpleParticleEmitter(particle, [0.2, 0.1, 0]), 2, 12));
    text(scene, "Portal particles return to their origin, totems fall, and dust changes colour smoothly", [3.5, 2, 3]);
    scene.markAsFinished();
  }
  parts.push({ registerScenes(helper) {
    helper.forComponents("minecraft:paper").addStoryBoard(details, blockDetails).addStoryBoard(effects, blockEffects)
      .addStoryBoard(water, boats).addStoryBoard(plate(() => {}), equipment).addStoryBoard(plate(() => {}), items);
  } });
})();

  // One plugin for all groups: each method asks every part, in order (redstone's tag first, so
  // mining can add TNT to it).
  const plugin = { getModId() { return "vanilla"; }, name: "Minecraft" };
  ["registerScenes", "registerTags", "registerSharedText", "indexExclusions"].forEach(method => {
    plugin[method] = helper => parts.forEach(part => { if (part[method]) part[method](helper); });
  });
  P.addPlugin(plugin);
})();
