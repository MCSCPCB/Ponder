// Blocks of other packs. tools/adapter writes ponder_blocks.json into an add-on's
// hbui/ponder_addons/<folder>/: each block's minecraft:geometry, material_instances and
// transformation with its permutations, and the geometries and textures they use. A block
// becomes quads in its cell (corners o, u, v in block space, wound as P.FACES), which
// world_render draws far to near with the rest.
(function () {
  const P = window.Ponder, M = P.Mat;
  const blocks = new Map(); // id -> { entry, index }
  const loaded = new Set(); // folders read

  // The ponder_blocks.json beside each add-on's plugin script. A pack without one reads as empty.
  P.loadAddonBlocks = function (addons) {
    const folders = [];
    addons.forEach(a => {
      const m = /^ponder_addons\/([^/]+)\//.exec(a.script);
      if (m && !loaded.has(m[1]) && folders.indexOf(m[1]) < 0) folders.push(m[1]);
    });
    return Promise.all(folders.map(folder => P.readJson(`/hbui/ponder_addons/${folder}/ponder_blocks.json`).then(index => {
      loaded.add(folder);
      Object.keys(index.blocks || {}).forEach(id => blocks.set(id, { entry: index.blocks[id], index }));
      Object.keys(index.items || {}).forEach(id => P.addonItems.set(id, index.items[id]));
    })));
  };

  // The Molang that permutation conditions and bone visibility use: query.block_state('name'),
  // numbers, strings, true and false, == != < <= > >=, && || ! and brackets. Anything else is 0.
  const TOKEN = /\d+(?:\.\d+)?|'[^']*'|"[^"]*"|[A-Za-z_][\w.]*|==|!=|<=|>=|&&|\|\||[()!<>,]/g;
  const truthy = v => v !== 0 && v !== false && v !== "" && v != null;
  const number = v => (typeof v === "boolean" ? (v ? 1 : 0) : v);
  function molang(text, states) {
    const tokens = String(text).match(TOKEN) || [];
    let i = 0;
    function primary() {
      const t = tokens[i++];
      if (t === undefined) return 0;
      if (t === "(") { const v = or(); i++; return v; }
      if (t === "!") return !truthy(primary());
      if (/^\d/.test(t)) return +t;
      if (t[0] === "'" || t[0] === '"') return t.slice(1, -1);
      const name = t.toLowerCase();
      if (name === "true" || name === "false") return name === "true";
      const args = [];
      if (tokens[i] === "(") {
        i++;
        while (i < tokens.length && tokens[i] !== ")") { args.push(or()); if (tokens[i] === ",") i++; }
        i++;
      }
      return (name === "query.block_state" || name === "q.block_state") && args[0] in states ? states[args[0]] : 0;
    }
    function comparison() {
      let a = primary();
      while (/^(==|!=|<=|>=|<|>)$/.test(tokens[i] || "")) {
        const op = tokens[i++], b = primary();
        const x = number(a), y = number(b);
        a = op === "==" ? x === y : op === "!=" ? x !== y : op === "<" ? x < y : op === "<=" ? x <= y : op === ">" ? x > y : x >= y;
      }
      return a;
    }
    function and() { let a = comparison(); while (tokens[i] === "&&") { i++; const b = comparison(); a = truthy(a) && truthy(b); } return a; }
    function or() { let a = and(); while (tokens[i] === "||") { i++; const b = and(); a = truthy(a) || truthy(b); } return a; }
    return truthy(or());
  }

  P.addonBlockStates = id => blocks.has(id) ? blocks.get(id).entry.states : null;

  // The block's states (each unset one at its default, the first value) and its look: the
  // block's components with those of every permutation whose condition holds over them.
  function lookOf(entry, given) {
    const states = {};
    Object.keys(entry.states).forEach(s => { states[s] = entry.states[s][0]; });
    Object.assign(states, given);
    const look = Object.assign({}, entry.look);
    entry.permutations.forEach(p => { if (molang(p.condition, states)) Object.assign(look, p.look); });
    return { states, look };
  }

  // minecraft:transformation about the cell's centre: translation, then rotation about the
  // centre plus rotation_pivot, then scale about the centre plus scale_pivot.
  function transformOf(t) {
    let m = M.translate(M.id(), 0.5, 0.5, 0.5);
    if (!t) return M.translate(m, -0.5, -0.5, -0.5);
    const tr = t.translation || [0, 0, 0], r = t.rotation || [0, 0, 0], rp = t.rotation_pivot || [0, 0, 0];
    const s = t.scale || [1, 1, 1], sp = t.scale_pivot || [0, 0, 0];
    m = M.translate(m, tr[0], tr[1], tr[2]);
    m = M.translate(m, rp[0], rp[1], rp[2]);
    m = M.rotZ(M.rotY(M.rotX(m, r[0]), r[1]), r[2]);
    m = M.translate(m, sp[0] - rp[0], sp[1] - rp[1], sp[2] - rp[2]);
    m = M.scale(m, s[0], s[1], s[2]);
    return M.translate(m, -0.5 - sp[0], -0.5 - sp[1], -0.5 - sp[2]);
  }
  // Whether the transformation leaves a full block filling its cell.
  const fillsCell = t => !t || ((t.rotation || [0, 0, 0]).every(a => a % 90 === 0)
    && (t.translation || [0, 0, 0]).every(v => v === 0) && (t.scale || [1, 1, 1]).every(v => v === 1));

  // The material a face uses: its geometry's material_instance name, else its direction, else
  // "*". A material given as a string is another instance's name.
  function materialFor(materials, name, direction) {
    let m = (name && materials[name]) || materials[direction] || materials["*"];
    if (typeof m === "string") m = materials[m];
    return m || null;
  }
  // A texture's image and what is known of it: its size; for an animation (a strip of square
  // frames, top to bottom), its frame count, ticks per frame and frame order; and the tint the
  // game gives it in plains (tint [r, g, b], alpha, and `under`, the image drawn untinted under
  // an overlay such as grass_side). One per file.
  // An entry with a `url` is an image of Ponder's own (hbui/ponder/assets/). Entity entries can
  // also name an opaque/cutout image whose alpha the adapter prepared for that material.
  const textures = new Map();
  P.textureOf = function (entry, mode) {
    const url = (mode && entry[mode]) || entry.url || `pack://${entry.file}?filtering=point${entry.pack ? "&packId=" + entry.pack : ""}`;
    let t = textures.get(url);
    if (!t) textures.set(url, (t = { url, w: entry.w, h: entry.h, frames: entry.frames || 1, tick: entry.tick || 1, seq: entry.seq || null,
      tint: entry.tint || null, alpha: entry.alpha != null ? entry.alpha : 1, ao: !!entry.ao, under: entry.under ? P.textureOf(entry.under) : null }));
    return t;
  };
  // The texture P.textureOf made for a URL, or null.
  P.textureAt = url => textures.get(url) || null;
  // The piece of the image a look reads, as fractions [x0, y0, x1, y1]: the frame an animation
  // is on; else a `window`'s 16 by 16 pixels (from the top left when the image has no room for
  // it, as Scaffold reads it); else, with `crop`, the top left 16 by 16; else all of it.
  function tileOf(look, ticks) {
    const t = look.tex;
    if (t.frames > 1 && !look.window) {
      const n = Math.floor(ticks / t.tick), f = t.seq ? t.seq[n % t.seq.length] : n % t.frames;
      return [0, f / t.frames, 1, (f + 1) / t.frames];
    }
    if (look.window || look.crop) {
      let x = look.window ? look.window[0] : 0, y = look.window ? look.window[1] : 0;
      if (Math.max(t.h, 16) < y + 16 || Math.max(t.w, 16) < x + 16) x = y = 0;
      return [x / t.w, y / t.h, (x + 16) / t.w, (y + 16) / t.h];
    }
    return [0, 0, 1, 1];
  }
  // Where (s, t) of a tile turned `turn` degrees clockwise lies in the tile as it is.
  const unturned = (turn, s, t) => (turn === 90 ? [t, 1 - s] : turn === 180 ? [1 - s, 1 - t] : turn === 270 ? [1 - t, s] : [s, t]);
  // What a quad draws at `ticks`: its image, the image fractions its corners o, u and v show, and
  // the outline (fractions) it shows. A quad's tile fractions are its `region` [u0, v0, u1, v1],
  // or, for one that is not a rectangle of the tile (liquid_models.js), its `uvs`: one per
  // corner, in order round it from o through u to v. Animated faces keep their coordinates in
  // one frame; `tile` selects that frame inside the image without moving the face's clip.
  P.quadImage = function (q, ticks) {
    const look = q.look, tile = tileOf(look, ticks), animated = look.tex.frames > 1 && !look.window;
    const at = st => { const p = unturned(look.turn, st[0], st[1]); return animated ? p : [tile[0] + p[0] * (tile[2] - tile[0]), tile[1] + p[1] * (tile[3] - tile[1])]; };
    if (q.uvs) {
      const clip = q.uvs.map(at);
      return { src: look.tex.url, a: clip[0], b: clip[1], c: clip[clip.length - 1], clip, tile: animated ? tile : null };
    }
    const r = q.region, a = at([r[0], r[1]]), b = at([r[2], r[1]]), c = at([r[0], r[3]]);
    return { src: look.tex.url, a, b, c, clip: [a, b, [b[0] + c[0] - a[0], b[1] + c[1] - a[1]], c], tile: animated ? tile : null };
  };
  const SOLID = /^(opaque|double_sided)$/, TWO_SIDED = /^(double_sided|alpha_test)$/;
  const DIRECTION = [["west", "east"], ["down", "up"], ["north", "south"]];
  const FULL = [0, 0, 1, 1];

  // A quad: block-space corners o, u, v under matrix m, showing `region` [u0, v0, u1, v1]
  // (fractions of the tile) of a look { tex (P.textureOf), window, turn, crop, tint, dim, solid,
  // twoSided }: `tint` multiplies it by its model's tint, `dim` false leaves it unshaded, `solid`
  // marks an opaque face. `cull` is the side of the cell it lies flat against, if any, where a
  // full neighbour hides it.
  function quad(out, m, o, u, v, region, look) {
    if (!look || !look.tex) return;
    const a = M.apply(m, o[0], o[1], o[2]), b = M.apply(m, u[0], u[1], u[2]), c = M.apply(m, v[0], v[1], v[2]);
    const du = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], dv = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const lu = Math.hypot(du[0], du[1], du[2]), lv = Math.hypot(dv[0], dv[1], dv[2]);
    if (lu < 1e-6 || lv < 1e-6) return;
    // Out of the face, as P.FACES' corners wind.
    const n = [dv[1] * du[2] - dv[2] * du[1], dv[2] * du[0] - dv[0] * du[2], dv[0] * du[1] - dv[1] * du[0]];
    const ln = Math.hypot(n[0], n[1], n[2]);
    n[0] /= ln; n[1] /= ln; n[2] /= ln;
    const ax = [1, 2].reduce((best, i) => (Math.abs(n[i]) > Math.abs(n[best]) ? i : best), 0);
    const direction = DIRECTION[ax][n[ax] > 0 ? 1 : 0], edge = n[ax] > 0 ? 1 : 0;
    const flush = Math.abs(n[ax]) > 0.999 && Math.abs(a[ax] - edge) < 1e-4 && Math.abs(du[ax]) < 1e-4 && Math.abs(dv[ax]) < 1e-4;
    out.push({
      o: a, u: b, v: c, n, look, region,
      shade: look.dim === false ? 1 : P.SHADE[direction],
      cull: flush ? direction : null, twoSided: !!look.twoSided, solid: !!look.solid,
    });
  }
  // A face of the box lo..hi, wound as P.FACES[face].
  function box(out, m, lo, hi, face, region, look) {
    const f = P.FACES[face], at = c => [c[0] ? hi[0] : lo[0], c[1] ? hi[1] : lo[1], c[2] ? hi[2] : lo[2]];
    quad(out, m, at(f.o), at(f.u), at(f.v), region, look);
  }
  // A face as the game's code makes them (LiquidBlockRenderer, ModelPart.Polygon): `pts` (3 or 4,
  // block space, under matrix m) wound so that (p1 - p0) x (pLast - p0) points out of it, with the
  // tile fractions `uvs` at them. Shaded by the side it faces most.
  function polygon(out, m, pts, uvs, look, twoSided) {
    const w = pts.map(p => M.apply(m, p[0], p[1], p[2])), o = w[0], u = w[1], v = w[w.length - 1];
    const du = [u[0] - o[0], u[1] - o[1], u[2] - o[2]], dv = [v[0] - o[0], v[1] - o[1], v[2] - o[2]];
    const n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
    const lu = Math.hypot(du[0], du[1], du[2]), lv = Math.hypot(dv[0], dv[1], dv[2]), ln = Math.hypot(n[0], n[1], n[2]);
    if (lu < 1e-6 || lv < 1e-6 || ln < 1e-9) return;
    n[0] /= ln; n[1] /= ln; n[2] /= ln;
    const ax = [1, 2].reduce((best, i) => (Math.abs(n[i]) > Math.abs(n[best]) ? i : best), 0);
    out.push({ o, u, v, look, uvs, n,
      shade: look.dim === false ? 1 : P.SHADE[DIRECTION[ax][n[ax] > 0 ? 1 : 0]], cull: null, twoSided: !!twoSided, solid: !!look.solid && w.length === 4 });
  }

  // vanilla_models.js, liquid_models.js, block_entity_models.js and blocks.js build their quads
  // with these too.
  P.blockQuad = quad;
  P.blockBox = box;
  P.blockPolygon = polygon;

  // An add-on material's look: its texture from the index, and its render_method.
  function addonLook(index, material) {
    const entry = material && material.texture && index.textures[material.texture];
    if (!entry) return null;
    const method = material.render_method || "opaque";
    return { tex: P.textureOf(entry), color: (index.tints || {})[material.tint_method] || null, dim: material.face_dimming !== false, solid: SOLID.test(method), twoSided: TWO_SIDED.test(method) };
  }

  // minecraft:geometry.full_block, and a geometry no pack has: the unit cube.
  function fullBlock(out, m, materials, index) {
    Object.keys(P.FACES).forEach(face => box(out, m, [0, 0, 0], [1, 1, 1], face, FULL, addonLook(index, materialFor(materials, null, face))));
  }
  // minecraft:geometry.cross: two upright planes from corner to corner.
  function cross(out, m, materials, index) {
    const look = addonLook(index, materialFor(materials, null, "north"));
    quad(out, m, [0, 1, 0], [1, 1, 1], [0, 0, 0], FULL, look);
    quad(out, m, [1, 1, 0], [0, 1, 1], [1, 0, 0], FULL, look);
  }

  // Box UV: where each face's piece starts and how far it runs (negative: flipped), for a box of
  // size s (whole pixels), mirrored by swapping east and west and flipping each across.
  function boxUv(s, mirror) {
    const list = {
      east: [0, s[2], s[2], s[1]], west: [s[2] + s[0], s[2], s[2], s[1]], up: [s[2] + s[0], s[2], -s[0], -s[2]],
      down: [s[2] + s[0] * 2, 0, -s[0], s[2]], south: [s[2] * 2 + s[0], s[2], s[0], s[1]], north: [s[2], s[2], s[0], s[1]],
    };
    if (mirror) {
      Object.values(list).forEach(f => { f[0] += f[2]; f[2] = -f[2]; });
      const e = list.east; list.east = list.west; list.west = e;
    }
    return list;
  }
  // A face's own size in pixels, the uv_size a face without one takes.
  const FACE_SIZE = { east: s => [s[2], s[1]], west: s => [s[2], s[1]], up: s => [s[0], s[2]], down: s => [s[0], s[2]], south: s => [s[0], s[1]], north: s => [s[0], s[1]] };
  // Pixel corners [u0, v0, u1, v1] of each face the cube shows, and the turn of each. A cube
  // without uv is box UV from 0, 0.
  function cubeUv(c, mirror) {
    const out = {};
    if (Array.isArray(c.uv) || !c.uv) {
      const at = c.uv || [0, 0], s = c.size.map(v => Math.floor(Math.abs(v) + 1e-7)), list = boxUv(s, mirror);
      Object.keys(list).forEach(k => { const f = list[k]; out[k] = { uv: [at[0] + f[0], at[1] + f[1], at[0] + f[0] + f[2], at[1] + f[1] + f[3]], turn: 0 }; });
      return out;
    }
    Object.keys(FACE_SIZE).forEach(k => {
      const f = c.uv[k];
      if (!f || !f.uv) return;
      const size = f.uv_size || FACE_SIZE[k](c.size);
      let uv = [f.uv[0], f.uv[1], f.uv[0] + size[0], f.uv[1] + size[1]];
      if (k === "up" || k === "down") uv = [uv[2], uv[3], uv[0], uv[1]];
      out[k] = { uv, turn: f.uv_rotation || 0 };
    });
    return out;
  }

  P.cubeUV = cubeUv;

  // Geometry files measure in pixels: x mirrored (+x is west), y up from the cell's bottom, z
  // south, the cell's centre at x = z = 0. A rotation turns about x, then y, then z, and with x
  // mirrored its x and y turn the other way.
  const toCell = p => [(8 - p[0]) / 16, p[1] / 16, (p[2] + 8) / 16];
  function pivoted(m, pivot, rotation) {
    if (!rotation || !rotation.some(Boolean)) return m;
    const c = toCell(pivot);
    m = M.translate(m, c[0], c[1], c[2]);
    m = M.rotX(M.rotY(M.rotZ(m, rotation[2]), -rotation[1]), -rotation[0]);
    return M.translate(m, -c[0], -c[1], -c[2]);
  }
  // Cube UV is shared with entity geometry; per-face material names remain block-local.
  function cube(out, boxes, m, c, geo, materials, index, mirror) {
    const o = c.origin, s = c.size, g = c.inflate || 0;
    const lo = toCell([o[0] + s[0] + g, o[1] - g, o[2] - g]), hi = toCell([o[0] - g, o[1] + s[1] + g, o[2] + s[2] + g]);
    const t = pivoted(m, c.pivot || [o[0] + s[0] / 2, o[1] + s[1] / 2, o[2] + s[2] / 2], c.rotation);
    boxes.push({ lo, hi, matrix: t });
    const uvs = cubeUv(c, c.mirror === undefined ? mirror : c.mirror);
    Object.keys(uvs).forEach(face => {
      const f = c.uv && c.uv[face], uv = uvs[face].uv;
      const look = addonLook(index, materialFor(materials, f && f.material_instance, face));
      if (!look) return;
      look.turn = uvs[face].turn;
      box(out, t, lo, hi, face, uv.map((v, i) => v / (i % 2 ? geo.height : geo.width)), look);
    });
  }
  // A geometry's bones, each turned about its pivot within its parent. bone_visibility (true,
  // false or Molang over the block's states) hides a bone and the bones under it.
  function custom(out, boxes, m, geo, materials, index, visibility, states) {
    const byName = {}, matrices = {};
    geo.bones.forEach(b => { byName[b.name] = b; });
    const shown = b => {
      const v = visibility && visibility[b.name];
      if (v === false || (typeof v === "string" && !molang(v, states))) return false;
      return !b.parent || !byName[b.parent] || shown(byName[b.parent]);
    };
    const matrixOf = b => matrices[b.name] || (matrices[b.name] = pivoted(b.parent && byName[b.parent] ? matrixOf(byName[b.parent]) : m, b.pivot || [0, 0, 0], b.rotation));
    geo.bones.forEach(b => { if (shown(b)) (b.cubes || []).forEach(c => cube(out, boxes, matrixOf(b), c, geo, materials, index, b.mirror === true)); });
  }

  // The model of a block an add-on index has, or null: shape "model" with its quads, `faces`
  // (each side's texture, for block particles), and `full` when it is a full block filling its
  // cell, which then hides its neighbours' faces as a vanilla cube does.
  const cache = new Map();
  P.addonBlockModel = function (block) {
    const found = blocks.get(P.blockId(block));
    if (!found) return null;
    const key = JSON.stringify(block);
    if (cache.has(key)) return cache.get(key);
    const { states, look } = lookOf(found.entry, P.blockStates(block));
    const index = found.index, materials = look.material_instances || {};
    const g = look.geometry, id = !g ? "minecraft:geometry.full_block" : typeof g === "string" ? g : g.identifier;
    const geo = index.geometries[id], m = transformOf(look.transformation), quads = [], boxes = [];
    if (id === "minecraft:geometry.cross") cross(quads, m, materials, index);
    else if (geo) custom(quads, boxes, m, geo, materials, index, typeof g === "object" ? g.bone_visibility : null, states);
    else { fullBlock(quads, m, materials, index); boxes.push({ lo: [0, 0, 0], hi: [1, 1, 1], matrix: m }); }
    const full = !geo && id !== "minecraft:geometry.cross" && fillsCell(look.transformation);
    const faces = {};
    Object.keys(P.FACES).forEach(face => { const look = addonLook(index, materialFor(materials, null, face)); faces[face] = look && look.tex.url; });
    const model = { id: P.blockId(block), shape: "model", quads, boxes, faces, tint: null, full, opaque: full && quads.length === 6 && quads.every(q => q.solid) };
    cache.set(key, model);
    return model;
  };
})();
