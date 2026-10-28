import { world } from "@minecraft/server";
import { CustomForm } from "@minecraft/server-ui";

// Items with ponder scenes. The scenes themselves live in the resource pack
// (hbui/ponder/content), which draws the whole Ponder screen in Ore UI.
const PONDER_ITEMS = new Set(["minecraft:redstone_lamp", "minecraft:spyglass"]);

// The resource pack finds this marker in the form, hides the form and draws Ponder over it.
// ";" ends it, since Ore UI's text runs straight into whatever is drawn next.
const marker = (itemId) => `ponder:${itemId};`;
// Ponder's Close presses this button when it cannot press the form's own close button.
const CLOSE_LABEL = "ponder:close;";

world.afterEvents.itemUse.subscribe((event) => {
  const player = event.source;
  const itemId = event.itemStack?.typeId;
  if (player?.typeId !== "minecraft:player" || !PONDER_ITEMS.has(itemId)) return;

  const form = new CustomForm(player, marker(itemId));
  form.label(marker(itemId)).button(CLOSE_LABEL, () => form.close()).closeButton();
  void form.show();
});
