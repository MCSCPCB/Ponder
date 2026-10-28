// Adapts Ponder packs to another game version. Node only, no packages.
//
//   node tools/adapter/adapt.js <version> [input...]
//
// <version> names a folder under tools/version/ (1-26-60-4 or 1.26.60.4) holding that version's
// gui folder, copied from the game: tools/version/<version>/gui/dist/hbui/gameplay.html and the
// bundles it names. Each input is a folder, .mcpack, .mcaddon or .zip; every manifest.json found
// in it is one pack. Without inputs, everything in tools/input/ is adapted. Results go to
// tools/output/<version>/: one .mcpack per single-pack input, one .mcaddon otherwise.
//
// For each pack it:
// - swaps vanilla's hashed bundle names at the top of hbui/gameplay.html for the target's;
// - renames the vanilla queries and commands Ponder calls to what the target bundle calls them
//   (NAMES below), and stops if the bundle has none of the known names;
// - sets header.min_engine_version to the target version and adds 1 to the last digit of
//   header.version, so the game takes it as a new pack; dependencies on packs adapted in the
//   same run follow. UUIDs stay the same.
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

// ---- the target version's gui folder ----

function versionFolder(version) {
  const folder = path.join(TOOLS, "version", version);
  if (fs.existsSync(folder)) return folder;
  const dashed = version.replace(/\./g, "-");
  if (dashed !== version && fs.existsSync(path.join(TOOLS, "version", dashed))) return path.join(TOOLS, "version", dashed);
  fail("no folder tools/version/" + version + " (put that version's gui folder there)");
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

function readZip(file) {
  const data = fs.readFileSync(file);
  const files = new Map();
  let offset = 0;
  while (offset + 30 <= data.length && data.readUInt32LE(offset) === 0x04034b50) {
    const method = data.readUInt16LE(offset + 8);
    const compressed = data.readUInt32LE(offset + 18);
    const nameLength = data.readUInt16LE(offset + 26);
    const extraLength = data.readUInt16LE(offset + 28);
    const name = data.toString("utf8", offset + 30, offset + 30 + nameLength);
    const start = offset + 30 + nameLength + extraLength;
    if (name && !name.endsWith("/")) {
      const bytes = data.subarray(start, start + compressed);
      if (method === 0) files.set(name, Buffer.from(bytes));
      else if (method === 8) files.set(name, zlib.inflateRawSync(bytes));
      else fail(path.basename(file) + " stores " + name + " with compression method " + method);
    }
    offset = start + compressed;
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

function manifestOf(pack) {
  try { return JSON.parse(pack.get("manifest.json").toString("utf8")); }
  catch (e) { fail("manifest.json is not JSON: " + e.message); }
}

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

function adaptManifest(manifest, engine, versions) {
  const header = manifest.header;
  const changes = [];
  if (!sameVersion(header.min_engine_version, engine)) {
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

function adaptPack(pack, target, engine, versions) {
  const manifest = manifestOf(pack);
  const report = { name: manifest.header.name, uuid: manifest.header.uuid, changes: adaptManifest(manifest, engine, versions) };
  // Two-space JSON with number arrays on one line, as the packs write it.
  const json = JSON.stringify(manifest, null, 2).replace(/\[\s*(\d+(?:,\s*\d+)*)\s*\]/g, (match, list) => "[" + list.split(/,\s*/).join(", ") + "]");
  pack.set("manifest.json", Buffer.from(json + "\n"));

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
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  groups.forEach(group => {
    const single = group.packs.length === 1;
    const file = path.join(outDir, safe(single ? group.packs[0].name : addonName(group)) + (single ? ".mcpack" : ".mcaddon"));
    const folders = single
      ? [{ folder: "", files: group.packs[0].files }]
      : group.packs.map(pack => ({ folder: safe(pack.name) + "/", files: pack.files }));
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

  const groups = inputsFrom(args).map(input => {
    let files;
    try { files = readInput(input.path); }
    catch (e) { if (e.code === "ENOENT") fail("not found: " + input.path); throw e; }
    const packs = packsOf(files).map(pack => ({ name: manifestOf(pack).header.name, uuid: manifestOf(pack).header.uuid, files: pack }));
    return { label: input.label, packs };
  });

  // Every pack's new version, so a dependency on a pack adapted in this run asks for the new one.
  const versions = new Map(groups.flatMap(group => group.packs.map(pack => [pack.uuid, bumped(manifestOf(pack.files).header.version)])));
  groups.forEach(group => group.packs.forEach(pack => {
    pack.report = adaptPack(pack.files, target, engine, versions);
  }));

  const written = writeOutput(groups, path.basename(folder));
  groups.forEach(group => group.packs.forEach(pack => {
    console.log(pack.report.name);
    pack.report.changes.forEach(change => console.log("  " + change));
  }));
  console.log("wrote " + written.join(", "));
}

main();
