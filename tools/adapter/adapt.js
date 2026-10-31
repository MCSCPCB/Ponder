// Adapts Ponder packs to another game version. Node only, no packages.
//
//   1. Put the packs in tools/input/ as .zip, .mcpack or .mcaddon: Ponder itself (src/BP and
//      src/RP) and the add-ons with Ponder scenes, each add-on whole (behavior and resource pack).
//   2. Into tools/version/<version>/ put the game's gui folder, so that
//      tools/version/<version>/gui/dist/hbui/gameplay.html exists; and in scaffold/ the shape
//      tables of Scaffold (github.com/EvilSlimeLabs/Scaffold:
//      block_definition, block_geometry, block_rotation, state_rotations and dust_connections
//      .json from scaffold/lookups/) with its LICENSE. Keep one current Android APK (or that
//      APK renamed to .zip) in tools/version/common/. Its vanilla resource and behavior packs
//      supply every target: only layers no newer than <version> are read, including JSON and
//      images in __brarchive/*.brarchive. Ore UI always comes from the target's own gui folder.
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
// - writes hbui/ponder/entities/vanilla_entities.json: every vanilla client entity's definition
//   and the models, animations, animation controllers and render controllers it uses, with
//   material alpha prepared in hbui/ponder/assets/entity_textures/;
// - sets header.min_engine_version to the target version.
// An add-on: for each hbui/ponder_addons/<folder>/ in its resource pack, writes ponder_blocks.json
// and ponder_entities.json there, what Ponder needs to draw the add-on's own blocks and entities.
// Its scripts and min_engine_version stay as they are.
// Every pack: 1 is added to the last digit of header.version, so the game takes it as a new
// pack; dependencies on packs adapted in the same run follow. UUIDs stay the same.
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { isDeepStrictEqual } = require("util");
const { itemData } = require("./item-data.js");

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
  { use: "GUI scale", names: ["core.device.display"] },
  { use: "controller press", names: ["engine:gamepad:onPress"] },
  { use: "controller release", names: ["engine:gamepad:onRelease"] },
  { use: "controller repeat", names: ["engine:gamepad:onLongPress"] },
  { use: "controller sticks", names: ["engine:gamepad:onJoystickMovement"] },
  { use: "item icons", names: ["geo-item://"], unquoted: true },
  { use: "pack files", names: ["pack://"], unquoted: true },
  // Not a name: how a query subscription's id goes to the engine. Vanilla's query driver hashes
  // the query and its arguments to a uint32 and passes either that number or its string; bridge.js
  // reads the marker to know which. The supplied 1.26.51 and 1.26.60 bundles pass the number.
  { use: "query subscription id", names: ["ponder:query-id/string", "ponder:query-id/number"], detect: queryIdKind },
];

// In the driver: `l=o.toString();return null!==(r=a(l,()=>({value:t(e,n,o)})))…`, where o is the
// hash and l its string; the third argument of t is what reaches query:subscribe. Some builds
// wrap the callback in parentheses: `a(l,(()=>({value:t(e,n,o)})))`.
function queryIdKind(bundle) {
  const m = /([\w$]+)=([\w$]+)\.toString\(\);return null!==\([\w$]+=[\w$]+\(\1,\(?\(\)=>\(\{value:[\w$]+\([\w$]+,[\w$]+,([\w$]+)\)\}\)\)?\)\)/.exec(bundle);
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

// ---- vanilla's blocks and entities, from the shared APK ----

// APK resources are shared; Ore UI and Scaffold's tables stay in each version's folder.
const SCAFFOLD = ["block_definition", "block_geometry", "block_rotation", "state_rotations", "dust_connections"];
const RESOURCE_FILES = /^(blocks\.json|textures\/(terrain_texture|item_texture|flipbook_textures)\.json|textures\/.+\.(png|tga)|biomes\/plains\.client_biome\.json|(entity|items|attachables|models|animations|animation_controllers|render_controllers)\/.+\.json|materials\/.+\.material)$/;
const BEHAVIOR_FILES = /^(biomes\/plains\.biome\.json|entities\/.+\.json)$/;
const RESOURCE_FOLDERS = ["entity", "items", "models", "animations", "animation_controllers", "render_controllers", "attachables", "materials", "biomes", "textures"];
const BEHAVIOR_FOLDERS = ["entities", "biomes"];
// blocks.json keys some blocks by an older name than their id.
const LEGACY_NAMES = {
  grass: "grass_block", chain: "iron_chain", seaLantern: "sea_lantern", tripWire: "trip_wire", invisibleBedrock: "invisible_bedrock",
  movingBlock: "moving_block", pistonArmCollision: "piston_arm_collision", stickyPistonArmCollision: "sticky_piston_arm_collision",
};
function commonApk(dir) {
  const candidates = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(apk|zip)$/i.test(entry.name)).map(entry => entry.name).sort() : [];
  if (candidates.length !== 1) throw new Error("keep exactly one current Minecraft APK (.apk or .zip) in " + dir + "; found " + candidates.length);
  return path.join(dir, candidates[0]);
}

function vanillaPack(folder, version) {
  const file = commonApk(path.join(TOOLS, "version", "common"));
  const merged = mergeVanillaLayers(vanillaLayers(file, version));
  const { files, blocks, terrain } = merged;
  for (const name of ["blocks.json", "textures/terrain_texture.json", "textures/flipbook_textures.json", "biomes/plains.biome.json", "biomes/plains.client_biome.json"]) {
    if (!files.has(name)) fail(path.basename(file) + " has no " + name + " in the layers for " + version);
  }
  Object.keys(LEGACY_NAMES).forEach(name => { if (blocks[name]) blocks[LEGACY_NAMES[name]] = blocks[name]; });
  const scaffold = {};
  SCAFFOLD.forEach(name => {
    const table = path.join(folder, "scaffold", name + ".json");
    if (!fs.existsSync(table)) fail("missing " + path.relative(TOOLS, table) + " (Scaffold's scaffold/lookups/" + name + ".json)");
    scaffold[name] = parseJson(fs.readFileSync(table), "scaffold/" + name + ".json");
  });
  const license = path.join(folder, "scaffold", "LICENSE");
  if (!fs.existsSync(license)) fail("missing " + path.relative(TOOLS, license) + " (Scaffold's LICENSE)");
  return {
    ...merged, file, scaffold, license: fs.readFileSync(license, "utf8"),
    tints: textureTints(plainsColors(files), terrain), colors: plainsColors(files),
  };
}

// Bedrock archive v1, as stored in Android's __brarchive/<folder>.brarchive. A 16-byte
// header precedes 256-byte entries: name length, a 247-byte name area, uint32 offset and
// uint32 length. Offsets are relative to the data after the entry table. Keep the files in
// memory; an archive can contain JSON or ordinary PNG/TGA image bytes.
function readBrArchive(data, name) {
  const invalid = reason => { throw new Error(name + ": " + reason); };
  if (data.length < 16 || data.subarray(0, 8).toString("hex") !== "7d2725b1a0527026") invalid("invalid Bedrock archive header");
  if (data.readUInt32LE(12) !== 1) invalid("unsupported Bedrock archive version " + data.readUInt32LE(12));
  const count = data.readUInt32LE(8), start = 16 + count * 256;
  if (start > data.length) invalid("truncated entry table");
  const files = new Map();
  for (let i = 0; i < count; i++) {
    const at = 16 + i * 256, length = data[at];
    if (!length || length > 247) invalid("invalid entry name length");
    const file = data.toString("utf8", at + 1, at + 1 + length).replace(/\\/g, "/");
    if (file.startsWith("/") || file.includes(":") || file.includes("\0") || file.split("/").some(p => !p || p === "." || p === "..")) invalid("invalid entry path");
    const offset = data.readUInt32LE(at + 248), size = data.readUInt32LE(at + 252);
    if (start + offset + size > data.length) invalid("truncated contents for " + file);
    if (files.has(file)) invalid("duplicate entry " + file);
    files.set(file, data.subarray(start + offset, start + offset + size));
  }
  return files;
}

function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] || 0) - (b[i] || 0);
    if (difference) return difference;
  }
  return 0;
}
const layerVersion = name => name === "vanilla" ? [0] : name.slice("vanilla_".length).split(".").map(Number);

// Retain only real pack paths (not subdirs/ metadata), and discard newer layers before
// decompressing. Entity definitions stay in separate layers: merging files by path would
// lose older identifiers that a later file of the same name no longer defines.
function vanillaLayers(file, version) {
  const target = version.split(/[.-]/).map(Number);
  engineVersion(version);
  const roots = { resource_packs: new Map(), behavior_packs: new Map() };
  const locate = name => {
    const m = /^assets\/(?:assets\/)?(resource_packs|behavior_packs)\/(vanilla(?:_\d+(?:\.\d+)*)?)\/(.+)$/.exec(name);
    if (!m || compareVersions(layerVersion(m[2]), target) > 0) return null;
    const resource = m[1] === "resource_packs", keep = resource ? RESOURCE_FILES : BEHAVIOR_FILES;
    const archived = /^__brarchive\/(.+)\.brarchive$/.exec(m[3]);
    if (archived ? !(resource ? RESOURCE_FOLDERS : BEHAVIOR_FOLDERS).includes(archived[1].split("/")[0]) : !keep.test(m[3])) return null;
    return { kind: m[1], layer: m[2], name: m[3], folder: archived && archived[1], keep };
  };
  readZip(file, name => !!locate(name)).forEach((bytes, name) => {
    const entry = locate(name), layers = roots[entry.kind];
    if (!layers.has(entry.layer)) layers.set(entry.layer, []);
    layers.get(entry.layer).push({ ...entry, bytes });
  });
  const expand = layers => [...layers.keys()].sort((a, b) => compareVersions(layerVersion(a), layerVersion(b))).map(name => {
    const files = new Map(), entries = layers.get(name);
    entries.filter(e => e.folder).sort((a, b) => a.name.localeCompare(b.name)).forEach(e => {
      readBrArchive(e.bytes, name + "/" + e.name).forEach((bytes, relative) => {
        const full = e.folder + "/" + relative;
        if (e.keep.test(full)) files.set(full, bytes);
      });
    });
    // Loose files override the archive's copy within the same version layer, regardless
    // of their order in the APK's ZIP directory.
    entries.filter(e => !e.folder).forEach(e => files.set(e.name, e.bytes));
    return { name, files };
  });
  return { resources: expand(roots.resource_packs), behaviors: expand(roots.behavior_packs) };
}

// blocks.json can update only a block's sound, or one face's texture. Preserve the
// remaining fields from earlier layers; arrays and scalar values replace their old value.
function mergeJsonFields(target, source) {
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  Object.keys(source).forEach(key => {
    target[key] = object(source[key]) ? mergeJsonFields(object(target[key]) ? target[key] : {}, source[key]) : source[key];
  });
  return target;
}

function mergeVanillaLayers({ resources, behaviors }) {
  const files = new Map(), sizes = new Map(), blocks = {}, terrain = {}, flipbooks = new Map();
  resources.forEach(layer => {
    const layerSizes = new Map();
    layer.files.forEach((bytes, name) => {
      const image = /^(.+)\.(png|tga)$/.exec(name);
      if (!image || name.startsWith("textures/colormap/")) files.set(name, bytes);
      if (image && (image[2] === "png" || !layerSizes.has(image[1]))) {
        layerSizes.set(image[1], { file: name, ...imageSize(bytes, image[2]) });
      }
      if (name === "blocks.json") mergeJsonFields(blocks, parseJson(bytes, layer.name + "/" + name));
      if (name === "textures/terrain_texture.json") mergeJsonFields(terrain, parseJson(bytes, layer.name + "/" + name).texture_data || {});
      if (name === "textures/flipbook_textures.json") flipbookTable(parseJson(bytes, layer.name + "/" + name)).forEach((entry, texture) => flipbooks.set(texture, entry));
    });
    // Newer layers win, even when an image switches between PNG and TGA.
    layerSizes.forEach((size, texture) => sizes.set(texture, size));
  });
  behaviors.forEach(layer => {
    const climate = layer.files.get("biomes/plains.biome.json");
    if (climate) files.set("biomes/plains.biome.json", climate);
  });
  return {
    files, sizes, blocks, terrain, flipbooks,
    layers: resources.map(layer => layer.files), behaviorLayers: behaviors.map(layer => layer.files),
    layerNames: resources.map(layer => layer.name), behaviorLayerNames: behaviors.map(layer => layer.name),
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
// PNG pixels as straight RGBA, including palette transparency and Adam7 passes. Keep RGB
// under transparent pixels: entity materials can use alpha as a mask instead of opacity.
function decodePng(bytes, name) {
  const invalid = message => { throw new Error(name + ": " + message); };
  if (bytes.length < 33 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") invalid("invalid PNG header");
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), depth = bytes[24], type = bytes[25], interlace = bytes[28];
  const samples = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!width || !height || !samples || ![1, 2, 4, 8, 16].includes(depth) || (type === 3 && depth === 16)
    || (type !== 0 && type !== 3 && depth < 8) || bytes[26] || bytes[27] || interlace > 1) invalid("unsupported PNG format");
  const data = [];
  let palette = null, transparency = null;
  for (let p = 8; p + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(p);
    if (p + length + 12 > bytes.length) invalid("truncated PNG chunk");
    const kind = bytes.toString("latin1", p + 4, p + 8), chunk = bytes.subarray(p + 8, p + 8 + length);
    if (kind === "IDAT") data.push(chunk);
    if (kind === "PLTE") palette = chunk;
    if (kind === "tRNS") transparency = chunk;
    p += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(data)), pixels = Buffer.alloc(width * height * 4);
  const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  const step = Math.ceil(samples * depth / 8), byte = v => depth === 16 ? v >> 8 : Math.round(v * 255 / ((1 << depth) - 1));
  let offset = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const w = Math.ceil((width - x0) / dx), h = Math.ceil((height - y0) / dy);
    if (w <= 0 || h <= 0) continue;
    const stride = Math.ceil(w * samples * depth / 8);
    let previous = Buffer.alloc(stride);
    for (let y = 0; y < h; y++) {
      if (offset + stride + 1 > raw.length) invalid("truncated PNG pixels");
      const filter = raw[offset++], row = Buffer.alloc(stride);
      if (filter > 4) invalid("invalid PNG row filter");
      for (let i = 0; i < stride; i++) {
        const left = i >= step ? row[i - step] : 0, up = previous[i], corner = i >= step ? previous[i - step] : 0;
        let add = 0;
        if (filter === 1) add = left;
        else if (filter === 2) add = up;
        else if (filter === 3) add = (left + up) >> 1;
        else if (filter === 4) {
          const guess = left + up - corner, a = Math.abs(guess - left), b = Math.abs(guess - up), c = Math.abs(guess - corner);
          add = a <= b && a <= c ? left : b <= c ? up : corner;
        }
        row[i] = raw[offset++] + add;
      }
      const sample = i => depth === 16 ? row.readUInt16BE(i * 2) : (row[Math.floor(i * depth / 8)] >> (8 - depth - i * depth % 8)) & ((1 << depth) - 1);
      for (let x = 0; x < w; x++) {
        const v = Array.from({ length: samples }, (_, c) => sample(x * samples + c)), at = ((y0 + y * dy) * width + x0 + x * dx) * 4;
        let rgba;
        if (type === 3) {
          const p = v[0] * 3;
          if (!palette || p + 3 > palette.length) invalid("invalid PNG palette index");
          rgba = [palette[p], palette[p + 1], palette[p + 2], transparency && v[0] < transparency.length ? transparency[v[0]] : 255];
        } else if (type === 0 || type === 4) {
          const g = byte(v[0]), a = type === 4 ? byte(v[1]) : transparency && v[0] === transparency.readUInt16BE(0) ? 0 : 255;
          rgba = [g, g, g, a];
        } else {
          const a = type === 6 ? byte(v[3]) : transparency && v.every((n, i) => n === transparency.readUInt16BE(i * 2)) ? 0 : 255;
          rgba = [byte(v[0]), byte(v[1]), byte(v[2]), a];
        }
        pixels.set(rgba, at);
      }
      previous = row;
    }
  }
  if (offset !== raw.length) invalid("unexpected PNG pixel data");
  return { width, height, channels: 4, pixels };
}

// Bedrock's true-colour TGA files, raw or RLE, with either vertical and horizontal origin.
function decodeTga(bytes, name) {
  const invalid = message => { throw new Error(name + ": " + message); };
  if (bytes.length < 18) invalid("invalid TGA header");
  const width = bytes.readUInt16LE(12), height = bytes.readUInt16LE(14), type = bytes[2], bits = bytes[16], flags = bytes[17];
  if (!width || !height || bytes[1] || ![2, 10].includes(type) || ![24, 32].includes(bits)) invalid("unsupported TGA format");
  const step = bits / 8, pixels = Buffer.alloc(width * height * 4);
  let offset = 18 + bytes[0], count = 0;
  const put = at => {
    if (at + step > bytes.length || count >= width * height) invalid("truncated or oversized TGA pixels");
    const x = count % width, y = Math.floor(count / width), to = ((flags & 32 ? y : height - 1 - y) * width + (flags & 16 ? width - 1 - x : x)) * 4;
    pixels.set([bytes[at + 2], bytes[at + 1], bytes[at], step === 4 ? bytes[at + 3] : 255], to);
    count++;
  };
  while (count < width * height) {
    if (offset >= bytes.length) invalid("truncated TGA pixels");
    const packet = type === 10 ? bytes[offset++] : 0, length = (packet & 127) + 1;
    for (let i = 0; i < length; i++) { put(offset); if (!(packet & 128)) offset += step; }
    if (packet & 128) offset += step;
  }
  return { width, height, channels: 4, pixels };
}
function encodePng({ width, height, pixels }) {
  const chunk = (type, data) => {
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length); out.write(type, 4); data.copy(out, 8);
    out.writeUInt32BE(zlib.crc32(out.subarray(4, -4)), out.length - 4);
    return out;
  };
  const header = Buffer.alloc(13), raw = Buffer.alloc((width * 4 + 1) * height);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  for (let y = 0; y < height; y++) pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// Material inheritance applies removals after additions, including named skinning variants.
// Keep shader semantics in the table instead of guessing them from the material's name.
function entityMaterials(sources, base) {
  const definitions = {}, resolved = {};
  sources.forEach(source => source.files.forEach((bytes, name) => {
    if (!/^materials\/.+\.material$/.test(name)) return;
    const entries = parseJson(bytes, name).materials || {};
    Object.keys(entries).forEach(key => {
      if (key === "version") return;
      const [id, parent] = key.split(":");
      definitions[id] = { parent, value: entries[key] };
    });
  }));
  const merge = (parent, value) => {
    const out = Object.assign({}, parent, value);
    for (const key of ["defines", "states"]) out[key] = Array.from(new Set((value[key] || parent[key] || []).concat(value["+" + key] || [])))
      .filter(entry => !(value["-" + key] || []).includes(entry));
    return out;
  };
  const resolve = (id, seen) => {
    if (resolved[id]) return resolved[id];
    const entry = definitions[id];
    if (!entry) return base && base[id] || {};
    if (seen.has(id)) throw new Error("Cyclic entity material: " + id);
    return (resolved[id] = merge(entry.parent ? resolve(entry.parent, new Set([...seen, id])) : {}, entry.value));
  };
  Object.keys(definitions).forEach(id => {
    const material = resolve(id, new Set());
    (material.variants || []).forEach(variant => Object.keys(variant).forEach(name => { resolved[id + "." + name] = merge(material, variant[name]); }));
  });
  return resolved;
}

// Normalize material alpha before Gameface premultiplies the image. A CSS colour matrix that
// multiplies alpha by 255 also multiplies RGB by that unbounded result in Bedrock's shader.
// Opaque materials keep every RGB pixel, cutouts use the entity shader's 0.5 threshold, and
// blended materials continue to use the original image. Equal images share one output file.
function entityTextureImages(table, read) {
  const files = new Map(), used = new Map();
  const modesOf = material => {
    const flags = material.defines || [], states = material.states || [];
    if (states.includes("DisableColorWrite")) return [];
    const blend = states.includes("Blending") && material.blendSrc !== "One", test = flags.includes("ALPHA_TEST");
    const alpha = blend ? test ? "blendCutout" : "blend" : test ? "cutout" : "opaque";
    const prefix = flags.includes("USE_EMISSIVE") ? flags.includes("USE_ONLY_EMISSIVE") ? "emissiveOnly_" : "emissive_" : flags.includes("USE_COLOR_MASK") ? "mask_" : "";
    return prefix ? [alpha, prefix + alpha, prefix + alpha + "Layer"] : [alpha];
  };
  Object.values(table.entities || {}).concat(Object.values(table.attachables || {})).forEach(def => {
    const modes = Object.values(def.materials || {}).flatMap(name => modesOf((table.materials || {})[name] || { defines: ["ALPHA_TEST"] }));
    if (!Object.keys(def.materials || {}).length) modes.push("cutout");
    Object.values(def.textures || {}).forEach(id => {
      if (!used.has(id)) used.set(id, new Set());
      modes.forEach(mode => used.get(id).add(mode));
    });
  });
  Object.entries(table.textures).forEach(([id, entry]) => {
    const bytes = read(entry);
    if (!bytes) throw new Error("entity texture not found: " + entry.file);
    const image = entry.file.endsWith(".tga") ? decodeTga(bytes, entry.file) : decodePng(bytes, entry.file);
    entry.coverage = { blend: imageCoverage(image) };
    const modes = used.get(id) || new Set(["opaque", "cutout"].concat(Object.values(table.entities || {}).length ? [] : Object.values(table.materials || {}).flatMap(modesOf)));
    for (const mode of modes) {
      if (mode === "blend") continue;
      const split = mode.indexOf("_") >= 0, layer = mode.endsWith("Layer"), alphaMode = mode.replace(/^.*_/, "").replace(/Layer$/, "");
      const mask = mode.startsWith("mask_"), emissive = mode.startsWith("emissive_"), only = mode.startsWith("emissiveOnly_");
      const pixels = Buffer.from(image.pixels);
      for (let i = 0; i < pixels.length; i += 4) {
        const a = image.pixels[i + 3], visible = only ? a > 0 && a < 255 : emissive ? a + pixels[i] + pixels[i + 1] + pixels[i + 2] > 0 : mask ? a > 0 : a >= 128;
        pixels[i + 3] = /cutout/i.test(alphaMode) && !visible ? 0 : alphaMode.startsWith("blend") ? a : 255;
        if (split) for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(pixels[i + c] * (layer ? a : 255 - a) / 255);
      }
      entry.coverage[mode] = imageCoverage({ ...image, pixels });
      if (pixels.equals(image.pixels)) continue;
      const png = encodePng({ ...image, pixels }), hash = crypto.createHash("sha256").update(png).digest("hex");
      const file = "hbui/ponder/assets/entity_textures/" + hash + ".png";
      files.set(file, png); entry[mode] = "/" + file;
    }
  });
  return files;
}
// Nonzero alpha runs, joined vertically. The renderer can omit empty UV regions without
// reading image pixels in Ore UI or discarding the reverse faces of a cutout model.
function imageCoverage({ width, height, pixels }) {
  const out = [], previous = new Map();
  for (let y = 0; y < height; y++) {
    const row = new Map();
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const visible = x < width && pixels[(y * width + x) * 4 + 3] > 0;
      if (visible && start < 0) start = x;
      if (!visible && start >= 0) {
        const key = start + "," + x, rect = previous.get(key);
        if (rect) rect[3] = (y + 1) / height;
        else out.push([start / width, y / height, x / width, (y + 1) / height]);
        row.set(key, rect || out[out.length - 1]); start = -1;
      }
    }
    previous.clear(); row.forEach((rect, key) => previous.set(key, rect));
  }
  return out;
}
// Armor trim palettes are texture lookups in the native renderer. Bake those lookups once;
// a storyboard selects the pattern and material without generating images in Ore UI.
function equipmentImages(table, vanilla) {
  const files = new Map(), source = new Map();
  vanilla.layers.forEach(layer => layer.forEach((bytes, name) => source.set(name, bytes)));
  const equipment = table.equipment = { trims: {}, shield: {} };
  const read = file => decodePng(source.get(file), file);
  const paletteFile = "textures/trims/color_palettes/trim_palette.png";
  if (source.has(paletteFile)) {
    const key = read(paletteFile), palettes = [...source.keys()].filter(p => /^textures\/trims\/color_palettes\/(?!trim_palette)[a-z_]+\.png$/.test(p));
    for (const file of source.keys()) {
      const match = /^textures\/trims\/([a-z_]+)\.png$/.exec(file);
      if (!match) continue;
      const image = read(file), variants = equipment.trims[match[1]] = {};
      for (const palette of palettes) {
        const colors = read(palette), replacements = new Map();
        for (let i = 0; i < Math.min(key.pixels.length, colors.pixels.length); i += 4)
          replacements.set(key.pixels.readUInt32BE(i) >>> 8, colors.pixels.subarray(i, i + 3));
        const pixels = Buffer.from(image.pixels);
        for (let i = 0; i < pixels.length; i += 4) {
          const color = replacements.get(pixels.readUInt32BE(i) >>> 8);
          if (color) color.copy(pixels, i);
        }
        const result = { ...image, pixels }, png = encodePng(result), hash = crypto.createHash("sha256").update(png).digest("hex");
        const output = "hbui/ponder/assets/entity_textures/" + hash + ".png";
        files.set(output, png);
        variants[path.basename(palette, ".png")] = { url: "/" + output, w: image.width, h: image.height, coverage: { blend: imageCoverage(result) } };
      }
    }
  }
  for (const file of source.keys()) {
    const match = /^textures\/entity\/shield_patterns\/([a-z_]+)\.png$/.exec(file);
    if (match) {
      const image = read(file);
      equipment.shield[match[1]] = { file, w: image.width, h: image.height, coverage: { blend: imageCoverage(image) } };
    }
  }
  table.missing = table.missing.filter(name => name !== "texture atlas.shield");
  return files;
}
// AO is masked by the texture's silhouette. Ore UI reads both PNG and TGA from the pack
// stack; inspect alpha for the AO pass without making another copy of the original image.
function blockTextureData(table, read) {
  const prepare = entry => {
    const bytes = read(entry);
    if (!bytes) throw new Error("block texture not found: " + entry.file);
    const tga = entry.file.endsWith(".tga"), image = tga ? decodeTga(bytes, entry.file) : decodePng(bytes, entry.file);
    entry.ao = true;
    for (let i = 3; i < image.pixels.length; i += 4) if (image.pixels[i] !== 0 && image.pixels[i] !== 255) { entry.ao = false; break; }
    if (entry.under) prepare(entry.under);
  };
  Object.values(table.textures).forEach(prepare);
  Object.values(table.items || {}).forEach(item => { if (item.texture) prepare(item.texture); });
}
// ItemModelGenerator's spans: only the exposed edges of opaque sprite pixels need a side.
// Runs share a face, so a 16x16 icon is not expanded into 256 separate little boxes.
function itemEdges(image) {
  const { width: w, height: h, pixels } = image, edges = [];
  const solid = (x, y) => x >= 0 && x < w && y >= 0 && y < h && pixels[(y * w + x) * 4 + 3] > 0;
  for (const [name, dx, dy] of [["up", 0, -1], ["down", 0, 1], ["left", -1, 0], ["right", 1, 0]]) {
    const vertical = dx !== 0, rows = vertical ? w : h, columns = vertical ? h : w;
    for (let row = 0; row < rows; row++) {
      let start = -1;
      for (let col = 0; col <= columns; col++) {
        const x = vertical ? row : col, y = vertical ? col : row;
        const edge = col < columns && solid(x, y) && !solid(x + dx, y + dy);
        if (edge && start < 0) start = col;
        if (!edge && start >= 0) { edges.push([name, row, start, col]); start = -1; }
      }
    }
  }
  return edges;
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
const ENTITY_TABLE = "hbui/ponder/entities/vanilla_entities.json";
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
  const registry = vanillaRegistry(), items = vanillaItemModels(vanilla, registry);
  const client = JSON.parse(fs.readFileSync(path.join(TOOLS, "data/java-1.21.1/client.json"), "utf8"));
  return { textures, cubes, liquids, blockEntities, shapes, registry, items, client, itemData: itemData(registry) };
}

function vanillaItemModels(vanilla, registry) {
  const atlas = {}, definitions = {}, files = new Map();
  vanilla.layers.forEach(layer => layer.forEach((bytes, name) => {
    files.set(name, bytes);
    if (name === "textures/item_texture.json") Object.assign(atlas, parseJson(bytes, name).texture_data || {});
    if (/^items\/.*\.json$/.test(name)) {
      const item = parseJson(bytes, name)["minecraft:item"];
      if (item) definitions[item.description.identifier] = item.components || {};
    }
  }));
  const models = {}, prepared = new Map(), paths = new Map();
  const texturePath = value => typeof value === "string" ? value : value && value.path;
  Object.values(atlas).forEach(entry => [].concat(entry.textures || []).forEach(value => {
    const p = texturePath(value); if (p) paths.set(p.split("/").pop(), p);
  }));
  const aliases = { book: "book_normal", writable_book: "book_writable", written_book: "book_written", enchanted_book: "book_enchanted",
    bow: "bow_standby", crossbow: "crossbow_standby", empty_map: "map_empty", filled_map: "map_filled", clock: "clock_item", compass: "compass_item",
    lodestone_compass: "lodestonecompass_item", minecart: "minecart_normal", glass_bottle: "potion_bottle_empty", potion: "potion_bottle_drinkable",
    splash_potion: "potion_bottle_splash", lingering_potion: "potion_bottle_lingering", redstone: "redstone_dust", slime_ball: "slimeball",
    fermented_spider_eye: "spider_eye_fermented", glistering_melon_slice: "melon_speckled", ink_sac: "dye_powder_black", cocoa_beans: "dye_powder_brown",
    lapis_lazuli: "dye_powder_blue", bone_meal: "dye_powder_white", glow_ink_sac: "dye_powder_glow", oak_sign: "sign", dark_oak_sign: "sign_darkoak",
    tropical_fish_bucket: "bucket_tropical", firework_star: "fireworks_charge", tropical_fish_spawn_egg: "spawn_egg_tropicalfish", zombie_pigman_spawn_egg: "spawn_egg_zombified_piglin" };
  Object.keys(registry.items).forEach(id => {
    const name = id.slice(10), serialized = registry.items[id].replace(/^item\.|\.name$/g, "");
    const definition = definitions[id] || definitions["minecraft:" + serialized] || {}, icon = definition["minecraft:icon"];
    let key = typeof icon === "string" ? icon : icon && (icon.texture || icon.textures && icon.textures.default);
    if (!key) key = aliases[name] || name.replace(/^wooden_/, "wood_").replace(/^golden_/, "gold_").replace(/^(.*)_spawn_egg$/, "spawn_egg_$1")
      .replace(/^zombie_pigman$/, "zombified_piglin").replace(/^(.*)_bundle$/, "bundle_$1").replace(/^(.*)_harness$/, "harness_$1")
      .replace(/^(.*)_minecart$/, "minecart_$1").replace(/^(.*)_bucket$/, "bucket_$1");
    if (/_dye$/.test(name)) key = "dye_powder_" + name.slice(0, -4).replace("light_gray", "silver") + (/^(black|blue|brown|white)_dye$/.test(name) ? "_new" : "");
    const entry = atlas[key] || atlas[serialized], list = entry && entry.textures;
    const texture = texturePath(Array.isArray(list) ? list[0] : list) || paths.get(key) || paths.get(name)
      || paths.get("sign_" + name.replace(/_sign$/, "")) || paths.get(name.replace(/^(.*)_hanging_sign$/, "sign_$1_hanging"))
      || paths.get(name.replace(/^(.*)_boat$/, "boat_$1").replace("dark_oak", "darkoak"));
    const file = texture && textureFile(files, texture);
    const model = models[id] = { rarity: definition["minecraft:rarity"] || "common" };
    if (!file) return;
    if (!prepared.has(file)) {
      const image = file.endsWith(".tga") ? decodeTga(files.get(file), file) : decodePng(files.get(file), file);
      prepared.set(file, { w: image.width, h: image.height, edges: itemEdges(image), texture: textureEntry({ file, width: image.width, height: image.height }) });
    }
    Object.assign(model, prepared.get(file));
  });
  return models;
}

// The official 1.26.50 data release supplies the 1.26.51 baseline's property domains and item
// identities. Resource packs contain images and models, but not the runtime state registry.
function vanillaRegistry() {
  const folder = path.join(TOOLS, "data/bedrock-samples/1.26.50.4");
  const blocks = JSON.parse(fs.readFileSync(path.join(folder, "mojang-blocks.json"), "utf8"));
  const items = JSON.parse(fs.readFileSync(path.join(folder, "mojang-items.json"), "utf8"));
  const properties = {}, types = {}, names = {}, ids = {};
  blocks.block_properties.forEach(p => { properties[p.name] = p.values.map(v => v.value); });
  blocks.data_items.forEach(b => { types[b.name] = b.properties.map(p => p.name); names[b.name] = b.serialization_id + ".name"; });
  items.data_items.forEach(i => { ids[i.name] = i.serialization_id + ".name"; });
  return { properties, blocks: types, names, items: ids };
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
    chest: { normal: need("textures/entity/chest/normal"), double: need("textures/entity/chest/double_normal"), trapped: need("textures/entity/chest/trapped"), trappedDouble: need("textures/entity/chest/trapped_double"), ender: need("textures/entity/chest/ender") },
    book: need("textures/entity/enchanting_table_book"), bell: need("textures/entity/bell/bell"), beam: need("textures/entity/beacon_beam"),
    portal: { sky: need("textures/environment/end_sky"), portal: need("textures/entity/end_portal") },
    conduit: { base: need("textures/blocks/conduit_base"), cage: need("textures/blocks/conduit_cage"), open: need("textures/blocks/conduit_open"), closed: need("textures/blocks/conduit_closed"), horizontal: need("textures/blocks/conduit_wind_horizontal"), vertical: need("textures/blocks/conduit_wind_vertical") },
    shulker: ["undyed"].concat(BED_COLORS).map(color => need("textures/entity/shulker/shulker_" + color)),
    pot: { base: need("textures/blocks/decorated_pot_base"), side: need("textures/blocks/decorated_pot_side"), patterns: Object.fromEntries(
      ["angler", "archer", "arms_up", "blade", "brewer", "burn", "danger", "explorer", "friend", "heart", "heartbreak", "howl", "miner", "mourner", "plenty", "prize", "sheaf", "shelter", "skull", "snort", "flow", "guster", "scrape"]
        .map(name => ["minecraft:" + name + "_pottery_sherd", need("textures/blocks/" + name + "_pottery_pattern")])) },
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
// 0.95 across so a ghost block lets the one behind show; here it fills its cell again. Slabs
// use the same inset footprint and move 0.025 toward the cell's centre; restore their half of
// the cell too. A face with no area, which Scaffold does not draw, is left out, and so is one
// whose texture the pack does not have. Water and lava are not Scaffold's: Ponder draws them
// from `liquids`.
const RULES = ["pick", "data", "turn_by", "texture_by"];
const LIQUIDS = /^(flowing_)?(water|lava)$/;
function vanillaShapes(vanilla, use) {
  const s = vanilla.scaffold, geometry = s.block_geometry.families, standard = s.state_rotations.states;
  const shapes = { blocks: {}, families: {}, rotations: {}, faces: {}, terrain: {} };
  const trim = (form, family, name) => ({ center: family === "slab" ? [0.5, name === "top" ? 0.75 : 0.25, 0.5] : form.center, cubes: form.cubes.map(c => {
    const ghost = form.cubes.length === 1 && c.size.every(v => v === 0.95) && c.offset.every(v => v === 0.025);
    const slab = family === "slab";
    const cube = { size: slab ? [1, 0.5, 1] : ghost ? [1, 1, 1] : c.size,
      offset: slab ? [0, name === "top" ? 0.5 : 0, 0] : ghost ? [0, 0, 0] : c.offset, faces: {} };
    if (family === "chest") cube.offset = [name === "default" ? 1 / 16 : c.offset[0], c.offset[1], 1 / 16];
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
    Object.keys(entry.forms).forEach(f => { kept.forms[f] = trim(entry.forms[f], family, f); });
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

const ADDON_INDEX = "ponder_blocks.json", ADDON_ENTITIES = "ponder_entities.json";
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
// 1.8's geometry.<name>:geometry.<parent> takes its parent's bones and texture size where it gives
// none of its own (`parent`). The texture size is left out where the file gives none.
function geometryEntries(json) {
  if (Array.isArray(json["minecraft:geometry"])) return json["minecraft:geometry"].map(g => ({
    identifier: g.description.identifier, width: g.description.texture_width, height: g.description.texture_height, bones: g.bones || [] }));
  return Object.keys(json).filter(key => key.startsWith("geometry.")).map(key => ({
    identifier: key.split(":")[0], parent: key.split(":")[1], width: json[key].texturewidth, height: json[key].textureheight, bones: json[key].bones || [] }));
}

// ponder_blocks.json: blocks { id: { states, look, permutations: [{ condition, look }] } }, look
// holding the block's geometry, material_instances and transformation; geometries { identifier:
// { width, height, bones } }; textures { name: { pack, file, w, h, frames, tick, seq } }, pack
// being the uuid of the resource pack that has the file (none for vanilla's) and the rest as in
// vanilla_blocks.json. Only blocks that say how they look, and only the geometries and textures
// they use.
function addonBlockIndex(behaviorPacks, resourcePacks, vanilla) {
  const index = { blocks: {}, items: {}, geometries: {}, textures: {}, tints: vanilla.colors || {} }, missing = [];
  const vanillaItems = {};
  (vanilla.layers || []).forEach(layer => {
    const bytes = layer.get("textures/item_texture.json");
    if (bytes) Object.assign(vanillaItems, parseJson(bytes, "textures/item_texture.json").texture_data || {});
  });
  behaviorPacks.forEach(pack => pack.files.forEach((bytes, name) => {
    if (!/^items\/.*\.json$/.test(name)) return;
    const item = parseJson(bytes, name)["minecraft:item"];
    if (!item || !item.description) return;
    const components = item.components || {}, display = components["minecraft:display_name"], icon = components["minecraft:icon"];
    const model = index.items[item.description.identifier] = { name: display && display.value || "item." + item.description.identifier + ".name", rarity: components["minecraft:rarity"] || "common" };
    const damage = components["minecraft:damage"];
    if (damage != null) model.attackDamage = typeof damage === "number" ? damage : damage.value;
    model.maxStackSize = components["minecraft:max_stack_size"] || 64;
    const key = typeof icon === "string" ? icon : icon && (icon.texture || icon.textures && icon.textures.default);
    if (!key) return;
    const atlas = resourcePacks.map(pack => pack.files.get("textures/item_texture.json")).filter(Boolean).map(bytes => parseJson(bytes, "textures/item_texture.json").texture_data || {});
    const entry = atlas.map(t => t[key]).find(Boolean) || vanillaItems[key], p = entry && terrainPath(entry);
    if (!p) { missing.push("item texture " + key); return; }
    const sources = resourcePacks.concat((vanilla.layers || []).slice().reverse().map(files => ({ files })));
    const resource = sources.map(pack => ({ pack, file: textureFile(pack.files, p) })).find(p => p.file);
    if (!resource) { missing.push("item texture " + p); return; }
    const image = resource.file.endsWith(".tga") ? decodeTga(resource.pack.files.get(resource.file), resource.file) : decodePng(resource.pack.files.get(resource.file), resource.file);
    Object.assign(model, { w: image.width, h: image.height, edges: itemEdges(image), texture: Object.assign(resource.pack.uuid ? { pack: resource.pack.uuid } : {}, textureEntry({ file: resource.file, width: image.width, height: image.height })) });
  }));
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
      if (geometries.has(g.identifier) && !index.geometries[g.identifier]) index.geometries[g.identifier] = { width: g.width || 16, height: g.height || 16, bones: g.bones };
    });
  }));
  // Resolve the winning terrain declaration first, then its image path through the entire
  // resource stack. A declaration may name a vanilla file under a different terrain key.
  const terrains = resourcePacks.map(pack => {
    const bytes = pack.files.get("textures/terrain_texture.json");
    return bytes ? parseJson(bytes, pack.name + " textures/terrain_texture.json").texture_data || {} : {};
  });
  const flipbooks = resourcePacks.map(pack => {
    const bytes = pack.files.get("textures/flipbook_textures.json");
    return bytes ? flipbookTable(parseJson(bytes, pack.name + " textures/flipbook_textures.json")) : new Map();
  });
  textures.forEach(name => {
    const declaration = terrains.find(t => Object.prototype.hasOwnProperty.call(t, name));
    const p = terrainPath(declaration ? declaration[name] : vanilla.terrain[name]);
    if (p) {
      for (let i = 0; i < resourcePacks.length; i++) {
        const file = textureFile(resourcePacks[i].files, p);
        if (!file) continue;
        const size = Object.assign({ file }, imageSize(resourcePacks[i].files.get(file), path.extname(file).slice(1)));
        const animation = flipbooks.map(f => f.get(p)).find(Boolean) || vanilla.flipbooks.get(p);
        index.textures[name] = Object.assign({ pack: resourcePacks[i].uuid }, textureEntry(size, animation));
        return;
      }
      const size = vanilla.sizes.get(p);
      if (size) { index.textures[name] = textureEntry(size, vanilla.flipbooks.get(p)); return; }
    }
    missing.push("texture " + name);
  });
  geometries.forEach(id => { if (!BUILT_IN_GEOMETRY.has(id) && !index.geometries[id]) missing.push("geometry " + id); });
  return { index, missing };
}

// The entity tables: vanilla_entities.json (hbui/ponder/entities/), every client entity of the
// game, and an add-on's ponder_entities.json, its own. Each holds the entities' definitions
// (entities { id: { textures, geometry, animations, animation_controllers, render_controllers,
// scripts, materials, properties } }, the names as the definition gives them, and properties { name:
// default } from the behavior pack's entity file) and what those names point at,
// cut to what the entity renderer reads: geometries { identifier: { width, height, bones } },
// animations, controllers (animation controllers) and renders (render controllers) by name, and
// textures { path: { pack, file, w, h, frames, tick, seq, opaque, cutout } } (textureEntry,
// `pack` as in ponder_blocks.json, opaque/cutout the prepared image URLs when needed).
// An add-on's names may point at vanilla's (`base`), which it does not
// repeat unless vanilla_entities.json leaves it out (no vanilla entity names it, as
// controller.render.piglin): that is copied in. A name nothing defines is in `missing`.
// `sources` are { files, texture(path) }: a pack's files by path, and a texture's entry or null;
// `behavior` the behavior packs' files by path.
function entityTable(sources, behavior, base) {
  const entities = {}, attachables = {}, geometries = {}, animations = {}, controllers = {}, renders = {}, textures = {}, missing = [];
  const own = { geometries, animations, controllers, renders };
  const materials = entityMaterials(sources, base && base.materials);
  const borrow = (table, id) => { const v = base && base.all[table][id]; if (v) own[table][id] = v; return v; };
  // Sources in order: a later one's definition replaces an earlier one's of the same name.
  const each = (prefix, fn) => sources.forEach((s, i) => { for (const [name, bytes] of s.files) if (name.startsWith(prefix) && name.endsWith(".json")) fn(parseJson(bytes, name), i); });
  const versionOf = d => String(d.min_engine_version || "0").split(".").map(Number);
  const newer = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const x = a[i] || 0, y = b[i] || 0; if (x !== y) return x > y; } return false; };
  const raw = {};
  // A geometry two files of one source define (mobs.json's 1.8 iron golem and
  // iron_golem.geo.json's): the newer format's.
  const formatOf = json => String(json.format_version || "0").split(".").map(Number);
  each("models/", (json, source) => geometryEntries(json).forEach(g => {
    g.format = formatOf(json);
    g.source = source;
    const had = raw[g.identifier];
    if (!had || source > had.source || newer(g.format, had.format)) raw[g.identifier] = g;
  }));
  // A 1.8 geometry with a parent: the parent's bones, a bone of the same name taking the child's
  // settings and both one's cubes (a sheep's wool over its sheared body). An add-on's own geometry
  // wins over vanilla's of the same name.
  const known = id => geometries[id] || (!raw[id] && base && (base.geometries[id] || borrow("geometries", id)));
  const resolve = (id, seen) => {
    if (known(id) || !raw[id]) return known(id);
    const g = raw[id], parent = g.parent && !seen.has(g.parent) ? resolve(g.parent, new Set([...seen, id])) : null;
    if (g.parent && !parent) missing.push("geometry " + g.parent);
    const byName = new Map(g.bones.map(b => [b.name, b]));
    const bones = parent ? parent.bones.map(b => {
      const own = byName.get(b.name);
      return own ? Object.assign({}, b, own, { cubes: (own.reset ? [] : b.cubes || []).concat(own.cubes || []) }) : b;
    }).concat(g.bones.filter(b => !parent.bones.some(p => p.name === b.name))) : g.bones;
    return (geometries[id] = { width: g.width || (parent && parent.width) || 64, height: g.height || (parent && parent.height) || 64, bones });
  };
  Object.keys(raw).forEach(id => resolve(id, new Set()));
  each("animations/", json => Object.assign(animations, json.animations || {}));
  each("animation_controllers/", json => Object.assign(controllers, json.animation_controllers || {}));
  each("render_controllers/", json => Object.assign(renders, json.render_controllers || {}));
  const properties = {}, health = {}, collision = {}, variants = {}, dimensions = {};
  behavior.forEach(files => { for (const [name, bytes] of files) if (/^entities\/.+\.json$/.test(name)) {
    const e = parseJson(bytes, name)["minecraft:entity"] || {}, d = e.description;
    if (d) {
      const c = (e.components || {})["minecraft:collision_box"];
      if (c) collision[d.identifier] = c;
      const sizes = {}, scale = (e.components || {})["minecraft:scale"], dimension = { scale: scale ? scale.value : 1 };
      Object.values(e.component_groups || {}).forEach(group => {
        const v = group["minecraft:variant"], box = group["minecraft:collision_box"];
        if (v && box) sizes[v.value] = box;
        if (group["minecraft:is_baby"]) dimension.baby = { scale: (group["minecraft:scale"] || scale || { value: 1 }).value, collision: box || c };
      });
      if (Object.keys(sizes).length) variants[d.identifier] = sizes;
      dimensions[d.identifier] = dimension;
    }
    // A fresh entity's health, which query.health reads (an iron golem's cracks).
    const h = ((e.components || {})["minecraft:health"] || {});
    if (d && typeof (h.value ?? h.max) === "number") health[d.identifier] = { value: h.value ?? h.max, max: h.max ?? h.value };
    // An enum's default is its name; another's given as Molang (a bee's has_nectar reads its
    // component groups) is taken as false or 0, as a fresh entity has.
    if (d && d.properties) properties[d.identifier] = Object.fromEntries(Object.keys(d.properties).map(k => {
      const p = d.properties[k];
      return [k, p.type === "enum" || typeof p.default !== "string" ? p.default : p.type === "bool" ? false : 0];
    }));
  } });
  // Several files can define one entity: the game uses the one with the highest
  // min_engine_version, and of those the latest source's.
  const chosen = new Map(), chosenFrom = new Map();
  each("entity/", (json, source) => {
    const d = (json["minecraft:client_entity"] || {}).description;
    if (!d || !d.identifier) return;
    const had = chosen.get(d.identifier);
    if (!had || newer(versionOf(d), versionOf(had)) || (!newer(versionOf(had), versionOf(d)) && source > chosenFrom.get(d.identifier))) {
      chosen.set(d.identifier, d);
      chosenFrom.set(d.identifier, source);
    }
  });
  const has = (table, id) => own[table][id] || (base && (base[table][id] || borrow(table, id)));
  const use = p => {
    if (!(p in textures) && !(base && base.textures[p])) {
      const entry = sources.map(s => s.texture(p)).find(Boolean) || (base && base.all.texture(p));
      if (entry) textures[p] = entry;
      else missing.push("texture " + p);
    }
    return p;
  };
  const equipment = new Map();
  each("attachables/", json => {
    const d = (json["minecraft:attachable"] || {}).description;
    if (d && d.identifier) equipment.set(d.identifier, d);
  });
  const define = (d, id, target) => {
    const t = {};
    // Model-less attachables use the ordinary item mesh and its item atlas.
    if (target !== attachables || Object.keys(d.geometry || {}).length)
      Object.keys(d.textures || {}).forEach(k => { t[k] = use(d.textures[k]); });
    target[id] = {
      textures: t, geometry: d.geometry || {}, animations: d.animations || {},
      animation_controllers: d.animation_controllers || [], render_controllers: d.render_controllers || [],
      scripts: d.scripts || {}, materials: d.materials || {}, properties: properties[id] || {},
    };
    if (d.item) target[id].item = d.item;
    if (health[id]) target[id].health = health[id];
    if (collision[id]) target[id].collision = collision[id];
    if (variants[id]) target[id].variantCollisions = variants[id];
    if (dimensions[id]) target[id].dimensions = dimensions[id];
    Object.values(d.geometry || {}).forEach(g => { if (!has("geometries", g)) missing.push("geometry " + g); });
    Object.values(d.animations || {}).forEach(a => { if (!has("animations", a) && !has("controllers", a)) missing.push("animation " + a); });
    (d.animation_controllers || []).forEach(entry => Object.values(typeof entry === "string" ? { entry } : entry).forEach(c => {
      if (!has("controllers", c)) missing.push("animation controller " + c);
    }));
    (d.render_controllers || []).forEach(entry => Object.keys(typeof entry === "string" ? { [entry]: 0 } : entry).forEach(r => {
      if (!has("renders", r)) missing.push("render controller " + r);
    }));
  };
  chosen.forEach((d, id) => define(d, id, entities));
  equipment.forEach((d, id) => define(d, id, attachables));
  // Only what an entity names.
  const named = { geometries: new Set(), animations: new Set(), renders: new Set() };
  Object.values(entities).concat(Object.values(attachables)).forEach(e => {
    Object.values(e.geometry).forEach(g => named.geometries.add(g));
    Object.values(e.animations).forEach(a => named.animations.add(a));
    e.animation_controllers.forEach(entry => Object.values(typeof entry === "string" ? { entry } : entry).forEach(c => named.animations.add(c)));
    e.render_controllers.forEach(entry => Object.keys(typeof entry === "string" ? { [entry]: 0 } : entry).forEach(r => named.renders.add(r)));
  });
  const only = (table, set) => { const out = {}; Object.keys(table).forEach(k => { if (set.has(k)) out[k] = table[k]; }); return out; };
  const table = {
    entities, attachables, geometries: only(geometries, named.geometries), animations: only(animations, named.animations),
    controllers: only(controllers, named.animations), renders: only(renders, named.renders), textures, materials, missing: [...new Set(missing)],
  };
  // Vanilla's whole tables, for the add-ons (`all`, not written out).
  if (!base) Object.defineProperty(table, "all", { value: { geometries, animations, controllers, renders, texture: p => sources.map(s => s.texture(p)).find(Boolean) } });
  return table;
}
// Vanilla's resource and behavior layers from the shared APK, restricted to the target.
const vanillaEntityTable = vanilla => {
  const texture = p => {
    const size = vanilla.sizes.get(p);
    return size ? textureEntry(size, vanilla.flipbooks.get(p)) : null;
  };
  const table = entityTable(vanilla.layers.map(files => ({ files, texture })), vanilla.behaviorLayers, null);
  // BoatModel/ChestBoatModel are code models. Their Bedrock textures use the same layout;
  // include every wood's skin because the client definition names only some of them.
  for (const type of ["boat", "chest_boat"]) {
    const entity = table.entities["minecraft:" + type];
    if (!entity) continue;
    entity.renderer = "boat";
    entity.geometry = {};
    entity.materials = { default: "boat" };
    const woods = ["oak", "spruce", "birch", "jungle", "acacia", "darkoak", "mangrove", "bamboo", "cherry", "paleoak"];
    woods.forEach((wood, i) => {
      const file = type === "chest_boat" ? "chest_boat_" + (wood === "paleoak" ? "pale_oak" : wood)
        : i < 6 ? "boat_" + wood : wood === "bamboo" ? "bamboo_raft" : (wood === "paleoak" ? "pale_oak" : wood) + "_boat";
      const id = "textures/entity/boat/" + file, entry = texture(id);
      if (entry) { entity.textures[wood] = id; table.textures[id] = entry; }
    });
    table.missing = table.missing.filter(name => name !== "geometry geometry." + type);
  }
  // The current geometries omit bind rotations that their unchanged vanilla cubes still use.
  // Restore only matching adult bones; an authored replacement keeps its own pose.
  const shape = b => ({ pivot: b.pivot, cubes: (b.cubes || []).map(c => ({ origin: c.origin, size: c.size,
    pivot: c.pivot || null, rotation: c.rotation || [0, 0, 0], inflate: c.inflate || 0 })) });
  for (const [file, id] of [["cat", "geometry.cat"], ["ocelot", "geometry.ocelot.v1.8"], ["polar_bear", "geometry.polarbear"]]) {
    const model = table.geometries[id];
    if (!model) continue;
    vanilla.layers.forEach(files => {
      const bytes = files.get("models/entity/" + file + ".geo.json");
      if (!bytes) return;
      const source = geometryEntries(parseJson(bytes, file + ".geo.json")).find(g => g.identifier === id);
      if (!source) return;
      model.bones.forEach(b => {
        if (b.rotation || b.bind_pose_rotation) return;
        const rest = source.bones.find(r => r.name === b.name && r.bind_pose_rotation);
        if (rest && isDeepStrictEqual(shape(rest), shape(b))) b.bind_pose_rotation = rest.bind_pose_rotation.slice();
      });
    });
  }
  return table;
};
// An add-on's, from its resource packs, its textures in the first pack that has the file.
const addonEntityTable = (resourcePacks, behaviorPacks, base) => entityTable(resourcePacks.map(pack => ({ files: pack.files, texture: p => {
  const file = textureFile(pack.files, p);
  return file ? Object.assign({ pack: pack.uuid }, textureEntry(Object.assign({ file }, imageSize(pack.files.get(file), path.extname(file).slice(1))))) : null;
} })), behaviorPacks.map(pack => pack.files), base);

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
    vanilla = vanillaPack(folder, version);
    console.log("vanilla resources from " + path.relative(TOOLS, vanilla.file).split(path.sep).join("/"));
    console.log("resource layers for " + version + ": " + vanilla.layerNames.join(", "));
    console.log("behavior layers for " + version + ": " + vanilla.behaviorLayerNames.join(", "));
    console.log("gui and scaffold from " + path.relative(TOOLS, folder).split(path.sep).join("/"));
    return vanilla;
  };
  const vanillaImage = entry => {
    const layers = loadVanilla().layers;
    for (let i = layers.length - 1; i >= 0; i--) if (layers[i].has(entry.file)) return layers[i].get(entry.file);
    return null;
  };
  let vanillaEntities = null, vanillaImages = null;
  const loadVanillaEntities = () => {
    if (!vanillaEntities) {
      vanillaEntities = vanillaEntityTable(loadVanilla());
      vanillaImages = entityTextureImages(vanillaEntities, vanillaImage);
      equipmentImages(vanillaEntities, loadVanilla()).forEach((bytes, file) => vanillaImages.set(file, bytes));
    }
    return vanillaEntities;
  };
  for (const group of groups) {
    const resourcePacks = group.packs.filter(isResourcePack), behaviorPacks = group.packs.filter(pack => !isResourcePack(pack));
    if (group.main) {
      const table = vanillaBlockTable(loadVanilla());
      blockTextureData(table, vanillaImage);
      const entityTable = loadVanillaEntities();
      resourcePacks.filter(pack => pack.files.has("hbui/gameplay.html")).forEach(pack => {
        pack.files.set(VANILLA_TABLE, Buffer.from(JSON.stringify(table)));
        pack.files.set(VANILLA_LICENSE, Buffer.from(SHAPES_NOTICE + vanilla.license));
        pack.files.set(ENTITY_TABLE, Buffer.from(JSON.stringify(entityTable)));
        vanillaImages.forEach((bytes, file) => pack.files.set(file, bytes));
        pack.report.changes.push(ENTITY_TABLE + ": " + Object.keys(entityTable.entities).length + " entities, "
          + Object.keys(entityTable.geometries).length + " geometries, " + Object.keys(entityTable.animations).length + " animations, "
          + Object.keys(entityTable.textures).length + " textures, " + vanillaImages.size + " material images"
          + (entityTable.missing.length ? "; not found: " + entityTable.missing.join(", ") : ""));
        pack.report.changes.push(VANILLA_TABLE + ": " + Object.keys(table.textures).length + " textures ("
          + Object.values(table.textures).filter(t => t.tint).length + " tinted as in plains), " + Object.keys(table.cubes).length + " cube blocks, "
          + Object.keys(table.liquids).length + " liquids, "
          + Object.keys(table.shapes.blocks).length + " blocks in " + Object.keys(table.shapes.families).length + " shapes; " + VANILLA_LICENSE);
      });
      continue;
    }
    // An add-on with scenes (hbui/ponder_addons/): its own blocks and entities.
    const targets = resourcePacks.filter(pack => addonFolders(pack).length);
    if (!targets.length) continue;
    const write = (file, table, report) => targets.forEach(pack => addonFolders(pack).forEach(f => {
      const name = "hbui/ponder_addons/" + f + "/" + file;
      pack.files.set(name, Buffer.from(JSON.stringify(table)));
      pack.report.changes.push(name + ": " + report);
    }));
    if (behaviorPacks.some(pack => blockFiles(pack).length || [...pack.files.keys()].some(name => /^items\/.*\.json$/.test(name)))) {
      const { index, missing } = addonBlockIndex(behaviorPacks, resourcePacks, loadVanilla());
      if (Object.keys(index.blocks).length || Object.keys(index.items).length) {
        blockTextureData(index, entry => entry.pack
          ? resourcePacks.find(pack => pack.uuid === entry.pack).files.get(entry.file) : vanillaImage(entry));
        write(ADDON_INDEX, index, Object.keys(index.blocks).length + " blocks, " + Object.keys(index.geometries).length + " geometries, " + Object.keys(index.textures).length + " textures");
        if (missing.length) targets[0].report.changes.push("not found: " + missing.join(", "));
      }
    }
    if (resourcePacks.some(pack => [...pack.files.keys()].some(name => /^entity\/.*\.json$/.test(name)))) {
      const entities = addonEntityTable(resourcePacks, behaviorPacks, loadVanillaEntities());
      const images = entityTextureImages(entities, entry => entry.pack
        ? resourcePacks.find(pack => pack.uuid === entry.pack).files.get(entry.file) : vanillaImage(entry));
      targets.forEach(pack => images.forEach((bytes, file) => pack.files.set(file, bytes)));
      write(ADDON_ENTITIES, entities, Object.keys(entities.entities).length + " entities, " + Object.keys(entities.geometries).length + " geometries, "
        + Object.keys(entities.animations).length + " animations, " + Object.keys(entities.textures).length + " textures, " + images.size + " material images"
        + (entities.missing.length ? "; not found: " + entities.missing.join(", ") : ""));
    }
  }

  groups.forEach(group => group.packs.forEach(require("./structures.js").adaptStructures));
  const written = writeOutput(groups, path.basename(folder));
  groups.forEach(group => group.packs.forEach(pack => {
    console.log(pack.report.name);
    pack.report.changes.forEach(change => console.log("  " + change));
  }));
  console.log("wrote " + written.join(", "));
}

if (require.main === module) main();
module.exports = { queryIdKind, readBrArchive, commonApk, vanillaLayers, mergeVanillaLayers, vanillaShapes, vanillaEntityTable, addonEntityTable, addonBlockIndex,
  decodePng, decodeTga, encodePng, entityMaterials, entityTextureImages, equipmentImages, blockTextureData, itemEdges, readZip, zip };
