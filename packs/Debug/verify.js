"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert/strict");
const { runtime, behavior } = require("./runtime.js");
const root = path.resolve(__dirname, "../..");
const a = require(path.join(root, "tools/adapter/adapt.js"));
const out = path.join(root, "tools/output", a.loadBaseline().version);
const archives = ["Ponder Debug.mcaddon"];
assert.deepEqual(fs.readdirSync(out).filter(name => /\.mc(?:addon|pack)$/.test(name)).sort(), archives, "deliver one bundled archive");
const packs = a.packsOf(a.readInput(path.join(out, archives[0])));
assert.equal(packs.length, 6, "one archive contains main, Debug and Farmer's Delight behavior/resource packs");
const main = packs.find(p => p.has("hbui/gameplay.html"));
assert.ok(main.get("hbui/ponder/lib/draw.js").equals(fs.readFileSync(path.join(root, "src/RP/hbui/ponder/lib/draw.js"))), "archive contains current drawing code");
assert.ok(main.get("hbui/ponder/entities/entity_models.js").equals(fs.readFileSync(path.join(root, "src/RP/hbui/ponder/entities/entity_models.js"))), "archive contains current entity material code");
assert.ok(main.get("hbui/ponder/entities/entity_animation.js").equals(fs.readFileSync(path.join(root, "src/RP/hbui/ponder/entities/entity_animation.js"))), "archive contains current native cat controller defaults");
const nativeEntities = JSON.parse(main.get("hbui/ponder/entities/vanilla_entities.json"));
for (const name of ["body", "tail1", "tail2"]) assert.deepEqual(nativeEntities.geometries["geometry.cat"].bones.find(b => b.name === name).bind_pose_rotation, [90, 0, 0]);
const uiPacks = packs.filter(p => a.isResourcePack({ files: p }) && [...p.keys()].some(file => file.startsWith("hbui/")));
for (const p of uiPacks) assert.ok(p.has("content.zipe"), a.manifestOf(p).header.name + ": missing content.zipe; Ore UI cannot read hbui files");
let preparedTextureReferences = 0;
const preparedTextures = new Set();
for (const p of uiPacks) for (const [file, bytes] of p) if (/(?:vanilla|ponder)_entities\.json$/.test(file)) {
  const table = JSON.parse(bytes);
  for (const entry of Object.values(table.textures)) for (const url of Object.values(entry.images || {})) {
    assert.ok(uiPacks.some(pack => pack.has(url.slice(1))), "prepared entity texture included: " + url);
    preparedTextureReferences++; preparedTextures.add(url);
  }
}
const versions = new Map(packs.map(p => { const h = a.manifestOf(p).header; return [h.uuid, h.version]; }));
assert.equal(versions.size, packs.length, "each bundled pack keeps a unique UUID");
for (const p of packs) for (const d of a.manifestOf(p).dependencies || []) if (d.uuid) {
  assert.ok(versions.has(d.uuid), "dependency included: " + d.uuid);
  assert.deepEqual(d.version, versions.get(d.uuid));
}
const debug = packs.find(p => a.manifestOf(p).header.name === "Ponder Debug Behavior");
const debugManifest = a.manifestOf(debug);
assert.equal(debugManifest.dependencies.filter(d => d.uuid).length, 3, "Debug declares its resource pack, main pack and crop dependency");
assert.match(main.get("hbui/ponder/bridge/bridge.js").toString(), /ponder:query-id\/number/);
assert.ok(main.get("hbui/ponder/entities/entity_models.js").toString().includes('this.lifeSpan = type === "minecraft:evocation_fang" ? 22 : 0'));
// Ore UI only mounts hbui files from packs with content.zipe, even if the file exists on disk.
const imageSources = new Map();
const ui = runtime(file => { const p = uiPacks.find(p => p.has("content.zipe") && p.has(file)); return p && p.get(file); }, {
  onImageSource(image, src) {
    assert.ok(!imageSources.has(image), "live image must keep its texture binding: " + src);
    imageSources.set(image, src);
  },
});
const P = ui.P;
const mainBehavior = packs.find(p => a.manifestOf(p).header.uuid === "eae14a5a-7092-4213-a263-868bca4243e5");
const farmers = packs.find(p => p.has("scripts/ponder.js"));
const server = behavior(mainBehavior.get("scripts/index.js"), [debug.get("scripts/index.js"), farmers.get("scripts/ponder.js")]);
async function verify() {
  // Exercise the real command -> behavior registration -> form query -> dynamic script load.
  // In particular, the title arrives alone, with the label still pending.
  const all = [];
  for (const [i, item] of ["minecraft:slime_ball", "minecraft:beetroot"].entries()) {
    const form = server.open(item);
    ui.screen(i + 1); ui.field("title", form.title); ui.poll(); await ui.settle();
    assert.ok(P.screens.current, "actual form opens " + item + ": " + JSON.stringify(ui.logs));
    assert.equal(P.screens.current.item, item);
    all.push(...P.screens.current.scenes);
  }
  assert.equal(ui.scripts.length, 2, "each add-on plugin loads once through the page");
  assert.ok(ui.logs.some(entry => entry.message.includes("addon registered ponder_batch1")));
  assert.equal(ui.logs.filter(entry => entry.level === 3).length, 0, "no Ore UI errors while opening scenes");
  assert.equal(all.length, 3);
  const summary = [];
  for (const scene of all) {
    // Run the actual animation callback, screen renderer, DrawList and image/CSS writes.
    // The previous verifier stopped at face callbacks and missed native image replacement.
    P.screens.reset();
    const screen = new P.PonderUI(scene.id.endsWith(":crops") ? "minecraft:beetroot" : "minecraft:slime_ball");
    screen.scenes = [scene];
    P.screens.open(screen);
    const seen = new Map();
    let maxDraws = 0, maxMappedFaces = 0, maxFaceFilterPixels = 0;
    for (let tick = 0; tick < 360; tick++) {
      ui.stepFrame();
      maxDraws = Math.max(maxDraws, screen.d.used);
      maxMappedFaces = Math.max(maxMappedFaces, screen.d.mappedFaces);
      maxFaceFilterPixels = Math.max(maxFaceFilterPixels, screen.d.faceFilterPixels);
      for (const node of screen.d.nodes) {
        assert.doesNotMatch(node.css + node.imgCss + node.clipCss, /NaN|Infinity/, "finite rendered CSS");
        for (const match of (node.css + node.imgCss).matchAll(/coh-color-matrix\(([^)]+)\)/g)) {
          const matrix = match[1].split(",").map(Number);
          assert.ok(matrix[18] >= 0 && matrix[18] <= 1, "alpha multiplier cannot brighten RGB");
        }
        if (node.clip) {
          assert.equal(node.img.parentNode, node.clip);
          assert.equal(node.clip.parentNode, node.el);
          assert.match(node.clipCss, /overflow:hidden/);
          assert.doesNotMatch(node.clipCss + node.imgCss, /(?:^|;)filter:/, "mapped faces crop before filtering");
          if (node.clipCss.includes("clip-path:")) assert.match(node.clipCss, /shape-rendering:optimizeSpeed/);
        }
      }
      for (const e of scene.world.entities) {
        seen.set(e.type, (seen.get(e.type) || 0) + 1);
        assert.ok(e.box().flat().every(Number.isFinite));
      }
    }
    const nativeIcons = screen.d.nodes.filter(n => n.src.startsWith("geo-item://"));
    assert.equal(nativeIcons.length, 1, "one persistent native item image per scene screen");
    assert.ok(maxDraws > 0);
    const record = { id: scene.id, types: Object.fromEntries(seen), rendering: {
      frames: 360, maxDraws, pooledNodes: screen.d.nodes.length, imageBindings: screen.d.imageBindings, nativeItemImages: nativeIcons.length,
      maxMappedFaces, maxFaceFilterPixels: Math.round(maxFaceFilterPixels),
    } };
    if (scene.id.endsWith(":defaults")) assert.equal(seen.get("minecraft:evocation_fang"), 4 * 23);
    if (scene.id.endsWith(":defaults")) {
      for (const [id, mode] of [["sheep/sheep", "opaque"], ["slime/magmacube_v2", "emissive_cutout"]]) {
        const url = P.entityData.textures["textures/entity/" + id].images[mode];
        assert.ok(screen.d.nodes.some(n => n.src === url), "rendered prepared material texture: " + id);
      }
      assert.ok(screen.d.nodes.some(n => n.src.startsWith("pack://textures/entity/slime/slime.png")), "slime shell still uses native transparency");
    }
    if (scene.id.endsWith(":collision")) {
      record.stopped = scene.world.entities.map(e => ({ size: e.variant, x: e.x, width: e.halfWidth * 2 }));
      for (const e of scene.world.entities) assert.ok(Math.abs(e.x + e.halfWidth - 6) < 1e-8);
    }
    if (scene.id.endsWith(":crops")) {
      let count = 0;
      for (const block of scene.world.blocks.values()) if (P.blockId(block).startsWith("farmersdelight:")) {
        const model = P.addonBlockModel(block);
        assert.ok(model && model.quads.length, P.blockId(block));
        for (const face of model.quads) assert.ok(face.look.tex.url && !face.look.tex.url.includes("undefined"));
        count++;
      }
      assert.equal(count, 40); record.cropBlocks = count;
    }
    summary.push(record);
  }
  assert.ok(ui.logs.some(entry => entry.message.includes("render submitted") && entry.message.includes("minecraft:slime")), "real frame callback records entity rendering diagnostics");
  const report = { date: new Date().toISOString(), automaticChecks: { adapter: 16, bridge: 12, render: 8, material: 8, entity: 7 }, packagedArchives: archives,
    entityAlpha: { preparedTextureReferences, uniquePreparedTextures: preparedTextures.size, runtimeAlphaRange: [0, 1] },
    packVersions: packs.map(p => { const h = a.manifestOf(p).header; return { name: h.name, version: h.version.join(".") }; }),
    oreUiResourcePacks: uiPacks.map(p => ({ name: a.manifestOf(p).header.name, contentZipe: p.has("content.zipe") })),
    entryPath: "behavior command -> atomic form title -> native queries -> dynamic plugins -> PonderUI -> frame -> DrawList -> DOM/CSS",
    nativeGamefaceRendering: "not emulated; user separately confirmed main 1.0.10 / Debug 1.0.8 on 2026-10-31", scenes: summary,
    gameVisualVerification: { mainVersion: "1.0.10", debugVersion: "1.0.8", status: "passed", confirmedBy: "user", date: "2026-10-31", countedTest: 1 },
    previousBuildUserFeedback: { mainVersion: "1.0.9", debugVersion: "1.0.7", entitiesVisible: true, entityColour: "normal", remaining: "cat upright; hole at sheep rear-right leg/body intersection", crops: "render normally", performance: "no issue reported" },
    testCounting: { used: 1, limit: 6, remaining: 5, note: "User explicitly counted the successful main 1.0.10 / Debug 1.0.8 acceptance as one test; preceding troubleshooting runs remain excluded." } };
  fs.writeFileSync(path.join(root, "_sample/verification/batch1-runtime-log.json"), JSON.stringify({ behavior: server.logs, oreUI: ui.logs }, null, 2) + "\n");
  fs.writeFileSync(path.join(root, "_sample/verification/batch1-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
