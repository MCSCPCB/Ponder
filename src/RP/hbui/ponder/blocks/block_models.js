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
  const textureUrl = (index, name) => {
    const t = name && index.textures[name];
    return t ? `pack://${t.file}?filtering=point${t.pack ? "&packId=" + t.pack : ""}` : null;
  };
  const SOLID = /^(opaque|double_sided)$/, TWO_SIDED = /^(double_sided|alpha_test)$/;
  const DIRECTION = [["west", "east"], ["down", "up"], ["north", "south"]];
  const FULL = [0, 0, 1, 1];

  // A quad: block-space corners o, u, v under matrix m, showing `region` [u0, v0, u1, v1]
  // (fractions of the texture) of the material's texture. `cull` is the side of the cell it lies
  // flat against, if any, where a full neighbour hides it.
  function quad(out, m, o, u, v, region, material, index) {
    const src = textureUrl(index, material && material.texture);
    if (!src) return;
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
    const method = material.render_method || "opaque";
    out.push({
      o: a, u: b, v: c, n, src, region,
      eu: [du[0] / lu, du[1] / lu, du[2] / lu], ev: [dv[0] / lv, dv[1] / lv, dv[2] / lv],
      shade: material.face_dimming === false ? 1 : P.SHADE[direction],
      cull: flush ? direction : null, twoSided: TWO_SIDED.test(method), solid: SOLID.test(method),
    });
  }
  // A face of the box lo..hi, wound as P.FACES[face].
  function box(out, m, lo, hi, face, region, material, index) {
    const f = P.FACES[face], at = c => [c[0] ? hi[0] : lo[0], c[1] ? hi[1] : lo[1], c[2] ? hi[2] : lo[2]];
    quad(out, m, at(f.o), at(f.u), at(f.v), region, material, index);
  }

  // minecraft:geometry.full_block, and a geometry no pack has: the unit cube.
  function fullBlock(out, m, materials, index) {
    Object.keys(P.FACES).forEach(face => box(out, m, [0, 0, 0], [1, 1, 1], face, FULL, materialFor(materials, null, face), index));
  }
  // minecraft:geometry.cross: two upright planes from corner to corner.
  function cross(out, m, materials, index) {
    const material = materialFor(materials, null, "north");
    quad(out, m, [0, 1, 0], [1, 1, 1], [0, 0, 0], FULL, material, index);
    quad(out, m, [1, 1, 0], [0, 1, 1], [1, 0, 0], FULL, material, index);
  }

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
  // A cube's faces. uv and uv_size are texture pixels, uv_size the face's size when left out;
  // up and down count from the far corner, as Blockbench writes them. Box UV (uv as one [u, v])
  // is not drawn.
  function cube(out, m, c, geo, materials, index) {
    if (!c.uv || Array.isArray(c.uv)) return;
    const o = c.origin, s = c.size, g = c.inflate || 0;
    const lo = toCell([o[0] + s[0] + g, o[1] - g, o[2] - g]), hi = toCell([o[0] - g, o[1] + s[1] + g, o[2] + s[2] + g]);
    const t = pivoted(m, c.pivot || [o[0] + s[0] / 2, o[1] + s[1] / 2, o[2] + s[2] / 2], c.rotation);
    Object.keys(c.uv).forEach(face => {
      const f = c.uv[face];
      if (!P.FACES[face] || !f || !f.uv) return;
      const size = f.uv_size || (face === "north" || face === "south" ? [s[0], s[1]] : face === "east" || face === "west" ? [s[2], s[1]] : [s[0], s[2]]);
      if (!size[0] || !size[1]) return;
      let u0 = f.uv[0], v0 = f.uv[1], u1 = u0 + size[0], v1 = v0 + size[1];
      if (face === "up" || face === "down") { [u0, u1] = [u1, u0]; [v0, v1] = [v1, v0]; }
      box(out, t, lo, hi, face, [u0 / geo.width, v0 / geo.height, u1 / geo.width, v1 / geo.height], materialFor(materials, f.material_instance, face), index);
    });
  }
  // A geometry's bones, each turned about its pivot within its parent. bone_visibility (true,
  // false or Molang over the block's states) hides a bone and the bones under it.
  function custom(out, m, geo, materials, index, visibility, states) {
    const byName = {}, matrices = {};
    geo.bones.forEach(b => { byName[b.name] = b; });
    const shown = b => {
      const v = visibility && visibility[b.name];
      if (v === false || (typeof v === "string" && !molang(v, states))) return false;
      return !b.parent || !byName[b.parent] || shown(byName[b.parent]);
    };
    const matrixOf = b => matrices[b.name] || (matrices[b.name] = pivoted(b.parent && byName[b.parent] ? matrixOf(byName[b.parent]) : m, b.pivot || [0, 0, 0], b.rotation));
    geo.bones.forEach(b => { if (shown(b)) (b.cubes || []).forEach(c => cube(out, matrixOf(b), c, geo, materials, index)); });
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
    const geo = index.geometries[id], m = transformOf(look.transformation), quads = [];
    if (id === "minecraft:geometry.cross") cross(quads, m, materials, index);
    else if (geo) custom(quads, m, geo, materials, index, typeof g === "object" ? g.bone_visibility : null, states);
    else fullBlock(quads, m, materials, index);
    const full = !geo && id !== "minecraft:geometry.cross" && fillsCell(look.transformation);
    const faces = {};
    Object.keys(P.FACES).forEach(face => { const mat = materialFor(materials, null, face); faces[face] = textureUrl(index, mat && mat.texture); });
    const model = { id: P.blockId(block), shape: "model", quads, faces, tint: null, full, opaque: full && quads.length === 6 && quads.every(q => q.solid) };
    cache.set(key, model);
    return model;
  };
})();
