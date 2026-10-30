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
    if (e.built && e.builtVersion === e.version) return e.built;
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
        const quads = model.quads.filter(q => !q.cull || !hidden(q.cull));
        if (quads.length || model.moving) out.push({ p, model, quads });
      } else {
        const faces = model.shape === "wire" ? [["up", P.WIRE_FACE]] : Object.keys(DIRS).filter(f => !hidden(f)).map(f => [f, P.FACES[f]]);
        if (faces.length) out.push({ p, model, faces });
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
    return out;
  }

  // The colour matrix a face is drawn with: its shade, its model's tint (redstone dust) and its
  // texture's (P.textureOf: plains' grass, foliage, water), with the texture's alpha.
  const filterOf = (shade, tint, tex) => {
    const t = tex && tex.tint, a = tex ? tex.alpha : 1;
    const c = [0, 1, 2].map(i => (tint ? tint[i] : 1) * (t ? t[i] : 1) * shade);
    if (c.every(v => v > 0.995) && a > 0.995) return null;
    return `coh-color-matrix(${c[0].toFixed(3)}, 0, 0, 0, 0, 0, ${c[1].toFixed(3)}, 0, 0, 0, 0, 0, ${c[2].toFixed(3)}, 0, 0, 0, 0, 0, ${a.toFixed(3)}, 0)`;
  };
  // A face's three texture corners on screen, pushed out by `grow` blocks to close seams.
  function corners(m, p, face, grow) {
    const at = (c, du, dv) => {
      const x = p[0] + c[0] + du * (face.u[0] - face.o[0]) + dv * (face.v[0] - face.o[0]);
      const y = p[1] + c[1] + du * (face.u[1] - face.o[1]) + dv * (face.v[1] - face.o[1]);
      const z = p[2] + c[2] + du * (face.u[2] - face.o[2]) + dv * (face.v[2] - face.o[2]);
      return M.apply(m, x, y, z);
    };
    const g = grow, o = face.o;
    return [at(o, -g, -g), at(o, 1 + g, -g), at(o, -g, 1 + g)];
  }
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
    // About half a GUI pixel of overlap between neighbouring faces at 30 px per block.
    const blockPx = 30 * scene.scaleFactor, grow = 0.6 / blockPx, size = Math.max(16, Math.round(blockPx * P.view.cssPerGui));
    // Scene elements drawing an entity (createBirb, createCart): renderItems(scene, sceneMatrix, pt, blockPx).
    const base = scene.transform.matrix(pt);
    scene.elements.forEach(e => { if (e.visible && e.renderItems) e.renderItems(scene, base, pt, blockPx).forEach(p => items.push(p)); });
    items.sort((a, b) => a.depth - b.depth);
    const breaking = scene.world.breaking, ticks = animationTicks();
    items.forEach(it => {
      if (it.draw) { it.draw(d); return; }
      // renderBreakingTexture: destroy_stage_<progress> over the block's faces.
      const stage = breaking.get(P.blockKey(it.b.p[0], it.b.p[1], it.b.p[2]));
      if (it.b.quads) {
        // A model with a moving part (a banner's flag) adds that part's quads for this frame.
        const quads = it.b.model.moving ? it.b.quads.concat(it.b.model.moving(ticks, it.b.p)) : it.b.quads;
        drawQuads(d, M.translate(it.m, it.b.p[0], it.b.p[1], it.b.p[2]), quads, it.light, grow, size, stage, it.b.model.tint, ticks);
        return;
      }
      it.b.faces.forEach(f => {
        const face = f[1];
        if (!facing(it.m, face.n)) return;
        const c = corners(it.m, it.b.p, face, it.b.model.opaque ? grow : 0);
        d.texturedQuad(it.b.model.faces[f[0]], c[0], c[1], c[2], filterOf(P.SHADE[f[0]] * it.light, it.b.model.tint), size);
        if (stage != null) d.texturedQuad(destroyStage(stage), c[0], c[1], c[2], null, size);
      });
    });
  };
  const destroyStage = stage => `pack://textures/environment/destroy_stage_${stage}.png?filtering=point`;
  // The ticks animated textures step by: 20 a second, as the game runs them.
  const animationTicks = () => Date.now() / 50;

  // A model's quads under matrix m (block space), far to near, each showing its texture's piece
  // at `ticks` (P.quadImage) with the texture's tint, and an overlay's image under it untinted.
  // Solid ones are pushed out by `grow` blocks along their edges to close seams; two-sided ones
  // show from behind too; a look with `tint` takes the model's, one with `color` [r, g, b] its own
  // (a bed's or banner's dye).
  function drawQuads(d, m, quads, light, grow, size, stage, tint, ticks) {
    const list = [];
    quads.forEach(q => {
      if (!q.twoSided && !facing(m, q.n)) return;
      const g = q.solid ? grow : 0, eu = q.eu, ev = q.ev;
      const at = (p, su, sv) => M.apply(m, p[0] + (eu[0] * su + ev[0] * sv) * g, p[1] + (eu[1] * su + ev[1] * sv) * g, p[2] + (eu[2] * su + ev[2] * sv) * g);
      const o = at(q.o, -1, -1), u = at(q.u, 1, -1), v = at(q.v, -1, 1);
      // A triangle's centre, else the parallelogram's.
      list.push({ q, o, u, v, depth: q.uvs && q.uvs.length === 3 ? (o[2] + u[2] + v[2]) / 3 : (u[2] + v[2]) / 2, i: list.length });
    });
    // Quads at one depth (a banner's flag and its patterns) keep their order.
    list.sort((a, b) => a.depth - b.depth || a.i - b.i);
    list.forEach(it => {
      const img = P.quadImage(it.q, ticks), l = it.q.look, tex = l.tex, shade = it.q.shade * light;
      if (tex.under) d.texturedQuadMap(tex.under.url, it.o, it.u, it.v, img.a, img.b, img.c, img.clip, filterOf(shade, null, null), size);
      d.texturedQuadMap(img.src, it.o, it.u, it.v, img.a, img.b, img.c, img.clip, filterOf(shade, l.color || (l.tint ? tint : null), tex), size);
      if (stage != null) d.texturedQuad(destroyStage(stage), it.o, it.u, it.v, null, size);
    });
  }

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
      const block = P.isBlockItem(e.item.id), scale = block ? 0.25 : 0.5, lift = (block ? 3 : 2) / 16;
      const pose = P.itemEntityPose(e, pt), n = P.renderedItemAmount(e.item.count);
      let m = M.translate(base, P.lerp(pt, e.xo, e.x), P.lerp(pt, e.yo, e.y) + pose.bob + 0.25 * scale, P.lerp(pt, e.zo, e.z));
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
        t = M.scale(M.translate(t, 0, lift, 0), scale, scale, scale);
        const centre = M.apply(t, 0, 0, 0);
        const draw = block ? d => drawCube(d, t, e.item.id, blockPx * scale) : d => drawFlat(d, t, e.item.id, blockPx * scale);
        out.push({ depth: centre[2], draw });
        if (!block) m = M.translate(m, 0, 0, 0.09375 * scale);
      }
    });
    return out;
  };
  // A block item: its block's six faces around the origin, shaded like the world's.
  function drawCube(d, m, id, px) {
    const model = P.blockModel(id), size = Math.max(16, Math.round(px * P.view.cssPerGui));
    const c = M.translate(m, -0.5, -0.5, -0.5);
    if (model.quads) {
      const ticks = animationTicks(), quads = model.moving ? model.quads.concat(model.moving(ticks, [0, 0, 0])) : model.quads;
      drawQuads(d, c, quads, 1, 0, size, null, model.tint, ticks);
      return;
    }
    Object.keys(P.FACES).forEach(f => {
      const face = P.FACES[f];
      if (!facing(c, face.n)) return;
      const q = corners(c, [0, 0, 0], face, 0);
      d.texturedQuad(model.faces[f], q[0], q[1], q[2], filterOf(P.SHADE[f], model.tint), size);
    });
  }
  // A flat item: its icon on a unit quad in the XY plane, seen from either side.
  function drawFlat(d, m, id, px) {
    const size = Math.max(16, Math.round(px * P.view.cssPerGui));
    const o = M.apply(m, -0.5, 0.5, 0), u = M.apply(m, 0.5, 0.5, 0), v = M.apply(m, -0.5, -0.5, 0);
    d.texturedQuad(P.itemIcon(id, size), o, u, v, null, size);
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
    Object.keys(P.FACES).forEach(f => {
      const face = P.FACES[f];
      if (!facing(s.m, face.n)) return;
      const p = s.p, pt = (a) => M.apply(s.m, p[0] + a[0], p[1] + a[1], p[2] + a[2]);
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
      const inv = M.invert(e.transform(M.id(), 1)), a = M.apply(inv, from[0], from[1], from[2]), b = M.apply(inv, to[0], to[1], to[2]);
      // A liquid has no outline to hit (LiquidBlock.getShape).
      const hit = traverse(a, b, (x, y, z) => {
        const block = e.section.has(x, y, z) && scene.world.getBlock(x, y, z);
        return !!block && P.blockModel(block).shape !== "liquid";
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
    let t = 0;
    for (let n = 0; n < 512 && t <= 1; n++) {
      if (solid(cell[0], cell[1], cell[2])) return { pos: cell.slice(), at: [a[0] + dir[0] * t, a[1] + dir[1] * t, a[2] + dir[2] * t] };
      const i = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
      t = tMax[i];
      cell[i] += step[i];
      tMax[i] += tDelta[i];
    }
    return null;
  }
})();
