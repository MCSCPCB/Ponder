import { generateEntities } from "./entities.mjs";
import { generateTextures } from "./textures.mjs";
import { generateUI } from "./ui.mjs";
import { path, write } from "./files.mjs";
import { readFileSync, statSync } from "node:fs";
import { registry } from "../src/BP/scripts/ponder/registry.js";

// Source-of-truth is scripts/config + these generators, never generated JSON.
generateTextures();
generateEntities();
const ui = generateUI();
write("src/RP/licenses/Ponder-MIT.txt", readFileSync(path("licenses/Ponder-MIT.txt")));
console.log(`Built ${registry.scenes.length} scenes, ${ui.runPresets} UI playback presets, ` +
  `${ui.definitions} definitions (${(statSync(path("src/RP/ui/ponder.generated.json")).size / 1024).toFixed(0)} KiB).`);
console.log("Client render/performance acceptance is separate from a successful build.");
