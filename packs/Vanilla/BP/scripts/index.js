import { system, world } from "@minecraft/server";

// Tells Ponder about this pack's plugin once the world has loaded. The script is a path under
// hbui/ in this pack's resource pack; the items are the ones that open Ponder.
world.afterEvents.worldLoad.subscribe(() => {
  system.sendScriptEvent("ponder:register", JSON.stringify({
    modId: "vanilla",
    script: "ponder_addons/vanilla/plugin.js",
    items: [
      "minecraft:redstone_lamp", "minecraft:piston", "minecraft:sticky_piston", "minecraft:lever",
      "minecraft:stone_button", "minecraft:wooden_button", "minecraft:repeater", "minecraft:comparator",
      "minecraft:hopper", "minecraft:iron_ore", "minecraft:deepslate_iron_ore", "minecraft:moss_block",
      "minecraft:tnt", "minecraft:lead",
    ],
  }));
});
