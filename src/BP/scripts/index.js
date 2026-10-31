import { system, world, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from "@minecraft/server";
import { CustomForm } from "@minecraft/server-ui";

// Ponder packs by other authors report in with a script event once the world has loaded:
//   system.sendScriptEvent("ponder:register", JSON.stringify({
//     modId: "my_mod", script: "ponder_addons/my_mod/plugin.js", items: ["my_mod:widget"] }));
// `script` is the plugin, a path under hbui/ in the author's resource pack; `items` are the items
// that open Ponder. Our own scenes are built into the resource pack, so "ponder" has no script.
const addons = new Map([["ponder", { script: null, items: ["minecraft:spyglass"] }]]);

system.afterEvents.scriptEventReceive.subscribe((event) => {
  if (event.id !== "ponder:register") return;
  let data;
  try { data = JSON.parse(event.message); } catch (e) { return; }
  if (!data || typeof data !== "object") return;
  const { modId, script, items } = data;
  if (!/^[a-z0-9_.-]+$/.test(modId) || !/^ponder_addons\/[a-z0-9_.-]+\/[a-z0-9_./-]+\.js$/.test(script) || script.includes("..") || !Array.isArray(items) || items.some(id => typeof id !== "string" || !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(id))) return;
  addons.set(modId, { script, items });
});

const hasPonder = (itemId) => [...addons.values()].some((a) => a.items.includes(itemId));

// The resource pack finds these markers in the form, hides the form and draws Ponder over it.
// ";" ends each, since Ore UI's text runs straight into whatever is drawn next. The stamp tells
// one form from the next, even for the same item.
const marker = (itemId, stamp) => `ponder:${itemId}#${stamp};`;
const addonMarker = () => `ponder.addons:${JSON.stringify([...addons].filter(([, a]) => a.script).map(([modId, a]) => ({ modId, script: a.script })))};`;
// Ponder's Close presses this button when it cannot press the form's own close button.
const CLOSE_LABEL = "ponder:close;";

// Opens Ponder for an item. Every way in goes through here.
function openPonder(player, itemId) {
  const mark = marker(itemId, Date.now());
  const form = new CustomForm(player, mark);
  form.label(mark).label(addonMarker()).button(CLOSE_LABEL, () => form.close()).closeButton();
  void form.show();
}

// The way in for now: using an item that has scenes.
world.afterEvents.itemUse.subscribe((event) => {
  const player = event.source;
  const itemId = event.itemStack?.typeId;
  if (player?.typeId !== "minecraft:player" || !hasPonder(itemId)) return;
  openPonder(player, itemId);
});

// Java's /ponder: indexes, or a ResourceLocation and optional target players.
system.beforeEvents.startup.subscribe((event) => {
  const registry = event.customCommandRegistry;
  registry.registerCommand({
    name: "ponder:ponder",
    description: "ponder.command.ponder",
    permissionLevel: CommandPermissionLevel.Any,
    cheatsRequired: false,
    optionalParameters: [{ name: "ponder.command.scene", type: CustomCommandParamType.String },
      { name: "ponder.command.players", type: CustomCommandParamType.PlayerSelector }],
  }, (origin, scene, targets) => {
    const player = origin.sourceEntity;
    if (!targets && (!player || player.typeId !== "minecraft:player")) return { status: CustomCommandStatus.Failure, message: "A player is required" };
    if (targets && player && (player.typeId !== "minecraft:player" || !(player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors)))
      return { status: CustomCommandStatus.Failure, message: "Operator permission is required to open Ponder for other players" };
    let id = !scene || scene === "tags" ? "ponder:tags" : scene === "index" ? "ponder:index" : scene;
    if (!id.includes(":")) id = "minecraft:" + id;
    if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(id)) return { status: CustomCommandStatus.Failure, message: "Invalid scene id: " + scene };
    const players = targets || [player];
    system.run(() => players.forEach(p => openPonder(p, id)));
    return { status: CustomCommandStatus.Success };
  });
});
