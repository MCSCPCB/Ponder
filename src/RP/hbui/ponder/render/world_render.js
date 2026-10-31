// WorldSectionElementImpl rendering: the blocks of each visible section, every face drawn as
// a texture under the scene's orthographic transform. Faces facing a full block of the same
// section are culled (PonderLevel masks the world to the section), faces turned away are not
// drawn, and blocks are drawn far to near across all sections (painter's algorithm).
(function () {
  const P = window.Ponder, M = P.Mat;
  const DIRS = { up: [0, 1, 0], down: [0, -1, 0], north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0] };

  // LightTexture at block light `l` (sky 0, gamma 0), relative to full light: a section is
  // drawn at light lerp(fade, 5, 15) while it fades in.
  const curve = l => { const f = l / 15, b = f / (4 - 3 * f), g = 1 - Math.pow(1 - b, 4); return 0.04 + 0.96 * P.lerp(0.5, b, g); };
  const lightFromFade = (P.lightFromFade = fade => (fade === 1 ? 1 : curve(P.int(P.lerp(fade, 5, 15))) / curve(15)));

  // The section's transform: the scene's, then the fade-in offset and its animated transform.
  function sectionMatrix(scene, e, pt) {
    let m = scene.transform.matrix(pt);
    const fade = e.fade.getValue(pt);
    if (e.fadeVec) m = M.translate(m, e.fadeVec[0] * (fade - 1), e.fadeVec[1] * (fade - 1), e.fadeVec[2] * (fade - 1));
    return e.transform(m, pt);
  }

  // The faces of the section's blocks (a model's quads) that are not against a full block of the
  // section, and the liquids' faces, made with the section's blocks round them.
  function blocksOf(world, e) {
    if (e.built && e.builtVersion === e.version && e.builtWorldVersion === world.blockVersion) return e.built;
    const out = [], has = (x, y, z) => e.section.has(x, y, z);
    e.section.keys.forEach(k => {
      const p = k.split(",").map(Number), block = P.withDustJoins(world, p[0], p[1], p[2], world.getBlock(p[0], p[1], p[2]));
      if (!block) return;
      const model = P.blockModel(block);
      // Whether the neighbour on side f hides this block's face there.
      const hidden = f => {
        const d = DIRS[f], nx = p[0] + d[0], ny = p[1] + d[1], nz = p[2] + d[2];
        const other = has(nx, ny, nz) && world.getBlock(nx, ny, nz);
        if (!other) return false;
        const om = P.blockModel(other);
        return om.full && (om.opaque || om.id === model.id);
      };
      const around = (dx, dy, dz) => (has(p[0] + dx, p[1] + dy, p[2] + dz) ? world.getBlock(p[0] + dx, p[1] + dy, p[2] + dz) : null);
      if (model.shape === "liquid") {
        const quads = P.liquidQuads(block, around);
        if (quads.length) out.push({ p, model, quads });
        return;
      }
      if (model.shape === "model") {
        const quads = model.quads.filter(q => !q.cull || !hidden(q.cull)).map(q => {
          if (!q.look.tex.ao || q.look.tex.alpha < 1 || q.look.dim === false || luminous(block)) return q;
          return Object.assign({}, q, { ao: P.ambientOcclusion(q, around) });
        });
        const entity = world.getBlockEntity(p);
        if (quads.length || model.moving || entity) out.push({ p, offset: P.blockOffset(block, p), model, quads, entity });
      } else {
        const faces = model.shape === "wire" ? [["up", P.WIRE_FACE]] : Object.keys(DIRS).filter(f => !hidden(f)).map(f => [f, P.FACES[f]]);
        const entity = world.getBlockEntity(p);
        if (faces.length || entity) out.push({ p, model, faces, entity, ao: luminous(block) ? null : faces.map(f => P.ambientOcclusion(f[1], around)) });
      }
      // The water in a waterlogged block, over it.
      const liquid = P.liquidOf(block);
      if (liquid) {
        const quads = P.liquidQuads(liquid, around);
        if (quads.length) out.push({ p, model: P.blockModel(liquid), quads });
      }
    });
    e.built = out;
    e.builtVersion = e.version;
    e.builtWorldVersion = world.blockVersion;
    return out;
  }

  const luminous = block => P.blockLighting(block)[5] > 0;
  // ModelBlockRenderer.AmbientOcclusionFace: the two edge neighbours and their diagonal
  // contribute to each corner. Partial faces interpolate those four cell-corner values.
  P.ambientOcclusion = function (q, around) {
    const axis = [0, 1, 2].reduce((a, i) => Math.abs(q.n[i]) > Math.abs(q.n[a]) ? i : a, 0), axes = [0, 1, 2].filter(i => i !== axis);
    const sign = q.n[axis] < 0 ? -1 : 1, base = [0, 0, 0];
    const points = [q.o, q.u, q.u.map((v, i) => v + q.v[i] - q.o[i]), q.v];
    const self = around(0, 0, 0), full = P.blockLighting(self)[3];
    if (points.every(p => p[axis] === points[0][axis]) && (full || (sign > 0 ? points[0][axis] > 0.9999 : points[0][axis] < 0.0001))) base[axis] = sign;
    const sample = p => P.blockLighting(around(...p))[0];
    const blocksView = p => { const next = p.slice(); next[axis] += sign; const light = P.blockLighting(around(...next)); return light[2] && light[1] !== 0; };
    // AdjacencyInfo's first edge supplies the diagonal when both outward cells block it.
    const first = axis === 0 ? [0, sign > 0 ? -1 : 1, 0] : axis === 1 ? [sign, 0, 0] : sign > 0 ? [-1, 0, 0] : [0, 1, 0];
    const fallback = sample(base.map((v, i) => v + first[i])), center = sample(base), corners = [];
    for (let v = 0; v < 2; v++) for (let u = 0; u < 2; u++) {
      const a = base.slice(), b = base.slice(), c = base.slice();
      a[axes[0]] += u ? 1 : -1; b[axes[1]] += v ? 1 : -1;
      c[axes[0]] = a[axes[0]]; c[axes[1]] = b[axes[1]];
      const x = sample(a), y = sample(b), diagonal = blocksView(a) && blocksView(b) ? fallback : sample(c);
      corners.push((center + x + y + diagonal) / 4);
    }
    return points.map(p => P.lerp(P.clamp(p[axes[1]], 0, 1), P.lerp(P.clamp(p[axes[0]], 0, 1), corners[0], corners[1]), P.lerp(P.clamp(p[axes[0]], 0, 1), corners[2], corners[3])));
  };

  // The colour matrix a face is drawn with: its shade, its model's tint (redstone dust) and its
  // texture's (P.textureOf: plains' grass, foliage, water), with the texture's alpha.
  const filterOf = (shade, tint, tex) => {
    const t = tex && tex.tint, a = tex ? tex.alpha : 1;
    const c = [0, 1, 2].map(i => (tint ? tint[i] : 1) * (t ? t[i] : 1) * shade);
    if (c.every(v => v > 0.995) && a > 0.995) return null;
    return `coh-color-matrix(${c[0].toFixed(3)}, 0, 0, 0, 0, 0, ${c[1].toFixed(3)}, 0, 0, 0, 0, 0, ${c[2].toFixed(3)}, 0, 0, 0, 0, 0, ${a.toFixed(3)}, 0)`;
  };
  // Faces meet at their actual shared edges. Extending each face beyond them exposes thin
  // strips of the adjoining faces when depth sorting, making the block look like stacked shells.
  const corners = (m, p, face) => [face.o, face.u, face.v].map(c => M.apply(m, p[0] + c[0], p[1] + c[1], p[2] + c[2]));
  // Whether a face with outward normal `n` faces the viewer (GUI z grows towards the screen).
  const facing = (m, n) => m[8] * n[0] + m[9] * n[1] + m[10] * n[2] > 0;

  P.renderWorldSections = function (d, scene, pt) {
    const items = [];
    scene.forEachVisible(P.WorldSectionElement, e => {
      if (e.isEmpty()) return;
      const m = sectionMatrix(scene, e, pt), light = lightFromFade(e.fade.getValue(pt));
      blocksOf(scene.world, e).forEach(b => {
        const c = M.apply(m, b.p[0] + 0.5, b.p[1] + 0.5, b.p[2] + 0.5);
        items.push({ m, b, depth: c[2], light });
      });
      if (e.selectedBlock) scene.selection = { m, p: e.selectedBlock };
    });
    P.particleItems(scene, pt).forEach(p => items.push(p));
    P.entityItems(scene, pt).forEach(p => items.push(p));
    const blockPx = 30 * scene.scaleFactor, size = Math.max(16, Math.round(blockPx * P.view.cssPerGui));
    // Scene elements drawing an entity (createBirb, createCart): renderItems(scene, sceneMatrix, pt, blockPx).
    const base = scene.transform.matrix(pt);
    scene.elements.forEach(e => { if (e.visible && e.renderItems) e.renderItems(scene, base, pt, blockPx).forEach(p => items.push(p)); });
    items.sort((a, b) => a.depth - b.depth);
    const breaking = scene.world.breaking, ticks = animationTicks();
    items.forEach(it => {
      if (it.draw) { it.draw(d); return; }
      // renderBreakingTexture: destroy_stage_<progress> over the block's faces.
      const stage = breaking.get(P.blockKey(it.b.p[0], it.b.p[1], it.b.p[2]));
      if (it.b.entity && P.drawBlockEntity(d, it.b.entity, M.translate(it.m, ...it.b.p), pt, it.light, size, ticks, it.b.model, it.b.quads)) return;
      if (it.b.quads) {
        // A model with a moving part (a banner's flag) adds that part's quads for this frame.
        const quads = it.b.model.moving ? it.b.quads.concat(it.b.model.moving(ticks, it.b.p)) : it.b.quads;
        const pos = it.b.p.map((v, i) => v + (it.b.offset ? it.b.offset[i] : 0));
        drawQuads(d, M.translate(it.m, ...pos), quads, it.light, size, stage, it.b.model.tint, ticks);
        return;
      }
      it.b.faces.forEach((f, i) => {
        const face = f[1];
        if (!facing(it.m, face.n)) return;
        const c = corners(it.m, it.b.p, face);
        const src = it.b.model.faces[f[0]], tex = P.textureAt(src);
        shadeImage(d, src, c[0], c[1], c[2], [0, 0], [1, 0], [0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]], filterOf(P.SHADE[f[0]] * it.light, it.b.model.tint), size, null, tex && tex.ao && it.b.ao ? it.b.ao[i] : null);
        if (stage != null) d.texturedQuad(destroyStage(stage), c[0], c[1], c[2], null, size);
      });
    });
  };
  const destroyStage = stage => `pack://textures/environment/destroy_stage_${stage}.png?filtering=point`;
  // The ticks animated textures step by: 20 a second, as the game runs them.
  const animationTicks = () => Date.now() / 50;

  function shadeImage(d, src, o, u, v, a, b, c, clip, filter, size, tile, ao, water) {
    if (!ao || ao.every(n => n > 0.9999)) { d.texturedQuadMap(src, o, u, v, a, b, c, clip, filter, size, tile, null, null, null, water); return; }
    const triangles = clip.length === 3 ? [[0, 1, 2]] : [[0, 1, 2], [0, 2, 3]];
    triangles.forEach(indices => {
      const points = indices.map(i => clip[i]), values = indices.map(i => 1 - ao[i]);
      const [p, q, r] = points, x = q[0] - p[0], y = q[1] - p[1], z = r[0] - p[0], w = r[1] - p[1], det = x * w - y * z;
      if (Math.abs(det) < 1e-10) return;
      const dx = ((values[1] - values[0]) * w - (values[2] - values[0]) * y) / det;
      const dy = ((values[2] - values[0]) * x - (values[1] - values[0]) * z) / det;
      d.texturedQuadMap(src, o, u, v, a, b, c, points, filter, size, tile, null, [values[0] - dx * p[0] - dy * p[1], dx, dy]);
    });
  }

  // A model's quads under matrix m (block space), far to near, each showing its texture's piece
  // at `ticks` (P.quadImage) with the texture's tint, and an overlay's image under it untinted.
  // Two-sided ones show from behind too; a look with `tint` takes the model's, one with
  // `color` [r, g, b] its own (a bed's or banner's dye).
  function drawQuads(d, m, quads, light, size, stage, tint, ticks, foil) {
    const list = [];
    quads.forEach(q => {
      if (!q.twoSided && !facing(m, q.n)) return;
      const o = M.apply(m, ...q.o), u = M.apply(m, ...q.u), v = M.apply(m, ...q.v);
      // A triangle's centre, else the parallelogram's.
      list.push({ q, o, u, v, depth: q.uvs && q.uvs.length === 3 ? (o[2] + u[2] + v[2]) / 3 : (u[2] + v[2]) / 2, i: list.length });
    });
    // Quads at one depth (a banner's flag and its patterns) keep their order.
    list.sort((a, b) => a.depth - b.depth || a.i - b.i);
    list.forEach(it => {
      const img = P.quadImage(it.q, ticks), l = it.q.look, tex = l.tex, shade = it.q.shade * light;
      if (tex.under) shadeImage(d, tex.under.url, it.o, it.u, it.v, img.a, img.b, img.c, img.clip, filterOf(shade, null, null), size, img.tile, it.q.ao);
      shadeImage(d, img.src, it.o, it.u, it.v, img.a, img.b, img.c, img.clip, filterOf(shade, l.color || (l.tint ? tint : null), tex), size, img.tile, it.q.ao, l.water);
      if (foil) d.texturedQuadMap(img.src, it.o, it.u, it.v, img.a, img.b, img.c, img.clip, null, size, img.tile, "additive", null,
        { src: "/hbui/ponder/assets/glint_item.png", scale: 8, time: ticks });
      if (stage != null) d.texturedQuad(destroyStage(stage), it.o, it.u, it.v, null, size);
    });
  }

  P.drawModelQuads = drawQuads;

  // ItemEntityRenderer.render + renderMultipleFromCount (1.21.1). The ground display transforms
  // are vanilla's: block.json translation (0, 3, 0) px, scale 0.25; item/generated.json
  // translation (0, 2, 0) px, scale 0.5. A flat item is one sprite of 1/16 thickness; its copies
  // step 0.09375 * scale along Z, a block's are spread by ±0.15 on all axes.
  P.entityItems = function (scene, pt) {
    const base = scene.transform.matrix(pt), blockPx = 30 * scene.scaleFactor, out = [];
    scene.world.entityList().forEach(e => {
      if (!e.alive) return;
      // Any other entity draws itself: render(sceneMatrix, pt, blockPx) returns { depth, draw(d) } items.
      if (!(e instanceof P.ItemEntity)) { if (e.render) e.render(base, pt, blockPx).forEach(it => out.push(it)); return; }
      const block = P.isBlockItem(e.item.id), ground = P.itemGroundModel(e.item.id) || { scale: block ? [0.25, 0.25, 0.25] : [0.5, 0.5, 0.5], rotation: [0, 0, 0], translation: [0, block ? 3 : 2, 0] };
      const scale = Math.max(...ground.scale);
      const pose = P.itemEntityPose(e, pt), n = P.renderedItemAmount(e.item.count);
      let m = M.translate(base, P.lerp(pt, e.xo, e.x), P.lerp(pt, e.yo, e.y) + pose.bob + 0.25 * ground.scale[1], P.lerp(pt, e.zo, e.z));
      m = M.rotY(m, pose.spin);
      if (!block) m = M.translate(m, 0, 0, -0.09375 * (n - 1) * 0.5 * scale);
      const random = P.seededRandom(P.itemSeed(e.item.id));
      for (let i = 0; i < n; i++) {
        let t = m;
        if (i > 0) {
          if (block) t = M.translate(t, (random.nextFloat() * 2 - 1) * 0.15, (random.nextFloat() * 2 - 1) * 0.15, (random.nextFloat() * 2 - 1) * 0.15);
          else t = M.translate(t, (random.nextFloat() * 2 - 1) * 0.15 * 0.5, (random.nextFloat() * 2 - 1) * 0.15 * 0.5, 0);
        }
        // The model's ground transform: translate, then scale about the model's centre.
        t = M.translate(t, ...ground.translation.map(v => v / 16));
        t = M.scale(M.rotZ(M.rotY(M.rotX(t, ground.rotation[0]), ground.rotation[1]), ground.rotation[2]), ...ground.scale);
        const centre = M.apply(t, 0, 0, 0);
        const draw = block ? d => drawCube(d, t, e.item, blockPx * scale) : d => drawFlat(d, t, e.item, blockPx * scale);
        out.push({ depth: centre[2], draw });
        if (!block) m = M.translate(m, 0, 0, 0.09375 * scale);
      }
    });
    return out;
  };
  // A block item: its block's six faces around the origin, shaded like the world's.
  function drawCube(d, m, id, px) {
    const foil = P.hasFoil(id);
    const size = Math.max(16, Math.round(px * P.view.cssPerGui));
    if (P.drawBlockEntityItem && P.drawBlockEntityItem(d, m, id, size, animationTicks())) return;
    if (typeof id === "object") id = P.block(id.id, id.states, id);
    if (id === "minecraft:banner") id = "minecraft:standing_banner";
    const model = P.blockModel(id);
    const c = M.translate(m, -0.5, -0.5, -0.5);
    if (model.quads) {
      const ticks = animationTicks(), quads = model.moving ? model.quads.concat(model.moving(ticks, [0, 0, 0])) : model.quads;
      drawQuads(d, c, quads, 1, size, null, model.tint, ticks, foil);
      return;
    }
    Object.keys(P.FACES).forEach(f => {
      const face = P.FACES[f];
      if (!facing(c, face.n)) return;
      const q = corners(c, [0, 0, 0], face);
      d.texturedQuad(model.faces[f], q[0], q[1], q[2], filterOf(P.SHADE[f], model.tint), size);
      if (foil) d.texturedQuadMap(model.faces[f], q[0], q[1], q[2], [0, 0], [1, 0], [0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]], null, size, null, "additive", null,
        { src: "/hbui/ponder/assets/glint_item.png", scale: 8, time: animationTicks() });
    });
  }
  // ItemModelGenerator: front/back at 7.5/16 and 8.5/16, joined along sprite alpha spans.
  const itemModels = new Map();
  function drawFlat(d, m, id, px) {
    const foil = P.hasFoil(id), stack = id;
    if (typeof id === "object") id = id.id;
    const size = Math.max(16, Math.round(px * P.view.cssPerGui));
    const layers = P.vanilla.client && P.vanilla.client.layers[id] || [P.addonItems.get(id) || P.vanilla.items && P.vanilla.items[id]];
    layers.forEach((sprite, layer) => {
      const color = P.itemTint(stack, layer);
      if (!color) return;
      const key = id + "@" + size + ":" + layer;
      if (!itemModels.has(key)) {
        const lo = [-0.5, -0.5, -1 / 32], hi = [0.5, 0.5, 1 / 32];
        const quads = [], look = { tex: sprite && sprite.texture ? P.textureOf(sprite.texture) : { url: P.itemIcon(id, size), w: 16, h: 16, frames: 1, alpha: 1 }, dim: true, solid: false, tint: true };
        P.blockBox(quads, M.id(), lo, hi, "south", [0, 0, 1, 1], look);
        P.blockBox(quads, M.id(), lo, hi, "north", [1, 0, 0, 1], look);
        if (sprite && sprite.edges) sprite.edges.forEach(([edge, row, start, end]) => {
          const w = sprite.w, h = sprite.h;
          if (edge === "up" || edge === "down") {
            const y = 0.5 - (row + (edge === "down" ? 1 : 0)) / h;
            P.blockBox(quads, M.id(), [start / w - 0.5, y, -1 / 32], [end / w - 0.5, y, 1 / 32], edge,
              [start / w, (row + 0.01) / h, end / w, (row + 0.99) / h], look);
          } else {
            const x = (row + (edge === "right" ? 1 : 0)) / w - 0.5;
            P.blockBox(quads, M.id(), [x, 0.5 - end / h, -1 / 32], [x, 0.5 - start / h, 1 / 32], edge === "right" ? "east" : "west",
              [(row + 0.01) / w, start / h, (row + 0.99) / w, end / h], look);
          }
        });
        itemModels.set(key, quads);
      }
      drawQuads(d, m, itemModels.get(key), 1, size, null, color, animationTicks(), foil);
    });
  }

  // For entities that draw themselves: a block's cube or an item's icon about matrix m's origin.
  P.drawBlockCube = drawCube;
  P.drawItemSprite = drawFlat;

  // renderLast: the outline of the block identify mode points at (AABBOutline, colour 0xefefef).
  P.renderSelection = function (d, scene) {
    const s = scene.selection;
    scene.selection = null;
    if (!s) return;
    const c = [0xef, 0xef, 0xef, 255], width = Math.max(1 / 64 * 30 * scene.scaleFactor, 1 / P.view.cssPerGui);
    const block = scene.world.getBlock(...s.p), offset = P.blockOffset(block, s.p);
    const bounds = P.blockBounds(P.blockModel(block));
    if (!bounds) return;
    Object.keys(P.FACES).forEach(f => {
      const face = P.FACES[f];
      if (!facing(s.m, face.n)) return;
      const p = s.p, pt = (a) => M.apply(s.m, ...a.map((v, i) => p[i] + offset[i] + bounds[0][i] + v * (bounds[1][i] - bounds[0][i])));
      const o = face.o, du = [face.u[0] - o[0], face.u[1] - o[1], face.u[2] - o[2]], dv = [face.v[0] - o[0], face.v[1] - o[1], face.v[2] - o[2]];
      const q = [o, [o[0] + du[0], o[1] + du[1], o[2] + du[2]], [o[0] + du[0] + dv[0], o[1] + du[1] + dv[1], o[2] + du[2] + dv[2]], [o[0] + dv[0], o[1] + dv[1], o[2] + dv[2]]].map(pt);
      for (let i = 0; i < 4; i++) d.line(q[i], q[(i + 1) % 4], width, c);
    });
  };

  // WorldSectionElement.rayTrace: the first block of a visible section along from -> to
  // (scene space), stepping through the grid. Returns { pos, block, distance } or null.
  P.rayTraceSections = function (scene, from, to) {
    let best = null;
    scene.forEachVisible(P.WorldSectionElement, e => {
      e.selectedBlock = null;
      if (e.isEmpty()) return;
      // reverseTransformVec
      const a = e.reverseTransformVec(from, 1), b = e.reverseTransformVec(to, 1);
      // A liquid has no outline to hit (LiquidBlock.getShape).
      const hit = traverse(a, b, (x, y, z) => {
        const block = e.section.has(x, y, z) && scene.world.getBlock(x, y, z);
        if (!block) return null;
        const p = [x, y, z].map((v, i) => v + P.blockOffset(block, [x, y, z])[i]);
        return P.clipBlock(P.blockModel(block), a.map((v, i) => v - p[i]), b.map((v, i) => v - p[i]));
      });
      if (!hit) return;
      const dist = Math.hypot(hit.at[0] - a[0], hit.at[1] - a[1], hit.at[2] - a[2]);
      if (!best || dist < best.distance) best = { element: e, pos: hit.pos, block: scene.world.getBlock(hit.pos[0], hit.pos[1], hit.pos[2]), distance: dist };
    });
    return best;
  };
  // Amanatides & Woo grid traversal.
  function traverse(a, b, solid) {
    const dir = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], cell = a.map(Math.floor);
    const step = dir.map(v => (v > 0 ? 1 : v < 0 ? -1 : 0));
    const tDelta = dir.map(v => (v !== 0 ? Math.abs(1 / v) : Infinity));
    const tMax = dir.map((v, i) => (v > 0 ? (cell[i] + 1 - a[i]) / v : v < 0 ? (a[i] - cell[i]) / -v : Infinity));
    let t = 0, best = null;
    for (let n = 0; n < 512 && t <= 1; n++) {
      const hit = solid(cell[0], cell[1], cell[2]);
      if (hit != null && (!best || hit < best.t)) best = { pos: cell.slice(), at: a.map((v, i) => v + dir[i] * hit), t: hit };
      const i = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
      t = tMax[i];
      if (best && best.t <= t) return best;
      cell[i] += step[i];
      tMax[i] += tDelta[i];
    }
    return best;
  }
})();
