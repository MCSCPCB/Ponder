import { world, system } from "@minecraft/server";

// Tells Ponder about this pack's plugin once the world has loaded. The script is a path under
// hbui/ in this pack's resource pack; the items are the ones that open Ponder.
world.afterEvents.worldLoad.subscribe(() => {
  system.sendScriptEvent("ponder:register", JSON.stringify({
    modId: "gathering",
    script: "ponder_addons/gathering/plugin.js",
    items: ["minecraft:iron_ore", "minecraft:deepslate_iron_ore", "minecraft:moss_block", "minecraft:tnt", "minecraft:lever"],
  }));
});
