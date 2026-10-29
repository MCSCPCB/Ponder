// Water and lava. Their block models name only a particle texture (Java's water.json, lava.json);
// the game draws them in code, and this is LiquidBlockRenderer.tesselate: the top's corners at
// the liquid's height averaged with its neighbours', in the still texture or the flowing one
// turned along the flow; the sides up to those corners in the flowing texture; the bottom; each
// face left out against the same liquid or a block that covers it. The neighbours are the
// section's (PonderLevel masks the world to it), outside it air; the water a waterlogged block
// holds (P.liquidOf) counts as water there, and is drawn in its cell the same way. Bedrock's
// liquid_depth is Java's LEVEL: 0 a source, 1 to 7 flowing, 8 and up falling.
(function () {
  const P = window.Ponder, M = P.Mat;
  const nameOf = block => P.blockId(block).replace(/^minecraft:/, "");
  // The liquid in a cell (its FluidState): the block if it is one, else what a waterlogged block
  // holds, else null.
  const fluidOf = block => (!block ? null : P.vanilla.liquids[nameOf(block)] ? block : P.liquidOf(block));
  // Which liquid a cell holds ("water", "lava"), or null.
  const kindOf = block => { const f = fluidOf(block); return f ? nameOf(f).replace(/^flowing_/, "") : null; };

  // A liquid's model has no quads of its own (liquidQuads makes them with its neighbours) and does
  // not fill its cell, so the faces round it show. `faces` are for its particles. Water's sides
  // against glass and leaves show water_overlay, which Bedrock does not have: Ponder's own (Java's
  // is one flat colour), tinted as the water.
  const models = new Map();
  const OVERLAY = "/hbui/ponder/assets/water_overlay.png";
  P.liquidModel = function (block) {
    const name = nameOf(block), t = P.vanilla.liquids[name];
    if (!t) return null;
    if (!models.has(name)) {
      const stillEntry = P.vanilla.textures[t.still], still = P.textureOf(stillEntry), flow = P.textureOf(P.vanilla.textures[t.flow]), faces = {};
      Object.keys(P.FACES).forEach(f => { faces[f] = still.url; });
      const lava = kindOf(block) === "lava";
      const overlay = lava ? null : P.textureOf({ url: OVERLAY, w: 16, h: 16, tint: stillEntry.tint, alpha: stillEntry.alpha });
      models.set(name, { id: P.blockId(block), shape: "liquid", quads: [], faces, tint: null, full: false, opaque: false, still, flow, overlay, lava });
    }
    return models.get(name);
  };

  const depthOf = block => P.blockStates(block).liquid_depth || 0;
  // FlowingFluid.getOwnHeight: amount / 9, the amount 8 for a source or a falling liquid.
  const ownHeight = block => { const d = depthOf(block); return (d === 0 || d >= 8 ? 8 : 8 - d) / 9; };
  const solid = block => !!block && P.blockModel(block).full;
  // Whether a block covers the face of a liquid against it: a full cube that hides what is behind.
  const covers = block => !!block && P.blockModel(block).full && P.blockModel(block).opaque;
  const normalize = v => { const l = Math.hypot(v[0], v[1], v[2]); return l < 1e-4 ? [0, 0, 0] : [v[0] / l, v[1] / l, v[2] / l]; };

  // getHeight of the cell (dx, dy, dz) from the liquid: 1 under the same liquid, else its own
  // height; 0 with none of it there, -1 for a solid block.
  function heightAt(at, kind, dx, dy, dz) {
    const b = at(dx, dy, dz);
    if (kindOf(b) === kind) return kindOf(at(dx, dy + 1, dz)) === kind ? 1 : ownHeight(fluidOf(b));
    return solid(b) ? -1 : 0;
  }
  // calculateAverageHeight: the corner of the cell (height `own`) between its neighbours of
  // heights a and b, with the diagonal cell when either holds the liquid.
  function cornerHeight(at, kind, own, a, b, diagonal) {
    if (a >= 1 || b >= 1) return 1;
    const sum = [0, 0];
    const add = h => { if (h >= 0.8) { sum[0] += h * 10; sum[1] += 10; } else if (h >= 0) { sum[0] += h; sum[1] += 1; } };
    if (a > 0 || b > 0) {
      const d = heightAt(at, kind, diagonal[0], 0, diagonal[1]);
      if (d >= 1) return 1;
      add(d);
    }
    add(own); add(a); add(b);
    return sum[0] / sum[1];
  }

  const SIDES = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  const ICE = /^(minecraft:)?(ice|frosted_ice)$/;
  // FlowingFluid.isSolidFace for a side: a sturdy block that is not ice.
  const solidFace = block => solid(block) && !ICE.test(P.blockId(block));
  // FlowingFluid.getFlow: towards lower liquid beside it, or down past an edge where the liquid
  // goes on below; a falling liquid against a wall flows down.
  function flowOf(at, kind, block) {
    const own = ownHeight(block);
    let x = 0, z = 0;
    SIDES.forEach(d => {
      const b = at(d[0], 0, d[1]), k = kindOf(b);
      if (k && k !== kind) return;
      let diff = 0;
      if (!k) {
        const below = at(d[0], -1, d[1]);
        if (!solid(b) && kindOf(below) === kind) diff = own - (ownHeight(fluidOf(below)) - 0.8888889);
      } else diff = own - ownHeight(fluidOf(b));
      x += d[0] * diff; z += d[1] * diff;
    });
    let v = [x, 0, z];
    if (depthOf(block) >= 8 && SIDES.some(d => solidFace(at(d[0], 0, d[1])) || solidFace(at(d[0], 1, d[1])))) {
      v = normalize(v);
      v[1] -= 6;
    }
    return normalize(v);
  }
  // shouldRenderBackwardUpFace: the top shows from below too when a cell round the one above is
  // neither the liquid nor a solid cube.
  function backwardUp(at, kind) {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const b = at(dx, 1, dz);
      if (kindOf(b) !== kind && !covers(b)) return true;
    }
    return false;
  }

  const face = (out, pts, uvs, look, twoSided) => P.blockPolygon(out, M.id(), pts, uvs, look, twoSided);
  // HalfTransparentBlock (glass, ice, slime, honey) and LeavesBlock, which water shows its overlay
  // against.
  const SEE_THROUGH = /^minecraft:(.*glass|ice|frosted_ice|blue_ice|slime|honey_block|.*leaves.*)$/;
  const showsOverlay = block => !!block && SEE_THROUGH.test(P.blockId(block));

  // The quads of the liquid `block` (a liquid itself, or the water of a waterlogged block),
  // `at(dx, dy, dz)` giving the blocks round its cell (null for none).
  P.liquidQuads = function (block, at) {
    const model = P.blockModel(block), kind = kindOf(block), out = [];
    // Lava is opaque and grows over seams; water is see-through (its texture's alpha).
    const look = tex => ({ tex, dim: true, solid: model.lava });
    const other = (dx, dy, dz) => kindOf(at(dx, dy, dz)) !== kind;
    const up = other(0, 1, 0), down = other(0, -1, 0) && !covers(at(0, -1, 0));
    const own = heightAt(at, kind, 0, 0, 0);
    let ne = 1, nw = 1, se = 1, sw = 1;
    if (own < 1) {
      const n = heightAt(at, kind, 0, 0, -1), s = heightAt(at, kind, 0, 0, 1), e = heightAt(at, kind, 1, 0, 0), w = heightAt(at, kind, -1, 0, 0);
      ne = cornerHeight(at, kind, own, n, e, [1, -1]);
      nw = cornerHeight(at, kind, own, n, w, [-1, -1]);
      se = cornerHeight(at, kind, own, s, e, [1, 1]);
      sw = cornerHeight(at, kind, own, s, w, [-1, 1]);
    }
    const y0 = down ? 0.001 : 0;
    if (up && !(Math.min(ne, nw, se, sw) >= 1 && covers(at(0, 1, 0)))) {
      ne -= 0.001; nw -= 0.001; se -= 0.001; sw -= 0.001;
      const flow = flowOf(at, kind, block);
      let tex = model.still, uv = [[0, 0], [0, 1], [1, 1], [1, 0]];
      // Flowing: the middle of the flowing texture, turned to the flow.
      if (flow[0] !== 0 || flow[2] !== 0) {
        const angle = Math.atan2(flow[2], flow[0]) - Math.PI / 2, s = Math.sin(angle) * 0.25, c = Math.cos(angle) * 0.25;
        tex = model.flow;
        uv = [[0.5 - c - s, 0.5 - c + s], [0.5 - c + s, 0.5 + c + s], [0.5 + c + s, 0.5 + c - s], [0.5 + c - s, 0.5 - c - s]];
      }
      const pts = [[0, nw, 0], [0, sw, 1], [1, se, 1], [1, ne, 0]], both = backwardUp(at, kind);
      // A top whose corners are not in one plane is the two triangles the game's quad is drawn as.
      if (Math.abs(nw + se - sw - ne) < 1e-6) face(out, pts, uv, look(tex), both);
      else {
        face(out, [pts[0], pts[1], pts[2]], [uv[0], uv[1], uv[2]], look(tex), both);
        face(out, [pts[0], pts[2], pts[3]], [uv[0], uv[2], uv[3]], look(tex), both);
      }
    }
    // The sides: the top corners seen from outside, left then right, where they stand, and the
    // neighbour's offset. Each shows the top left quarter of the flowing texture, cut at the
    // corners' heights, from both sides; against glass or leaves, water's overlay from outside only.
    [[nw, ne, [0, 0.001], [1, 0.001], [0, 0, -1]], [se, sw, [1, 0.999], [0, 0.999], [0, 0, 1]],
      [sw, nw, [0.001, 1], [0.001, 0], [-1, 0, 0]], [ne, se, [0.999, 0], [0.999, 1], [1, 0, 0]]].forEach(([h1, h2, a, b, d]) => {
      const beside = at(d[0], d[1], d[2]);
      if (!other(d[0], d[1], d[2]) || covers(beside)) return;
      const overlay = model.overlay && showsOverlay(beside);
      face(out, [[a[0], h1, a[1]], [b[0], h2, b[1]], [b[0], y0, b[1]], [a[0], y0, a[1]]],
        [[0, (1 - h1) / 2], [0.5, (1 - h2) / 2], [0.5, 0.5], [0, 0.5]], look(overlay ? model.overlay : model.flow), !overlay);
    });
    if (down) face(out, [[0, y0, 1], [0, y0, 0], [1, y0, 0], [1, y0, 1]], [[0, 1], [0, 0], [1, 0], [1, 1]], look(model.still), false);
    return out;
  };
})();
