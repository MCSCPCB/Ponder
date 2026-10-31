import { system, world } from "@minecraft/server";
world.afterEvents.worldLoad.subscribe(() => {
  system.sendScriptEvent("ponder:register", JSON.stringify({
    modId: "ponder_batch1", script: "ponder_addons/ponder_batch1/plugin.js",
    items: ["minecraft:slime_ball", "minecraft:beetroot"],
  }));
});
