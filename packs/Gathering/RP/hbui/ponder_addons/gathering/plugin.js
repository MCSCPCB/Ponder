// A second Ponder plugin from another pack: mining, bone meal and TNT. It shows what a plugin can
// add on top of the scene instructions: its own particles (subclasses of P.Particle) and its own
// entity (a subclass of P.PonderEntity with render()). It also puts TNT into the Redstone pack's
// "redstone" tag and adds a lever scene after that pack's, so both packs' scenes show for levers.
// Strings are the English defaults; texts/*.lang has them under gathering.ponder.* keys.
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
  P.registerBlockModel("gathering:scorched_stone", () => {
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
    scene.world.setBlock([2, 0, 2], "gathering:scorched_stone");
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

  P.addPlugin({
    modId: "gathering",
    name: "Gathering",
    registerScenes(helper) {
      helper.forComponents("minecraft:iron_ore", "minecraft:deepslate_iron_ore")
        .addStoryBoard(orePlate, mining, "mining");
      helper.forComponents("minecraft:moss_block")
        .addStoryBoard(mossPlate, moss, "mining");
      helper.forComponents("minecraft:tnt")
        .addStoryBoard(tntPlate, tnt, "mining", "redstone:redstone");
      // Another pack's tag and scene are named with their namespace.
      helper.forComponents("minecraft:lever")
        .addStoryBoard(leverTntPlate, leverTnt, entry => entry
          .highlightTag("redstone:redstone")
          .orderAfter("redstone", "inputs"));
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
      helper.addToTag("redstone:redstone")
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
