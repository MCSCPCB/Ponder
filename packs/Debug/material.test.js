"use strict";
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const adapter = require("../../tools/adapter/adapt.js");
const { decodePng, decodeTga, encodePng, entityTextureImages } = require("../../tools/adapter/entity_textures.js");
const { runtime } = require("./runtime.js");
const root = path.resolve(__dirname, "../..");
let table, images, read, P;
const decode = (entry, bytes) => entry.file.endsWith(".tga") ? decodeTga(bytes, entry.file) : decodePng(bytes, entry.file);
before(() => {
  const vanilla = adapter.vanillaPack(adapter.loadBaseline());
  table = adapter.vanillaEntityTable(vanilla);
  read = entry => fs.readFileSync(path.join(vanilla.file, "resource_pack", entry.file));
  images = entityTextureImages(table, read);
  P = runtime(file => fs.readFileSync(path.join(root, "src/RP", file))).P;
  for (const key of Object.keys(P.entityData)) Object.assign(P.entityData[key], table[key]);
});

function faces(type) {
  const world = new P.PonderWorld({ x: 16, y: 16, z: 16 });
  const entity = new P.ClientEntity(world, type, 0, 1, 0), out = [];
  const matrix = P.Mat.rotY(P.Mat.rotX(P.Mat.scale(P.Mat.id(), 30, -30, 30), -35), 145);
  entity.render(matrix, 0.5, 30).forEach(item => item.draw({
    texturedQuadMap(src, o, u, v, a, b, c, clip, filter) {
      const m = /^coh-color-matrix\((.*)\)$/.exec(filter)[1].split(",").map(Number);
      assert.equal(m.length, 20);
      out.push({ src, m });
    },
  }));
  return out;
}

test("current material inheritance distinguishes opacity from alpha masks and blended slime", () => {
  assert.deepEqual(table.materials.sheep, { mode: "opaque", alpha: "opaque" });
  assert.deepEqual(table.materials.magma_cube, { mode: "cutout", alpha: "emissive_cutout" });
  assert.deepEqual(table.materials.cat, { mode: "cutout", alpha: "mask_cutout" });
  assert.deepEqual(table.materials.vex, { mode: "cutout", alpha: "cutout" });
  assert.deepEqual(table.materials.slime_outer, { mode: "blend", alpha: "blend" });
  assert.deepEqual(table.materials["entity_static.skinning_alphatest"], { mode: "cutout", alpha: "cutout" });
});

test("add-on materials inherit the current game's alpha rules and apply removals and variants", () => {
  const files = new Map(Object.entries({
    "entity/test.json": { "minecraft:client_entity": { description: { identifier: "test:skin", materials: { default: "custom.opaque" }, textures: { default: "textures/entity/slime/slime" } } } },
    "materials/test.material": { materials: { version: "1.0.0", "custom:slime_outer": {
      "-states": ["Blending"], "+defines": ["ALPHA_TEST"], variants: [{ opaque: { "-defines": ["ALPHA_TEST"] } }],
    } } },
  }).map(([name, data]) => [name, Buffer.from(JSON.stringify(data))]));
  const addon = adapter.addonEntityTable([{ files, uuid: "test-pack" }], [], table);
  assert.deepEqual(addon.materials.custom, { mode: "cutout", alpha: "cutout" });
  assert.deepEqual(addon.materials["custom.opaque"], { mode: "opaque", alpha: "opaque" });
  const generated = entityTextureImages(addon, read, table);
  assert.ok(addon.textures["textures/entity/slime/slime"].images.opaque);
  assert.equal(generated.size, 1);
  assert.ok(!table.textures["textures/entity/slime/slime"].images.opaque);
});

test("sheep and magma retain raw RGB while their mask alpha becomes visible opacity", () => {
  for (const [id, mode] of [["sheep/sheep", "opaque"], ["slime/magmacube_v2", "emissive_cutout"]]) {
    const entry = table.textures["textures/entity/" + id];
    const input = decode(entry, read(entry)), url = entry.images[mode];
    const output = decodePng(images.get(url.slice(1)), url);
    assert.equal(output.width, input.width); assert.equal(output.height, input.height);
    let masked = 0;
    for (let i = 0; i < input.pixels.length; i += 4) {
      assert.deepEqual(output.pixels.subarray(i, i + 3), input.pixels.subarray(i, i + 3), "no brightness or hue baking");
      if (input.pixels[i + 3] > 0 && input.pixels[i + 3] < 255) {
        masked++;
        assert.equal(output.pixels[i + 3], 255, "alpha used as material data must not make the body transparent");
      }
      if (mode === "opaque") assert.equal(output.pixels[i + 3], 255);
      else if (input.pixels.subarray(i, i + 4).every(v => v === 0)) assert.equal(output.pixels[i + 3], 0);
    }
    assert.ok(masked > 0, id + " has real mask pixels in the current baseline");
  }
});

test("unchanged cat/fang skins reuse native resources and slime outer retains the original alpha", () => {
  for (const [id, mode] of [["cat/white", "mask_cutout"], ["illager/fangs", "cutout"]]) {
    const entry = table.textures["textures/entity/" + id];
    assert.ok(!entry.images || !entry.images[mode], id + " must not gain an unnecessary image");
  }
  const slime = table.textures["textures/entity/slime/slime"];
  assert.ok(slime.images.cutout);
  assert.ok(!slime.images.blend);
  const draws = faces("minecraft:slime");
  assert.ok(draws.some(f => f.src === slime.images.cutout), "inner model selects its cutout texture");
  assert.ok(draws.some(f => f.src.startsWith("pack://textures/entity/slime/slime.png")), "outer shell keeps the native translucent texture");
});

test("rendered entity filters keep alpha normalized and preserve shaded pixel colour", () => {
  for (const id of ["slime", "magma_cube", "sheep", "cat", "vex", "evocation_fang"]) {
    const draws = faces("minecraft:" + id);
    assert.ok(draws.length > 0, id);
    for (const { m } of draws) {
      // Evaluate an opaque sample through the emitted matrix and premultiplied output.
      // The old alpha=255 brightens this sample even though RGB shading is <=1.
      const sample = [0.25, 0.4, 0.6, 1];
      const filtered = [0, 1, 2, 3].map(row => m[row * 5 + 4]
        + sample.reduce((sum, channel, i) => sum + channel * m[row * 5 + i], 0));
      assert.equal(filtered[3], 1, id + " opaque texel stays at alpha 1");
      for (let c = 0; c < 3; c++) {
        const premultiplied = filtered[c] * filtered[3];
        assert.ok(premultiplied <= sample[c] + 1e-9, id + " must not amplify shaded RGB");
      }
      assert.equal(m[19], 0, "fully transparent pixels stay transparent");
    }
  }
});

test("blend controller opacity is bounded and does not select an opaque texture", () => {
  const key = "controller.render.slime_armor", controller = P.entityData.renders[key];
  try {
    for (const [value, expected] of [[0.25, 0.25], [-2, 0], [3, 1]]) {
      P.entityData.renders[key] = Object.assign({}, controller, { color: { r: 1, g: 1, b: 1, a: value } });
      const outer = faces("minecraft:slime").filter(f => f.src.startsWith("pack://"));
      assert.ok(outer.length > 0);
      outer.forEach(f => assert.equal(f.m[18], expected));
    }
  } finally { P.entityData.renders[key] = controller; }
});

test("prepared skin images deduplicate, preserve colour and can be generated for an add-on using a vanilla skin", () => {
  const image = { width: 2, height: 1, pixels: Buffer.from([40, 80, 120, 3, 100, 60, 20, 0]) };
  const png = encodePng(image), bytes = Buffer.from(png);
  const entry = { file: "textures/test.png", w: 2, h: 1 };
  const base = { textures: { borrowed: entry }, materials: { body: { mode: "opaque", alpha: "opaque" } } };
  const addon = { entities: { a: { materials: { default: "body" }, textures: { default: "borrowed", second: "own" } } },
    textures: { own: Object.assign({}, entry) }, materials: {} };
  const generated = entityTextureImages(addon, () => bytes, base);
  assert.equal(generated.size, 1);
  assert.ok(!base.textures.borrowed.images, "borrowing does not mutate the main table");
  assert.equal(addon.textures.borrowed.images.opaque, addon.textures.own.images.opaque);
  assert.deepEqual(decodePng([...generated.values()][0], "prepared").pixels, Buffer.from([40, 80, 120, 255, 100, 60, 20, 255]));
  assert.deepEqual(bytes, png, "source texture remains byte-for-byte unchanged");
});

test("PNG palettes and TGA RLE origins preserve hidden RGB and fractional alpha", () => {
  const zlib = require("node:zlib");
  const chunk = (name, data) => { const b = Buffer.alloc(data.length + 12); b.writeUInt32BE(data.length); b.write(name, 4); data.copy(b, 8); b.writeUInt32BE(zlib.crc32(b.subarray(4, -4)), b.length - 4); return b; };
  const header = Buffer.alloc(13); header.writeUInt32BE(2); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 3;
  const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("PLTE", Buffer.from([20, 40, 60, 90, 80, 70])),
    chunk("tRNS", Buffer.from([0, 3])), chunk("IDAT", zlib.deflateSync(Buffer.from([0, 0, 1]))), chunk("IEND", Buffer.alloc(0))]);
  assert.deepEqual(decodePng(png, "palette").pixels, Buffer.from([20, 40, 60, 0, 90, 80, 70, 3]));
  for (const flags of [0, 16, 32, 48]) {
    const tga = Buffer.alloc(18); tga[2] = 10; tga.writeUInt16LE(2, 12); tga.writeUInt16LE(2, 14); tga[16] = 32; tga[17] = flags | 8;
    const raw = Buffer.from([1, 60, 40, 20, 0, 70, 80, 90, 3, 0x81, 120, 100, 80, 255]);
    const decoded = decodeTga(Buffer.concat([tga, raw]), "rle");
    const first = ((flags & 32 ? 0 : 1) * 2 + (flags & 16 ? 1 : 0)) * 4;
    assert.deepEqual(decoded.pixels.subarray(first, first + 4), Buffer.from([20, 40, 60, 0]));
    assert.equal(decoded.pixels.filter((v, i) => i % 4 === 3 && v === 255).length, 2);
  }
  assert.throws(() => decodePng(png.subarray(0, 20), "short"), /header/);
  assert.throws(() => decodeTga(Buffer.alloc(10), "short"), /header/);
});
