"use strict";
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const adapter = require("../../tools/adapter/adapt.js");
const { runtime } = require("./runtime.js");
const root = path.resolve(__dirname, "../..");
let P, table, vanilla;
before(() => {
  vanilla = adapter.vanillaPack(adapter.loadBaseline());
  table = adapter.vanillaEntityTable(vanilla);
  P = runtime(file => fs.readFileSync(path.join(root, "src/RP", file))).P;
  for (const key of Object.keys(P.entityData)) Object.assign(P.entityData[key], table[key]);
});
const plain = x => JSON.parse(JSON.stringify(x));
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-7, message || `${a} != ${b}`);
const entity = type => new P.ClientEntity(new P.PonderWorld({ x: 16, y: 16, z: 16 }), type, 0, 0, 0);
const camera = (yaw = 145, pitch = -35) => P.Mat.scale(P.Mat.rotY(P.Mat.rotX(P.Mat.id(), pitch), yaw), 80, -80, 80);
function capture(e, m = camera()) {
  const out = [];
  e.render(m, .5, 80).sort((a, b) => a.depth - b.depth).forEach(item => item.draw({
    texturedQuadMap(src, o, u, v, a, b, c, clip) { out.push({ src, o, u, v, a, b, c, clip }); },
  }));
  return out;
}
function pose(e, id) {
  e.animator.begin(.5);
  const g = P.entityGeometry(id), p = new Map(g.bones.map(b => [b.name, { bind: b.bind, rest: b.rest, rot: b.bind.slice(), pos: [0, 0, 0], scale: [1, 1, 1] }]));
  e.animator.animate(p);
  return p;
}
function spans(b) {
  const corners = b.faces.flatMap(f => [f.o, f.u, f.v]);
  return [0, 1, 2].map(k => Math.max(...corners.map(p => p[k])) - Math.min(...corners.map(p => p[k])));
}

test("current adult cat bind pose lies horizontally without rotating its child legs", () => {
  const raw = table.geometries["geometry.cat"], prepared = P.entityGeometry("geometry.cat");
  for (const name of ["body", "tail1", "tail2"]) assert.deepEqual(raw.bones.find(b => b.name === name).bind_pose_rotation, [90, 0, 0]);
  const body = prepared.bones.find(b => b.name === "body");
  spans(body).forEach((n, k) => close(n, [4, 6, 16][k]));
  assert.deepEqual(plain(body.bind), [0, 0, 0], "rest orientation belongs to cubes, not the animated parent bone");
  for (const name of ["frontlegl", "frontlegr", "backlegl", "backlegr"]) {
    const b = prepared.bones.find(b => b.name === name);
    close(spans(b)[1], name.startsWith("front") ? 10 : 6);
  }
  assert.ok(table.geometries["geometry.cat.baby"].bones.every(b => !b.bind_pose_rotation), "baby uses its own horizontal geometry");
});

test("cat native controller defaults to walking and follows explicit state/queries for adult and baby", () => {
  for (const baby of [false, true]) {
    const e = entity("minecraft:cat"); e.baby = baby;
    const id = baby ? "geometry.cat.baby" : "geometry.cat";
    let p = pose(e, id);
    assert.equal(e.animator.controllers.get("/move").state, "walking");
    assert.deepEqual(plain(p.get("body").pos), [0, 0, 0]);
    e.setQuery("is_sitting", 1); e.tickCount++;
    p = pose(e, id);
    assert.equal(e.animator.controllers.get("/move").state, "sitting");
    if (!baby) close(p.get("body").rot[0], -45);
    e.setQuery("is_sitting", 0); e.walkSpeed = e.walkSpeedO = .7; e.walkPosition = 1; e.tickCount++;
    p = pose(e, id);
    assert.equal(e.animator.controllers.get("/move").state, "walking");
    assert.ok(Math.abs(p.get("frontlegl").rot[0]) > 1, "walk animation still moves the legs");
    e.setVariable("variable.state", 0); e.tickCount++;
    pose(e, id);
    assert.equal(e.animator.controllers.get("/move").state, "sneaking", "explicit variable overrides native defaults");
  }
});

test("cat pose recovery leaves changed geometry and authored bind poses intact", () => {
  const layers = vanilla.layers.slice(), top = new Map(), source = JSON.parse(JSON.stringify(table.geometries["geometry.cat"]));
  for (const b of source.bones) delete b.bind_pose_rotation;
  source.bones.find(b => b.name === "body").cubes[0].size[1] = 12;
  source.bones.find(b => b.name === "tail1").rotation = [30, 0, 0];
  source.bones.find(b => b.name === "tail2").bind_pose_rotation = [15, 0, 0];
  top.set("models/entity/cat.geo.json", Buffer.from(JSON.stringify({ format_version: "1.21.0", "minecraft:geometry": [{
    description: { identifier: "geometry.cat", texture_width: 64, texture_height: 32 }, bones: source.bones,
  }] })));
  const changed = adapter.vanillaEntityTable(Object.assign({}, vanilla, { layers: layers.concat(top) })).geometries["geometry.cat"];
  assert.equal(changed.bones.find(b => b.name === "body").bind_pose_rotation, undefined);
  assert.deepEqual(changed.bones.find(b => b.name === "tail1").rotation, [30, 0, 0]);
  assert.deepEqual(changed.bones.find(b => b.name === "tail2").bind_pose_rotation, [15, 0, 0]);
});

// Independent ray sampling of projected polygons. A per-sample maximum depth supplies the
// reference; no production clipping, culling or sorting helpers are used in this check.
function hit(f, x, y) {
  const ux = f.u[0] - f.o[0], uy = f.u[1] - f.o[1], vx = f.v[0] - f.o[0], vy = f.v[1] - f.o[1], det = ux * vy - uy * vx;
  if (Math.abs(det) < 1e-8) return null;
  const s = ((x - f.o[0]) * vy - (y - f.o[1]) * vx) / det, t = ((y - f.o[1]) * ux - (x - f.o[0]) * uy) / det;
  if (s < 1e-6 || s > 1-1e-6 || t < 1e-6 || t > 1-1e-6) return null;
  const uv = [0, 1].map(k => f.a[k] + s * (f.b[k] - f.a[k]) + t * (f.c[k] - f.a[k]));
  let positive = false, negative = false;
  f.clip.forEach((p, i) => {
    const q = f.clip[(i + 1) % f.clip.length], cross = (q[0] - p[0]) * (uv[1] - p[1]) - (q[1] - p[1]) * (uv[0] - p[0]);
    if (cross > 1e-9) positive = true;
    if (cross < -1e-9) negative = true;
  });
  return positive && negative ? null : f.o[2] + s * (f.u[2] - f.o[2]) + t * (f.v[2] - f.o[2]);
}
function compare(reference, actual) {
  let beforeWrong = 0, afterWrong = 0, covered = 0;
  for (let y = -125.37; y < 40; y += 1.5) for (let x = -100.19; x < 100; x += 1.5) {
    const expected = reference.map(f => hit(f, x, y)).filter(z => z !== null), shown = actual.map(f => hit(f, x, y)).filter(z => z !== null);
    assert.equal(shown.length > 0, expected.length > 0, `silhouette at ${x},${y}`);
    if (!expected.length) continue;
    covered++;
    const z = Math.max(...expected);
    close(Math.max(...shown), z, "trimming must preserve the closest surface");
    if (Math.abs(expected[expected.length - 1] - z) > .01) beforeWrong++;
    if (Math.abs(shown[shown.length - 1] - z) > .01) afterWrong++;
  }
  assert.ok(covered > 100);
  return { beforeWrong, afterWrong, covered };
}

test("sheep leg/body trimming preserves every visible surface and removes buried faces in four views", () => {
  const e = entity("minecraft:sheep"), material = P.entityData.materials.sheep;
  for (const yaw of [0, 90, 180, 270]) {
    e.yRot = e.yRotO = yaw;
    material.mode = "cutout"; const reference = capture(e);
    material.mode = "opaque"; const actual = capture(e);
    const stats = compare(reference, actual);
    assert.ok(stats.beforeWrong > 20, "reference reproduces the visible overlap error");
    assert.ok(stats.afterWrong < stats.beforeWrong * .2, JSON.stringify({ yaw, ...stats }));
    assert.ok(actual.length < reference.length, "stationary sheep uses fewer draw calls");
  }
});

test("sheep pose cache survives camera movement and refreshes during walking", () => {
  const e = entity("minecraft:sheep"), material = P.entityData.materials.sheep, invert = P.Mat.invert;
  let inversions = 0; P.Mat.invert = m => { inversions++; return invert(m); };
  try {
    capture(e); assert.ok(inversions > 0);
    inversions = 0; capture(e, camera(205)); assert.equal(inversions, 0, "camera changes reuse model-space surfaces");
    e.walkSpeed = e.walkSpeedO = .8; e.walkPosition = 1; e.tickCount++;
    capture(e); assert.ok(inversions > 0, "animated bones invalidate the pose cache");
    for (const phase of [0, 1, 3, 5]) {
      e.walkPosition = phase; e.tickCount++;
      material.mode = "cutout"; const reference = capture(e);
      material.mode = "opaque"; const actual = capture(e);
      compare(reference, actual);
    }
  } finally { P.Mat.invert = invert; material.mode = "opaque"; }
});

function fixture(mode, open = false, flat = false) {
  const id = `test:${mode}_${open}_${flat}`;
  P.entityData.geometries[id] = { width: 16, height: 16, bones: [
    { name: "body", cubes: [{ origin: [-4, 4, -4], size: [8, 8, 8], uv: [0, 0] }] },
    { name: "inside", cubes: [{ origin: [-1, 5, -1], size: [2, flat ? 0 : 2, 2], uv: open ? { north: { uv: [0, 0], uv_size: [2, 2] } } : [0, 0] }] },
  ] };
  P.entityData.materials[id] = { mode, alpha: mode };
  P.entityData.textures[id] = { file: "textures/test.png", w: 16, h: 16 };
  P.entityData.renders[id] = { geometry: "Geometry.default", textures: ["Texture.default"], materials: [{ "*": "Material.default" }], part_visibility: [{ body: "!query.hide_body" }] };
  P.entityData.entities[id] = { geometry: { default: id }, materials: { default: id }, textures: { default: id }, scripts: {}, animations: {}, animation_controllers: [], render_controllers: [id], properties: {} };
  return entity(id);
}

test("hidden opaque bones cannot erase visible parts, and visibility changes invalidate the cache", () => {
  const e = fixture("opaque");
  assert.equal(capture(e).length, 3, "only the outer cube is visible");
  e.setQuery("hide_body", 1); e.tickCount++;
  assert.equal(capture(e).length, 3, "inner cube reappears when the outer bone is hidden");
  e.setQuery("hide_body", 0); e.tickCount++;
  assert.equal(capture(e).length, 3);
});

test("cutout/blended, open and flat geometry retain their two-sided surfaces", () => {
  assert.equal(capture(fixture("cutout")).length, 12);
  assert.equal(capture(fixture("blend")).length, 12);
  assert.equal(capture(fixture("opaque", true)).length, 4, "open interior face stays two-sided and untrimmed");
  // Give the flat cube explicit UVs: its two flat surfaces are valid even with zero height.
  const e = fixture("opaque", false, true), g = P.entityData.geometries[e.type];
  g.bones[1].cubes[0].uv = { up: { uv: [0, 0], uv_size: [2, 2] }, down: { uv: [0, 0], uv_size: [2, 2] } };
  assert.equal(capture(e).length, 5);
});
