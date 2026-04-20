import {
  defineBlockStructure,
  defineBoxStructure,
  defineStage,
} from "../factories.js";

export const assemblyDemoScene = {
  id: "assembly_demo",
  title: "Assembly and Use",
  iconPath: "textures/items/stick",
  specialBlockIcons: [
    {
      iconPath: "textures/items/brick",
      tooltipText: "Barrel",
    },
    {
      iconPath: "textures/items/iron_ingot",
      tooltipText: "Blast Furnace",
    },
    {
      iconPath: "textures/items/redstone_dust",
      tooltipText: "Redstone Block",
    },
  ],
  entryItems: ["minecraft:stick"],
  stagePresetId: "demo_8x8x8",
  tickingAreaName: "ponder_demo_assembly",
  structures: [
    defineBoxStructure(
      "stone_base",
      "minecraft:stone_bricks",
      { x: 0, y: 0, z: 0 },
      { x: 7, y: 0, z: 7 },
    ),
    defineBoxStructure(
      "deck",
      "minecraft:spruce_planks",
      { x: 1, y: 1, z: 1 },
      { x: 6, y: 1, z: 6 },
    ),
    defineBoxStructure(
      "post_nw",
      "minecraft:oak_log",
      { x: 1, y: 1, z: 1 },
      { x: 1, y: 4, z: 1 },
    ),
    defineBoxStructure(
      "post_ne",
      "minecraft:oak_log",
      { x: 6, y: 1, z: 1 },
      { x: 6, y: 4, z: 1 },
    ),
    defineBoxStructure(
      "post_sw",
      "minecraft:oak_log",
      { x: 1, y: 1, z: 6 },
      { x: 1, y: 4, z: 6 },
    ),
    defineBoxStructure(
      "post_se",
      "minecraft:oak_log",
      { x: 6, y: 1, z: 6 },
      { x: 6, y: 4, z: 6 },
    ),
    defineBoxStructure(
      "beam_north",
      "minecraft:oak_log",
      { x: 1, y: 5, z: 1 },
      { x: 6, y: 5, z: 1 },
    ),
    defineBoxStructure(
      "beam_south",
      "minecraft:oak_log",
      { x: 1, y: 5, z: 6 },
      { x: 6, y: 5, z: 6 },
    ),
    defineBoxStructure(
      "beam_west",
      "minecraft:oak_log",
      { x: 1, y: 5, z: 1 },
      { x: 1, y: 5, z: 6 },
    ),
    defineBoxStructure(
      "beam_east",
      "minecraft:oak_log",
      { x: 6, y: 5, z: 1 },
      { x: 6, y: 5, z: 6 },
    ),
    defineBoxStructure(
      "machine_core",
      "minecraft:polished_andesite",
      { x: 3, y: 1, z: 3 },
      { x: 4, y: 2, z: 4 },
    ),
    defineBoxStructure(
      "roof",
      "minecraft:tinted_glass",
      { x: 2, y: 6, z: 2 },
      { x: 5, y: 6, z: 5 },
    ),
    defineBlockStructure("barrel", "minecraft:barrel", { x: 2, y: 2, z: 5 }),
    defineBlockStructure("furnace", "minecraft:blast_furnace", { x: 5, y: 2, z: 2 }),
    defineBlockStructure("gold_core", "minecraft:gold_block", { x: 3, y: 3, z: 3 }),
    defineBlockStructure("redstone_core", "minecraft:redstone_block", {
      x: 4,
      y: 3,
      z: 4,
    }),
    defineBlockStructure("diamond_cap", "minecraft:diamond_block", { x: 0, y: 1, z: 2 }),
    defineBlockStructure("emerald_cap", "minecraft:emerald_block", { x: 7, y: 1, z: 5 }),
    defineBlockStructure("amethyst_cap", "minecraft:amethyst_block", { x: 1, y: 6, z: 5 }),
  ],
  stages: [
    defineStage({
      bubbleSlot: "top",
      description:
        "Lay down the stone base and plank deck. This is the footprint the rest of the scene grows from.",
      add: ["stone_base", "deck"],
    }),
    defineStage({
      description:
        "Raise the oak posts and tie them together with a beam ring so the stage reads clearly from every angle.",
      add: [
        "post_nw",
        "post_ne",
        "post_sw",
        "post_se",
        "beam_north",
        "beam_south",
        "beam_west",
        "beam_east",
      ],
    }),
    defineStage({
      bubbleSlot: "middle",
      description:
        "Drop the processing core into the middle, then bolt on the side machines that make the build feel functional.",
      add: ["machine_core", "barrel", "furnace"],
    }),
    defineStage({
      description:
        "Cap the top with tinted glass and energize the center with bright accent blocks. Drag the preview to inspect the final pass.",
      add: [
        "roof",
        "gold_core",
        "redstone_core",
        "diamond_cap",
        "emerald_cap",
        "amethyst_cap",
      ],
    }),
  ],
};
