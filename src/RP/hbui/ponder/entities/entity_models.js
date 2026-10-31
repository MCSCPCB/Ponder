// Client entities drawn from their Bedrock definitions: geometry, render controllers and the
// pose entity_animation.js makes, each cube face a texture piece under the scene's transform.
// Geometry is read as Blockbench reads it: x mirrored, rotations about x and y turned round,
// applied x, then y, then z, about the bone's pivot.
(function () {
  const P = window.Ponder, M = P.Mat;

  // The tables tools/adapter writes: vanilla's (hbui/ponder/entities/vanilla_entities.json) and
  // each add-on's (hbui/ponder_addons/<folder>/ponder_entities.json), merged by name, an
  // add-on's over vanilla's.
  const TABLES = ["entities", "attachables", "geometries", "animations", "controllers", "renders", "textures", "materials", "equipment"];
  P.entityData = { entities: {}, attachables: {}, geometries: {}, animations: {}, controllers: {}, renders: {}, textures: {}, materials: {}, equipment: {} };
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

  // The adapter resolves the game's material inheritance and skinning variants. Alpha masks
  // remain separate images so the UI never tries to recover RGB from premultiplied alpha.
  const materialOf = name => {
    const material = P.entityData.materials[name] || P.entityData.materials[String(name).split(".")[0]];
    const flags = material ? material.defines || [] : ["ALPHA_TEST"], states = material ? material.states || [] : ["DisableCulling"];
    const mask = flags.includes("USE_COLOR_MASK"), emissive = flags.includes("USE_EMISSIVE"), only = flags.includes("USE_ONLY_EMISSIVE");
    const sourceOne = material && material.blendSrc === "One", additive = material && material.blendDst === "One";
    const blend = states.includes("Blending") && !sourceOne, test = flags.includes("ALPHA_TEST");
    const mode = states.includes("DisableColorWrite") ? "none" : blend ? "blend" : test ? "cutout" : "opaque";
    const alpha = blend ? test ? "blendCutout" : "blend" : test ? "cutout" : "opaque";
    const image = (emissive ? only ? "emissiveOnly_" : "emissive_" : mask ? "mask_" : "") + alpha;
    return { mode, image, alpha, mask, emissive, only, additive, overlay: flags.includes("USE_OVERLAY"), glint: flags.includes("GLINT"), cull: !states.includes("DisableCulling") };
  };

  // Prepare only types named by the storyboard. Each job reads definitions, never an entity
  // factory, setup callback or animation query. Variants share geometry and image caches.
  P.entityPreparation = function (types) {
    const jobs = [], seen = new Set();
    let faces = 0;
    types.forEach(type => {
      const def = P.entityData.entities[type] || P.entityData.attachables[type];
      if (!def) return;
      const geometries = Object.values(def.geometry), controllers = def.render_controllers.length
        ? [].concat(...def.render_controllers.map(r => typeof r === "string" ? [r] : Object.keys(r))) : [DEFAULT_RENDER];
      const count = Math.max(def.renderer === "boat" ? 78 : 0, ...geometries.map(id => {
        const g = P.entityData.geometries[id];
        return g ? g.bones.reduce((n, b) => n + (b.cubes || []).length * 6, 0) : 0;
      }));
      const layers = controllers.reduce((n, id) => n + ((P.entityData.renders[id] || {}).textures || []).length, 0);
      faces += count * Math.max(1, layers) * (Object.values(def.materials).some(name => { const look = materialOf(name); return look.mask || look.emissive; }) ? 2 : 1);
      if (seen.has(type)) return;
      seen.add(type);
      geometries.forEach(id => jobs.push(() => P.entityGeometry(id)));
      controllers.forEach(id => jobs.push(() => controllerContext(type, def, id)));
      const modes = new Set();
      Object.values(def.materials).forEach(name => {
        const look = materialOf(name);
        modes.add(look.image);
        if (look.mask) modes.add(look.alpha);
        if (look.mask || look.emissive) modes.add(look.image + "Layer");
      });
      if (!modes.size) modes.add("cutout");
      if (controllers.some(id => ((P.entityData.renders[id] || {}).textures || []).length > 1)) modes.add("blend");
      Object.values(def.textures).forEach(id => {
        const entry = P.entityData.textures[id];
        if (entry) modes.forEach(mode => { if (mode !== "none") jobs.push(() => P.preloadTexture(P.textureOf(entry, mode).url)); });
      });
    });
    return { jobs, faces };
  };

  // RGB shading and a bounded blend opacity. Opaque/cutout alpha is prepared in the image by
  // the adapter: Gameface multiplies RGB by the matrix's output alpha without clamping it.
  const filterOf = (c, mode, alpha, offset) => {
    const a = mode === "blend" ? Math.max(0, Math.min(1, alpha)).toFixed(3) : "1";
    const o = (offset || [0, 0, 0]).map(v => v.toFixed(3));
    return `coh-color-matrix(${c[0].toFixed(3)}, 0, 0, 0, ${o[0]}, 0, ${c[1].toFixed(3)}, 0, 0, ${o[1]}, 0, 0, ${c[2].toFixed(3)}, 0, ${o[2]}, 0, 0, 0, ${a}, 0)`;
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
          hidden: !!b.neverRender, binding: b.binding, faces: [] };
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
    const uvs = P.cubeUV(c, c.mirror === undefined ? bone.mirror === true : c.mirror === true);
    const closed = Object.keys(uvs).length === 6 && box.t.every((v, i) => v - box.f[i] > 1e-4)
      && Object.values(uvs).every(({ uv }) => Math.abs(uv[2] - uv[0]) >= 1e-6 && Math.abs(uv[3] - uv[1]) >= 1e-6);
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
      out.push({ o: p[0], u: p[1], v: p[2], n: [n[0] - z[0], n[1] - z[1], n[2] - z[2]], st: at, closed });
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
  const faceCoverage = new WeakMap();
  function hasPixels(entry, mode, face) {
    const regions = entry.coverage && entry.coverage[mode];
    if (!regions) return true;
    let cache = faceCoverage.get(regions);
    if (!cache) faceCoverage.set(regions, (cache = new WeakMap()));
    if (cache.has(face)) return cache.get(face);
    const lo = [0, 1].map(i => Math.min(...face.st.map(p => p[i]))), hi = [0, 1].map(i => Math.max(...face.st.map(p => p[i])));
    const visible = lo.some(v => v < 0) || hi.some(v => v > 1) || regions.some(r => r[0] < hi[0] - 1e-8 && r[2] > lo[0] + 1e-8 && r[1] < hi[1] - 1e-8 && r[3] > lo[1] + 1e-8);
    cache.set(face, visible); return visible;
  }

  // An entity's faces under `m` (its model space, in pixels, to the GUI) at partial tick pt:
  // { depth, draw(d) } items to sort with the world's. `world` turns model space into the
  // scene's (for shading). `light` dims the whole entity (an element fading in).
  P.clientEntityItems = function (entity, m, world, pt, blockPx, light) {
    const def = entity.definition(), out = [];
    if (!def) return out;
    // actor.billboard reads the camera in the entity's model frame, including its body turn.
    entity.animator.cameraMatrix = m;
    const anim = entity.animator, scale = Math.abs(entity.scaleOf(pt)[0]) || 1;
    const parentVariables = new Map();
    const equipment = entity.owner ? [] : equipmentOf(entity, parentVariables);
    entity.boneTransforms = new Map();
    const poses = new Map();
    entity.renderControllers().forEach(rc => {
      const r = P.entityData.renders[rc], ctx = controllerContext(entity.type, def, rc);
      const geo = pick(entity, ctx, r.geometry, "geometry"), g = geo && P.entityGeometry(def.geometry[geo]);
      if (!g) return;
      if (!poses.has(g)) poses.set(g, poseOf(entity, g));
      const bones = poses.get(g);
      g.bones.forEach((b, i) => { if (!entity.boneTransforms.has(b.name)) entity.boneTransforms.set(b.name, { matrix: bones[i], pivot: b.pivot }); });
      const layers = (r.textures || []).map(t => pick(entity, ctx, t, "texture")).map(t => t && P.entityData.textures[def.textures[t]]).filter(Boolean);
      if (!layers.length) return;
      // Materials and visibility per bone: the last pattern that matches.
      const materials = [];
      (r.materials || []).forEach(o => Object.keys(o).forEach(k => materials.push([k, pick(entity, ctx, o[k], "material")])));
      const shown = [];
      (r.part_visibility || []).forEach(o => Object.keys(o).forEach(k => shown.push([k, !!anim.eval(o[k])])));
      const color = r.color ? ["r", "g", "b", "a"].map(c => anim.eval(r.color[c], { this: 1 })) : entity.color;
      const uvAnim = r.uv_anim ? { offset: (r.uv_anim.offset || [0, 0]).map(v => anim.eval(v)), scale: (r.uv_anim.scale || [1, 1]).map(v => anim.eval(v)) } : null;
      g.bones.forEach((b, i) => {
        if (entity.boneVisible && !entity.boneVisible(b.name)) return;
        // Visibility per bone: the last pattern that matches.
        let v = true;
        shown.forEach(([k, s]) => { if (matches(k, b.name)) v = s; });
        if (!v || b.hidden || !b.faces.length) return;
        let mat = null;
        materials.forEach(([k, name]) => { if (matches(k, b.name)) mat = name; });
        const look = materialOf(mat ? def.materials[mat] : "");
        if (look.mode === "none") return;
        const overlay = look.overlay && r.overlay_color ? ["r", "g", "b", "a"].map(c => anim.eval(r.overlay_color[c], { this: 0 })) : [0, 0, 0, 0];
        const overlayAlpha = P.clamp(overlay[3], 0, 1);
        // Texture.enchanted is a shader sampler, never a second skin.
        const textures = layers.filter(entry => !/enchanted_.*glint/.test(entry.file || "")).map((entry, li) => {
          const mode = li ? "blend" : look.mode, tint = look.mask && color.slice(0, 3).some(v => Math.abs(v - 1) > 1e-6);
          const imageMode = li ? mode : look.mask && !tint ? look.alpha : look.image;
          return { entry, imageMode, tex: P.textureOf(entry, imageMode), mode,
            mask: !li && (tint || look.emissive) ? P.textureOf(entry, look.image + "Layer") : null };
        });
        if (entity.owner) equipmentLayers(entity).forEach(layer => textures.push({ entry: layer.entry, imageMode: "blend",
          tex: P.textureOf(layer.entry), mode: "blend", color: layer.color || [1, 1, 1] }));
        const full = M.mul(m, bones[i]), flip = det3(full) < 0, w = M.mul(world, bones[i]);
        b.faces.forEach(f => {
          const o = M.apply(full, ...f.o), u = M.apply(full, ...f.u), v2 = M.apply(full, ...f.v);
          const nz = (v2[0] - o[0]) * (u[1] - o[1]) - (v2[1] - o[1]) * (u[0] - o[0]);
          // A closed opaque box hides its own back faces even with a two-sided material.
          // Open, flat, cutout and blended parts still need the material's culling rule.
          if ((look.cull || f.closed && look.mode === "opaque") && (flip ? -nz : nz) <= 0) return;
          const visibleTextures = uvAnim ? textures : textures.filter(t => hasPixels(t.entry, t.imageMode, f));
          if (!visibleTextures.length) return;
          const nw = M.apply(linear(w), ...f.n), shade = (r.ignore_lighting ? 1 : shadeOf(nw)) * light;
          let st = f.st;
          if (uvAnim) st = st.map(q => [q[0] * uvAnim.scale[0] + uvAnim.offset[0], q[1] * uvAnim.scale[1] + uvAnim.offset[1]]);
          const size = Math.min(1024, Math.max(16, Math.round(blockPx * P.view.cssPerGui * (g.width || 16) / 16 * scale)));
          const c = [shade * color[0], shade * color[1], shade * color[2]];
          out.push({ depth: (u[2] + v2[2]) / 2, draw: d => {
            visibleTextures.forEach(({ tex, mode, mask, color: tint }) => {
            const draw = (image, rgb, alphaMode, additive, layer) => {
              // entity.fragment mixes overlayColor after texture tint and before lighting.
              // A split mask adds the overlay only once, on its base pass.
              const offset = layer ? null : overlay.slice(0, 3).map(v => v * overlayAlpha * shade);
              const args = [image.url, o, u, v2, st[0], st[1], st[2], [st[0], st[1], st[3], st[2]], filterOf(rgb.map(v => v * (1 - overlayAlpha)), alphaMode, color[3], offset), size];
              if (uvAnim) P.repeatTexture(d, ...args, additive ? "additive" : null);
              else d.texturedQuadMap(...args, null, additive ? "additive" : null);
            };
            if (mask) {
              // RGB is prepared as C*(1-A) and C*A. Only the base attenuates the
              // backdrop; the second pass adds its contribution at the same opacity.
              draw(tex, look.emissive ? color.slice(0, 3) : [shade, shade, shade], mode, look.additive);
              draw(mask, c, mode, true, true);
            } else draw(tex, tint ? tint.map(v => v * shade) : c, mode, look.additive);
            });
            if (look.glint && textures.length) {
              const args = [textures[0].tex.url, o, u, v2, st[0], st[1], st[2], [st[0], st[1], st[3], st[2]], null, size];
              const glint = { src: "/hbui/ponder/assets/glint_entity.png", scale: 0.16, time: Date.now() / 50, alpha: color[3] };
              if (uvAnim) P.repeatTexture(d, ...args, "additive", glint);
              else d.texturedQuadMap(...args, null, "additive", null, glint);
            }
          } });
        });
      });
    });
    equipment.forEach(e => {
      if (e.definition() && Object.keys(e.definition().geometry).length) out.push(...P.clientEntityItems(e, m, world, pt, blockPx, light));
      else if (e.slot === "mainhand" || e.slot === "offhand") {
        const bone = entity.boneTransforms.get(e.slot === "offhand" ? "leftitem" : "rightitem");
        if (!bone) return;
        let t = M.translate(M.mul(m, bone.matrix), ...bone.pivot);
        t = M.scale(M.rotZ(M.rotX(t, -90), 180), 8, 8, 8);
        const pos = M.apply(t, 0, 0, 0);
        out.push({ depth: pos[2], draw: d => (P.isBlockItem(e.stack.id) ? P.drawBlockCube : P.drawItemSprite)(d, t, e.stack, blockPx / 2) });
      }
    });
    parentVariables.forEach((value, key) => { if (value === undefined) delete anim.variables[key]; else anim.variables[key] = value; });
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
    if (entity.owner) {
      const bindings = [];
      g.bones.forEach((b, i) => {
        const name = b.binding ? entity.animator.eval(b.binding) : b.name;
        const inherited = entity.owner.boneTransforms.get(String(name).replace(/^'|'$/g, "").toLowerCase());
        // Binding places the attachable's (0, 24, 0) model origin at the item's bone.
        // Its children inherit that anchor; same-name armor bones keep the owner's pose.
        const binding = b.binding && inherited ? M.translate(inherited.matrix, inherited.pivot[0], inherited.pivot[1] - 24, inherited.pivot[2]) : b.parent >= 0 ? bindings[b.parent] : null;
        bindings[i] = binding;
        if (binding || inherited) out[i] = M.mul(binding || inherited.matrix, out[i]);
      });
    }
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
      this.variant = /:(slime|magma_cube)$/.test(type) ? 1 : 0;
      this.markVariant = this.skinId = 0;
      this.color = [1, 1, 1, 1];
      this.paddles = [false, false]; this.rowingTime = [0, 0]; this.rowingTimeO = [0, 0];
      this.lifeSpan = type === "minecraft:evocation_fang" ? 22 : 0;
      this.onGround = true;
      this.noGravity = false;
      this.halfWidth = 0.3; this.height = 1.8;
      this.walkSpeed = this.walkSpeedO = this.walkPosition = 0;
      this.flap = this.oFlap = this.flapSpeed = this.oFlapSpeed = 0;
      this.queries = {};
      this.equipment = new Map();
      this.attachments = new Map();
      const def = this.definition();
      this.updateDimensions();
      this.properties = Object.assign({}, def ? def.properties : {});
      this.extraAnimations = [];
      this.animator = new P.EntityAnimator(this);
    }
    updateDimensions() {
      const def = this.definition(), dimensions = def && def.dimensions || {}, baby = this.baby && dimensions.baby;
      const box = baby && baby.collision || def && ((def.variantCollisions || {})[this.variant] || def.collision), scale = baby ? baby.scale : dimensions.scale == null ? 1 : dimensions.scale;
      if (box) { this.halfWidth = box.width * scale / 2; this.height = box.height * scale; }
      else if (this.type === "minecraft:evocation_fang") { this.halfWidth = 0.25; this.height = 0.8; }
    }
    definition() {
      const def = P.entityData.entities[this.type];
      if (!def && !missingTypes.has(this.type)) { missingTypes.add(this.type); P.log("entity: no client definition for", this.type); }
      return def || null;
    }
    // A query by its name without "query." (lower case): a value, or fn(entity, args).
    setQuery(name, value) { this.queries[String(name).toLowerCase()] = value; return this; }
    setProperty(name, value) { this.properties[name] = value; return this; }
    setItemSlot(slot, stack) {
      slot = String(slot).toLowerCase().replace(/^slot\.(weapon|armor)\./, "");
      slot = ({ helmet: "head", chestplate: "chest", leggings: "legs", boots: "feet" })[slot] || slot;
      if (!/^(mainhand|offhand|head|chest|legs|feet|body)$/.test(slot)) throw new Error("Unknown equipment slot: " + slot);
      if (!stack || stack.count === 0) this.equipment.delete(slot);
      else this.equipment.set(slot, typeof stack === "string" ? P.itemStack(stack) : stack);
      this.attachments.delete(slot);
      return this;
    }
    getItemBySlot(slot) { return this.equipment.get(String(slot).toLowerCase()) || P.itemStack("minecraft:air", 0); }
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
      this.updateDimensions();
      this.rowingTimeO = this.rowingTime.slice();
      this.rowingTime = this.rowingTime.map((v, i) => this.paddles[i] ? v + Math.PI / 8 : 0);
      if (this.lifeSpan > 0 && this.tickCount >= this.lifeSpan) this.discard();
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
        const block = this.world.getBlock(x, y, z);
        if (P.liquidKind(block) === kind && y + P.liquidHeight(block, this.world.getBlock(x, y + 1, z)) > b[0][1] + 0.001) return true;
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
      const dimensions = def.dimensions || {}, nativeScale = this.baby && dimensions.baby ? dimensions.baby.scale : dimensions.scale == null ? 1 : dimensions.scale;
      const all = (s.scale != null ? a.eval(s.scale) : 1) * nativeScale;
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
      if (this.definition() && this.definition().renderer === "boat") return P.boatItems(this, base, pt, blockPx);
      const world = this.modelToScene(pt);
      return P.clientEntityItems(this, M.mul(base, world), world, pt, blockPx, 1);
    }
  }
  // Attachable models use the owner's posed bones, then their own animation. Unmodelled
  // held items use ItemModelGenerator at the existing rightItem/leftItem attachment point.
  function equipmentOf(owner, parentVariables) {
    const out = [];
    owner.equipment.forEach((stack, slot) => {
      let e = owner.attachments.get(slot);
      if (!e || e.stack !== stack) {
        const id = owner.type === "minecraft:player" && P.entityData.attachables[stack.id + ".player"] ? stack.id + ".player" : stack.id;
        e = Object.create(owner);
        e.owner = owner; e.type = "ponder:equipment/" + id; e.slot = slot; e.stack = stack;
        e.definition = () => P.entityData.attachables[id] || null;
        e.extraAnimations = []; e.queries = Object.assign({}, owner.queries);
        e.animator = new P.EntityAnimator(e);
        e.scaleOf = () => [1, 1, 1];
        owner.attachments.set(slot, e);
      }
      e.tickCount = owner.tickCount; e.queries = owner.queries;
      if (e.definition()) {
        const variables = e.animator.variables;
        variables["variable.is_enchanted"] = P.hasFoil(stack) ? 1 : 0;
        variables["variable.is_dyed"] = stack.color || stack.components && stack.components["minecraft:dyed_color"] != null ? 1 : 0;
        variables["variable.has_trim"] = 0;
        e.color = P.equipmentColor(stack);
        e.animator.begin(owner.animator.pt);
        const before = Object.assign({}, owner.animator.variables);
        owner.animator.run(e.definition().scripts.parent_setup);
        Object.keys(owner.animator.variables).forEach(key => {
          if (owner.animator.variables[key] !== before[key] && !parentVariables.has(key)) parentVariables.set(key, before[key]);
        });
      }
      out.push(e);
    });
    return out;
  }
  P.equipmentColor = stack => {
    const dye = stack.components && stack.components["minecraft:dyed_color"];
    return stack.color ? stack.color.slice(0, 3).concat(stack.color[3] == null ? 1 : stack.color[3]) : dye == null ? [1, 1, 1, 1] : P.rgb(typeof dye === "number" ? dye : dye.rgb).concat(1);
  };
  function equipmentLayers(entity) {
    const stack = entity.stack, components = stack.components || {}, table = P.entityData.equipment, layers = [];
    const trim = components["minecraft:trim"];
    // controller.render.armor.v2 uses the dedicated baby skin without an adult trim atlas.
    if (trim && !entity.animator.variables["variable.use_baby_geo"]) {
      const name = String(trim.pattern).replace(/^minecraft:/, "") + (entity.slot === "legs" ? "_leggings" : ""), variants = table.trims && table.trims[name];
      let material = String(trim.material).replace(/^minecraft:/, "");
      if (variants) {
        if (stack.id.startsWith("minecraft:" + material + "_") && variants[material + "_darker"]) material += "_darker";
        if (variants[material]) layers.push({ entry: variants[material] });
      }
    }
    if (stack.id === "minecraft:shield" && table.shield) {
      const base = components["minecraft:base_color"], patterns = components["minecraft:banner_patterns"] || [];
      const add = (name, color) => { if (table.shield[name]) layers.push({ entry: table.shield[name], color: P.dyeColors[P.dyeNames.indexOf(color)] || P.dyeColors[0] }); };
      if (base || patterns.length) { add("base", base || "white"); patterns.slice(0, 16).forEach(p => add(String(p.pattern).replace(/^minecraft:/, ""), p.color)); }
    }
    return layers;
  }
  P.EquipmentSlot = { MAINHAND: "mainhand", OFFHAND: "offhand", HEAD: "head", CHEST: "chest", LEGS: "legs", FEET: "feet", BODY: "body" };
  P.ClientEntity = ClientEntity;
})();
