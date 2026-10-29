// Beds and banners, which the game draws with a block entity renderer (BedRenderer,
// BannerRenderer, 1.21.1): their model parts in Java's frame and pose, on Bedrock's own entity
// textures (vanilla_blocks.json's blockEntities). A bed's colour and a banner's base, patterns and
// ominous look come from the block's block entity data (P.blockNbt), as Bedrock saves it; a block
// without any looks like a new one (BLANK).
(function () {
  const P = window.Ponder, M = P.Mat;
  const S = 64; // both models' texture size (LayerDefinition.create(mesh, 64, 64))

  // What a new bed's and banner's block entity holds: a red bed, a white banner.
  const BLANK = { bed: { id: "Bed", color: 14 }, standing_banner: { id: "Banner", Base: 15, Patterns: [], Type: 0 } };
  BLANK.wall_banner = BLANK.standing_banner;
  const nameOf = block => P.blockId(block).replace(/^minecraft:/, "");
  // A copy of a block's block entity data: what it holds, else a new one's; null for a block
  // Ponder knows no block entity of.
  P.blockEntityData = block => {
    const nbt = P.blockNbt(block) || BLANK[nameOf(block)];
    return nbt ? JSON.parse(JSON.stringify(nbt)) : null;
  };

  // DyeColor.getTextureDiffuseColor, white to black.
  const DYES = [0xF9FFFE, 0xF9801D, 0xC74EBD, 0x3AB3DA, 0xFED83D, 0x80C71F, 0xF38BAA, 0x474F52,
    0x9D9D97, 0x169C9C, 0x8932B8, 0x3C44AA, 0x835432, 0x5E7C16, 0xB02E26, 0x1D1D21].map(c => [(c >> 16) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]);

  // ModelPart.Cube: the box at (x, y, z) of size (w, h, d) pixels, under matrix m. Its faces'
  // texture rectangles [u0, v0, u1, v1] are `rects`, else a box's laid out from `uv` (texOffs);
  // a face `rects` leaves out is not drawn. Corners and texture corners as Polygon has them.
  const CORNERS = { down: [5, 4, 0, 1], up: [2, 3, 7, 6], west: [0, 4, 7, 3], north: [1, 0, 3, 2], east: [5, 1, 2, 6], south: [4, 5, 6, 7] };
  function cube(out, m, x, y, z, w, h, d, uv, look, rects) {
    const x1 = x + w, y1 = y + h, z1 = z + d, u = uv ? uv[0] : 0, v = uv ? uv[1] : 0;
    const pts = [[x, y, z], [x1, y, z], [x1, y1, z], [x, y1, z], [x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1]];
    const r = rects || {
      down: [u + d, v, u + d + w, v + d], up: [u + d + w, v + d, u + d + 2 * w, v],
      west: [u, v + d, u + d, v + d + h], north: [u + d, v + d, u + d + w, v + d + h],
      east: [u + d + w, v + d, u + 2 * d + w, v + d + h], south: [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h],
    };
    Object.keys(CORNERS).forEach(f => {
      if (!r[f]) return;
      const [a, b, c, e] = r[f].map(n => n / S);
      P.blockPolygon(out, m, CORNERS[f].map(i => pts[i]), [[c, b], [a, b], [a, e], [c, e]], look, false);
    });
  }
  // ModelPart.translateAndRotate with a part's pose (pixels, radians), then the pixels its cubes
  // measure in.
  const part = (m, x, y, z, xRot, yRot, zRot) => {
    const deg = 180 / Math.PI;
    return M.scale(M.rotX(M.rotY(M.rotZ(M.translate(m, x / 16, y / 16, z / 16), zRot * deg), yRot * deg), xRot * deg), 1 / 16, 1 / 16, 1 / 16);
  };
  const look = (tex, color) => ({ tex, color: color || null, dim: true, solid: true });
  const planks = () => P.textureOf(P.vanilla.textures[P.vanilla.blockEntities.particle]).url;
  const sixFaces = url => { const f = {}; Object.keys(P.FACES).forEach(k => { f[k] = url; }); return f; };
  // BedRenderer.renderPiece: the block's piece (head or foot) turned to the bed's facing, Bedrock's
  // `direction` (0 south, 1 west, 2 north, 3 east, Direction.toYRot over 90). Java's head and
  // foot layers are each a 16 by 16 by 6 box and two legs; Bedrock's texture lays the mattress out
  // as one box from head to foot (geometry.bed: texOffs 0, 0 at 16 by 32 by 6), so each piece
  // reads its half, and the faces where the two halves meet, which that box has none for, are left
  // out. Bedrock's legs are at 0, 38 and 12, 38 (head) and 0, 44 and 12, 44 (foot).
  const HEAD = { down: [6, 0, 22, 6], north: [6, 6, 22, 22], west: [0, 6, 6, 22], east: [22, 6, 28, 22], south: [28, 6, 44, 22] };
  const FOOT = { up: [22, 6, 38, 0], north: [6, 22, 22, 38], west: [0, 22, 6, 38], east: [22, 22, 28, 38], south: [28, 22, 44, 38] };
  function bed(block) {
    const states = P.blockStates(block), nbt = P.blockEntityData(block), t = P.vanilla.blockEntities;
    const l = look(P.textureOf(P.vanilla.textures[t.bed[nbt.color || 0]])), quads = [];
    let m = M.rotX(M.translate(M.id(), 0, 0.5625, 0), 90);
    m = M.translate(M.rotZ(M.translate(m, 0.5, 0.5, 0.5), 180 + (states.direction || 0) * 90), -0.5, -0.5, -0.5);
    const q = Math.PI / 2;
    if (states.head_piece_bit) {
      cube(quads, part(m, 0, 0, 0, 0, 0, 0), 0, 0, 0, 16, 16, 6, null, l, HEAD);
      cube(quads, part(m, 0, 0, 0, q, 0, q), 0, 6, 0, 3, 3, 3, [0, 38], l);
      cube(quads, part(m, 0, 0, 0, q, 0, Math.PI), -16, 6, 0, 3, 3, 3, [12, 38], l);
    } else {
      cube(quads, part(m, 0, 0, 0, 0, 0, 0), 0, 0, 0, 16, 16, 6, null, l, FOOT);
      cube(quads, part(m, 0, 0, 0, q, 0, 0), 0, 6, -16, 3, 3, 3, [0, 44], l);
      cube(quads, part(m, 0, 0, 0, q, 0, 3 * q), -16, 6, -16, 3, 3, 3, [12, 44], l);
    }
    return { id: P.blockId(block), shape: "model", quads, faces: sixFaces(planks()), tint: null, full: false, opaque: false };
  }

  // BannerRenderer.render: a standing banner turned by its ground_sign_direction (ROTATION, 22.5
  // degrees a step), a wall banner against the wall behind its facing_direction, its pole hidden;
  // pole and bar in banner_base, the flag in banner_base tinted the base colour and then each
  // pattern (at most 16) in its colour. Bedrock numbers colours the other way (0 black, 15 white)
  // and draws an ominous banner (Type 1) all in banner_illager. The flag sways with the game time
  // (`moving`).
  const WALL_TURN = { 2: 180, 3: 0, 4: 90, 5: 270 };
  function banner(block, name) {
    const states = P.blockStates(block), nbt = P.blockEntityData(block), t = P.vanilla.blockEntities.banner;
    const tex = path => P.textureOf(P.vanilla.textures[path]), dye = c => DYES[15 - (c || 0)];
    const ominous = nbt.Type === 1, base = tex(ominous ? t.illager : t.base), standing = name === "standing_banner";
    let m = standing ? M.rotY(M.translate(M.id(), 0.5, 0.5, 0.5), -(states.ground_sign_direction || 0) * 22.5)
      : M.translate(M.rotY(M.translate(M.id(), 0.5, -1 / 6, 0.5), -WALL_TURN[states.facing_direction || 2]), 0, -0.3125, -0.4375);
    m = M.scale(m, 2 / 3, -2 / 3, -2 / 3);
    const quads = [], still = part(m, 0, 0, 0, 0, 0, 0);
    if (standing) cube(quads, still, -1, -30, -1, 2, 42, 2, [44, 0], look(base));
    cube(quads, still, -10, -32, -1, 20, 2, 2, [0, 42], look(base));
    const layers = ominous ? [look(base)] : [look(base, dye(nbt.Base))];
    if (!ominous) (nbt.Patterns || []).slice(0, 16).forEach(p => { const path = t.patterns[p.Pattern]; if (path) layers.push(look(tex(path), dye(p.Color))); });
    const moving = (ticks, p) => {
      const f = ((((p[0] * 7 + p[1] * 9 + p[2] * 13 + ticks) % 100) + 100) % 100) / 100;
      const flag = part(m, 0, -32, 0, (-0.0125 + 0.01 * Math.cos(Math.PI * 2 * f)) * Math.PI, 0, 0), out = [];
      layers.forEach(l => cube(out, flag, -10, 0, -2, 20, 40, 1, [0, 0], l));
      return out;
    };
    return { id: P.blockId(block), shape: "model", quads, moving, faces: sixFaces(planks()), tint: null, full: false, opaque: false };
  }

  // The model of a bed or banner (shape "model", block_models.js), or null for any other block or
  // with no vanilla table.
  const cache = new Map();
  P.blockEntityModel = function (block) {
    const name = nameOf(block);
    if (!P.vanilla.blockEntities || !BLANK[name]) return null;
    const key = JSON.stringify(block);
    if (!cache.has(key)) cache.set(key, name === "bed" ? bed(block) : banner(block, name));
    return cache.get(key);
  };
})();
