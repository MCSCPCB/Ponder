// Adapts Ponder packs to another game version. Node only, no packages.
//
//   1. Put the packs in tools/input/ as .zip, .mcpack or .mcaddon: Ponder itself (src/BP and
//      src/RP) and the add-ons with Ponder scenes, each add-on whole (behavior and resource pack).
//   2. Into tools/version/<version>/ put the game's gui folder, so that
//      tools/version/<version>/gui/dist/hbui/gameplay.html exists, and Mojang's
//      bedrock-samples-v<release>-min.zip (github.com/Mojang/bedrock-samples/releases, the newest
//      full release no newer than <version>), which has vanilla's resource pack.
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
// - writes hbui/ponder/blocks/vanilla_blocks.json, every vanilla block's textures;
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
// local headers. Folders, and macOS's __MACOSX copies, are skipped.
function readZip(file) {
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
    if (!name || name.endsWith("/") || name.startsWith("__MACOSX/")) continue;
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

// The resource pack in the version folder's bedrock-samples-v<release>-min.zip: one pack, every
// version layer already merged.
function vanillaPack(folder) {
  const zips = fs.readdirSync(folder).filter(name => /^bedrock-samples-v[\d.]+-min\.zip$/.test(name)).sort();
  if (!zips.length) fail("no bedrock-samples-v<release>-min.zip in " + path.relative(TOOLS, folder) + " (download it from github.com/Mojang/bedrock-samples/releases)");
  const file = path.join(folder, zips[zips.length - 1]), files = new Map();
  readZip(file).forEach((bytes, name) => { if (name.startsWith("resource_pack/")) files.set(name.slice("resource_pack/".length), bytes); });
  if (!files.has("blocks.json")) fail(path.basename(file) + " has no resource_pack/blocks.json");
  return {
    file, files,
    blocks: parseJson(files.get("blocks.json"), "vanilla blocks.json"),
    terrain: parseJson(files.get("textures/terrain_texture.json"), "vanilla textures/terrain_texture.json").texture_data,
  };
}

// A texture's file in a pack, with its extension (textures/blocks/stone -> textures/blocks/stone.png).
const textureFile = (files, texture) => [".png", ".tga"].map(ext => texture + ext).find(name => files.has(name)) || null;
// The texture a terrain_texture.json entry draws: its first variant. One the game tints
// (overlay_color, tint_color) gives null, since its file alone is not what the game shows.
function terrainPath(entry) {
  let t = entry && entry.textures;
  if (Array.isArray(t)) t = t[0];
  if (t && typeof t === "object") return t.overlay_color || t.tint_color ? null : t.path || null;
  return typeof t === "string" ? t : null;
}
const terrainFile = (files, terrain, name) => { const t = terrainPath(terrain[name]); return t && textureFile(files, t); };
// bedrock-samples' min.zip holds no images, so a vanilla texture is taken to be a .png; the few
// that are only .tga in the game (cactus, ferns, the double plants) do not load that way.
const vanillaTexture = (vanilla, name) => { const t = terrainPath(vanilla.terrain[name]); return t ? t + ".png" : null; };

// vanilla_blocks.json: block name (the id without minecraft:) -> its texture file, or one per face
// { up, down, north, south, west, east }. blocks.json names each face's texture, the inventory
// look (carried_textures) first; terrain_texture.json gives its file. A block with a face the
// game tints is left out, and Ponder falls back to its own table for it.
const FACE_NAMES = ["up", "down", "north", "south", "west", "east"];
const VANILLA_TABLE = "hbui/ponder/blocks/vanilla_blocks.json";
function vanillaBlockTable(vanilla) {
  const blocks = vanilla.blocks, table = {};
  const faces = names => {
    const out = {};
    for (const face of FACE_NAMES) {
      const name = typeof names === "string" ? names : names[face] || names.side;
      const file = name && vanillaTexture(vanilla, name);
      if (!file) return null;
      out[face] = file;
    }
    return out;
  };
  Object.keys(blocks).forEach(name => {
    const entry = blocks[name];
    if (!entry || typeof entry !== "object") return;
    const found = (entry.carried_textures && faces(entry.carried_textures)) || (entry.textures && faces(entry.textures));
    if (found) table[name] = FACE_NAMES.every(face => found[face] === found.up) ? found.up : found;
  });
  return table;
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
// { width, height, bones } }; textures { name: { pack, file } }, pack being the uuid of the
// resource pack that has the file (none for vanilla's). Only blocks that say how they look, and
// only the geometries and textures they use.
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
  // A texture name is looked up in each resource pack's terrain_texture.json, then vanilla's.
  const terrains = resourcePacks.map(pack => {
    const bytes = pack.files.get("textures/terrain_texture.json");
    return bytes ? parseJson(bytes, pack.name + " textures/terrain_texture.json").texture_data || {} : {};
  });
  textures.forEach(name => {
    for (let i = 0; i < resourcePacks.length; i++) {
      const file = terrainFile(resourcePacks[i].files, terrains[i], name);
      if (file) { index.textures[name] = { pack: resourcePacks[i].uuid, file }; return; }
    }
    const file = vanillaTexture(vanilla, name);
    if (file) index.textures[name] = { file };
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
    console.log("vanilla blocks from " + path.relative(TOOLS, vanilla.file).split(path.sep).join("/"));
    return vanilla;
  };
  for (const group of groups) {
    const resourcePacks = group.packs.filter(isResourcePack), behaviorPacks = group.packs.filter(pack => !isResourcePack(pack));
    if (group.main) {
      const table = vanillaBlockTable(loadVanilla());
      resourcePacks.filter(pack => pack.files.has("hbui/gameplay.html")).forEach(pack => {
        pack.files.set(VANILLA_TABLE, Buffer.from(JSON.stringify(table)));
        pack.report.changes.push(VANILLA_TABLE + ": " + Object.keys(table).length + " vanilla blocks");
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
