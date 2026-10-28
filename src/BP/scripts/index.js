import { system, world } from "@minecraft/server";
import { CustomForm } from "@minecraft/server-ui";

// Ponder packs by other authors report in with a script event once the world has loaded:
//   system.sendScriptEvent("ponder:register", JSON.stringify({
//     modId: "my_mod", script: "ponder_addons/my_mod/plugin.js", items: ["my_mod:widget"] }));
// `script` is the plugin, a path under hbui/ in the author's resource pack; `items` are the items
// that open Ponder. Our own scenes are built into the resource pack, so "ponder" has no script.
const addons = new Map([["ponder", { script: null, items: ["minecraft:redstone_lamp"] }]]);

system.afterEvents.scriptEventReceive.subscribe((event) => {
  if (event.id !== "ponder:register") return;
  const { modId, script, items } = JSON.parse(event.message);
  addons.set(modId, { script, items });
});

const hasPonder = (itemId) => [...addons.values()].some((a) => a.items.includes(itemId));

// The resource pack finds these markers in the form, hides the form and draws Ponder over it.
// ";" ends each, since Ore UI's text runs straight into whatever is drawn next.
const marker = (itemId) => `ponder:${itemId};`;
const addonMarker = () => `ponder.addons:${JSON.stringify([...addons].filter(([, a]) => a.script).map(([modId, a]) => ({ modId, script: a.script })))};`;
// Ponder's Close presses this button when it cannot press the form's own close button.
const CLOSE_LABEL = "ponder:close;";

// Opens Ponder for an item. Every way in goes through here.
function openPonder(player, itemId) {
  const form = new CustomForm(player, marker(itemId));
  form.label(marker(itemId)).label(addonMarker()).button(CLOSE_LABEL, () => form.close()).closeButton();
  void form.show();
}

// The way in for now: using an item that has scenes.
world.afterEvents.itemUse.subscribe((event) => {
  const player = event.source;
  const itemId = event.itemStack?.typeId;
  if (player?.typeId !== "minecraft:player" || !hasPonder(itemId)) return;
  openPonder(player, itemId);
});
