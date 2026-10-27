// Redstone lamp: two scenes and a tag, written like Create's ponder storyboards.
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

  P.registerTag({
    id: "redstone",
    title: { en_us: "Redstone", zh_cn: "红石" },
    description: { en_us: "Components which help with redstone engineering", zh_cn: "帮助你进行红石工程的元件" },
    icon: "minecraft:redstone",
  });
  P.addToTag("redstone", [LAMP, "minecraft:redstone_block", "minecraft:repeater", "minecraft:comparator"]);
  P.itemNames[LAMP] = { en_us: "Redstone Lamp", zh_cn: "红石灯" };
  P.itemNames["minecraft:redstone"] = { en_us: "Redstone Dust", zh_cn: "红石粉" };
  P.itemNames["minecraft:redstone_block"] = { en_us: "Block of Redstone", zh_cn: "红石块" };

  P.registerScene({
    id: "redstone_lamp", items: [LAMP], tags: ["redstone"], schematic,
    storyboard(scene, util) {
      scene.title("redstone_lamp", { en_us: "Redstone Lamp", zh_cn: "红石灯" });
      scene.configureBasePlate(0, 0, 5);
      scene.showBasePlate();
      scene.idle(10);
      scene.world.showSection(util.select.position(2, 1, 2), "DOWN");
      scene.idle(10);
      scene.overlay.showText(70)
        .text("红石灯默认不会自己发亮，只有收到红石信号才会立刻点亮。")
        .pointAt(util.vector.centerOf(2, 1, 2))
        .placeNearTarget()
        .attachKeyFrame();
      scene.idle(80);
      scene.world.showSection(util.select.position(1, 1, 2), "EAST");
      scene.idle(10);
      scene.world.setBlock([2, 1, 2], "minecraft:lit_redstone_lamp");
      scene.overlay.showText(70)
        .text("毗邻的开启电源或毗邻的充能方块都能直接点亮红石灯。")
        .pointAt(util.vector.centerOf(1, 1, 2))
        .placeNearTarget()
        .attachKeyFrame();
      scene.idle(80);
      scene.world.showSection(util.select.position(2, 2, 2), "DOWN");
      scene.idle(10);
      scene.overlay.showText(70)
        .text("指向红石灯的红石粉、中继器、比较器也能点亮它，包括红石灯上方的红石粉。")
        .pointAt(util.vector.of(2.5, 2.1, 2.5))
        .attachKeyFrame();
      scene.idle(80);
      scene.markAsFinished();
    },
  });

  P.registerScene({
    id: "redstone_lamp_delay", items: [LAMP], tags: ["redstone"], schematic,
    storyboard(scene, util) {
      scene.title("redstone_lamp_delay", { en_us: "Redstone Lamp Timing", zh_cn: "红石灯的熄灭延迟" });
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
        .text("红石灯失去信号后要过 4 游戏刻才会熄灭，而且它本身是红石导体，被充能时也能继续带动相邻元件。")
        .pointAt(util.vector.centerOf(2, 1, 2))
        .attachKeyFrame();
      scene.idle(90);
      scene.rotateCameraY(90);
      scene.idle(20);
      scene.markAsFinished();
    },
  });
})();
