// Live block entity parts share modelCube and DrawList with beds, banners and entities.
// Static block parts remain Scaffold's; the moving parts replace those in the same block.
(function () {
  const P = window.Ponder, M = P.Mat;
  const turns = { south: 0, west: 90, north: 180, east: 270 }, facing = { 2: "north", 3: "south", 4: "west", 5: "east" };
  const direction = block => { const s = P.blockStates(block); return s["minecraft:cardinal_direction"] || facing[s.facing_direction] || ["south", "west", "north", "east"][s.direction || 0]; };
  const turn = (m, block) => M.translate(M.rotY(M.translate(m, 0.5, 0.5, 0.5), -turns[direction(block)]), -0.5, -0.5, -0.5);
  const texture = path => P.textureOf(P.vanilla.textures[path]);
  const look = path => ({ tex: texture(path), dim: true, solid: true });
  const box = (out, m, pos, rotation, origin, size, uv, material) => P.modelCube(out, P.modelPart(m, ...pos, ...rotation), ...origin, ...size, uv, material);
  const bounds = q => { const points = [q.o, q.u, q.v, q.u.map((v, i) => v + q.v[i] - q.o[i])]; return [0, 1, 2].map(i => [Math.min(...points.map(p => p[i])), Math.max(...points.map(p => p[i]))]); };

  function chest(entity, pt) {
    const block = entity.getBlockState(), data = entity.native, textures = P.vanilla.blockEntities.chest;
    const trapped = P.blockId(block) === "minecraft:trapped_chest", ender = P.blockId(block) === "minecraft:ender_chest";
    const pair = data.pairx != null && data.pairz != null ? entity.world.getBlockEntity([data.pairx, entity.pos.y, data.pairz]) : null;
    const double = pair instanceof P.ChestBlockEntity && P.blockId(pair.getBlockState()) === P.blockId(block) && !ender;
    const material = look(ender ? textures.ender : double ? trapped ? textures.trappedDouble : textures.double : trapped ? textures.trapped : textures.normal);
    let m = turn(M.id(), block);
    // A double skin is 30 pixels wide. Each block keeps only its own half of that model,
    // including when a storyboard reveals the two blocks in different sections.
    let half = 0;
    if (double) {
      const local = M.apply(M.invert(m), 0.5 + pair.pos.x - entity.pos.x, 0.5, 0.5 + pair.pos.z - entity.pos.z);
      half = local[0] < 0.5 ? 1 : 0;
      if (half) m = M.translate(m, -1, 0, 0);
    }
    const open = Math.max(entity.getOpenNess(pt), double ? pair.getOpenNess(pt) : 0), angle = -(1 - Math.pow(1 - open, 3)) * Math.PI / 2;
    const quads = [], width = double ? 30 : 14;
    box(quads, m, [0, 0, 0], [0, 0, 0], [1, 0, 1], [width, 10, 14], [0, 19], material);
    box(quads, m, [0, 9, 1], [angle, 0, 0], [1, 0, 0], [width, 5, 14], [0, 0], material);
    box(quads, m, [0, 9, 1], [angle, 0, 0], [double ? 15 : 7, -2, 14], [2, 4, 1], [0, 0], material);
    if (!double) return quads;
    // The shared face clipping helper carries UVs with each cut.
    return clipHalf(quads, turn(M.id(), block), half ? 0 : 1, half ? 1 : -1);
  }
  function clipHalf(quads, transform, edge, sign) {
    const inverse = M.invert(transform), out = [];
    quads.forEach(q => {
      const points = [q.o, q.u, q.u.map((v, i) => v + q.v[i] - q.o[i]), q.v];
      const uv = q.uvs || [[0, 0], [1, 0], [1, 1], [0, 1]], input = points.map((p, i) => ({ p, uv: uv[i] })), kept = [];
      for (let i = 0; i < input.length; i++) {
        const a = input[i], b = input[(i + 1) % input.length], x = (M.apply(inverse, ...a.p)[0] - edge) * sign, y = (M.apply(inverse, ...b.p)[0] - edge) * sign;
        if (x >= -1.0e-8) kept.push(a);
        if ((x < 0) !== (y < 0)) { const t = x / (x - y); kept.push({ p: a.p.map((v, j) => P.lerp(t, v, b.p[j])), uv: a.uv.map((v, j) => P.lerp(t, v, b.uv[j])) }); }
      }
      if (kept.length >= 3) P.blockPolygon(out, M.id(), kept.map(p => p.p), kept.map(p => p.uv), q.look, q.twoSided);
    });
    return out;
  }

  function shulker(entity, pt) {
    const block = entity.getBlockState(), color = P.blockId(block).slice(10).replace(/_shulker_box$/, ""), index = P.dyeNames.indexOf(color);
    const material = look(P.vanilla.blockEntities.shulker[index + 1]), progress = entity.getProgress(pt), out = [];
    const facing = P.blockStates(block).facing_direction, rotation = { 0: [180, 0], 2: [-90, 0], 3: [90, 0], 4: [0, 90], 5: [0, -90] }[facing] || [0, 0];
    let m = M.translate(M.id(), 0.5, 0.5, 0.5);
    m = M.translate(M.scale(M.rotZ(M.rotX(M.scale(m, 0.9995, 0.9995, 0.9995), rotation[0]), rotation[1]), 1, -1, -1), 0, -1, 0);
    box(out, m, [0, 24, 0], [0, 0, 0], [-8, -8, -8], [16, 8, 16], [0, 28], material);
    box(out, m, [0, 24 - progress * 8, 0], [0, progress * Math.PI * 1.5, 0], [-8, -16, -8], [16, 12, 16], [0, 0], material);
    out.forEach(q => { q.twoSided = true; });
    return out;
  }
  function pot(entity, pt) {
    const paths = P.vanilla.blockEntities.pot, decorations = entity.getDecorations(), out = [];
    let m = M.translate(M.rotY(M.translate(M.id(), 0.5, 0, 0.5), 180 - turns[direction(entity.getBlockState())]), -0.5, 0, -0.5);
    const positive = entity.lastWobbleStyle === "POSITIVE", t = (entity.world.gameTime - entity.wobbleStartedAtTick + pt) / (positive ? 7 : 10);
    if (entity.lastWobbleStyle && t >= 0 && t <= 1) {
      m = M.translate(m, 0.5, 0, 0.5);
      if (positive) {
        const a = t * Math.PI * 2;
        m = M.rotZ(M.rotX(m, -1.5 * (Math.cos(a) + 0.5) * Math.sin(a / 2) / 64 * 180 / Math.PI), Math.sin(a) / 64 * 180 / Math.PI);
      } else m = M.rotY(m, Math.sin(-t * 3 * Math.PI) * (1 - t) / 8 * 180 / Math.PI);
      m = M.translate(m, -0.5, 0, -0.5);
    }
    const base = look(paths.base), neck = P.modelPart(m, 0, 37, 16, Math.PI, 0, 0);
    const rim = (x, y, z, w, h, d, v, inflate) => {
      const rects = { down: [d, v, d + w, v + d], up: [d + w, v + d, d + 2 * w, v],
        west: [0, v + d, d, v + d + h], north: [d, v + d, d + w, v + d + h],
        east: [d + w, v + d, 2 * d + w, v + d + h], south: [2 * d + w, v + d, 2 * d + 2 * w, v + d + h] };
      P.modelCube(out, neck, x - inflate, y - inflate, z - inflate, w + 2 * inflate, h + 2 * inflate, d + 2 * inflate, null, base, rects);
    };
    rim(4, 17, 4, 8, 3, 8, 0, -0.1); rim(5, 20, 5, 6, 1, 6, 5, 0.2);
    [0, 16].forEach(y => box(out, m, [1, y, 1], [0, 0, 0], [0, 0, 0], [14, 0, 14], [-14, 13], base));
    const sides = { back: [[15, 16, 1], [0, 0, Math.PI]], left: [[1, 16, 1], [0, -Math.PI / 2, Math.PI]],
      right: [[15, 16, 15], [0, Math.PI / 2, Math.PI]], front: [[1, 16, 15], [Math.PI, 0, 0]] };
    Object.keys(sides).forEach(side => {
      const [pos, rotation] = sides[side], material = look(paths.patterns[decorations[side]] || paths.side);
      P.modelCube(out, P.modelPart(m, ...pos, ...rotation), 0, 0, 0, 14, 16, 0, null, material, { north: [1, 0, 15, 16] });
    });
    return out;
  }

  // BookModel.setupAnim: both covers, page blocks, spine and the two turning leaves.
  function book(out, m, time, open, flip1, flip2) {
    const a = (Math.sin(time * 0.02) * 0.1 + 1.25) * open, material = look(P.vanilla.blockEntities.book), x = Math.sin(a);
    const add = (pos, y, origin, size, uv) => box(out, m, pos, [0, y, 0], origin, size, uv, material);
    add([0, 0, -1], Math.PI + a, [-6, -5, -0.005], [6, 10, 0.005], [0, 0]);
    add([0, 0, 1], -a, [0, -5, -0.005], [6, 10, 0.005], [16, 0]);
    add([0, 0, 0], Math.PI / 2, [-1, -5, 0], [2, 10, 0.005], [12, 0]);
    add([x, 0, 0], a, [0, -4, -0.99], [5, 8, 1], [0, 10]);
    add([x, 0, 0], -a, [0, -4, -0.01], [5, 8, 1], [12, 10]);
    [flip1, flip2].forEach(f => add([x, 0, 0], a - a * 2 * f, [0, -4, 0], [5, 8, 0.005], [24, 10]));
  }
  function signText(d, entity, m, light, model) {
    const boards = (model.quads || []).filter(q => Math.abs(q.n[1]) < 0.1).map(q => {
      const a = q.u.map((v, i) => v - q.o[i]), b = q.v.map((v, i) => v - q.o[i]);
      return { q, area: Math.hypot(...a) * Math.hypot(...b) };
    }).sort((a, b) => b.area - a.area).slice(0, 2);
    const block = entity.getBlockState(), states = P.blockStates(block), rotation = states.ground_sign_direction != null ? -states.ground_sign_direction * 22.5 : -turns[direction(block)];
    const normal = M.apply(M.rotY(M.id(), rotation), 0, 0, 1);
    boards.forEach(({ q }) => {
      if (m[8] * q.n[0] + m[9] * q.n[1] + m[10] * q.n[2] <= 0) return;
      const front = q.n.reduce((s, v, i) => s + v * normal[i], 0) > 0, text = entity.getText(front) || {}, colorIndex = P.dyeNames.indexOf(text.color);
      const dye = P.dyeColors[colorIndex < 0 ? 15 : colorIndex], color = dye.map(c => Math.round(c * 255 * (text.has_glowing_text ? 1 : 0.4 * light))).concat(255);
      const outline = colorIndex === 15 || colorIndex < 0 ? P.color(0xf0ebcc) : dye.map(c => Math.round(c * 255 * 0.4)).concat(255);
      const center = q.u.map((v, i) => (v + q.v[i]) / 2 + q.n[i] * 0.002), right = [q.n[2], 0, -q.n[0]];
      const hanging = P.blockId(block).includes("hanging"), scale = (hanging ? 1 : 2 / 3) / 64, limit = hanging ? 60 : 90;
      (text.messages || []).slice(0, 4).forEach((message, line) => {
        const runs = P.splitStyledLines(P.componentRuns(message), limit)[0], width = P.styledWidth(runs);
        const point = (x, y) => M.apply(m, ...center.map((v, i) => v + right[i] * x * scale - (i === 1 ? y * scale : 0)));
        let x0 = -width / 2;
        runs.forEach(run => {
          const w = P.styledWidth([run]), tint = run.color ? run.color.map((c, i) => i === 3 ? c : Math.round(c * (text.has_glowing_text ? 1 : 0.4 * light))) : color;
          const draw = (dx, dy, color) => d.projectedText(run.text, point(x0 + dx, line * 10 - 20 + dy), point(x0 + w + dx, line * 10 - 20 + dy), point(x0 + dx, line * 10 - 12 + dy), color, null, run);
          if (text.has_glowing_text) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (x || y) draw(x, y, outline);
          draw(0, 0, tint); x0 += w;
        });
      });
    });
  }
  function beam(d, m, time, size, sections, src, inner, outer, y, scale) {
    time = (time % 40 + 40) % 40;
    const maxHeight = 2 * Math.max(P.view.width, P.view.height) / Math.max(1, Math.hypot(m[1], m[5]));
    sections.forEach(section => {
      const start = Math.max(y, -maxHeight), h = Math.min(y + section.height, maxHeight) - start;
      if (h <= 0) return;
      for (let layer = 0; layer < 2; layer++) {
        const r = layer ? outer : inner, alpha = layer ? 32 / 255 : 1, rgb = section.color;
        const filter = `coh-color-matrix(${rgb[0]},0,0,0,0,0,${rgb[1]},0,0,0,0,0,${rgb[2]},0,0,0,0,0,${alpha},0)`;
        const t = M.rotY(M.translate(m, 0.5, 0, 0.5), layer ? 0 : time * 2.25 - 45);
        const rate = scale * (layer ? 1 : 0.5 / r), low = -1 + ((-time * 0.2 - Math.floor(-time * 0.1)) % 1 + 1) % 1 + (start - y) * rate;
        const points = layer ? [[-r, -r], [r, -r], [r, r], [-r, r]] : [[0, r], [r, 0], [0, -r], [-r, 0]];
        for (let i = 0; i < 4; i++) {
          const a = points[i], b = points[(i + 1) % 4], o = M.apply(t, a[0], start + h, a[1]), u = M.apply(t, b[0], start + h, b[1]), v = M.apply(t, a[0], start, a[1]);
          const top = low + h * rate;
          P.repeatTexture(d, src, o, u, v, [0, top], [1, top], [0, low], [[0, top], [1, top], [1, low], [0, low]], filter, size);
        }
      }
      y += section.height;
    });
  }
  // rendertype_end_portal: screen-projected texture matrices, one sky and sixteen additive
  // layers. Orthographic projection makes each texture lookup affine over the face.
  const PORTAL_COLORS = [[0.022087, 0.098399, 0.110818], [0.011892, 0.095924, 0.089485], [0.027636, 0.101689, 0.100326], [0.046564, 0.109883, 0.114838],
    [0.064901, 0.117696, 0.097189], [0.063761, 0.086895, 0.123646], [0.084817, 0.111994, 0.166380], [0.097489, 0.154120, 0.091064],
    [0.106152, 0.131144, 0.195191], [0.097721, 0.110188, 0.187229], [0.133516, 0.138278, 0.148582], [0.070006, 0.243332, 0.235792],
    [0.196766, 0.142899, 0.214696], [0.047281, 0.315338, 0.321970], [0.204675, 0.390010, 0.302066], [0.080955, 0.314821, 0.661491]];
  function portal(d, entity, m, light, size, ticks) {
    const gateway = entity instanceof P.TheEndGatewayBlockEntity, paths = P.vanilla.blockEntities.portal, time = (ticks % 24000) / 24000;
    if (gateway && (entity.isSpawning() || entity.isCoolingDown())) {
      const spawning = entity.isSpawning(), scale = Math.sin((spawning ? entity.getSpawnPercent(entity.partialTick) : entity.getCooldownPercent(entity.partialTick)) * Math.PI);
      const height = Math.floor(scale * (spawning ? 320 : 50));
      if (height > 0) beam(d, m, entity.world.gameTime + entity.partialTick, size, [{ height: height * 2, color: P.dyeColors[spawning ? 2 : 10] }],
        "/hbui/ponder/assets/end_gateway_beam.png", 0.15, 0.175, -height, scale);
    }
    Object.keys(P.FACES).forEach(side => {
      const face = P.FACES[side];
      if (!entity.shouldRenderFace(side) || m[8] * face.n[0] + m[9] * face.n[1] + m[10] * face.n[2] <= 0) return;
      const points = [face.o, face.u, face.v].map(p => M.apply(m, p[0], gateway ? p[1] : p[1] * 0.375 + 0.375, p[2]));
      for (let layer = 0; layer <= 16; layer++) {
        const color = PORTAL_COLORS[Math.max(0, layer - 1)].map(v => v * light), angle = (layer * layer * 4321 + layer * 9) * 2 * Math.PI / 180;
        const cs = Math.cos(angle), sn = Math.sin(angle), scale = (4.5 - layer / 4) * 2;
        const uv = points.map(p => {
          const x = p[0] / P.view.width, y = 1 - p[1] / P.view.height;
          return layer ? [(x * cs - y * sn) * scale * 0.5 + 8.5 / layer + 0.25,
            (x * sn + y * cs) * scale * 0.5 + (2 + layer / 1.5) * time * 0.75 + 0.25] : [x, y];
        });
        const clip = [uv[0], uv[1], uv[1].map((v, i) => v + uv[2][i] - uv[0][i]), uv[2]], tex = texture(layer ? paths.portal : paths.sky);
        const filter = `coh-color-matrix(${color[0]},0,0,0,0,0,${color[1]},0,0,0,0,0,${color[2]},0,0,0,0,0,1,0)`;
        P.repeatTexture(d, tex.url, ...points, ...uv, clip, filter, size, layer ? "additive" : null);
      }
    });
  }
  function conduit(d, entity, m, pt, light, size) {
    const out = [], paths = P.vanilla.blockEntities.conduit, time = entity.time + pt;
    const add = (transform, side, path) => box(out, transform, [0, 0, 0], [0, 0, 0], [-side / 2, -side / 2, -side / 2], [side, side, side], [0, 0], look(path));
    if (!entity.isActive()) add(M.rotY(M.translate(M.id(), 0.5, 0.5, 0.5), entity.getActiveRotation(0) * 180 / Math.PI), 6, paths.base);
    else {
      const bob = Math.sin(time * 0.1) / 2 + 0.5, y = 0.3 + (bob * bob + bob) * 0.2;
      const a = entity.getActiveRotation(pt), c = Math.cos(a), s = Math.sin(a), k = 1 - c, x = 1 / Math.sqrt(6), z = x, v = 2 * x;
      const rotation = [c + x * x * k, x * v * k - z * s, x * z * k + v * s, 0, v * x * k + z * s, c + v * v * k, v * z * k - x * s, 0,
        z * x * k - v * s, z * v * k + x * s, c + z * z * k, 0, 0, 0, 0, 1];
      add(M.mul(M.translate(M.id(), 0.5, y, 0.5), rotation), 8, paths.cage);
      const phase = Math.floor(entity.time / 66) % 3, center = M.translate(M.id(), 0.5, 0.5, 0.5), wind = phase === 1 ? paths.vertical : paths.horizontal;
      add(phase === 1 ? M.rotX(center, 90) : phase === 2 ? M.rotZ(center, 90) : center, 16, wind);
      add(M.scale(M.rotX(M.rotZ(center, 180), 180), 0.875, 0.875, 0.875), 16, wind);
      P.drawModelQuads(d, m, out, light, size, null, null, time);
      const p = M.apply(m, 0.5, y, 0.5), r = Math.hypot(m[0], m[4], m[8]) / 6, tex = texture(entity.isHunting() ? paths.open : paths.closed);
      d.texturedQuadMap(tex.url, [p[0] - r, p[1] - r, p[2] + 0.001], [p[0] + r, p[1] - r, p[2] + 0.001], [p[0] - r, p[1] + r, p[2] + 0.001],
        [0, 0], [0.5, 0], [0, 0.5], [[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]], null, size);
      return;
    }
    P.drawModelQuads(d, m, out, light, size, null, null, time);
  }
  function skull(d, entity, m, pt, light, size) {
    entity.partialTick = pt;
    const names = { skeleton_skull: "skeleton", wither_skeleton_skull: "wither", zombie_head: "zombie", creeper_head: "creeper", dragon_head: "dragon", piglin_head: "piglin", player_head: "steve" };
    const kind = names[P.blockId(entity.getBlockState()).split(":").pop()], def = P.entityData.entities["minecraft:skull"];
    if (!def) return false;
    if (!entity.modelEntity) {
      const mob = entity.modelEntity = new P.ClientEntity(entity.world, "minecraft:skull", 0, 0, 0);
      mob.type = "ponder:skull/" + kind;
      const definition = Object.assign({}, def, { textures: { default: def.textures[kind] }, geometry: { default: def.geometry[kind] } });
      mob.definition = () => definition;
      mob.boneVisible = name => kind !== "piglin" || /^(head|leftear|rightear|hat)$/.test(name);
      mob.animator.animate = pose => {
        const time = entity.getAnimation(entity.partialTick);
        if (kind === "dragon" && pose.has("jaw")) pose.get("jaw").rot[0] = (Math.sin(time * Math.PI * 0.2) + 1) * 0.2 * 180 / Math.PI;
        if (kind === "piglin") {
          if (pose.has("leftear")) pose.get("leftear").rot[2] = -(Math.cos(time * Math.PI * 0.2 * 1.2) + 2.5) * 0.2 * 180 / Math.PI;
          if (pose.has("rightear")) pose.get("rightear").rot[2] = (Math.cos(time * Math.PI * 0.2) + 2.5) * 0.2 * 180 / Math.PI;
        }
      };
    }
    const states = P.blockStates(entity.getBlockState()), wall = states.facing_direction >= 2, normal = { north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0] }[direction(entity.getBlockState())];
    let t = M.translate(M.id(), 0.5 - (wall ? normal[0] * 0.25 : 0), wall ? 0.25 : 0, 0.5 - (wall ? normal[2] * 0.25 : 0));
    t = M.rotY(t, wall ? -turns[direction(entity.getBlockState())] : -(entity.native.Rotation || 0));
    if (kind === "dragon") t = M.scale(M.translate(t, 0, 0.374375, 0), 0.75, 0.75, 0.75);
    t = M.translate(M.scale(t, 1 / 16, 1 / 16, 1 / 16), 0, -24, 0);
    entity.modelEntity.animator.begin(pt);
    P.clientEntityItems(entity.modelEntity, M.mul(m, t), t, pt, size / P.view.cssPerGui, light).forEach(it => it.draw(d));
    return true;
  }
  function movingPiston(d, entity, m, pt, light, size, ticks) {
    const state = entity.getMovedState(), id = P.blockId(state), normal = P.normalOf(entity.getDirection()), progress = entity.getProgress(pt);
    if (id === "minecraft:air") return;
    const draw = (block, transform, short) => {
      const model = P.blockModel(block);
      if (!model.quads) { P.drawBlockCube(d, M.translate(transform, 0.5, 0.5, 0.5), block, size / P.view.cssPerGui); return; }
      let quads = model.quads;
      if (short) {
        const axis = normal.findIndex(v => v !== 0), sign = normal[axis];
        quads = [];
        model.quads.forEach(q => {
          // The short head cuts half a block off the rod's trailing end. UVs stay at
          // their original positions on that rod instead of stretching its texture.
          const r = q.region, points = [q.o, q.u, q.u.map((v, i) => v + q.v[i] - q.o[i]), q.v], uv = q.uvs || [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
          const output = [], tex = [], distance = p => sign > 0 ? p[axis] - 0.25 : 0.75 - p[axis];
          let p = points[points.length - 1], a = distance(p), at = uv[uv.length - 1];
          points.forEach((v, i) => {
            const b = distance(v), to = uv[i];
            if (a < 0 && b > 0 || a > 0 && b < 0) {
              const t = a / (a - b); output.push(p.map((n, k) => n + (v[k] - n) * t)); tex.push(at.map((n, k) => n + (to[k] - n) * t));
            }
            if (b >= 0) { output.push(v); tex.push(to); }
            p = v; a = b; at = to;
          });
          const count = quads.length;
          if (output.length >= 3) P.blockPolygon(quads, M.id(), output, tex, q.look, q.twoSided);
          if (quads.length > count) { quads[count].n = q.n; quads[count].shade = q.shade; }
        });
      }
      P.drawModelQuads(d, transform, quads, light, size, null, model.tint, ticks);
    };
    const moving = M.translate(m, entity.getXOff(pt), entity.getYOff(pt), entity.getZOff(pt));
    if (entity.isSourcePiston() && !entity.isExtending() && /^minecraft:(sticky_)?piston$/.test(id)) {
      const head = P.block(id === "minecraft:sticky_piston" ? "minecraft:sticky_piston_arm_collision" : "minecraft:piston_arm_collision", P.blockStates(state));
      draw(head, moving, progress >= 0.5);
      draw(P.withNbt(state, Object.assign({}, P.blockNbt(state), { State: 2 })), m, false);
    } else draw(state, moving, /:.*piston_arm_collision$/.test(id) && progress <= 0.5);
  }
  P.drawBlockEntity = function (d, entity, m, pt, light, size, ticks, model, visibleQuads, foil) {
    const block = entity.getBlockState(), out = [], draw = quads => P.drawModelQuads(d, m, quads, light, size, null, model.tint, ticks, foil);
    const custom = P.blockEntityRenderer(entity);
    if (custom) { custom(d, entity, m, pt, light, size, ticks, model, visibleQuads); return true; }
    if (entity instanceof P.PistonMovingBlockEntity) { movingPiston(d, entity, m, pt, light, size, ticks); return true; }
    if (entity instanceof P.BedBlockEntity || entity instanceof P.BannerBlockEntity) {
      const live = P.blockEntityModel(P.withNbt(block, entity.bedrockData()));
      draw(live.quads.concat(live.moving ? live.moving(ticks, entity.pos) : [])); return true;
    }
    if (entity instanceof P.ChestBlockEntity) { draw(chest(entity, pt)); return true; }
    if (entity instanceof P.ShulkerBoxBlockEntity) { draw(shulker(entity, pt)); return true; }
    if (entity instanceof P.DecoratedPotBlockEntity) { draw(pot(entity, pt)); return true; }
    if (entity instanceof P.TheEndPortalBlockEntity) { entity.partialTick = pt; portal(d, entity, m, light, size, ticks); return true; }
    if (entity instanceof P.ConduitBlockEntity) { conduit(d, entity, m, pt, light, size); return true; }
    if (entity instanceof P.SkullBlockEntity) return skull(d, entity, m, pt, light, size);
    if (entity instanceof P.EnchantmentTableBlockEntity) {
      draw(model.quads.filter(q => bounds(q)[1][1] <= 0.750001));
      const time = entity.time + pt, rot = P.lerp(pt, entity.rotO, entity.rot), flip = P.lerp(pt, entity.flipO, entity.flip);
      let t = M.translate(M.id(), 0.5, 0.75 + 0.1 + Math.sin(time * 0.1) * 0.01, 0.5);
      t = M.rotZ(M.rotY(t, -rot * 180 / Math.PI), 80);
      const page = f => P.clamp(((f % 1 + 1) % 1) * 1.6 - 0.3, 0, 1);
      book(out, t, time, P.lerp(pt, entity.openO, entity.open), page(flip + 0.25), page(flip + 0.75)); draw(out); return true;
    }
    if (entity instanceof P.LecternBlockEntity) {
      draw(model.quads.filter(q => !q.look.tex.url.includes("enchanting_table_book")));
      if (entity.hasBook()) { book(out, M.rotZ(M.rotY(M.translate(M.id(), 0.5, 1.0625, 0.5), -turns[direction(block)]), 67.5), 0, 1.2, 0.1, 0.9); draw(out); }
      return true;
    }
    if (entity instanceof P.BellBlockEntity) {
      draw(model.quads.filter(q => { const b = bounds(q); return !(b[0][0] >= 0.25 && b[0][1] <= 0.75 && b[2][0] >= 0.25 && b[2][1] <= 0.75 && b[1][1] <= 0.812501); }));
      const time = entity.ticks + pt, a = entity.shaking ? Math.sin(time / Math.PI) / (4 + time / 3) : 0;
      const x = entity.clickDirection === "NORTH" ? -a : entity.clickDirection === "SOUTH" ? a : 0, z = entity.clickDirection === "EAST" ? -a : entity.clickDirection === "WEST" ? a : 0;
      const t = M.rotX(M.rotZ(M.translate(M.id(), 0.5, 0.75, 0.5), z * 180 / Math.PI), x * 180 / Math.PI), material = look(P.vanilla.blockEntities.bell);
      box(out, t, [0, 0, 0], [0, 0, 0], [-3, -6, -3], [6, 7, 6], [0, 0], material);
      box(out, t, [0, 0, 0], [0, 0, 0], [-4, -8, -4], [8, 2, 8], [0, 13], material); draw(out); return true;
    }
    // These add a live layer to the static block model.
    if (!(entity instanceof P.SignBlockEntity || entity instanceof P.CampfireBlockEntity || entity instanceof P.BeaconBlockEntity || entity instanceof P.SpawnerBlockEntity || entity instanceof P.VaultBlockEntity || entity instanceof P.BrushableBlockEntity)) return false;
    if (visibleQuads) draw(visibleQuads);
    else P.drawBlockCube(d, M.translate(m, 0.5, 0.5, 0.5), block, size / P.view.cssPerGui);
    if (entity instanceof P.SignBlockEntity) signText(d, entity, m, light, model);
    if (entity instanceof P.BeaconBlockEntity) beam(d, m, entity.world.gameTime + pt, size, entity.getBeamSections(), texture(P.vanilla.blockEntities.beam).url, 0.2, 0.25, 0, 1);
    if (entity instanceof P.CampfireBlockEntity) entity.getItems().forEach(item => {
      let t = M.rotX(M.rotY(M.translate(m, 0.5, 0.44921875, 0.5), -turns[direction(block)] - (item.Slot || 0) * 90), 90);
      t = M.scale(M.translate(t, -0.3125, -0.3125, 0), 0.375, 0.375, 0.375);
      (P.isBlockItem(item.id) ? P.drawBlockCube : P.drawItemSprite)(d, t, item, size * 0.375 / P.view.cssPerGui);
    });
    if (entity instanceof P.SpawnerBlockEntity) {
      const mob = entity.getDisplayEntity();
      if (!mob) return true;
      const s = 0.53125 / Math.max(mob.halfWidth * 2, mob.height, 1);
      let t = M.rotY(M.translate(m, 0.5, 0.4, 0.5), P.lerp(pt, entity.spinO, entity.spin) * 10);
      t = M.scale(M.rotX(M.translate(t, 0, -0.2, 0), -30), s, s, s);
      mob.render(t, pt, size / P.view.cssPerGui * s).forEach(it => it.draw(d));
    }
    if (entity instanceof P.VaultBlockEntity) {
      const item = entity.getSharedData().getDisplayItem();
      if (item && item.id && item.count !== 0) {
        const blockItem = P.isBlockItem(item.id), s = blockItem ? 0.25 : 0.5;
        let t = M.rotY(M.translate(m, 0.5, 0.4, 0.5), P.angleLerp(pt, entity.spinO, entity.spin));
        t = M.scale(M.translate(t, 0, (blockItem ? 3 : 2) / 16, 0), s, s, s);
        const count = P.renderedItemAmount(item.count == null ? 1 : item.count), random = P.seededRandom(P.itemSeed(item.id));
        if (!blockItem) t = M.translate(t, 0, 0, -0.09375 * (count - 1) / 2);
        for (let i = 0; i < count; i++) {
          const offset = i === 0 ? [0, 0, 0] : blockItem ? [0, 1, 2].map(() => (random.nextFloat() * 2 - 1) * 0.15 / s)
            : [(random.nextFloat() * 2 - 1) * 0.15, (random.nextFloat() * 2 - 1) * 0.15, i * 0.09375];
          (blockItem ? P.drawBlockCube : P.drawItemSprite)(d, M.translate(t, ...offset), item, size * s / P.view.cssPerGui);
        }
      }
    }
    if (entity instanceof P.BrushableBlockEntity) {
      const dust = P.blockStates(block).brushed_progress || 0, side = entity.getHitDirection(), item = entity.getItem();
      if (dust > 0 && side && item && item.id && item.count !== 0) {
        const p = [0.5, 0.5, 0.5], normal = P.normalOf(side), axis = normal.findIndex(v => v !== 0);
        p[axis] = normal[axis] > 0 ? 0.73 + dust * 0.075 : 0.25 - dust * 0.075;
        if (axis === 1) p[axis] += 0.02;
        const t = M.scale(M.rotY(M.translate(m, ...p), axis === 0 ? 176 : 86), 0.5, 0.5, 0.5);
        (P.isBlockItem(item.id) ? P.drawBlockCube : P.drawItemSprite)(d, t, item, size * 0.5 / P.view.cssPerGui);
      }
    }
    return true;
  };

  // BlockEntityWithoutLevelRenderer: item components supply the model's colour and contents.
  const itemEntities = new Map();
  P.blockEntityItem = function (stack) {
    const id = typeof stack === "string" ? stack : stack.id, name = id.replace(/^minecraft:/, "");
    if (!/^(?:(?:trapped_|ender_)?chest|(?:[a-z_]+_)?shulker_box|(?:[a-z_]+_)?bed|(?:[a-z_]+_)?banner|decorated_pot|conduit|(?:[a-z_]+_)(?:head|skull))$/.test(name)) return null;
    const components = P.itemComponents(stack), states = Object.assign({}, typeof stack === "object" && stack.states, components["minecraft:block_state"]);
    const data = Object.assign({}, typeof stack === "object" && stack.nbt), java = Object.assign({}, data.PonderJavaData, components["minecraft:block_entity_data"]);
    let blockId = id;
    if (/(?:^|_)bed$/.test(name)) {
      const color = P.dyeNames.indexOf(name.replace(/_bed$/, ""));
      blockId = "minecraft:bed"; data.color = color < 0 ? data.color == null ? 14 : data.color : color; states.direction = 0;
    }
    if (/(?:^|_)banner$/.test(name)) {
      const color = P.dyeNames.indexOf(components["minecraft:base_color"] || name.replace(/_banner$/, ""));
      blockId = "minecraft:standing_banner"; data.Base = color < 0 ? data.Base == null ? 15 : data.Base : 15 - color;
      if (components["minecraft:banner_patterns"]) java.patterns = components["minecraft:banner_patterns"];
    }
    if (components["minecraft:pot_decorations"]) java.sherds = components["minecraft:pot_decorations"];
    if (Object.keys(java).length) data.PonderJavaData = java;
    return P.block(blockId, states, { nbt: data });
  };
  P.drawBlockEntityItem = function (d, m, stack, size, ticks) {
    const id = typeof stack === "string" ? stack : stack.id, foil = P.hasFoil(stack);
    if (id === "minecraft:shield") {
      const table = P.entityData, entry = table.textures["textures/entity/shield"];
      if (!entry) return false;
      const quads = [], transform = P.modelPart(M.scale(M.id(), 1, -1, -1), 0, 0, 0, 0, 0, 0), material = { tex: P.textureOf(entry), dim: true, solid: true };
      P.modelCube(quads, transform, -6, -11, -2, 12, 22, 1, [0, 0], material);
      P.modelCube(quads, transform, -1, -3, -1, 2, 6, 6, [26, 0], material);
      const components = P.itemComponents(stack), patterns = components["minecraft:banner_patterns"] || [], base = components["minecraft:base_color"];
      if (base || patterns.length) [{ pattern: "base", color: base || "white" }].concat(patterns.slice(0, 16)).forEach(p => {
        const pattern = typeof p.pattern === "string" ? p.pattern : p.pattern && p.pattern.asset_id;
        const texture = pattern && table.equipment.shield && table.equipment.shield[pattern.replace(/^minecraft:/, "")];
        if (texture) P.modelCube(quads, transform, -6, -11, -2, 12, 22, 1, [0, 0], { tex: P.textureOf(texture), dim: true, solid: false, color: P.dyeColors[P.dyeNames.indexOf(p.color)] });
      });
      P.drawModelQuads(d, m, quads, 1, size, null, null, ticks, foil); return true;
    }
    const block = P.blockEntityItem(stack);
    if (!block) return false;
    const key = JSON.stringify(block);
    if (!itemEntities.has(key)) {
      const world = new P.PonderWorld({ x: 1, y: 1, z: 2 }); world.setBlock(0, 0, 0, block);
      if (P.blockId(block) === "minecraft:bed") {
        world.setBlock(0, 0, 0, P.withStates(block, { head_piece_bit: true }));
        world.setBlock(0, 0, 1, P.withStates(block, { head_piece_bit: false }));
      }
      if (itemEntities.size >= 128) itemEntities.clear();
      itemEntities.set(key, world);
    }
    const world = itemEntities.get(key), entity = world.getBlockEntity([0, 0, 0]);
    if (!entity) return false;
    const draw = (entity, z) => {
      const model = P.blockModel(entity.getBlockState());
      return P.drawBlockEntity(d, entity, M.translate(m, -0.5, -0.5, z - 0.5), 0, 1, size, ticks, model, model.quads, foil);
    };
    if (!draw(entity, 0)) return false;
    if (entity instanceof P.BedBlockEntity) draw(world.getBlockEntity([0, 0, 1]), -1);
    return true;
  };
})();
