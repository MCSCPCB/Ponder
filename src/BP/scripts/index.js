import { world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { handlePonderItemUse } from "./ponder/runtime.js";

function showVanillaFormTest(player) {
  const form = new ActionFormData()
    .title("Vanilla Form Test")
    .body("This is a normal ActionFormData opened by using an iron ingot.")
    .button("Button 1")
    .button("Button 2");

  void form.show(player);
}

world.afterEvents.itemUse.subscribe((event) => {
  if (event.source?.typeId !== "minecraft:player") {
    return;
  }

  if (event.itemStack?.typeId === "minecraft:iron_ingot") {
    showVanillaFormTest(event.source);
    return;
  }

  handlePonderItemUse(event);
});
