// Added 2026-10-29 for the Ponder example (not part of Farmer's Delight 5.0.5).
// Tells Ponder about this pack's plugin once the world has loaded. The script is a path under
// hbui/ in this pack's resource pack; the items are the ones that open Ponder. Without Ponder in
// the world nothing receives the event.
import { system, world } from "@minecraft/server";

world.afterEvents.worldLoad.subscribe(() => {
  system.sendScriptEvent("ponder:register", JSON.stringify({
    modId: "farmersdelight",
    script: "ponder_addons/farmersdelight/plugin.js",
    items: ["farmersdelight:cooking_pot", "farmersdelight:stove"],
  }));
});
