import {
  defineBlockStructure,
  defineEntityStructure,
  defineStage,
} from "../../foundation/PonderScene.js";

const platformTiles = [];
const platformTileIds = [];

for (let x = 1; x <= 6; x += 1) {
  for (let z = 1; z <= 6; z += 1) {
    const id = `platform_${x}_${z}`;
    platformTileIds.push(id);
    platformTiles.push(
      defineBlockStructure(
        id,
        (x + z) % 2 === 0 ? "minecraft:light_gray_terracotta" : "minecraft:snow",
        { x, y: 0, z },
      ),
    );
  }
}

export const redstoneLampDemoScene = {
  id: "redstone_lamp_demo",
  title: "红石灯",
  iconPath: "textures/blocks/redstone_lamp_off",
  entryItems: ["minecraft:redstone_lamp"],
  stagePresetId: "demo_8x8x8",
  specialBlockIcons: [
    {
      iconPath: "textures/blocks/redstone_block",
      tooltipText: "红石块会持续输出信号，且不能关闭。",
    },
  ],
  structures: [
    ...platformTiles,
    defineBlockStructure("lamp_off", "minecraft:redstone_lamp", {
      x: 3,
      y: 1,
      z: 3,
    }),
    defineBlockStructure("adjacent_power_block", "minecraft:redstone_block", {
      x: 2,
      y: 1,
      z: 3,
    }),
    defineBlockStructure("top_dust", "minecraft:redstone_wire", {
      x: 3,
      y: 2,
      z: 3,
    }),
    defineBlockStructure("relay_lamp_on", "minecraft:redstone_lamp", {
      x: 4,
      y: 1,
      z: 3,
    }),
    defineEntityStructure(
      "pp",
      "minecraft:armor_stand",
      { x: 3, y: 2, z: 3 },
      {
        rotation: { x: 0, y: 180 },
        //spawnEvent: "minecraft:entity_spawned",
        nameTag: "PP",
        triggerEvents: [],
      },
    ),
  ],
  stages: [
    defineStage({
      description: "红石灯默认不会自己发亮，只有收到红石信号才会立刻点亮。",
      pointAt: { x: 3.5, y: 1.5, z: 3.5 }, // 可选：气泡指向的点，相对坐标，可带小数
      add: [...platformTileIds, "lamp_off", "pp"],
      remove: [],
    }),
    defineStage({
      description: "毗邻的开启电源或毗邻的充能方块都能直接点亮红石灯。",
      pointAt: { x: 2.5, y: 1.5, z: 3.5 },
      add: ["adjacent_power_block"],
      remove: [],
    }),
    defineStage({
      description: "指向红石灯的红石粉、中继器、比较器也能点亮它，包括红石灯上方的红石粉。",
      pointAt: { x: 3.5, y: 2.1, z: 3.5 },
      add: ["top_dust"],
      remove: [],
    }),
    defineStage({
      description: "红石灯失去信号后要过 4 游戏刻才会熄灭，而且它本身是红石导体，被充能时也能继续带动相邻元件。",
      pointAt: { x: 4.5, y: 1.5, z: 3.5 },
      add: ["relay_lamp_on"],
      remove: [],
    }),
  ],
};
