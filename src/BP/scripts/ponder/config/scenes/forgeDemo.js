import {
  defineBlockStructure,
  defineBoxStructure,
  defineScene,
  defineStage,
} from "../factories.js";

export const forgeDemoScene = defineScene({
  id: "forge_demo",
  title: "Forge Walkthrough",
  iconPath: "textures/items/blaze_rod",
  specialBlockIcons: [
    {
      iconPath: "textures/items/coal",
      tooltipText: "Blast Furnace",
    },
    {
      iconPath: "textures/items/iron_ingot",
      tooltipText: "Anvil",
    },
    {
      iconPath: "textures/items/redstone_dust",
      tooltipText: "Gold Block",
    },
    {
      iconPath: "textures/items/diamond",
      tooltipText: "Sea Lantern",
    },
  ],
  entryItems: ["minecraft:blaze_rod"],
  stagePresetId: "demo_16x16x16",
  tickingAreaName: "ponder_demo_forge",
  structures: [
    defineBoxStructure(
      "forge_base",
      "minecraft:deepslate_bricks",
      { x: 0, y: 0, z: 0 },
      { x: 15, y: 0, z: 15 },
    ),
    defineBoxStructure(
      "forge_floor",
      "minecraft:smooth_stone",
      { x: 1, y: 1, z: 1 },
      { x: 14, y: 1, z: 14 },
    ),
    defineBoxStructure(
      "pillar_nw",
      "minecraft:polished_blackstone_bricks",
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 6, z: 0 },
    ),
    defineBoxStructure(
      "pillar_ne",
      "minecraft:polished_blackstone_bricks",
      { x: 15, y: 1, z: 0 },
      { x: 15, y: 6, z: 0 },
    ),
    defineBoxStructure(
      "pillar_sw",
      "minecraft:polished_blackstone_bricks",
      { x: 0, y: 1, z: 15 },
      { x: 0, y: 6, z: 15 },
    ),
    defineBoxStructure(
      "pillar_se",
      "minecraft:polished_blackstone_bricks",
      { x: 15, y: 1, z: 15 },
      { x: 15, y: 6, z: 15 },
    ),
    defineBoxStructure(
      "wall_north",
      "minecraft:stone_bricks",
      { x: 1, y: 2, z: 0 },
      { x: 14, y: 5, z: 0 },
    ),
    defineBoxStructure(
      "wall_south",
      "minecraft:stone_bricks",
      { x: 1, y: 2, z: 15 },
      { x: 14, y: 5, z: 15 },
    ),
    defineBoxStructure(
      "wall_west",
      "minecraft:stone_bricks",
      { x: 0, y: 2, z: 1 },
      { x: 0, y: 5, z: 14 },
    ),
    defineBoxStructure(
      "wall_east",
      "minecraft:stone_bricks",
      { x: 15, y: 2, z: 1 },
      { x: 15, y: 5, z: 14 },
    ),
    defineBoxStructure(
      "entry_frame",
      "minecraft:cut_copper",
      { x: 5, y: 2, z: 1 },
      { x: 10, y: 5, z: 2 },
    ),
    defineBoxStructure(
      "west_catwalk",
      "minecraft:spruce_planks",
      { x: 2, y: 2, z: 11 },
      { x: 5, y: 2, z: 13 },
    ),
    defineBoxStructure(
      "east_catwalk",
      "minecraft:spruce_planks",
      { x: 10, y: 2, z: 2 },
      { x: 13, y: 2, z: 4 },
    ),
    defineBoxStructure(
      "scaffold_bridge",
      "minecraft:oak_planks",
      { x: 6, y: 2, z: 3 },
      { x: 9, y: 2, z: 5 },
    ),
    defineBoxStructure(
      "core_plinth",
      "minecraft:polished_andesite",
      { x: 6, y: 2, z: 6 },
      { x: 9, y: 3, z: 9 },
    ),
    defineBoxStructure(
      "roof_north",
      "minecraft:dark_oak_log",
      { x: 1, y: 7, z: 1 },
      { x: 14, y: 7, z: 1 },
    ),
    defineBoxStructure(
      "roof_south",
      "minecraft:dark_oak_log",
      { x: 1, y: 7, z: 14 },
      { x: 14, y: 7, z: 14 },
    ),
    defineBoxStructure(
      "roof_west",
      "minecraft:dark_oak_log",
      { x: 1, y: 7, z: 2 },
      { x: 1, y: 7, z: 13 },
    ),
    defineBoxStructure(
      "roof_east",
      "minecraft:dark_oak_log",
      { x: 14, y: 7, z: 2 },
      { x: 14, y: 7, z: 13 },
    ),
    defineBoxStructure(
      "roof_spine",
      "minecraft:dark_oak_planks",
      { x: 3, y: 8, z: 7 },
      { x: 12, y: 8, z: 8 },
    ),
    defineBoxStructure(
      "skylight",
      "minecraft:tinted_glass",
      { x: 5, y: 9, z: 5 },
      { x: 10, y: 9, z: 10 },
    ),
    defineBoxStructure(
      "chimney_left",
      "minecraft:stone_bricks",
      { x: 2, y: 6, z: 12 },
      { x: 3, y: 9, z: 13 },
    ),
    defineBoxStructure(
      "chimney_right",
      "minecraft:stone_bricks",
      { x: 12, y: 6, z: 2 },
      { x: 13, y: 9, z: 3 },
    ),
    defineBlockStructure("smelter_left", "minecraft:blast_furnace", {
      x: 3,
      y: 2,
      z: 6,
    }),
    defineBlockStructure("smelter_right", "minecraft:blast_furnace", {
      x: 12,
      y: 2,
      z: 9,
    }),
    defineBlockStructure("anvil_left", "minecraft:anvil", { x: 4, y: 2, z: 9 }),
    defineBlockStructure("anvil_right", "minecraft:anvil", { x: 11, y: 2, z: 6 }),
    defineBlockStructure("power_core_gold", "minecraft:gold_block", {
      x: 7,
      y: 4,
      z: 7,
    }),
    defineBlockStructure("power_core_redstone", "minecraft:redstone_block", {
      x: 8,
      y: 4,
      z: 8,
    }),
    defineBlockStructure("beacon_nw", "minecraft:sea_lantern", { x: 1, y: 8, z: 1 }),
    defineBlockStructure("beacon_ne", "minecraft:sea_lantern", { x: 14, y: 8, z: 1 }),
    defineBlockStructure("beacon_sw", "minecraft:sea_lantern", { x: 1, y: 8, z: 14 }),
    defineBlockStructure("beacon_se", "minecraft:sea_lantern", { x: 14, y: 8, z: 14 }),
  ],
  stages: [
    defineStage({
      bubbleSlot: "top",
      description:
        "Block out the 16 by 16 footprint first so the rest of the forge has a clear base to land on.",
      add: ["forge_base", "forge_floor"],
    }),
    defineStage({
      description:
        "Raise the perimeter walls and anchor the four corners with taller blackstone pillars.",
      add: [
        "pillar_nw",
        "pillar_ne",
        "pillar_sw",
        "pillar_se",
        "wall_north",
        "wall_south",
        "wall_west",
        "wall_east",
      ],
    }),
    defineStage({
      bubbleSlot: "middle",
      description:
        "Add the copper entry frame and temporary walkways so the workshop has a readable circulation path.",
      add: ["entry_frame", "west_catwalk", "east_catwalk", "scaffold_bridge"],
    }),
    defineStage({
      description:
        "Swap out the temporary bridge and drop in the processing plinth together with the furnace and anvil stations.",
      add: ["core_plinth", "smelter_left", "smelter_right", "anvil_left", "anvil_right"],
      remove: ["scaffold_bridge"],
    }),
    defineStage({
      bubbleSlot: "bottom",
      description:
        "Cap the hall with a dark oak ring, then close the center with a long skylight strip.",
      add: [
        "roof_north",
        "roof_south",
        "roof_west",
        "roof_east",
        "roof_spine",
        "skylight",
      ],
    }),
    defineStage({
      description:
        "Finish the forge with chimneys, a glowing core, and four corner lights to frame the final silhouette.",
      add: [
        "chimney_left",
        "chimney_right",
        "power_core_gold",
        "power_core_redstone",
        "beacon_nw",
        "beacon_ne",
        "beacon_sw",
        "beacon_se",
      ],
    }),
  ],
});
