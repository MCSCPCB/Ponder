// Client entities drawn from their Bedrock definitions: geometry, render controllers and the
// pose entity_animation.js makes, each cube face a texture piece under the scene's transform.
// Geometry is read as Blockbench reads it: x mirrored, rotations about x and y turned round,
// applied x, then y, then z, about the bone's pivot.
(function () {
  const P = window.Ponder, M = P.Mat;

  // The tables tools/adapter writes: vanilla's (hbui/ponder/entities/vanilla_entities.json) and
  // each add-on's (hbui/ponder_addons/<folder>/ponder_entities.json), merged by name, an
  // add-on's over vanilla's.
  const TABLES = ["entities", "geometries", "animations", "controllers", "renders", "textures", "materials"];
  P.entityData = { entities: {}, geometries: {}, animations: {}, controllers: {}, renders: {}, textures: {}, materials: {} };
  const merge = t => TABLES.forEach(k => Object.assign(P.entityData[k], t[k] || {}));
  let vanillaLoaded = null;
  const addonsLoaded = new Set();
  P.loadEntityData = addons => {
    vanillaLoaded = vanillaLoaded || P.readJson("/hbui/ponder/entities/vanilla_entities.json").then(merge);
    return vanillaLoaded.then(() => Promise.all(addons.map(a => /^ponder_addons\/([^/]+)\//.exec(a.script)).filter(m => m && !addonsLoaded.has(m[1])).map(m => {
      addonsLoaded.add(m[1]);
      return P.readJson(`/hbui/ponder_addons/${m[1]}/ponder_entities.json`).then(merge);
    })));
  };

  // Vanilla's entity materials as Ponder draws them: "opaque" ignores the texture's alpha (there
  // it is a mask: a sheep's wool, a spider's eyes), "cutout" hides only clear pixels, "blend"
  // mixes by alpha, "none" draws nothing; `cull` leaves out faces turned away. Any other
  // material is cutout and not culled, as most of vanilla's are (entity_alphatest).
  const MATERIALS = {};
  const set = (names, look) => names.split(" ").forEach(n => { MATERIALS[n] = look; });
  set("entity entity_static entity_emissive agent blaze_body camera chicken chicken_cold cow cow_cold creeper dolphin fox leash_knot llama "
    + "llama_spit mooshroom panda pig pig_v3 polar_bear rabbit silverfish snow_golem snow_golem_pumpkin squid glow_squid turtle bell chest "
    + "piston_arm player shield trident enchanting_table_book boat", { mode: "opaque", cull: true });
  set("sheep wolf entity_change_color entity_nocull", { mode: "opaque", cull: false });
  set("ender_dragon entity_emissive_alpha_one_sided", { mode: "cutout", cull: true });
  set("slime_outer guardian_ghost entity_alphablend entity_alphablend_nocolor", { mode: "blend", cull: true });
  set("charged_creeper wither_boss_armor experience_orb entity_beam_additive player_spectator breeze_wind sulfur_cube_outer "
    + "warden_bioluminescent_layer", { mode: "blend", cull: false });
  set("entity_dissolve_layer0", { mode: "none", cull: true });
  const CUTOUT = { mode: "cutout", cull: false };
  const materialOf = name => {
    const key = String(name).split(".")[0], look = MATERIALS[key] || CUTOUT;
    // Preserve face culling while taking alpha semantics from the current native material.
    return Object.assign({}, look, P.entityData.materials[name] || P.entityData.materials[key]);
  };

  // The adapter prepares opaque/cutout alpha before image premultiplication. Multiplying
  // alpha by 255 in Gameface also amplifies RGB; colour matrices must keep alpha in 0..1.
  const filterOf = (c, mode, alpha) => {
    const a = (mode === "blend" ? P.clamp(alpha, 0, 1).toFixed(3) : "1") + ", 0";
    return `coh-color-matrix(${c[0].toFixed(3)}, 0, 0, 0, 0, 0, ${c[1].toFixed(3)}, 0, 0, 0, 0, 0, ${c[2].toFixed(3)}, 0, 0, 0, 0, 0, ${a})`;
  };

  // ---- geometry ----

  // Bone and cube positions in Blockbench's space (pixels): x mirrored, rotations about x and y
  // turned round.
  const flipPos = p => [-(p[0] || 0), p[1] || 0, p[2] || 0];
  const flipRot = r => [-(r[0] || 0), -(r[1] || 0), r[2] || 0];
  // Rotation applied x, then y, then z.
  const rotate = (m, r) => M.rotX(M.rotY(M.rotZ(m, r[2]), r[1]), r[0]);
  // A box's faces: their corners 0, 1, 2 and 3 (Blockbench's order, 3 opposite 0) from its low
  // corner f and high corner t, and their outward normals.
  const FACES = {
    east: [f => [f.t[0], f.t[1], f.t[2]], f => [f.t[0], f.t[1], f.f[2]], f => [f.t[0], f.f[1], f.t[2]], f => [f.t[0], f.f[1], f.f[2]], [1, 0, 0]],
    west: [f => [f.f[0], f.t[1], f.f[2]], f => [f.f[0], f.t[1], f.t[2]], f => [f.f[0], f.f[1], f.f[2]], f => [f.f[0], f.f[1], f.t[2]], [-1, 0, 0]],
    up: [f => [f.f[0], f.t[1], f.f[2]], f => [f.t[0], f.t[1], f.f[2]], f => [f.f[0], f.t[1], f.t[2]], f => [f.t[0], f.t[1], f.t[2]], [0, 1, 0]],
    down: [f => [f.f[0], f.f[1], f.t[2]], f => [f.t[0], f.f[1], f.t[2]], f => [f.f[0], f.f[1], f.f[2]], f => [f.t[0], f.f[1], f.f[2]], [0, -1, 0]],
    south: [f => [f.f[0], f.t[1], f.t[2]], f => [f.t[0], f.t[1], f.t[2]], f => [f.f[0], f.f[1], f.t[2]], f => [f.t[0], f.f[1], f.t[2]], [0, 0, 1]],
    north: [f => [f.t[0], f.t[1], f.f[2]], f => [f.f[0], f.t[1], f.f[2]], f => [f.t[0], f.f[1], f.f[2]], f => [f.f[0], f.f[1], f.f[2]], [0, 0, -1]],
  };
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
    Object.keys(FACES).forEach(k => {
      const f = c.uv[k];
      if (!f || !f.uv) return;
      const size = f.uv_size || FACE_SIZE[k](c.size);
      let uv = [f.uv[0], f.uv[1], f.uv[0] + size[0], f.uv[1] + size[1]];
      if (k === "up" || k === "down") uv = [uv[2], uv[3], uv[0], uv[1]];
      out[k] = { uv, turn: f.uv_rotation || 0 };
    });
    return out;
  }

  // A geometry made ready to pose: its bones parents first ({ name (lower case), parent index,
  // pivot, rest (its pivot less its parent's, a root bone's less 0, 24, 0 as Java's model space
  // counts: what `this` starts at in a position channel), bind
  // (rotation; both the file's convention), hidden (neverRender), faces }), each face its
  // corners 0, 1, 2 and normal in the model's space and its texture fractions at corners
  // 0, 1, 2 and 3. A bone's bind_pose_rotation turns its own cubes about its pivot, not its
  // children's: a sheep's and a panda's legs are drawn where they stand.
  const prepared = new Map();
  P.entityGeometry = function (id) {
    if (prepared.has(id)) return prepared.get(id);
    const g = P.entityData.geometries[id];
    let out = null;
    if (g) {
      const byName = new Map(), list = [];
      g.bones.forEach(b => byName.set(String(b.name).toLowerCase(), b));
      const placed = new Map();
      const place = (b, depth) => {
        const name = String(b.name).toLowerCase();
        if (placed.has(name)) return placed.get(name);
        const parent = b.parent && byName.get(String(b.parent).toLowerCase());
        const pi = parent && depth < 64 ? place(parent, depth + 1) : -1;
        const own = b.pivot || [0, 0, 0], up = (parent && parent.pivot) || [0, 24, 0];
        const bone = { name, parent: pi, rest: [0, 1, 2].map(i => (own[i] || 0) - (up[i] || 0)), pivot: flipPos(b.pivot || [0, 0, 0]), bind: [0, 1, 2].map(i => (b.rotation && b.rotation[i]) || 0),
          hidden: !!b.neverRender, faces: [] };
        const pv = bone.pivot, bindPose = b.bind_pose_rotation
          ? M.translate(rotate(M.translate(M.id(), pv[0], pv[1], pv[2]), flipRot(b.bind_pose_rotation)), -pv[0], -pv[1], -pv[2]) : M.id();
        (b.cubes || []).forEach(c => cubeFaces(c, b, g, bindPose, bone.faces));
        placed.set(name, list.length);
        list.push(bone);
        return list.length - 1;
      };
      g.bones.forEach(b => place(b, 0));
      out = { width: g.width, height: g.height, bones: list, index: new Map(list.map((b, i) => [b.name, i])) };
    }
    prepared.set(id, out);
    return out;
  };
  // A cube's faces under `base` (its bone's bind pose). A cube turned without a pivot turns about
  // its centre.
  function cubeFaces(c, bone, g, base, out) {
    if (!c.size) return;
    const o = c.origin || [0, 0, 0], inflate = typeof c.inflate === "number" ? c.inflate : typeof bone.inflate === "number" ? bone.inflate : 0;
    const from = [-(o[0] + c.size[0]), o[1], o[2]], to = [from[0] + c.size[0], o[1] + c.size[1], o[2] + c.size[2]];
    const box = { f: from.map(v => v - inflate), t: to.map(v => v + inflate) };
    let m = base;
    if (c.rotation) {
      const p = c.pivot ? flipPos(c.pivot) : [0, 1, 2].map(i => (from[i] + to[i]) / 2);
      m = M.translate(rotate(M.translate(m, p[0], p[1], p[2]), flipRot(c.rotation)), -p[0], -p[1], -p[2]);
    }
    const uvs = cubeUv(c, c.mirror === undefined ? bone.mirror === true : c.mirror === true);
    const closed = Object.keys(uvs).length === 6 && box.t.every((v, i) => v - box.f[i] > 1e-4)
      && Object.values(uvs).every(({ uv }) => Math.abs(uv[2] - uv[0]) >= 1e-6 && Math.abs(uv[3] - uv[1]) >= 1e-6);
    const solid = closed ? { from: box.f, to: box.t, matrix: m, corners: [] } : null;
    if (solid) for (let i = 0; i < 8; i++) solid.corners.push(M.apply(m, ...box.f.map((v, k) => i & (1 << k) ? box.t[k] : v)));
    Object.keys(uvs).forEach(k => {
      const F = FACES[k], uv = uvs[k].uv;
      const p = [0, 1, 2, 3].map(i => M.apply(m, ...F[i](box)));
      const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
      if (Math.hypot(...e1) < 1e-4 || Math.hypot(...e2) < 1e-4) return;
      if (Math.abs(uv[2] - uv[0]) < 1e-6 || Math.abs(uv[3] - uv[1]) < 1e-6) return;
      // Fractions at corners 0..3, turned uv_rotation degrees.
      const W = g.width || 16, H = g.height || 16;
      let at = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[0], uv[3]], [uv[2], uv[3]]].map(q => [q[0] / W, q[1] / H]);
      for (let turn = uvs[k].turn; turn > 0; turn -= 90) at = [at[2], at[0], at[3], at[1]];
      const n = M.apply(m, ...F[4]), z = M.apply(m, 0, 0, 0);
      out.push({ o: p[0], u: p[1], v: p[2], n: [n[0] - z[0], n[1] - z[1], n[2] - z[2]], st: at, solid });
    });
  }

  // ---- render controllers ----

  // A render controller's Molang over an entity's names: Geometry.x, Texture.x and Material.x
  // become numbers (kind * 1000 + index) and Array.name[i] a function returning an element, so
  // `query.is_baby ? Texture.baby : Array.skins[query.variant]` evaluates to one of them.
  const KINDS = { geometry: 1, texture: 2, material: 3 };
  const contexts = new Map();
  function controllerContext(id, def, rc) {
    const key = id + "|" + rc;
    let ctx = contexts.get(key);
    if (ctx) return ctx;
    const names = { geometry: Object.keys(def.geometry), texture: Object.keys(def.textures), material: Object.keys(def.materials) };
    const values = {};
    Object.keys(names).forEach(kind => names[kind].forEach((n, i) => { values[kind + "." + n.toLowerCase()] = KINDS[kind] * 1000 + i; }));
    const r = P.entityData.renders[rc] || {};
    Object.values(r.arrays || {}).forEach(group => Object.keys(group).forEach(name => {
      const list = group[name].map(e => values[String(e).toLowerCase()] || 0);
      // Index from the floor, wrapped round the array.
      values[name.toLowerCase()] = i => (list.length ? list[((Math.floor(i) % list.length) + list.length) % list.length] : 0);
    }));
    ctx = { values, names };
    contexts.set(key, ctx);
    return ctx;
  }
  // Array.name[...] -> array.name(...), which MolangJS reads as a call.
  const arrays = new Map();
  function arrayCalls(expr) {
    if (typeof expr !== "string") return expr;
    let out = arrays.get(expr);
    if (out != null) return out;
    out = expr;
    for (let m; (m = /\barray\.[\w.]+\[/i.exec(out));) {
      let depth = 0, i = m.index + m[0].length - 1;
      for (; i < out.length; i++) { if (out[i] === "[") depth++; else if (out[i] === "]" && --depth === 0) break; }
      out = out.slice(0, m.index + m[0].length - 1) + "(" + out.slice(m.index + m[0].length, i) + ")" + out.slice(i + 1);
    }
    arrays.set(expr, out);
    return out;
  }
  // The definition's name an expression picks of one kind, or null.
  function pick(entity, ctx, expr, kind) {
    const code = entity.animator.eval(arrayCalls(expr), ctx.values), i = code - KINDS[kind] * 1000;
    return Math.floor(code / 1000) === KINDS[kind] && ctx.names[kind][i] != null ? ctx.names[kind][i] : null;
  }
  // A bone name against a pattern of render controllers ("*", "leg*").
  const globs = new Map();
  const matches = (pattern, name) => {
    let re = globs.get(pattern);
    if (!re) globs.set(pattern, (re = new RegExp("^" + pattern.toLowerCase().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$")));
    return re.test(name);
  };

  // ---- drawing ----

  // A face's brightness by its normal in the scene (as Minecraft shades a rotated block face):
  // 1 up, 0.5 down, 0.8 north and south, 0.6 east and west.
  const shadeOf = n => {
    const l = Math.hypot(n[0], n[1], n[2]) || 1, x = n[0] / l, y = n[1] / l, z = n[2] / l;
    return Math.min(1, x * x * 0.6 + y * y * ((3 + y) / 4) + z * z * 0.8);
  };
  const det3 = m => m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]);
  const linear = m => [m[0], m[1], m[2], 0, m[4], m[5], m[6], 0, m[8], m[9], m[10], 0, 0, 0, 0, 1];

  // Remove surfaces buried inside another opaque closed cube in model space. Average-depth
  // sorting alone lets the top of a sheep's leg paint over its body. Only intersecting cube
  // bounds need clipping, and a pose cache makes a stationary entity/camera orbit reuse it.
  // Open, flat, cutout and blended parts neither occlude nor get trimmed here.
  const surfaceCache = new WeakMap(), FACE_POLY = [[0, 0], [1, 0], [1, 1], [0, 1]], EPS = 1e-6;
  const facePoint = (f, p) => f.o.map((v, k) => v + (f.u[k] - v) * p[0] + (f.v[k] - v) * p[1]);
  const bounds = points => ({ low: [0, 1, 2].map(k => Math.min(...points.map(p => p[k]))), high: [0, 1, 2].map(k => Math.max(...points.map(p => p[k]))) });
  const overlaps = (a, b) => a.low.every((v, k) => Math.min(a.high[k], b.high[k]) - Math.max(v, b.low[k]) > EPS);
  const distance = (p, plane) => p[0] * plane[0] + p[1] * plane[1] + plane[2];
  function halfPolygon(poly, plane, sign) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], da = distance(a, plane) * sign, db = distance(b, plane) * sign;
      if (da >= 0) out.push(a);
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
        const t = da / (da - db); out.push([P.lerp(t, a[0], b[0]), P.lerp(t, a[1], b[1])]);
      }
    }
    return out;
  }
  function outsideBox(poly, planes) {
    // Strict interior only: touching or coplanar surfaces must not erase one another.
    if (planes.some(p => poly.every(v => distance(v, p) <= EPS))) return [poly];
    let inside = poly;
    const outside = [];
    for (const plane of planes) {
      if (inside.every(p => distance(p, plane) >= -EPS)) continue;
      const piece = halfPolygon(inside, plane, -1);
      if (piece.length >= 3) outside.push(piece);
      inside = halfPolygon(inside, plane, 1);
      if (inside.length < 3) break;
    }
    return outside;
  }
  function opaqueSurfaces(entity, rc, g, bones, looks) {
    let cache = surfaceCache.get(entity);
    if (!cache) surfaceCache.set(entity, (cache = new Map()));
    const modes = looks.map(l => l && l.mode).join(","), previous = cache.get(rc);
    if (previous && previous.g === g && previous.modes === modes && bones.every((m, i) => m.every((v, j) => v === previous.bones[i][j]))) return previous.faces;
    const boxes = [], bySolid = new Map();
    g.bones.forEach((b, i) => {
      if (!looks[i] || looks[i].mode !== "opaque") return;
      b.faces.forEach(f => {
        if (!f.solid || bySolid.has(f.solid) || Math.abs(det3(bones[i])) < EPS) return;
        const box = { solid: f.solid, bounds: bounds(f.solid.corners.map(p => M.apply(bones[i], ...p))),
          inverse: M.invert(M.mul(bones[i], f.solid.matrix)) };
        boxes.push(box); bySolid.set(f.solid, box);
      });
    });
    boxes.forEach(box => { box.others = boxes.filter(other => other !== box && overlaps(box.bounds, other.bounds)); });
    const faces = g.bones.map((b, i) => {
      if (!looks[i] || looks[i].mode !== "opaque") return b.faces;
      const out = [];
      b.faces.forEach(f => {
        const box = bySolid.get(f.solid);
        if (!box || !box.others.length) { out.push(f); return; }
        let pieces = [FACE_POLY];
        for (const other of box.others) {
          const m = M.mul(other.inverse, bones[i]), o = M.apply(m, ...f.o), u = M.apply(m, ...f.u), v = M.apply(m, ...f.v), planes = [];
          for (let k = 0; k < 3; k++) {
            planes.push([u[k] - o[k], v[k] - o[k], o[k] - other.solid.from[k]]);
            planes.push([o[k] - u[k], o[k] - v[k], other.solid.to[k] - o[k]]);
          }
          pieces = pieces.flatMap(p => outsideBox(p, planes));
          if (!pieces.length) break;
        }
        pieces.forEach(poly => {
          if (poly === FACE_POLY) { out.push(f); return; }
          // A convex fragment uses the original face's affine UV mapping, with a smaller clip.
          const centre = poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);
          out.push(Object.assign({}, f, { centre: facePoint(f, centre), clip: poly.map(p => [0, 1].map(k =>
            f.st[0][k] + (f.st[1][k] - f.st[0][k]) * p[0] + (f.st[2][k] - f.st[0][k]) * p[1])) }));
        });
      });
      return out;
    });
    cache.set(rc, { g, modes, bones, faces });
    return faces;
  }

  // An entity's faces under `m` (its model space, in pixels, to the GUI) at partial tick pt:
  // { depth, draw(d) } items to sort with the world's. `world` turns model space into the
  // scene's (for shading). `light` dims the whole entity (an element fading in).
  P.clientEntityItems = function (entity, m, world, pt, blockPx, light) {
    const def = entity.definition(), out = [];
    if (!def) return out;
    const anim = entity.animator, scale = Math.abs(entity.scaleOf(pt)[0]) || 1;
    const poses = new Map();
    entity.renderControllers().forEach(rc => {
      const r = P.entityData.renders[rc], ctx = controllerContext(entity.type, def, rc);
      const geo = pick(entity, ctx, r.geometry, "geometry"), g = geo && P.entityGeometry(def.geometry[geo]);
      if (!g) return;
      if (!poses.has(g)) poses.set(g, poseOf(entity, g));
      const bones = poses.get(g);
      const layers = (r.textures || []).map(t => pick(entity, ctx, t, "texture")).map(t => t && P.entityData.textures[def.textures[t]]).filter(Boolean);
      if (!layers.length) return;
      // Materials and visibility per bone: the last pattern that matches.
      const materials = [];
      (r.materials || []).forEach(o => Object.keys(o).forEach(k => materials.push([k, pick(entity, ctx, o[k], "material")])));
      const shown = [];
      (r.part_visibility || []).forEach(o => Object.keys(o).forEach(k => shown.push([k, !!anim.eval(o[k])])));
      const color = r.color ? ["r", "g", "b", "a"].map(c => anim.eval(r.color[c], { this: 1 })) : [1, 1, 1, 1];
      const uvAnim = r.uv_anim ? { offset: (r.uv_anim.offset || [0, 0]).map(v => anim.eval(v)), scale: (r.uv_anim.scale || [1, 1]).map(v => anim.eval(v)) } : null;
      const looks = g.bones.map(b => {
        // Visibility per bone: the last pattern that matches.
        let v = true;
        shown.forEach(([k, s]) => { if (matches(k, b.name)) v = s; });
        if (!v || b.hidden || !b.faces.length) return null;
        let mat = null;
        materials.forEach(([k, name]) => { if (matches(k, b.name)) mat = name; });
        return materialOf(mat ? def.materials[mat] : "");
      });
      const surfaces = opaqueSurfaces(entity, rc, g, bones, looks);
      g.bones.forEach((b, i) => {
        const look = looks[i];
        if (!look || look.mode === "none") return;
        const textures = layers.map((entry, li) => {
          const url = !li && entry.images && entry.images[look.alpha || look.mode];
          return P.textureOf(url ? Object.assign({}, entry, { url: url }) : entry);
        });
        const full = M.mul(m, bones[i]), flip = det3(full) < 0, w = M.mul(world, bones[i]);
        surfaces[i].forEach(f => {
          const o = M.apply(full, ...f.o), u = M.apply(full, ...f.u), v2 = M.apply(full, ...f.v);
          const nz = (v2[0] - o[0]) * (u[1] - o[1]) - (v2[1] - o[1]) * (u[0] - o[0]);
          if ((look.cull || f.solid && look.mode === "opaque") && (flip ? -nz : nz) <= 0) return;
          const nw = M.apply(linear(w), ...f.n), shade = shadeOf(nw) * light;
          let st = f.st;
          let clip = f.clip || [st[0], st[1], st[3], st[2]];
          if (uvAnim) st = st.map(q => [q[0] * uvAnim.scale[0] + uvAnim.offset[0], q[1] * uvAnim.scale[1] + uvAnim.offset[1]]);
          if (uvAnim) clip = clip.map(q => [q[0] * uvAnim.scale[0] + uvAnim.offset[0], q[1] * uvAnim.scale[1] + uvAnim.offset[1]]);
          const size = Math.min(1024, Math.max(16, Math.round(blockPx * P.view.cssPerGui * (g.width || 16) / 16 * scale)));
          const c = [shade * color[0], shade * color[1], shade * color[2]];
          out.push({ depth: f.centre ? M.apply(full, ...f.centre)[2] : (u[2] + v2[2]) / 2, draw: d => textures.forEach((tex, li) =>
            d.texturedQuadMap(tex.url, o, u, v2, st[0], st[1], st[2], clip, filterOf(c, li ? "blend" : look.mode, color[3]), size)) });
        });
      });
    });
    return out;
  };

  // Each bone's matrix in the model's space for this frame: the pose of every animation added
  // to its bind rotation, about its pivot. A bone posed relative to the entity takes its
  // rotation in the model's space, whatever its parents' are.
  function poseOf(entity, g) {
    const pose = new Map();
    g.bones.forEach(b => pose.set(b.name, { bind: b.bind, rest: b.rest, rot: b.bind.slice(), pos: [0, 0, 0], scale: [1, 1, 1], relative: false }));
    entity.animator.animate(pose);
    const out = [];
    g.bones.forEach((b, i) => {
      const p = pose.get(b.name), parent = b.parent < 0 ? M.id() : out[b.parent], pos = flipPos(p.pos), pv = b.pivot;
      let m = M.translate(parent, pv[0] + pos[0], pv[1] + pos[1], pv[2] + pos[2]);
      if (p.relative && b.parent >= 0) {
        const inv = M.invert(linear(parent));
        m = M.mul(m, rotate(inv, flipRot(p.rot)));
      } else m = rotate(m, flipRot(p.rot));
      m = M.scale(m, p.scale[0], p.scale[1], p.scale[2]);
      out.push(M.translate(m, -pv[0], -pv[1], -pv[2]));
    });
    return out;
  }

  // ---- the entity ----

  // An entity of any type the game or an add-on defines, drawn from its client definition. It
  // does nothing on its own (no AI): a scene moves it (setPos, setDeltaMovement), turns it (yRot
  // the body, yHeadRot the head, xRot the head's pitch) and sets what its animations read:
  // queries (setQuery("is_sitting", true)), properties, Molang variables, and animations of its
  // own (playAnimation). It falls and stops on blocks unless `noGravity`.
  const missingTypes = new Set();
  const DEFAULT_RENDER = "controller.render.default";
  P.entityData.renders[DEFAULT_RENDER] = { geometry: "Geometry.default", materials: [{ "*": "Material.default" }], textures: ["Texture.default"] };
  class ClientEntity extends P.PonderEntity {
    constructor(world, type, x, y, z) {
      super(world, x, y, z);
      this.type = type;
      this.yRot = this.yRotO = 0;
      this.xRot = this.xRotO = 0;
      this.yHeadRot = this.yHeadRotO = 0;
      this.baby = false;
      // Java AbstractCubeMob starts at size 1; Bedrock's visual scale reads that as variant.
      this.cubeMob = type === "minecraft:slime" || type === "minecraft:magma_cube";
      this._variant = this.cubeMob ? 1 : 0;
      this.markVariant = this.skinId = 0;
      this.onGround = true;
      this.noGravity = type === "minecraft:evocation_fang";
      // Java EvokerFangs: 20 attack ticks plus LIFE_OFFSET (2); no motion or gravity.
      this.lifeSpan = type === "minecraft:evocation_fang" ? 22 : 0;
      this.walkSpeed = this.walkSpeedO = this.walkPosition = 0;
      this.flap = this.oFlap = this.flapSpeed = this.oFlapSpeed = 0;
      this.queries = {};
      const def = this.definition();
      const collision = def && def.collision;
      this.halfWidth = collision ? collision.width / 2 : 0.3;
      this.height = collision ? collision.height : 1.8;
      this.properties = Object.assign({}, def ? def.properties : {});
      this.extraAnimations = [];
      this.animator = new P.EntityAnimator(this);
    }
    get variant() { return this._variant; }
    set variant(value) {
      if (this.cubeMob) {
        // AbstractCubeMob.setSize clamps to 1..127 and refreshes its dimensions.
        value = Number.isFinite(value) ? P.clamp(Math.floor(value), 1, 127) : 1;
        const scale = value / this._variant;
        this.halfWidth *= scale;
        this.height *= scale;
      }
      this._variant = value;
    }
    definition() {
      const def = P.entityData.entities[this.type];
      if (!def && !missingTypes.has(this.type)) { missingTypes.add(this.type); P.log("entity: no client definition for", this.type); }
      return def || null;
    }
    // A query by its name without "query." (lower case): a value, or fn(entity, args).
    setQuery(name, value) { this.queries[String(name).toLowerCase()] = value; return this; }
    setProperty(name, value) { this.properties[name] = value; return this; }
    // A Molang variable, "variable.name" or "v.name".
    setVariable(name, value) { this.animator.variables[String(name).toLowerCase().replace(/^v\./, "variable.")] = value; return this; }
    // An animation or controller, by the definition's short name or its id, played on top.
    playAnimation(name) { if (this.extraAnimations.indexOf(name) < 0) this.extraAnimations.push(name); return this; }
    stopAnimation(name) {
      this.extraAnimations = this.extraAnimations.filter(n => n !== name);
      const key = "+" + name;
      [this.animator.instances, this.animator.controllers].forEach(map => [...map.keys()].forEach(k => { if (k === key || k.startsWith(key + "/")) map.delete(k); }));
      return this;
    }
    tick() {
      super.tick();
      if (this.type === "minecraft:evocation_fang" && this.tickCount > this.animator.query("life_span")) { this.discard(); return; }
      this.xo = this.x; this.yo = this.y; this.zo = this.z;
      this.yRotO = this.yRot; this.xRotO = this.xRot; this.yHeadRotO = this.yHeadRot;
      this.walkSpeedO = this.walkSpeed; this.oFlap = this.flap; this.oFlapSpeed = this.flapSpeed;
      // LivingEntity.aiStep: a speed below 0.003 stops.
      if (Math.abs(this.xd) < 0.003) this.xd = 0;
      if (Math.abs(this.yd) < 0.003) this.yd = 0;
      if (Math.abs(this.zd) < 0.003) this.zd = 0;
      if (!this.noGravity) this.yd -= 0.08;
      if (this.xd || this.yd || this.zd) this.move(this.xd, this.yd, this.zd);
      const friction = this.onGround ? 0.546 : 0.91;
      this.xd *= friction; this.zd *= friction; this.yd *= 0.98;
      // WalkAnimationState: speed chases 4 times the distance walked, its sum the walk's position.
      const walked = Math.min(Math.hypot(this.x - this.xo, this.z - this.zo) * 4, 1);
      this.walkSpeed += (walked - this.walkSpeed) * 0.4;
      this.walkPosition += this.walkSpeed;
    }
    // Whether its box, 0.001 in from each side, reaches a cell of that liquid ("water", "lava").
    inLiquid(kind) {
      const b = this.box(), lo = b[0].map(v => Math.floor(v + 0.001)), hi = b[1].map(v => Math.floor(v - 0.001));
      for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
        if (P.liquidKind(this.world.getBlock(x, y, z)) === kind) return true;
      }
      return false;
    }
    // The definition's render controllers whose condition holds. One with none (the game draws
    // a trident or a skull in code) is drawn as controller.render.default would draw it.
    renderControllers() {
      const def = this.definition(), out = [];
      if (def && !def.render_controllers.length) return [DEFAULT_RENDER];
      (def ? def.render_controllers : []).forEach(entry => {
        if (typeof entry === "string") { if (P.entityData.renders[entry]) out.push(entry); return; }
        Object.keys(entry).forEach(id => { if (P.entityData.renders[id] && this.animator.eval(entry[id])) out.push(id); });
      });
      return out;
    }
    // scripts.scale, times scaleX, scaleY and scaleZ, after the frame's pre_animation scripts
    // (EntityAnimator.begin) at partial tick pt.
    scaleOf(pt) {
      const def = this.definition();
      if (!def) return [1, 1, 1];
      const s = def.scripts, a = this.animator;
      a.begin(pt);
      const one = k => (s[k] != null ? a.eval(s[k]) : s[k.toLowerCase()] != null ? a.eval(s[k.toLowerCase()]) : 1);
      const all = s.scale != null ? a.eval(s.scale) : 1;
      return [all * one("scaleX"), all * one("scaleY"), all * one("scaleZ")];
    }
    // Model space (pixels, facing north) to the scene's: at its feet, its body turned to yRot
    // (0 faces south), as LivingEntityRenderer turns 180 - bodyRot.
    modelToScene(pt) {
      let m = M.translate(M.id(), P.lerp(pt, this.xo, this.x), P.lerp(pt, this.yo, this.y), P.lerp(pt, this.zo, this.z));
      m = M.rotY(m, 180 - P.angleLerp(pt, this.yRotO, this.yRot));
      const s = this.scaleOf(pt);
      return M.scale(m, s[0] / 16, s[1] / 16, s[2] / 16);
    }
    render(base, pt, blockPx) {
      const world = this.modelToScene(pt);
      return P.clientEntityItems(this, M.mul(base, world), world, pt, blockPx, 1);
    }
  }
  P.ClientEntity = ClientEntity;
})();
