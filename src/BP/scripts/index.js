import { world } from "@minecraft/server";
import { handlePonderItemUse } from "./ponder/runtime.js";

world.afterEvents.itemUse.subscribe(handlePonderItemUse);
