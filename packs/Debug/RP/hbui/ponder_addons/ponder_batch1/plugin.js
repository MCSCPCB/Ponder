(function () {
  const P = window.Ponder;
  function plate(size, fill) {
    return { size: { x: size, y: 5, z: size }, fill(world) {
      for (let x = 0; x < size; x++) for (let z = 0; z < size; z++)
        world.setBlock(x, 0, z, (x + z) % 2 ? "minecraft:light_gray_terracotta" : "minecraft:snow");
      if (fill) fill(world);
    } };
  }
  const mobs = plate(7);
  const wall = plate(8, world => {
    for (let z = 1; z < 7; z++) for (let y = 1; y < 4; y++) world.setBlock(6, y, z, "minecraft:glass");
  });
  const crops = plate(8, world => {
    ["beetroot", "carrot", "potato", "wheat", "torchflower_crop"].forEach((crop, row) => {
      for (let stage = 0; stage < 8; stage++) world.setBlock(stage, 1, row + 1,
        P.block("farmersdelight:rich_soil_" + crop, { "farmersdelight:growth": stage }));
    });
  });
  function defaults(scene) {
    scene.title("defaults", "第 1 批：实体显示与尖牙");
    scene.configureBasePlate(0, 0, 7); scene.showBasePlate(); scene.idle(10);
    scene.effects.createClientEntity("minecraft:slime", [1.5, 1, 1.5], 0);
    scene.effects.createClientEntity("minecraft:magma_cube", [3.5, 1, 1.5], 0);
    scene.effects.createClientEntity("minecraft:sheep", [1.5, 1, 4.5], 0);
    scene.effects.createClientEntity("minecraft:cat", [3.5, 1, 4.5], 0);
    scene.effects.createClientEntity("minecraft:vex", [5.5, 2, 4.5], 0, e => { e.noGravity = true; });
    scene.overlay.showText(90).text("猫应四脚着地、身体横向；羊后腿与身体交界处应完整，无凹洞。").pointAt([2.5, 1, 4.5]).placeNearTarget();
    scene.idle(100);
    scene.overlay.showText(110).text("右侧尖牙会连续出现 4 次：升起、咬合、收缩消失。").pointAt([5.5, 1, 1.5]).placeNearTarget();
    for (let i = 0; i < 4; i++) {
      scene.effects.createClientEntity("minecraft:evocation_fang", [5.5, 1, 1.5], 0);
      scene.idle(30);
    }
    scene.markAsFinished();
  }
  function collision(scene, util) {
    scene.title("collision", "第 1 批：碰撞箱");
    scene.configureBasePlate(0, 0, 8); scene.showBasePlate();
    scene.world.showSection(util.select.fromTo(6, 1, 1, 6, 3, 6), "DOWN"); scene.idle(20);
    [1, 4].forEach((size, lane) => scene.effects.createClientEntity("minecraft:slime", [1.5, 1, 2 + lane * 3], 270, e => {
      e.variant = size;
      const tick = e.tick.bind(e);
      e.tick = function () { if (e.tickCount < 100) e.xd = 0.06; tick(); };
    }));
    scene.overlay.showText(90).text("大小史莱姆向玻璃墙移动，应各自在身体边缘贴墙时停下。").pointAt([6, 1, 3.5]).placeNearTarget();
    scene.idle(110);
    scene.overlay.showText(90).text("大史莱姆的中心离墙更远；两者都不应穿入墙里。").pointAt([6, 1, 3.5]).placeNearTarget();
    scene.idle(100); scene.markAsFinished();
  }
  function cropTextures(scene, util) {
    scene.title("crops", "第 1 批：农夫乐事原版作物贴图");
    scene.configureBasePlate(0, 0, 8); scene.showBasePlate();
    scene.world.showSection(util.select.layersFrom(1), "DOWN"); scene.idle(20);
    scene.overlay.showText(100).text("五排依次为甜菜、胡萝卜、马铃薯、小麦、火把花。每排从幼苗到成熟；应有作物图案，无紫黑缺图。").pointAt([3.5, 1, 3]).placeNearTarget();
    scene.idle(160); scene.markAsFinished();
  }
  P.addPlugin({ modId: "ponder_batch1", name: "第 1 批验收", registerScenes(helper) {
    helper.forComponents("minecraft:slime_ball").addStoryBoard(mobs, defaults).addStoryBoard(wall, collision);
    helper.forComponents("minecraft:beetroot").addStoryBoard(crops, cropTextures);
  } });
})();
