import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { path, readJson, ROOT } from "./files.mjs";
import { checkEntityPropertyLiterals } from "./entity-properties.mjs";
import { registry } from "../src/BP/scripts/ponder/registry.js";
import { SLOTS, LIMITS } from "../src/BP/scripts/ponder/constants.js";
import { FONT_METRICS } from "../src/BP/scripts/ponder/config/fontMetrics.js";

export function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => entry.isDirectory() ? filesIn(resolve(directory, entry.name)) : [resolve(directory, entry.name)]);
}
export function* nodes(value) {
  if (value && typeof value === "object") {
    yield value;
    for (const child of Object.values(value)) yield* nodes(child);
  }
}
export function check() {
  const all = filesIn(path("src")), jsonFiles = all.filter(f => /\.(json|material)$/.test(f));
  for (const file of jsonFiles) {
    const text = readFileSync(file, "utf8");
    assert.doesNotThrow(() => JSON.parse(text), relative(ROOT, file));
    assert(!/3d_structure_renderer|ponder_block|item_id_aux/.test(text), `Legacy renderer in ${file}`);
  }
  assert(!all.some(f => f.endsWith(".jsonc")), "Only generated JSON UI is shipped");
  const bp = readJson("src/BP/manifest.json"), rp = readJson("src/RP/manifest.json");
  const version = readJson("package.json").version.split(".").map(Number);
  for (const name of ["@minecraft/server", "@minecraft/server-ui"])
    assert.equal(bp.dependencies.find(d => d.module_name === name)?.version, "alpha");
  const uuids = [bp.header.uuid, rp.header.uuid, ...bp.modules.map(m => m.uuid), ...rp.modules.map(m => m.uuid)];
  assert.equal(new Set(uuids).size, uuids.length);
  for (const [pack, other] of [[bp, rp], [rp, bp]]) {
    assert.deepEqual(pack.header.version, version);
    for (const module of pack.modules) assert.deepEqual(module.version, version);
    assert.deepEqual(pack.dependencies.find(d => d.uuid === other.header.uuid)?.version, other.header.version);
  }
  const ui = readJson("src/RP/ui/ponder.generated.json"), defs = new Set(Object.keys(ui).map(k => k.split("@")[0]));
  let controls = 0;
  for (const node of nodes(ui)) {
    if (node.type) controls++;
    if (node.collection_index !== undefined) assert(node.collection_index >= 0 && node.collection_index < SLOTS.count);
    for (const [name, value] of Object.entries(node)) {
      const refs = [name.includes("@ponder.") ? name.slice(name.indexOf("@")) : "", typeof value === "string" ? value : ""];
      for (const ref of refs) if (ref.startsWith("@ponder.")) assert(defs.has(ref.slice(8)), `Missing UI definition ${ref}`);
      if (typeof value === "string" && value.startsWith("textures/ui/ponder/"))
        assert(existsSync(path("src/RP", value + ".png")), `Missing generated texture ${value}`);
    }
  }
  assert(statSync(path("src/RP/ui/ponder.generated.json")).size < 8 * 1024 * 1024, "UI preset budget exceeded; split the pack");
  for (const definition of readJson("src/RP/ui/_ui_defs.json").ui_defs)
    assert(existsSync(path("src/RP", definition)));
  const sizes = { header_icon_frame: [38, 38], button_bg_default: [28, 28], progress_track: [228, 9], progress_fill: [1, 3] };
  for (const file of all.filter(f => f.endsWith(".png"))) {
    const png = PNG.sync.read(readFileSync(file));
    const name = file.split(sep).at(-1).replace(".png", "");
    if (sizes[name]) assert.deepEqual([png.width, png.height], sizes[name]);
  }
  const geometries = new Set(readJson("src/RP/models/entity/ponder.geo.json")["minecraft:geometry"].map(g => g.description.identifier));
  const animations = readJson("src/RP/animations/ponder.animation.json").animations;
  const controllers = readJson("src/RP/render_controllers/ponder.render_controllers.json").render_controllers;
  for (const kind of ["text", "frame", "line", "icon"]) {
    const filename = `src/BP/entities/ponder_${kind}.json`;
    const server = checkEntityPropertyLiterals(readFileSync(path(filename), "utf8"), filename)["minecraft:entity"].description;
    const client = readJson(`src/RP/entity/ponder_${kind}.entity.json`)["minecraft:client_entity"].description;
    assert.equal(server.identifier, client.identifier);
    assert(Object.keys(server.properties).length <= 32);
    for (const value of Object.values(server.properties)) assert.equal(value.client_sync, true);
    for (const id of Object.values(client.geometry)) assert(geometries.has(id), `Missing geometry ${id}`);
    for (const id of Object.values(client.animations)) assert(animations[id], `Missing animation ${id}`);
    for (const id of client.render_controllers) assert(controllers[id], `Missing render controller ${id}`);
  }
  for (const metric of Object.values(FONT_METRICS))
    assert(metric.left >= 0 && metric.width >= 1 && metric.left + metric.width <= 16 && metric.advance > 0);
  assert.equal(SLOTS.keyframes + LIMITS.keyframes, SLOTS.cards);
  console.log(`Checked ${jsonFiles.length} JSON/material files, ${registry.scenes.length} scenes, ${controls} direct UI controls.`);
  if (!Object.keys(FONT_METRICS).length)
    console.warn("Font metrics: fallback only. Matching font atlases and in-client spacing acceptance are still required.");
  return { files: all.length, controls, scenes: registry.scenes.length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) check();
