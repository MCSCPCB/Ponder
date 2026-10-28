import { system, world } from "@minecraft/server";

// Tells Ponder about this pack's plugin once the world has loaded. The script is a path under
// hbui/ in this pack's resource pack; the items are the ones that open Ponder.
world.afterEvents.worldLoad.subscribe(() => {
  system.sendScriptEvent("ponder:register", JSON.stringify({
    modId: "redstone_lamp",
    script: "ponder_addons/redstone_lamp/plugin.js",
    items: ["minecraft:redstone_lamp"],
  }));
});
