// Adapts Ponder packs to another game version. Node only, no packages.
//
//   1. Put the packs in tools/input/ as .zip, .mcpack or .mcaddon: Ponder itself (src/BP and
//      src/RP) and the add-ons with Ponder scenes, each add-on whole (behavior and resource pack).
//   2. Into tools/version/<version>/ put the game's gui folder, so that
//      tools/version/<version>/gui/dist/hbui/gameplay.html exists; Mojang's
//      bedrock-samples-v<release>-full.zip (github.com/Mojang/bedrock-samples/releases, the newest
//      full release no newer than <version>), which has vanilla's resource pack with its
//      textures; and in scaffold/ the shape tables of Scaffold (github.com/EvilSlimeLabs/Scaffold:
//      block_definition, block_geometry, block_rotation, state_rotations and dust_connections
//      .json from scaffold/lookups/) with its LICENSE.
//   3. node tools/adapter/adapt.js <version>
//   4. Take the results from tools/output/<version>/.
//
// <version> is the folder's name, 1.26.60.4 or 1-26-60-4. Inputs can also be given after it
// (folders, .zip, .mcpack, .mcaddon) instead of using tools/input/. Every manifest.json in an
// input is one pack; an input with one pack becomes a .mcpack, one with more an .mcaddon.
// An add-on's behavior and resource packs belong in the same run, so that each one's dependency
// on the other moves to the other's new version.
//
// Ponder (the input whose resource pack has hbui/gameplay.html):
// - swaps vanilla's hashed bundle names at the top of hbui/gameplay.html for the target's;
// - renames the vanilla queries and commands Ponder calls to what the target bundle calls them
//   (NAMES below), and stops if the bundle has none of the known names;
// - writes hbui/ponder/blocks/vanilla_blocks.json: vanilla's textures (size, animation, the tint
//   plains gives grass, leaves and water), each block's textures, water's and lava's, beds' and
//   banners' and, from
//   Scaffold's tables, the shapes of the blocks that are not a plain cube, with Scaffold's
//   licence beside it;
// - sets header.min_engine_version to the target version.
// An add-on: for each hbui/ponder_addons/<folder>/ in its resource pack, writes ponder_blocks.json
// there, what Ponder needs to draw the add-on's own blocks. Its scripts and min_engine_version
// stay as they are.
// Every pack: 1 is added to the last digit of header.version, so the game takes it as a new
// pack; dependencies on packs adapted in the same run follow. UUIDs stay the same.
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const TOOLS = path.resolve(__dirname, "..");

// What Ponder needs from vanilla's Ore UI, with every name each has gone by. Add a name here when
// a version renames one; the adapter rewrites the quoted name in the pack's .js and .html files.
const NAMES = [
  { use: "DDUI screen id query", names: ["vanillaCoreDataDrivenUIScreenIdQuery", "vanilla.ddui.screenId"] },
  { use: "DDUI definition query", names: ["vanilla.CoreDataDrivenUIDefinitionQuery"] },
  { use: "DDUI data store string query", names: ["vanillaCoreDataStoreStringQuery", "vanilla.ddui.string"] },
  { use: "DDUI data store commands", names: ["vanillaCoreDataStoreSetCommandGroup", "vanillaDduiDataStoreSetCommandGroup"] },
  { use: "form button press", names: ["dataStoreButtonPress"] },
  { use: "form close button press", names: ["dataStoreCloseButtonPress"] },
  { use: "translation", names: ["coreTranslateCommandGroup"] },
  { use: "sounds", names: ["soundCommandGroup"] },
  { use: "item icons", names: ["geo-item://"], unquoted: true },
  { use: "pack files", names: ["pack://"], unquoted: true },
  // Not a name: how a query subscription's id goes to the engine. Vanilla's query driver hashes
  // the query and its arguments to a uint32 and passes either that number or its string; bridge.js
  // reads the marker to know which. 1.26.60 passes the number and rejects a string.
  { use: "query subscription id", names: ["ponder:query-id/string", "ponder:query-id/number"], detect: queryIdKind },
];

// In the driver: `l=o.toString();return null!==(r=a(l,()=>({value:t(e,n,o)})))…`, where o is the
// hash and l its string; the third argument of t is what reaches query:subscribe.
function queryIdKind(bundle) {
  const m = /(\w)=(\w)\.toString\(\);return null!==\(\w=\w\(\1,\(\)=>\(\{value:\w\(\w,\w,(\w)\)\}\)\)\)/.exec(bundle);
  if (!m) return null;
  return m[3] === m[2] ? "ponder:query-id/number" : m[3] === m[1] ? "ponder:query-id/string" : null;
}

const fail = message => { console.error("error: " + message); process.exit(1); };

// JSON as the game reads it, which allows a byte order mark and // and /* */ comments.
const stripComments = text => text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (match, string) => string || "");
function parseJson(bytes, name) {
  try { return JSON.parse(stripComments(bytes.toString("utf8").replace(/^\uFEFF/, ""))); }
  catch (e) { fail(name + " is not JSON: " + e.message); }
}

// ---- the target version's gui folder ----

// The folder may be named 1.26.60.4 or 1-26-60-4, whichever way the version was typed.
function versionFolder(version) {
  const names = [version, version.replace(/\./g, "-"), version.replace(/-/g, ".")];
  const found = names.map(name => path.join(TOOLS, "version", name)).find(folder => fs.existsSync(folder));
  if (!found) fail("no folder tools/version/" + version + " (put that version's gui folder there)");
  return found;
}

// gameplay.html names the bundles the game loads; everything Ponder calls lives in the .js one.
function gameplay(gui) {
  const htmlPath = path.join(gui, "dist", "hbui", "gameplay.html");
  if (!fs.existsSync(htmlPath)) fail("missing " + path.relative(TOOLS, htmlPath) + " (copy the game's gui folder into the version folder)");
  const html = fs.readFileSync(htmlPath, "utf8");
  const bundles = [];
  html.replace(VANILLA, (match, name, hash, ext) => bundles.push(name + "-" + hash + "." + ext));
  const js = bundles.filter(name => name.endsWith(".js"));
  if (js.length !== 1) fail(path.relative(TOOLS, htmlPath) + " names " + js.length + " scripts; expected one");
  const bundlePath = path.join(gui, "dist", "hbui", js[0]);
  if (!fs.existsSync(bundlePath)) fail("gameplay.html names " + js[0] + ", which is not in the gui folder");
  return { html, bundles, bundle: fs.readFileSync(bundlePath, "utf8") };
}

// Which known name the bundle uses for each entry, and the rewrite from any other known name.
function renames(bundle) {
  const out = [];
  NAMES.forEach(entry => {
    if (entry.detect) {
      const target = entry.detect(bundle);
      if (!target) fail("could not tell the " + entry.use + " from the target bundle; this version's Ore UI changed and the adapter needs updating");
      entry.names.forEach(name => { if (name !== target) out.push({ from: name, to: target }); });
      return;
    }
    const present = entry.names.filter(name => bundle.includes(name));
    if (!present.length) fail("the target bundle has none of [" + entry.names.join(", ") + "] (" + entry.use + "); this version's Ore UI changed and the adapter needs a new name in NAMES");
    const target = present[present.length - 1];
    entry.names.forEach(name => { if (name !== target) out.push({ from: name, to: target, unquoted: entry.unquoted }); });
  });
  return out;
}

// ---- reading packs ----

function readDir(dir) {
  const files = new Map();
  const walk = current => fs.readdirSync(current, { withFileTypes: true }).forEach(entry => {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.set(path.relative(dir, full).split(path.sep).join("/"), fs.readFileSync(full));
  });
  walk(dir);
  return files;
}

// Sizes come from the central directory: zips written with data descriptors leave them 0 in the
// local headers. Folders, and macOS's __MACOSX copies, are skipped; so is every entry `keep`, when
// given, says no to.
function readZip(file, keep) {
  const data = fs.readFileSync(file);
  const files = new Map();
  let end = data.length - 22;
  while (end >= 0 && data.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) fail(path.basename(file) + " is not a zip");
  const count = data.readUInt16LE(end + 10);
  let entry = data.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    if (data.readUInt32LE(entry) !== 0x02014b50) fail(path.basename(file) + " has a broken central directory");
    const method = data.readUInt16LE(entry + 10);
    const compressed = data.readUInt32LE(entry + 20);
    const nameLength = data.readUInt16LE(entry + 28);
    const extraLength = data.readUInt16LE(entry + 30);
    const commentLength = data.readUInt16LE(entry + 32);
    const local = data.readUInt32LE(entry + 42);
    const name = data.toString("utf8", entry + 46, entry + 46 + nameLength).replace(/\\/g, "/");
    entry += 46 + nameLength + extraLength + commentLength;
    if (!name || name.endsWith("/") || name.startsWith("__MACOSX/") || (keep && !keep(name))) continue;
    const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
    const bytes = data.subarray(start, start + compressed);
    if (method === 0) files.set(name, Buffer.from(bytes));
    else if (method === 8) files.set(name, zlib.inflateRawSync(bytes));
    else fail(path.basename(file) + " stores " + name + " with compression method " + method);
  }
  if (!files.size) fail(path.basename(file) + " has no files");
  return files;
}

function readInput(input) {
  if (!fs.existsSync(input)) fail("not found: " + input);
  return fs.statSync(input).isDirectory() ? readDir(input) : readZip(input);
}

// One pack per manifest.json. A zip may hold several packs, each under its own folder.
function packsOf(files) {
  const manifests = [...files.keys()].filter(name => name === "manifest.json" || name.endsWith("/manifest.json"));
  if (!manifests.length) fail("no manifest.json");
  return manifests.map(manifest => {
    const root = manifest.slice(0, -"manifest.json".length);
    const pack = new Map();
    files.forEach((bytes, name) => { if (name.startsWith(root)) pack.set(name.slice(root.length), bytes); });
    return pack;
  });
}

const manifestOf = pack => parseJson(pack.get("manifest.json"), "manifest.json");

// ---- changes ----

// "1.26.60.4" and "1-26-60-4" both become [1, 26, 60]; a fourth digit is a build number.
function engineVersion(version) {
  const parts = version.split(/[.-]/).map(Number);
  if (parts.length < 3 || parts.some(part => !Number.isInteger(part))) fail("version " + version + " is not a game version like 1.26.60.4");
  return parts.slice(0, 3);
}

// The last digit goes up by 1, so [1, 0, 0] becomes [1, 0, 1] and [1, 0] becomes [1, 1].
function bumped(version) {
  const next = version.slice();
  next[next.length - 1] += 1;
  return next;
}

function sameVersion(a, b) { return a.length === b.length && a.every((part, i) => part === b[i]); }

// Only Ponder itself moves to the target's min_engine_version; an add-on keeps its own.
function adaptManifest(manifest, engine, versions, main) {
  const header = manifest.header;
  const changes = [];
  if (main && !sameVersion(header.min_engine_version, engine)) {
    changes.push("min_engine_version " + header.min_engine_version.join(".") + " -> " + engine.join("."));
    header.min_engine_version = engine;
  }
  const next = versions.get(header.uuid);
  changes.push("version " + header.version.join(".") + " -> " + next.join("."));
  header.version = next;
  (manifest.modules || []).forEach(module => { if (module.version) module.version = next; });
  (manifest.dependencies || []).forEach(dependency => {
    if (dependency.uuid && versions.has(dependency.uuid)) dependency.version = versions.get(dependency.uuid);
  });
  return changes;
}

// Vanilla's bundles sit directly in /hbui/ as <name>-<20 hex digits>.<js|css>; Ponder's own files
// are in subfolders. "gameplay-theme-922e….css" is keyed "gameplay-theme.css".
const VANILLA = /["']\/hbui\/([a-z-]+)-([0-9a-f]{20})\.(js|css)["']/g;
const bundleKey = name => name.replace(/-[0-9a-f]{20}\./, ".");

// Swaps each vanilla bundle for the target's of the same key; only quoted names, so a comment
// mentioning one stays.
function adaptHtml(html, bundles) {
  const target = new Map(bundles.map(name => [bundleKey(name), name]));
  const ours = [];
  html.replace(VANILLA, (match, name, hash, ext) => ours.push(name + "-" + hash + "." + ext));
  const ourKeys = ours.map(bundleKey);
  const missing = [...target.keys()].filter(key => !ourKeys.includes(key));
  const extra = ourKeys.filter(key => !target.has(key));
  if (missing.length || extra.length) return { error: "loads vanilla bundles [" + ourKeys.join(", ") + "], the target gameplay.html loads [" + [...target.keys()].join(", ") + "]" };
  const changed = ours.filter(name => target.get(bundleKey(name)) !== name);
  if (!changed.length) return null;
  const out = html.replace(VANILLA, (match, name, hash, ext) => match.replace(name + "-" + hash + "." + ext, target.get(name + "." + ext)));
  return { html: out, from: changed, to: changed.map(name => target.get(bundleKey(name))) };
}

// A rename counts only inside quotes, so a comment that names the old query is left alone.
function adaptText(text, list) {
  const applied = [];
  list.forEach(rename => {
    const pattern = rename.unquoted ? rename.from : new RegExp('(["\'`])' + rename.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '\\1', "g");
    const out = text.replace(pattern, rename.unquoted ? rename.to : '$1' + rename.to + '$1');
    if (out !== text) applied.push(rename.from + " -> " + rename.to);
    text = out;
  });
  return { text, applied };
}

const TEXT = new Set([".js", ".html", ".css", ".json", ".lang"]);

// `main`: the pack is Ponder's own. An add-on's files other than its manifest are left as they are.
function adaptPack(pack, target, engine, versions, main) {
  const manifest = manifestOf(pack);
  const report = { name: manifest.header.name, uuid: manifest.header.uuid, changes: adaptManifest(manifest, engine, versions, main) };
  // Two-space JSON with number arrays on one line, as the packs write it.
  const json = JSON.stringify(manifest, null, 2).replace(/\[\s*(\d+(?:,\s*\d+)*)\s*\]/g, (match, list) => "[" + list.split(/,\s*/).join(", ") + "]");
  pack.set("manifest.json", Buffer.from(json + "\n"));
  if (!main) return report;

  const html = pack.get("hbui/gameplay.html");
  if (html) {
    const adapted = adaptHtml(html.toString("utf8"), target.bundles);
    if (adapted && adapted.error) fail(report.name + ": hbui/gameplay.html " + adapted.error);
    if (adapted) {
      pack.set("hbui/gameplay.html", Buffer.from(adapted.html));
      report.changes.push("gameplay.html bundles " + adapted.from.join(", ") + " -> " + adapted.to.join(", "));
    }
  }

  const renamed = new Map();
  pack.forEach((bytes, name) => {
    if (!TEXT.has(path.extname(name))) return;
    const adapted = adaptText(bytes.toString("utf8"), target.renames);
    if (!adapted.applied.length) return;
    pack.set(name, Buffer.from(adapted.text));
    adapted.applied.forEach(change => renamed.set(change, (renamed.get(change) || []).concat(name)));
  });
  renamed.forEach((files, change) => report.changes.push(change + " in " + files.join(", ")));
  return report;
}

// ---- vanilla's blocks, from bedrock-samples ----

// The resource pack in the version folder's bedrock-samples-v<release>-full.zip (one pack, every
// version layer already merged; of its images only their sizes and the colour maps are kept),
// plains' climate from its behavior pack, and Scaffold's tables in its scaffold/.
const SCAFFOLD = ["block_definition", "block_geometry", "block_rotation", "state_rotations", "dust_connections"];
const RESOURCES = /^resource_pack\/(blocks\.json|textures\/(terrain_texture|flipbook_textures)\.json|textures\/.+\.(png|tga)|biomes\/plains\.client_biome\.json)$|^behavior_pack\/biomes\/plains\.biome\.json$/;
// blocks.json keys some blocks by an older name than their id.
const LEGACY_NAMES = {
  grass: "grass_block", chain: "iron_chain", seaLantern: "sea_lantern", tripWire: "trip_wire", invisibleBedrock: "invisible_bedrock",
  movingBlock: "moving_block", pistonArmCollision: "piston_arm_collision", stickyPistonArmCollision: "sticky_piston_arm_collision",
};
function vanillaPack(folder) {
  const zips = fs.readdirSync(folder).filter(name => /^bedrock-samples-v[\d.]+-full\.zip$/.test(name)).sort();
  if (!zips.length) fail("no bedrock-samples-v<release>-full.zip in " + path.relative(TOOLS, folder) + " (download it from github.com/Mojang/bedrock-samples/releases)");
  const file = path.join(folder, zips[zips.length - 1]), files = new Map(), sizes = new Map();
  // Files by their path in their pack (biomes/plains.biome.json is the behavior pack's).
  readZip(file, name => RESOURCES.test(name)).forEach((bytes, name) => {
    const rel = name.slice(name.indexOf("/") + 1), image = /^(.+)\.(png|tga)$/.exec(rel);
    if (!image || /^textures\/colormap\//.test(rel)) files.set(rel, bytes);
    if (image && (image[2] === "png" || !sizes.has(image[1]))) sizes.set(image[1], Object.assign({ file: rel }, imageSize(bytes, image[2])));
  });
  if (!files.has("blocks.json")) fail(path.basename(file) + " has no resource_pack/blocks.json");
  const blocks = parseJson(files.get("blocks.json"), "vanilla blocks.json");
  Object.keys(LEGACY_NAMES).forEach(name => { if (blocks[name]) blocks[LEGACY_NAMES[name]] = blocks[name]; });
  const scaffold = {};
  SCAFFOLD.forEach(name => {
    const table = path.join(folder, "scaffold", name + ".json");
    if (!fs.existsSync(table)) fail("missing " + path.relative(TOOLS, table) + " (Scaffold's scaffold/lookups/" + name + ".json)");
    scaffold[name] = parseJson(fs.readFileSync(table), "scaffold/" + name + ".json");
  });
  const license = path.join(folder, "scaffold", "LICENSE");
  if (!fs.existsSync(license)) fail("missing " + path.relative(TOOLS, license) + " (Scaffold's LICENSE)");
  const terrain = parseJson(files.get("textures/terrain_texture.json"), "vanilla textures/terrain_texture.json").texture_data;
  return {
    file, sizes, scaffold, license: fs.readFileSync(license, "utf8"), blocks, terrain,
    flipbooks: flipbookTable(parseJson(files.get("textures/flipbook_textures.json"), "vanilla textures/flipbook_textures.json")),
    tints: textureTints(plainsColors(files), terrain),
  };
}

// ---- plains' colours ----

// Ponder's world is all plains (SchematicLevel.getBiome), so the textures the game tints by biome
// take plains' colours: a colour its client biome names, else its colour map's at plains' climate
// (GrassColor.get, FoliageColor.get). Water: the surface colour, and its opacity, which client
// biomes no longer write; 0.65 is what biomes_client.json's default gave.
const WATER_OPACITY = 0.65;
function plainsColors(files) {
  const climate = parseJson(files.get("biomes/plains.biome.json"), "vanilla behavior_pack/biomes/plains.biome.json")["minecraft:biome"].components["minecraft:climate"];
  const client = parseJson(files.get("biomes/plains.client_biome.json"), "vanilla biomes/plains.client_biome.json")["minecraft:client_biome"].components;
  const fromMap = map => colorMapAt(files.get("textures/colormap/" + map + ".png"), map, climate.temperature, climate.downfall);
  // An appearance component's colour: "#rrggbb", { color_map }, or none (the default map).
  const named = (component, map) => {
    const c = client[component] && client[component].color;
    return typeof c === "string" ? hexColor(c) : fromMap(c && c.color_map ? c.color_map : map);
  };
  const water = client["minecraft:water_appearance"];
  return {
    grass: named("minecraft:grass_appearance", "grass"), foliage: named("minecraft:foliage_appearance", "foliage"),
    dry_foliage: named("minecraft:dry_foliage_color", "dry_foliage"), birch: fromMap("birch"), evergreen: fromMap("evergreen"),
    water: hexColor(water.surface_color), waterOpacity: water.surface_opacity != null ? water.surface_opacity : WATER_OPACITY,
  };
}
const hexColor = hex => [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) / 255 * 1000) / 1000);
// The colour of a 256 by 256 colour map at a climate, as the game reads one.
function colorMapAt(png, name, temperature, downfall) {
  const image = decodePng(png, "colormap/" + name + ".png");
  const t = Math.min(Math.max(temperature, 0), 1), d = Math.min(Math.max(downfall, 0), 1) * t;
  const x = Math.floor((1 - t) * 255), y = Math.floor((1 - d) * 255), at = (y * image.width + x) * image.channels;
  return [0, 1, 2].map(c => Math.round(image.pixels[at + c] / 255 * 1000) / 1000);
}
// An 8-bit RGB or RGBA PNG's pixels, unfiltered.
function decodePng(bytes, name) {
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), depth = bytes[24], type = bytes[25];
  if (depth !== 8 || (type !== 2 && type !== 6)) fail(name + " is not an 8-bit RGB or RGBA PNG");
  const channels = type === 6 ? 4 : 3, stride = width * channels, data = [];
  for (let p = 8; p < bytes.length;) {
    const length = bytes.readUInt32BE(p);
    if (bytes.toString("latin1", p + 4, p + 8) === "IDAT") data.push(bytes.subarray(p + 8, p + 8 + length));
    p += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(data)), pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], row = y * stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? pixels[row + i - channels] : 0, up = y ? pixels[row - stride + i] : 0;
      const corner = y && i >= channels ? pixels[row - stride + i - channels] : 0;
      let add = 0;
      if (filter === 1) add = left;
      else if (filter === 2) add = up;
      else if (filter === 3) add = (left + up) >> 1;
      else if (filter === 4) {
        const guess = left + up - corner, a = Math.abs(guess - left), b = Math.abs(guess - up), c = Math.abs(guess - corner);
        add = a <= b && a <= c ? left : b <= c ? up : corner;
      }
      pixels[row + i] = raw[y * (stride + 1) + 1 + i] + add;
    }
  }
  return { width, height, channels, pixels };
}
// The textures the game tints and with what (BlockColors, in Bedrock's names). An `overlay`
// tints only where the image's alpha is set (grass_side); the rest of it is the image the game
// shows with it untinted, which Ponder draws under it.
const TINTS = {
  grass: ["grass_top", "tallgrass", "fern", "double_plant_grass_top", "double_plant_grass_bottom", "double_plant_fern_top", "double_plant_fern_bottom", "bush"],
  foliage: ["leaves_oak", "leaves_oak_opaque", "leaves_jungle", "leaves_jungle_opaque", "leaves_acacia", "leaves_acacia_opaque",
    "leaves_big_oak", "leaves_big_oak_opaque", "mangrove_leaves", "mangrove_leaves_opaque", "vine"],
  birch: ["leaves_birch", "leaves_birch_opaque"],
  evergreen: ["leaves_spruce", "leaves_spruce_opaque"],
  dry_foliage: ["leaf_litter"],
  water: ["water_still_grey", "water_flow_grey", "cauldron_water"],
};
const OVERLAYS = { grass_side: { tint: "grass", under: "grass_side_carried" } };
// Texture path -> { tint, alpha, under }: the lists above, and the fixed tint_color of
// terrain_texture.json (waterlily).
function textureTints(colors, terrain) {
  const out = new Map(), blocks = name => "textures/blocks/" + name;
  Object.keys(TINTS).forEach(kind => TINTS[kind].forEach(name => {
    out.set(blocks(name), kind === "water" ? { tint: colors.water, alpha: colors.waterOpacity } : { tint: colors[kind] });
  }));
  Object.keys(OVERLAYS).forEach(name => out.set(blocks(name), { tint: colors[OVERLAYS[name].tint], under: blocks(OVERLAYS[name].under) }));
  Object.values(terrain).forEach(entry => {
    const t = entry.textures;
    (Array.isArray(t) ? t : [t]).forEach(x => { if (x && x.tint_color && !out.has(x.path)) out.set(x.path, { tint: hexColor(x.tint_color) }); });
  });
  return out;
}

// An image's size from its header: PNG's IHDR, TGA's image specification.
const imageSize = (bytes, ext) => (ext === "png" ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } : { width: bytes.readUInt16LE(12), height: bytes.readUInt16LE(14) });
// flipbook_textures.json: texture -> { tick, seq }, seq the frames' order when it lists one.
function flipbookTable(list) {
  const out = new Map();
  list.forEach(e => out.set(e.flipbook_texture, { tick: e.ticks_per_frame || 1, seq: Array.isArray(e.frames) ? e.frames : null }));
  return out;
}
// What Ponder needs of a texture: its file and size and, for an animation (a strip of square
// frames, top to bottom), how many frames, how many ticks each, and their order.
function textureEntry(size, flipbook) {
  const out = { file: size.file, w: size.width, h: size.height };
  if (flipbook) {
    out.frames = Math.max(1, Math.round(size.height / size.width));
    out.tick = flipbook.tick;
    if (flipbook.seq) out.seq = flipbook.seq;
  }
  return out;
}

// A vanilla texture's entry with the tint the game gives it in plains (textureTints): `tint`
// [r, g, b], `alpha`, and `under`, the entry of the image drawn under an overlay.
function tintedEntry(entry, tint, vanilla) {
  if (!tint) return entry;
  entry.tint = tint.tint;
  if (tint.alpha != null) entry.alpha = tint.alpha;
  if (tint.under) entry.under = textureEntry(vanilla.sizes.get(tint.under));
  return entry;
}

// A texture's file in a pack, with its extension (textures/blocks/stone -> textures/blocks/stone.png).
const textureFile = (files, texture) => [".png", ".tga"].map(ext => texture + ext).find(name => files.has(name)) || null;
// The texture a terrain_texture.json entry draws: its first variant. One the game tints
// (overlay_color, tint_color) gives null unless `tints` says how, since its file alone is not
// what the game shows.
function terrainPath(entry, tints) {
  let t = entry && entry.textures;
  if (Array.isArray(t)) t = t[0];
  if (t && typeof t === "object") return (t.overlay_color || t.tint_color) && !(tints && tints.has(t.path)) ? null : t.path || null;
  return typeof t === "string" ? t : null;
}
const terrainFile = (files, terrain, name) => { const t = terrainPath(terrain[name]); return t && textureFile(files, t); };
// Every texture a terrain_texture.json entry lists, tinted or not, in order: a block's state
// picks one by its place in the list.
function terrainList(entry) {
  const t = entry && entry.textures, list = Array.isArray(t) ? t : [t];
  return list.map(x => (typeof x === "string" ? x : (x && x.path) || null));
}

// vanilla_blocks.json:
//   textures { path: { file, w, h, frames, tick, seq, tint, alpha, under } }, every texture the
//     rest names, with the tint it takes in plains (tintedEntry);
//   cubes { block: path, or one per face { up, down, north, south, west, east } }, a block drawn
//     as a plain cube, block being the id without minecraft:. blocks.json names each face's
//     texture and terrain_texture.json its file: the placed look when a face of it is tinted
//     (grass, leaves), else the inventory look (carried_textures) first. A block with a face the
//     game tints in a way not known here is left out, and Ponder falls back to its own table;
//   liquids { block: { still, flow } }, water's and lava's textures (liquid_models.js);
//   blockEntities, beds' and banners' textures (blockEntityTextures);
//   shapes, the blocks Scaffold gives a shape (vanillaShapes).
const FACE_NAMES = ["up", "down", "north", "south", "west", "east"];
const VANILLA_TABLE = "hbui/ponder/blocks/vanilla_blocks.json";
const VANILLA_LICENSE = "hbui/ponder/blocks/vanilla_shapes_LICENSE.txt";
const SHAPES_NOTICE = "The block shapes in vanilla_blocks.json (\"shapes\") are converted from the lookup tables of\n"
  + "Scaffold, https://github.com/EvilSlimeLabs/Scaffold (scaffold/lookups/), under its licence:\n\n";
function vanillaBlockTable(vanilla) {
  const textures = {}, cubes = {}, liquids = {};
  // A texture path the table names, or null when the pack has no such image.
  const use = p => {
    if (!p) return null;
    if (!(p in textures)) {
      const size = vanilla.sizes.get(p);
      textures[p] = size ? tintedEntry(textureEntry(size, vanilla.flipbooks.get(p)), vanilla.tints.get(p), vanilla) : null;
    }
    return textures[p] ? p : null;
  };
  // Each face's texture path, or null when a face has none.
  const faces = names => {
    const out = {};
    for (const face of FACE_NAMES) {
      const name = typeof names === "string" ? names : names[face] || names.side;
      const p = name && terrainPath(vanilla.terrain[name], vanilla.tints);
      if (!p || !vanilla.sizes.has(p)) return null;
      out[face] = p;
    }
    return out;
  };
  const tinted = found => !!found && FACE_NAMES.some(face => vanilla.tints.has(found[face]));
  Object.keys(vanilla.blocks).forEach(name => {
    const entry = vanilla.blocks[name];
    if (!entry || typeof entry !== "object") return;
    if (LIQUIDS.test(name)) {
      liquids[name] = { still: use(terrainPath(vanilla.terrain[entry.textures.up])), flow: use(terrainPath(vanilla.terrain[entry.textures.side])) };
      return;
    }
    const placed = entry.textures && faces(entry.textures);
    const found = tinted(placed) ? placed : (entry.carried_textures && faces(entry.carried_textures)) || placed;
    if (!found) return;
    FACE_NAMES.forEach(face => use(found[face]));
    cubes[name] = FACE_NAMES.every(face => found[face] === found.up) ? found.up : found;
  });
  const shapes = vanillaShapes(vanilla, use), blockEntities = blockEntityTextures(use);
  Object.keys(textures).forEach(p => { if (!textures[p]) delete textures[p]; });
  return { textures, cubes, liquids, blockEntities, shapes };
}

// The textures Ponder draws beds and banners with (block_entity_models.js), Bedrock's own entity
// textures: bed [path by colour, a bed's `color`]; banner { base, illager, patterns { code: path } },
// a banner's pole, bar and flag, its ominous look, and each pattern by the code Bedrock saves it as
// (Geyser's BannerPattern). Fails when vanilla lacks one, as a new version would have to be looked at.
const BED_COLORS = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "silver", "cyan", "purple", "blue", "brown", "green", "red", "black"];
const BANNER_PATTERNS = {
  b: "base", bl: "square_bottom_left", br: "square_bottom_right", tl: "square_top_left", tr: "square_top_right",
  bs: "stripe_bottom", ts: "stripe_top", ls: "stripe_left", rs: "stripe_right", cs: "stripe_center", ms: "stripe_middle",
  drs: "stripe_downright", dls: "stripe_downleft", ss: "small_stripes", cr: "cross", sc: "straight_cross",
  bt: "triangle_bottom", tt: "triangle_top", bts: "triangles_bottom", tts: "triangles_top",
  ld: "diagonal_left", rd: "diagonal_up_right", lud: "diagonal_up_left", rud: "diagonal_right",
  mc: "circle", mr: "rhombus", vh: "half_vertical", hh: "half_horizontal", vhr: "half_vertical_right", hhb: "half_horizontal_bottom",
  bo: "border", cbo: "curly_border", gra: "gradient", gru: "gradient_up", bri: "bricks", glb: "globe",
  cre: "creeper", sku: "skull", flo: "flower", moj: "mojang", pig: "piglin", flw: "flow", gus: "guster",
};
function blockEntityTextures(use) {
  const need = p => use(p) || fail("vanilla has no " + p + " (beds and banners in tools/adapter need looking at)");
  const patterns = {};
  Object.keys(BANNER_PATTERNS).forEach(code => { patterns[code] = need("textures/entity/banner/banner_" + BANNER_PATTERNS[code]); });
  return {
    bed: BED_COLORS.map(c => need("textures/entity/bed/" + c)),
    banner: { base: need("textures/entity/banner/banner_base"), illager: need("textures/entity/banner/banner_illager"), patterns },
    particle: need("textures/blocks/planks_oak"),
  };
}

// The blocks Scaffold draws: shapes.blocks { block: family }; shapes.families { family: { pick,
// data, turn_by, texture_by, forms } }, Scaffold's rules and its forms, without the simpler ones
// its low geometry draws; shapes.rotations { family: { value: [x, y, z] } }, Minecraft's angles;
// shapes.faces { block: terrain name, or { face: terrain name } } and shapes.terrain { name:
// [texture path or null] }, the placed look in blocks.json and terrain_texture.json, as Scaffold
// reads them; shapes.dust, the rules redstone dust joins by. A form's cubes keep Scaffold's
// frame, blocks from the cell's low corner as a .geo.json has it. Scaffold draws a plain cube
// 0.95 across so a ghost block lets the one behind show; here it fills its cell again. A face
// with no area, which Scaffold does not draw, is left out, and so is one whose texture the pack
// does not have. Water and lava are not Scaffold's: Ponder draws them from `liquids`.
const RULES = ["pick", "data", "turn_by", "texture_by"];
const LIQUIDS = /^(flowing_)?(water|lava)$/;
function vanillaShapes(vanilla, use) {
  const s = vanilla.scaffold, geometry = s.block_geometry.families, standard = s.state_rotations.states;
  const shapes = { blocks: {}, families: {}, rotations: {}, faces: {}, terrain: {} };
  const trim = form => ({ center: form.center, cubes: form.cubes.map(c => {
    const ghost = form.cubes.length === 1 && c.size.every(v => v === 0.95) && c.offset.every(v => v === 0.025);
    const cube = { size: ghost ? [1, 1, 1] : c.size, offset: ghost ? [0, 0, 0] : c.offset, faces: {} };
    if (c.rotation && c.rotation.some(Boolean)) cube.rotation = c.rotation;
    FACE_NAMES.forEach(face => {
      const f = c.faces[face];
      if (!f || !f.size[0] || !f.size[1] || (f.texture && f.texture.texture && !use(f.texture.texture))) return;
      cube.faces[face] = f;
    });
    return cube;
  }).filter(c => Object.keys(c.faces).length) });
  Object.entries(s.block_definition.blocks).forEach(([block, family]) => {
    if (LIQUIDS.test(block)) return;
    shapes.blocks[block] = family;
    if (family === "ignore" || shapes.families[family] || !geometry[family]) return;
    const entry = geometry[family], kept = { forms: {} };
    RULES.forEach(r => { if (entry[r]) kept[r] = entry[r]; });
    Object.keys(entry.forms).forEach(f => { kept.forms[f] = trim(entry.forms[f]); });
    shapes.families[family] = kept;
    const turns = s.block_rotation.families[family];
    if (turns) shapes.rotations[family] = typeof turns === "string" ? standard[turns] : turns;
  });
  Object.keys(shapes.blocks).forEach(block => {
    const declared = vanilla.blocks[block], layout = declared && declared.textures;
    if (!layout) return;
    const faces = {};
    if (typeof layout === "string") FACE_NAMES.forEach(f => { faces[f] = layout; });
    else {
      if (layout.side) ["north", "south", "east", "west"].forEach(f => { faces[f] = layout.side; });
      FACE_NAMES.forEach(f => { if (layout[f]) faces[f] = layout[f]; });
    }
    const names = Object.values(faces);
    shapes.faces[block] = names.length === 6 && names.every(n => n === names[0]) ? names[0] : faces;
    names.forEach(name => { if (!(name in shapes.terrain)) shapes.terrain[name] = terrainList(vanilla.terrain[name]).map(use); });
  });
  const d = s.dust_connections;
  shapes.dust = { dust: d.dust, directions: d.directions, attract: d.attract, not_conductors: d.not_conductors, holds_dust: d.holds_dust };
  return shapes;
}

// ---- an add-on's own blocks ----

const ADDON_INDEX = "ponder_blocks.json";
// The states the placement traits add, default first.
const TRAIT_STATES = {
  "minecraft:placement_direction": {
    "minecraft:cardinal_direction": ["south", "west", "north", "east"],
    "minecraft:facing_direction": ["down", "up", "south", "west", "north", "east"],
  },
  "minecraft:placement_position": {
    "minecraft:block_face": ["down", "up", "north", "south", "west", "east"],
    "minecraft:vertical_half": ["bottom", "top"],
  },
};
// The components that decide how a block looks.
const LOOK = ["minecraft:geometry", "minecraft:material_instances", "minecraft:transformation"];
function lookOf(components) {
  const out = {};
  LOOK.forEach(key => { if (components && components[key] !== undefined) out[key.slice("minecraft:".length)] = components[key]; });
  return out;
}
const range = state => { const out = []; for (let i = state.values.min; i <= state.values.max; i++) out.push(i); return out; };
const BUILT_IN_GEOMETRY = new Set(["minecraft:geometry.full_block", "minecraft:geometry.cross"]);
const isResourcePack = pack => (manifestOf(pack.files).modules || []).some(module => module.type === "resources");
const addonFolders = pack => [...new Set([...pack.files.keys()].map(name => /^hbui\/ponder_addons\/([^/]+)\//.exec(name)).filter(Boolean).map(m => m[1]))];
const blockFiles = pack => [...pack.files.keys()].filter(name => /^blocks\/.*\.json$/.test(name));

// Every geometry a model file defines: format 1.12 and later list them under minecraft:geometry,
// 1.8 keys them geometry.<name>.
function geometryEntries(json) {
  if (Array.isArray(json["minecraft:geometry"])) return json["minecraft:geometry"].map(g => ({
    identifier: g.description.identifier, width: g.description.texture_width || 16, height: g.description.texture_height || 16, bones: g.bones || [] }));
  return Object.keys(json).filter(key => key.startsWith("geometry.")).map(key => ({
    identifier: key.split(":")[0], width: json[key].texturewidth || 16, height: json[key].textureheight || 16, bones: json[key].bones || [] }));
}

// ponder_blocks.json: blocks { id: { states, look, permutations: [{ condition, look }] } }, look
// holding the block's geometry, material_instances and transformation; geometries { identifier:
// { width, height, bones } }; textures { name: { pack, file, w, h, frames, tick, seq } }, pack
// being the uuid of the resource pack that has the file (none for vanilla's) and the rest as in
// vanilla_blocks.json. Only blocks that say how they look, and only the geometries and textures
// they use.
function addonBlockIndex(behaviorPacks, resourcePacks, vanilla) {
  const index = { blocks: {}, geometries: {}, textures: {} }, missing = [];
  const geometries = new Set(), textures = new Set();
  const uses = look => {
    if (look.geometry) geometries.add(typeof look.geometry === "string" ? look.geometry : look.geometry.identifier);
    Object.values(look.material_instances || {}).forEach(m => { if (m && typeof m === "object" && m.texture) textures.add(m.texture); });
  };
  behaviorPacks.forEach(pack => blockFiles(pack).forEach(name => {
    const block = parseJson(pack.files.get(name), pack.name + " " + name)["minecraft:block"];
    if (!block || !block.description) return;
    const d = block.description, states = {};
    Object.keys(d.states || {}).forEach(s => { states[s] = Array.isArray(d.states[s]) ? d.states[s] : range(d.states[s]); });
    Object.keys(d.traits || {}).forEach(trait => (d.traits[trait].enabled_states || []).forEach(s => {
      if (TRAIT_STATES[trait] && TRAIT_STATES[trait][s]) states[s] = TRAIT_STATES[trait][s];
    }));
    const look = lookOf(block.components);
    const permutations = (block.permutations || []).map(p => ({ condition: p.condition, look: lookOf(p.components) })).filter(p => Object.keys(p.look).length);
    if (!Object.keys(look).length && !permutations.length) return;
    index.blocks[d.identifier] = { states, look, permutations };
    uses(look);
    permutations.forEach(p => uses(p.look));
  }));
  resourcePacks.forEach(pack => pack.files.forEach((bytes, name) => {
    if (!/^models\/.*\.json$/.test(name)) return;
    geometryEntries(parseJson(bytes, pack.name + " " + name)).forEach(g => {
      if (geometries.has(g.identifier) && !index.geometries[g.identifier]) index.geometries[g.identifier] = { width: g.width, height: g.height, bones: g.bones };
    });
  }));
  // A texture name is looked up in each resource pack's terrain_texture.json, then vanilla's. Each
  // keeps its size, and its animation from that pack's flipbook_textures.json.
  const terrains = resourcePacks.map(pack => {
    const bytes = pack.files.get("textures/terrain_texture.json");
    return bytes ? parseJson(bytes, pack.name + " textures/terrain_texture.json").texture_data || {} : {};
  });
  const flipbooks = resourcePacks.map(pack => {
    const bytes = pack.files.get("textures/flipbook_textures.json");
    return bytes ? flipbookTable(parseJson(bytes, pack.name + " textures/flipbook_textures.json")) : new Map();
  });
  textures.forEach(name => {
    for (let i = 0; i < resourcePacks.length; i++) {
      const file = terrainFile(resourcePacks[i].files, terrains[i], name);
      if (!file) continue;
      const size = Object.assign({ file }, imageSize(resourcePacks[i].files.get(file), path.extname(file).slice(1)));
      index.textures[name] = Object.assign({ pack: resourcePacks[i].uuid }, textureEntry(size, flipbooks[i].get(file.replace(/\.(png|tga)$/, ""))));
      return;
    }
    const p = terrainPath(vanilla.terrain[name]), size = p && vanilla.sizes.get(p);
    if (size) index.textures[name] = textureEntry(size, vanilla.flipbooks.get(p));
    else missing.push("texture " + name);
  });
  geometries.forEach(id => { if (!BUILT_IN_GEOMETRY.has(id) && !index.geometries[id]) missing.push("geometry " + id); });
  return { index, missing };
}

// ---- writing ----

function zip(folders) {
  const local = [], central = [];
  let offset = 0;
  const write = (name, bytes) => {
    const compressed = zlib.deflateRawSync(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(zlib.crc32(bytes), 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(Buffer.byteLength(name), 26);
    const nameBytes = Buffer.from(name);
    local.push(header, nameBytes, compressed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(zlib.crc32(bytes), 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(bytes.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += header.length + nameBytes.length + compressed.length;
  };
  folders.forEach(({ folder, files }) => files.forEach((bytes, name) => write(folder + name, bytes)));
  const centralOffset = offset;
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  const count = folders.reduce((sum, folder) => sum + folder.files.size, 0);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([...local, ...central, end]);
}

// An add-on is named for what its packs' names share ("Ponder Demo" from "Ponder Demo Behavior"
// and "Ponder Demo Resources"), or else for the input.
function addonName(group) {
  const words = group.packs.map(pack => pack.name.split(" "));
  const shared = [];
  for (let i = 0; words.every(w => i < w.length - 1 && w[i] === words[0][i]); i++) shared.push(words[0][i]);
  return shared.length ? shared.join(" ") : group.label;
}

function safe(name) { return name.replace(/[<>:"/\\|?*]/g, "").trim() || "pack"; }

function writeOutput(groups, version) {
  const outDir = path.join(TOOLS, "output", version);
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  groups.forEach(group => {
    const single = group.packs.length === 1;
    const file = path.join(outDir, safe(single ? group.packs[0].name : addonName(group)) + (single ? ".mcpack" : ".mcaddon"));
    // Packs named by a translation key ("pack.name") can share a name; later ones get " 2", " 3".
    const seen = new Map();
    const folders = single
      ? [{ folder: "", files: group.packs[0].files }]
      : group.packs.map(pack => {
        const name = safe(pack.name), n = (seen.get(name) || 0) + 1;
        seen.set(name, n);
        return { folder: (n > 1 ? name + " " + n : name) + "/", files: pack.files };
      });
    fs.writeFileSync(file, zip(folders));
    written.push(path.relative(TOOLS, file).split(path.sep).join("/"));
  });
  return written;
}

// ---- run ----

function inputsFrom(args) {
  if (args.length) return args.map(arg => ({ label: path.basename(arg).replace(/\.(mcpack|mcaddon|zip)$/i, ""), path: path.resolve(arg) }));
  const dir = path.join(TOOLS, "input");
  if (!fs.existsSync(dir)) fail("nothing to adapt: pass inputs, or put them in tools/input/");
  const found = fs.readdirSync(dir).filter(name => name !== ".gitkeep").map(name => ({ label: name.replace(/\.(mcpack|mcaddon|zip)$/i, ""), path: path.join(dir, name) }));
  if (!found.length) fail("tools/input/ is empty");
  return found;
}

function main() {
  const [version, ...args] = process.argv.slice(2);
  if (!version) fail("usage: node tools/adapter/adapt.js <version> [input...]");
  const folder = versionFolder(version);
  const target = gameplay(path.join(folder, "gui"));
  target.renames = renames(target.bundle);
  const engine = engineVersion(version);

  // The input whose resource pack has hbui/gameplay.html is Ponder itself; the others are add-ons.
  const groups = inputsFrom(args).map(input => {
    let files;
    try { files = readInput(input.path); }
    catch (e) { if (e.code === "ENOENT") fail("not found: " + input.path); throw e; }
    const packs = packsOf(files).map(pack => ({ name: manifestOf(pack).header.name, uuid: manifestOf(pack).header.uuid, files: pack }));
    return { label: input.label, packs, main: packs.some(pack => pack.files.has("hbui/gameplay.html")) };
  });

  // Every pack's new version, so a dependency on a pack adapted in this run asks for the new one.
  const versions = new Map(groups.flatMap(group => group.packs.map(pack => [pack.uuid, bumped(manifestOf(pack.files).header.version)])));
  groups.forEach(group => group.packs.forEach(pack => {
    pack.report = adaptPack(pack.files, target, engine, versions, group.main);
  }));

  // Vanilla's resource pack, read the first time a pack needs it.
  let vanilla = null;
  const loadVanilla = () => {
    if (vanilla) return vanilla;
    vanilla = vanillaPack(folder);
    console.log("vanilla blocks from " + path.relative(TOOLS, vanilla.file).split(path.sep).join("/") + " and " + path.relative(TOOLS, path.join(folder, "scaffold")).split(path.sep).join("/"));
    return vanilla;
  };
  for (const group of groups) {
    const resourcePacks = group.packs.filter(isResourcePack), behaviorPacks = group.packs.filter(pack => !isResourcePack(pack));
    if (group.main) {
      const table = vanillaBlockTable(loadVanilla());
      resourcePacks.filter(pack => pack.files.has("hbui/gameplay.html")).forEach(pack => {
        pack.files.set(VANILLA_TABLE, Buffer.from(JSON.stringify(table)));
        pack.files.set(VANILLA_LICENSE, Buffer.from(SHAPES_NOTICE + vanilla.license));
        pack.report.changes.push(VANILLA_TABLE + ": " + Object.keys(table.textures).length + " textures ("
          + Object.values(table.textures).filter(t => t.tint).length + " tinted as in plains), " + Object.keys(table.cubes).length + " cube blocks, "
          + Object.keys(table.liquids).length + " liquids, "
          + Object.keys(table.shapes.blocks).length + " blocks in " + Object.keys(table.shapes.families).length + " shapes; " + VANILLA_LICENSE);
      });
      continue;
    }
    // An add-on with scenes (hbui/ponder_addons/) and blocks of its own.
    const targets = resourcePacks.filter(pack => addonFolders(pack).length);
    if (!targets.length || !behaviorPacks.some(pack => blockFiles(pack).length)) continue;
    const { index, missing } = addonBlockIndex(behaviorPacks, resourcePacks, loadVanilla());
    if (!Object.keys(index.blocks).length) continue;
    targets.forEach(pack => addonFolders(pack).forEach(f => {
      const name = "hbui/ponder_addons/" + f + "/" + ADDON_INDEX;
      pack.files.set(name, Buffer.from(JSON.stringify(index)));
      pack.report.changes.push(name + ": " + Object.keys(index.blocks).length + " blocks, " + Object.keys(index.geometries).length + " geometries, " + Object.keys(index.textures).length + " textures");
    }));
    if (missing.length) targets[0].report.changes.push("not found: " + missing.join(", "));
  }

  const written = writeOutput(groups, path.basename(folder));
  groups.forEach(group => group.packs.forEach(pack => {
    console.log(pack.report.name);
    pack.report.changes.forEach(change => console.log("  " + change));
  }));
  console.log("wrote " + written.join(", "));
}

main();
