"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { runtime } = require("./runtime.js");
const root = path.resolve(__dirname, "../..");
function host() {
  const bindings = [];
  const ui = runtime(name => fs.readFileSync(path.join(root, "src/RP", name)), {
    onImageSource(image, src) { bindings.push({ image, src }); },
  });
  const container = ui.document.createElement("div");
  return { d: new ui.P.DrawList(container), P: ui.P, container, bindings };
}
const icon = "geo-item://slime_ball?width=96&height=96";
const texture = "pack://textures/entity/slime/slime.png?filtering=point";
const sprite = (d, src) => d.sprite(src, 0, 0, 16, 16, 16, 16, 0, 0, 16, 16, 1);
const visible = container => container.children.filter(e => !e.style.cssText.includes("display:none"))
  .sort((a, b) => Number(/z-index:(\d+)/.exec(a.style.cssText)[1]) - Number(/z-index:(\d+)/.exec(b.style.cssText)[1]));

test("entity insertion and depth changes preserve the native item image and its URL binding", () => {
  const { d, container, bindings } = host();
  d.begin(); sprite(d, icon); d.end();
  const nativeImage = bindings[0].image, parent = nativeImage.parentNode;
  for (let frame = 0; frame < 300; frame++) {
    d.begin();
    if (frame % 2) { sprite(d, icon); sprite(d, texture); }
    else { sprite(d, texture); sprite(d, icon); }
    d.end();
    assert.equal(nativeImage.parentNode, parent);
    assert.equal(parent.parentNode, container);
    assert.deepEqual(visible(container).map(e => e.firstChild.src), frame % 2 ? [icon, texture] : [texture, icon]);
  }
  assert.equal(bindings.filter(b => b.src === icon).length, 1, "native geo-item texture is never rebound");
  assert.equal(bindings.length, 2);
});

test("hiding, text insertion and reappearance retain images and preserve mixed draw order", () => {
  const { d, container, bindings } = host();
  d.begin(); sprite(d, icon); sprite(d, texture); d.end();
  d.begin(); d.text("caption", 0, 0, [255, 255, 255, 255]); d.end();
  assert.deepEqual(visible(container).map(e => e.textContent), ["caption"]);
  d.begin(); sprite(d, texture); d.text("caption", 0, 0, [255, 255, 255, 255]); sprite(d, icon); d.end();
  assert.deepEqual(visible(container).map(e => e.firstChild ? e.firstChild.src : e.textContent), [texture, "caption", icon]);
  assert.equal(bindings.length, 2);
});

test("faces sharing a texture retain enough distinct nodes and stop allocating at peak occupancy", () => {
  const { d, container, bindings } = host();
  for (let frame = 0; frame < 300; frame++) {
    const count = 1 + frame % 40;
    d.begin();
    for (let i = 0; i < count; i++) d.texturedQuadMap(texture, [i, 0], [i + 8, 0], [i, 8],
      [0, 0], [0.5, 0], [0, 0.5], [[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]], null, 32);
    d.end();
    assert.equal(visible(container).length, count);
    assert.equal(new Set(visible(container).map(e => e.firstChild)).size, count);
  }
  assert.equal(bindings.length, 40);
  assert.equal(container.children.length, 40);
});

const cssNumber = (css, name) => Number(new RegExp("(?:^|;)" + name + ":(-?[\\d.]+)px").exec(css)[1]);
const cssMatrix = css => /transform:matrix\(([^)]+)\)/.exec(css)[1].split(",").map(Number);
function screenPoint(n, uv, size) {
  // Resolve the emitted CSS independently of the renderer's UV-to-screen calculation.
  const local = uv.map((p, i) => p * size + cssNumber(n.imgCss, i ? "top" : "left"));
  const m = cssMatrix(n.clipCss);
  return [m[0] * local[0] + m[2] * local[1] + m[4] + cssNumber(n.css, "left"),
    m[1] * local[0] + m[3] * local[1] + m[5] + cssNumber(n.css, "top")];
}
function closePoint(actual, expected) {
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 0.03, `${actual} != ${expected}`));
}
const colorFilter = "coh-color-matrix(0.8,0,0,0,0,0,0.6,0,0,0,0,0,0.4,0,0,0,0,0,255,0)";

test("cropped faces preserve normal, flipped and rotated UV anchors at different GUI scales", () => {
  const { d, P } = host();
  const positions = [[-20.125, 30.25], [23.625, 43.75], [-5.5, 62.125]];
  const anchors = [
    [[0.25, 0.125], [0.75, 0.125], [0.25, 0.5]],
    [[0.75, 0.125], [0.25, 0.125], [0.75, 0.5]],
    [[0.25, 0.5], [0.25, 0.125], [0.75, 0.5]],
  ];
  for (const scale of [1, 1.5, 3]) for (const uv of anchors) {
    P.view.cssPerGui = scale;
    const fourth = [uv[1][0] + uv[2][0] - uv[0][0], uv[1][1] + uv[2][1] - uv[0][1]];
    d.begin();
    d.texturedQuadMap(texture, ...positions, ...uv, [uv[0], uv[1], fourth, uv[2]], colorFilter, 64);
    d.end();
    const n = d.nodes[0];
    uv.forEach((p, i) => closePoint(screenPoint(n, p, 64), positions[i].map(v => v * scale)));
    closePoint(screenPoint(n, fourth, 64), positions[0].map((v, i) => (positions[1][i] + positions[2][i] - v) * scale));
  }
  assert.equal(d.imageBindings, 1, "crop and scale changes keep the original texture binding");
});

test("filter surfaces bound the projected face even when it uses a tiny region of the atlas", () => {
  const { d, P } = host();
  P.view.cssPerGui = 2;
  const positions = [[10, 20], [30, 25], [5, 35]];
  for (const fraction of [0.5, 1 / 128]) {
    const a = [0.25, 0.25], b = [0.25 + fraction, 0.25], c = [0.25, 0.25 + fraction];
    d.begin();
    d.texturedQuadMap(texture, ...positions, a, b, c, [a, b, [b[0], c[1]], c], colorFilter, 64);
    d.end();
    const n = d.nodes[0];
    assert.equal(cssNumber(n.css, "width"), 52, "25 GUI px plus two CSS px padding");
    assert.equal(cssNumber(n.css, "height"), 42);
    assert.equal(d.faceFilterPixels, 52 * 42);
    assert.equal(d.mappedFaces, 1);
    assert.ok(n.css.includes("filter:" + colorFilter));
    assert.doesNotMatch(n.imgCss + n.clipCss, /(?:^|;)filter:/, "clip precedes filtering");
    assert.doesNotMatch(n.css, /transform:/, "filter is evaluated in screen space");
    assert.match(n.css, /overflow:hidden/);
    assert.match(n.clipCss, /overflow:hidden/);
    assert.doesNotMatch(n.clipCss, /clip-path:/, "rectangular UVs need no polygon mask");
    assert.equal(n.img.parentNode, n.clip);
    assert.equal(n.clip.parentNode, n.el);
  }
});

test("nonrectangular UVs use a local stencil polygon and reset clipping and filters when reused", () => {
  const { d } = host();
  const a = [0.25, 0.125], b = [0.75, 0.25], c = [0.375, 0.5];
  d.begin();
  d.texturedQuadMap(texture, [0, 0], [20, 0], [0, 10], a, b, c, [a, b, c], colorFilter, 64);
  d.end();
  const n = d.nodes[0];
  assert.match(n.clipCss, /shape-rendering:optimizeSpeed/);
  assert.ok(n.clipCss.includes("clip-path:polygon(0.000px 0.000px,32.000px 8.000px,8.000px 24.000px)"));
  [a, b, c].forEach((p, i) => closePoint(screenPoint(n, p, 64), [[0, 0], [20, 0], [0, 10]][i]));
  d.begin();
  d.texturedQuadMap(texture, [0, 0], [20, 0], [0, 10], [0, 0], [1, 0], [0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]], null, 16);
  d.end();
  assert.doesNotMatch(n.clipCss, /clip-path:/);
  assert.doesNotMatch(n.css + n.imgCss + n.clipCss, /(?:^|;)filter:/);
  assert.equal(d.faceFilterPixels, 0);
  assert.equal(d.imageBindings, 1);
});

test("mapped faces and sprites of the same image keep separate stable node hierarchies", () => {
  const { d, bindings, container } = host();
  const face = () => d.texturedQuadMap(texture, [0, 0], [8, 0], [0, 8], [0, 0], [1, 0], [0, 1],
    [[0, 0], [1, 0], [1, 1], [0, 1]], colorFilter, 32);
  d.begin(); face(); sprite(d, texture); d.end();
  const parents = bindings.map(b => b.image.parentNode);
  d.begin(); d.end();
  assert.equal(visible(container).length, 0);
  assert.equal(d.faceFilterPixels, 0);
  d.begin(); sprite(d, texture); face(); d.end();
  assert.equal(bindings.length, 2);
  bindings.forEach((b, i) => assert.equal(b.image.parentNode, parents[i]));
  assert.deepEqual(visible(container), [d.nodes[1].el, d.nodes[0].el]);
});

test("invalid or degenerate mappings allocate no nodes and emit no invalid CSS", () => {
  const { d } = host();
  const draw = (o, a, b, c, clip) => d.texturedQuadMap(texture, o, [10, 0], [0, 10], a, b, c, clip, colorFilter, 64);
  const rect = [[0, 0], [1, 0], [1, 1], [0, 1]];
  d.begin();
  draw([0, 0], [0, 0], [1, 0], [2, 0], rect);
  draw([0, 0], [0, 0], [1e-8, 0], [0, 1e-8], rect);
  draw([Infinity, 0], [0, 0], [1, 0], [0, 1], rect);
  draw([0, 0], [0, 0], [NaN, 0], [0, 1], rect);
  draw([0, 0], [0, 0], [1, 0], [0, 1], [[0, 0], [1, Infinity], [0, 1]]);
  draw([0, 0], [0, 0], [1, 0], [0, 1], [[0, 0], [1, 0]]);
  draw([0, 0], [0, 0], [1, 0], [0, 1], [[0, 0], [0, 0.5], [0, 1]]);
  d.end();
  assert.equal(d.used, 0);
  assert.equal(d.nodes.length, 0);
  assert.equal(d.imageBindings, 0);
});
