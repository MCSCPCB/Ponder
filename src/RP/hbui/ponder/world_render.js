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
  const lightFromFade = fade => (fade === 1 ? 1 : curve(P.int(P.lerp(fade, 5, 15))) / curve(15));

  // The section's transform: the scene's, then the fade-in offset and its animated offset.
  function sectionMatrix(scene, e, pt) {
    let m = scene.transform.matrix(pt);
    const fade = e.fade.getValue(pt);
    if (e.fadeVec) m = M.translate(m, e.fadeVec[0] * (fade - 1), e.fadeVec[1] * (fade - 1), e.fadeVec[2] * (fade - 1));
    const a = e.prevAnimatedOffset, b = e.animatedOffset;
    return M.translate(m, P.lerp(pt, a[0], b[0]), P.lerp(pt, a[1], b[1]), P.lerp(pt, a[2], b[2]));
  }

  // The faces of the section's blocks that are not against a full block of the section.
  function blocksOf(world, e) {
    if (e.built && e.builtVersion === e.version) return e.built;
    const out = [], has = (x, y, z) => e.section.has(x, y, z);
    e.section.keys.forEach(k => {
      const p = k.split(",").map(Number), block = world.getBlock(p[0], p[1], p[2]);
      if (!block) return;
      const model = P.blockModel(block), faces = [];
      if (model.shape === "wire") faces.push(["up", P.WIRE_FACE]);
      else Object.keys(DIRS).forEach(f => {
        const d = DIRS[f], nx = p[0] + d[0], ny = p[1] + d[1], nz = p[2] + d[2];
        const other = has(nx, ny, nz) && world.getBlock(nx, ny, nz);
        if (other) {
          const om = P.blockModel(other);
          if (om.shape === "cube" && (om.opaque || om.id === model.id)) return;
        }
        faces.push([f, P.FACES[f]]);
      });
      if (faces.length) out.push({ p, model, faces });
    });
    e.built = out;
    e.builtVersion = e.version;
    return out;
  }

  const filterOf = (shade, tint) => {
    const r = (tint ? tint[0] : 1) * shade, g = (tint ? tint[1] : 1) * shade, b = (tint ? tint[2] : 1) * shade;
    if (r > 0.995 && g > 0.995 && b > 0.995) return null;
    return `coh-color-matrix(${r.toFixed(3)}, 0, 0, 0, 0, 0, ${g.toFixed(3)}, 0, 0, 0, 0, 0, ${b.toFixed(3)}, 0, 0, 0, 0, 0, 1, 0)`;
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
    items.sort((a, b) => a.depth - b.depth);
    // About half a GUI pixel of overlap between neighbouring faces at 30 px per block.
    const blockPx = 30 * scene.scaleFactor, grow = 0.6 / blockPx, size = Math.max(16, Math.round(blockPx * P.view.cssPerGui));
    items.forEach(it => it.b.faces.forEach(f => {
      const face = f[1];
      if (!facing(it.m, face.n)) return;
      const c = corners(it.m, it.b.p, face, it.b.model.opaque ? grow : 0);
      d.texturedQuad(it.b.model.faces[f[0]], c[0], c[1], c[2], filterOf(P.SHADE[f[0]] * it.light, it.b.model.tint), size);
    }));
  };

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
      const off = e.animatedOffset, a = from.map((v, i) => v - off[i]), b = to.map((v, i) => v - off[i]);
      const hit = traverse(a, b, (x, y, z) => e.section.has(x, y, z) && scene.world.getBlock(x, y, z));
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
