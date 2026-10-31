"use strict";
// node --test tools/adapter/adapt.test.js
// Integration checks use the current, verified _sample baseline, never old reference files.
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const adapter = require("./adapt.js");
const ROOT = path.resolve(__dirname, "../..");
let baseline, vanilla, entities, farmers, P;

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const pack = (files, uuid = "test-pack") => ({ uuid, name: uuid, files: new Map(Object.entries(files).map(([name, data]) => [name, Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data))])) });
function inputPacks(dir) {
  return adapter.packsOf(adapter.readInput(path.join(ROOT, dir))).map(files => {
    const m = adapter.manifestOf(files);
    return { files, uuid: m.header.uuid, name: m.header.name };
  });
}
function runtime() {
  const context = vm.createContext({ window: { addEventListener() {} }, console });
  for (const file of ["lib/core.js", "level/ponder_level.js", "foundation/element/elements.js", "foundation/ponder_world_particles.js", "level/ponder_entity.js", "entities/molang.js", "entities/entity_animation.js", "entities/entity_models.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, "src/RP/hbui/ponder", file), "utf8"), context, { filename: file });
  }
  const p = context.window.Ponder;
  for (const key of ["entities", "geometries", "animations", "controllers", "renders", "textures"]) Object.assign(p.entityData[key], entities[key]);
  p.textureOf = entry => ({ url: "pack://" + entry.file });
  p.liquidKind = block => block === "water" ? "water" : block === "lava" ? "lava" : null;
  return p;
}
function world() { return new P.PonderWorld({ x: 16, y: 16, z: 16 }); }
function entity(id, w = world(), x = 0, y = 1, z = 0) { return new P.ClientEntity(w, "minecraft:" + id, x, y, z); }
function draw(e, pt = 0.5) {
  const quads = [];
  const matrix = P.Mat.rotY(P.Mat.rotX(P.Mat.scale(P.Mat.id(), 30, -30, 30), -35), 145);
  e.render(matrix, pt, 30).forEach(item => {
    assert.ok(Number.isFinite(item.depth), e.type + " depth");
    item.draw({ texturedQuadMap(url, o, u, v, ...rest) {
      const numbers = [o, u, v, ...rest.filter(Array.isArray)].flat(Infinity);
      assert.ok(numbers.every(Number.isFinite), e.type + " finite face coordinates");
      quads.push({ url, o, u, v });
    } });
  });
  return quads;
}

before(() => {
  baseline = adapter.loadBaseline();
  vanilla = adapter.vanillaPack(baseline);
  entities = adapter.vanillaEntityTable(vanilla);
  farmers = inputPacks("packs/FarmersDelightV5.0.5-26.0+");
  P = runtime();
});

test("only the verified current release can be selected", () => {
  assert.equal(adapter.loadBaseline(baseline.version).folder, baseline.folder);
  const child = spawnSync(process.execPath, [path.join(__dirname, "adapt.js"), "0.0.0"], { encoding: "utf8" });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /verified current Bedrock baseline/);
});

test("adaptation makes both main and add-on hbui files accessible without changing scripts", () => {
  for (const main of [true, false]) {
    const p = inputPacks("packs/Debug").find(adapter.isResourcePack);
    const script = p.files.get("hbui/ponder_addons/ponder_batch1/plugin.js");
    p.files.delete("content.zipe"); // Reproduce the missing file in the failed installed Debug pack.
    adapter.adaptPack(p.files, { renames: [] }, [1, 26, 60], new Map([[p.uuid, [1, 0, 4]]]), main);
    assert.ok(p.files.has("content.zipe"), "Ore UI requires the marker in each resource pack");
    assert.equal(p.files.get("content.zipe").length, 0);
    assert.deepEqual(p.files.get("hbui/ponder_addons/ponder_batch1/plugin.js"), script);
  }
});

test("adaptation preserves an existing content.zipe and does not add it to unrelated packs", () => {
  const p = inputPacks("packs/Debug").find(adapter.isResourcePack);
  const existing = Buffer.from("existing contents must be preserved");
  p.files.set("content.zipe", existing);
  const adapt = files => adapter.adaptPack(files, { renames: [] }, [1, 26, 60], new Map([[p.uuid, [1, 0, 4]]]), false);
  adapt(p.files);
  assert.deepEqual(p.files.get("content.zipe"), existing);
  p.files.delete("content.zipe");
  for (const name of [...p.files.keys()]) if (name.startsWith("hbui/")) p.files.delete(name);
  adapt(p.files);
  assert.equal(p.files.has("content.zipe"), false);
  const bp = inputPacks("packs/Debug").find(p => !adapter.isResourcePack(p));
  bp.files.set("hbui/not-a-resource-pack.js", Buffer.alloc(0));
  adapter.adaptPack(bp.files, { renames: [] }, [1, 26, 60], new Map([[bp.uuid, [1, 0, 4]]]), false);
  assert.equal(bp.files.has("content.zipe"), false);
});

test("current game layers resolve all missing sample animation definitions", () => {
  assert.ok(vanilla.layers.length > 1);
  assert.equal(vanilla.layers.length, vanilla.behaviorLayers.length);
  for (const id of ["animation.sheep.setup.v2", "animation.sheep.baby_transform", "animation.ghast.scale", "animation.vex.move", "animation.cat.baby_transform", "animation.fox.baby_transform", "animation.warden.hurt", "animation.breeze.idle_ground_sound", "controller.animation.player.hudplayer", "animation.humanoid.fishing_rod"]) {
    assert.ok(entities.all.animations[id] || entities.all.controllers[id], id);
  }
  // References absent from the game itself are already listed separately in TODO.
  assert.deepEqual(entities.missing.slice().sort(), [
    "geometry geometry.boat", "geometry geometry.chest_boat", "animation animation.camel.look_at_target",
    "animation controller.animation.player.base", "animation animation.villager.get_in_bed_baby",
    "texture textures/blocks/trial_spawner_base",
    ...["digSlowdown", "digSpeed", "confusion", "resistance", "blindness", "hunger", "healthBoost", "absorption", "saturation", "levitation"].map(n => "texture textures/items/potion_bottle_lingering_" + n),
  ].sort());
  // The latest client definition supersedes sample references it no longer uses.
  assert.equal(entities.entities["minecraft:sheep"].render_controllers[0], "controller.render.sheep.v2");
  assert.ok(entities.renders["controller.render.iron_golem"]);
});

test("an identifier survives replacement of a file in a newer layer", () => {
  const source = (animations, format = "1.8.0") => pack({
    "animations/example.json": { format_version: format, animations },
    "entity/example.json": { "minecraft:client_entity": { description: { identifier: "test:example", animations: { first: "animation.first", second: "animation.second" } } } },
  });
  const first = source({ "animation.first": { loop: true }, "animation.second": { loop: false } });
  const last = source({ "animation.second": { loop: true } });
  const table = adapter.entityTable([first, last].map(p => ({ files: p.files, texture: () => null })), [], null);
  assert.equal(table.animations["animation.first"].loop, true);
  assert.equal(table.animations["animation.second"].loop, true);
  assert.deepEqual(table.missing, []);
});

test("every vanilla definition has dimensions; shared types use Java's current registry", () => {
  for (const [id, def] of Object.entries(entities.entities)) {
    assert.ok(def.collision && Number.isFinite(def.collision.width) && Number.isFinite(def.collision.height), id);
    const expected = vanilla.javaDimensions[id];
    if (expected) assert.deepEqual(def.collision, expected, id);
  }
  close(entity("cow").halfWidth, 0.45);
  close(entity("cow").height, 1.4);
  close(entity("ghast").halfWidth, 2);
  close(entity("parrot").height, 0.9);
  close(entity("npc").height, 2.1); // Bedrock-only, from its current behavior definition.
});

test("entity movement and liquid queries use the entity's own collision box", () => {
  const w = world();
  for (let y = 0; y < 6; y++) for (let z = -3; z < 4; z++) w.setBlock(4, y, z, "stone");
  const cow = entity("cow", w), ghast = entity("ghast", w);
  cow.move(8, 0, 0); ghast.move(8, 0, 0);
  close(cow.x, 3.55); close(ghast.x, 2);
  const water = world(); water.setBlock(1, 1, 0, "water");
  assert.equal(entity("cow", water).inLiquid("water"), false);
  assert.equal(entity("ghast", water).inLiquid("water"), true);
  cow.halfWidth = 0.1; cow.height = 0.2;
  close(cow.box()[1][0] - cow.x, 0.1); close(cow.box()[1][1] - cow.y, 0.2);
});

test("add-on dimensions come from the behavior definition and preserve zero", () => {
  const resource = pack({ "entity/custom.json": { "minecraft:client_entity": { description: { identifier: "test:custom" } } } });
  const behavior = pack({ "entities/custom.json": { "minecraft:entity": { description: { identifier: "test:custom" }, components: { "minecraft:collision_box": { width: 0, height: 0.8 } } } } });
  const table = adapter.addonEntityTable([resource], [behavior], entities);
  Object.assign(P.entityData.entities, table.entities);
  const e = new P.ClientEntity(world(), "test:custom", 0, 0, 0);
  close(e.halfWidth, 0); close(e.height, 0.8);
});

test("slime and magma cube render immediately; size changes also refresh collision", () => {
  for (const id of ["slime", "magma_cube"]) {
    const e = entity(id);
    assert.equal(e.variant, 1);
    assert.ok(draw(e).length > 0, id);
    assert.ok(e.scaleOf(0.5).every(s => s > 0));
    close(e.halfWidth, 0.26); close(e.height, 0.52);
    for (const size of [2, 4, 1]) {
      e.variant = size; e.tickCount++;
      close(e.height, 0.52 * size); close(e.halfWidth, 0.26 * size);
      assert.ok(draw(e).length > 0);
      close(e.scaleOf(0.5)[0], size);
    }
    e.variant = 0; assert.equal(e.variant, 1);
    e.variant = 200; assert.equal(e.variant, 127);
    e.variant = NaN; assert.equal(e.variant, 1);
  }
  assert.equal(entity("cow").variant, 0);
});

test("fangs appear without setup, finish their animation, and expire after 22 ticks", () => {
  const e = entity("evocation_fang");
  assert.equal(e.animator.query("life_span"), 22);
  assert.equal(draw(e, 0).length, 0);
  for (let t = 0; t < 20; t++) {
    assert.ok(draw(e).length > 0, "fangs at tick " + t);
    e.tick();
    close(e.y, 1);
  }
  close(e.scaleOf(0.5)[0], 0);
  assert.equal(e.alive, true);
  e.tick(); e.tick(); assert.equal(e.alive, true);
  e.tick(); assert.equal(e.alive, false);
  const replay = entity("evocation_fang");
  assert.ok(draw(replay).length > 0);
});

test("a scene can still override a fang's lifespan", () => {
  const e = entity("evocation_fang"); e.setQuery("life_span", 30);
  assert.equal(draw(e).length, 0);
  for (let i = 0; i < 10; i++) e.tick();
  assert.ok(draw(e).length > 0);
  for (let i = 10; i < 30; i++) e.tick();
  assert.equal(e.alive, true); e.tick(); assert.equal(e.alive, false);
});

test("all vanilla entities produce finite faces over multiple animated frames", () => {
  const list = Object.keys(entities.entities).map(id => entity(id.slice(10)));
  let rendered = 0;
  for (const e of list) {
    let faces = 0;
    for (const time of [0, 1, 5, 12, 19]) { e.tickCount = time; faces += draw(e).length; }
    if (faces) rendered++;
  }
  assert.ok(rendered >= 120, rendered + " entity types rendered");
});

test("Farmer's Delight resolves every texture, including all 22 vanilla crop aliases", () => {
  const { index, missing } = adapter.addonBlockIndex(farmers.filter(p => !adapter.isResourcePack(p)), farmers.filter(adapter.isResourcePack), vanilla);
  assert.deepEqual(missing, []);
  const aliases = [
    ...["beetroots", "carrots", "potatoes"].flatMap(crop => [0, 1, 2, 3].map(stage => [crop + "_stage" + stage, crop + "_stage_" + stage])),
    ...[0, 1].map(stage => ["torchflower_crop_stage" + stage, "torchflower_crop_stage_" + stage]),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map(stage => ["wheat_stage" + stage, "wheat_stage_" + stage]),
  ];
  for (const [name, file] of aliases) {
    assert.equal(index.textures[name].file, "textures/blocks/" + file + ".png");
    assert.equal(index.textures[name].pack, undefined);
    assert.ok(index.textures[name].w > 0 && index.textures[name].h > 0);
  }
});

function blockPacks(terrain, images = {}) {
  const bp = pack({ "blocks/test.json": { "minecraft:block": { description: { identifier: "test:block" }, components: { "minecraft:material_instances": { "*": { texture: "alias" } } } } } });
  const rp = pack({ "textures/terrain_texture.json": { texture_data: terrain }, ...images });
  return { bp, rp };
}
const pngHeader = (w, h) => { const b = Buffer.alloc(24); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };

test("an atlas entry can use an image from another add-on pack", () => {
  const { bp, rp } = blockPacks({ alias: { textures: "textures/shared/crop" } });
  const images = pack({ "textures/shared/crop.png": pngHeader(32, 48) }, "image-pack");
  const { index, missing } = adapter.addonBlockIndex([bp], [rp, images], vanilla);
  assert.deepEqual(missing, []);
  assert.deepEqual(index.textures.alias, { pack: "image-pack", file: "textures/shared/crop.png", w: 32, h: 48 });
});

test("an unresolved higher atlas entry does not silently pick a lower same-name entry", () => {
  const { bp, rp } = blockPacks({ alias: { textures: "textures/missing" } });
  const lower = pack({ "textures/terrain_texture.json": { texture_data: { alias: { textures: "textures/blocks/stone" } } } });
  const result = adapter.addonBlockIndex([bp], [rp, lower], vanilla);
  assert.deepEqual(result.missing, ["texture alias"]);
});

test("image overrides, explicit extensions and vanilla flipbooks resolve by path", () => {
  const { bp, rp } = blockPacks({ alias: { textures: "textures/blocks/fire_0.png" } });
  const result = adapter.addonBlockIndex([bp], [rp], vanilla);
  assert.deepEqual(result.missing, []);
  assert.ok(result.index.textures.alias.frames > 1);
  rp.files.set("textures/blocks/fire_0.png", pngHeader(16, 16 * 32));
  const override = adapter.addonBlockIndex([bp], [rp], vanilla);
  assert.equal(override.index.textures.alias.pack, rp.uuid);
  assert.equal(override.index.textures.alias.frames, 32);
});
