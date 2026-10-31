// BoatModel, ChestBoatModel and RaftModel: code-defined parts, using the APK's boat skins.
// Model parts share the bed/banner cube builder and the world's textured-quad renderer.
(function () {
  const P = window.Ponder, M = P.Mat;
  const WOODS = ["oak", "spruce", "birch", "jungle", "acacia", "darkoak", "mangrove", "bamboo", "cherry", "paleoak"];
  P.boatItems = function (entity, base, pt, blockPx) {
    const def = entity.definition(), wood = WOODS[entity.variant] || "oak", raft = wood === "bamboo";
    const entry = P.entityData.textures[def.textures[wood] || def.textures.default];
    if (!entry) return [];
    const look = { tex: P.textureOf(entry, "opaque"), dim: true, solid: true }, quads = [];
    let m = M.translate(M.id(), P.lerp(pt, entity.xo, entity.x), P.lerp(pt, entity.yo, entity.y) + 0.375, P.lerp(pt, entity.zo, entity.z));
    m = M.rotY(m, 180 - P.angleLerp(pt, entity.yRotO, entity.yRot));
    m = M.rotY(M.scale(m, -1, -1, 1), 90);
    const scale = entity.scaleOf(pt);
    m = M.scale(m, ...scale);
    const box = (pivot, rotation, origin, size, uv) => P.modelCube(quads, P.modelPart(m, ...pivot, ...rotation), ...origin, ...size, uv, look);
    const q = Math.PI / 2;
    if (raft) {
      box([0, -2.1, 1], [q, 0, 0], [-14, -11, -4], [28, 20, 4], [0, 0]);
      box([0, -2.1, 1], [q, 0, 0], [-14, -9, -8], [28, 16, 4], [0, 0]);
    } else {
      box([0, 3, 1], [q, 0, 0], [-14, -9, -3], [28, 16, 3], [0, 0]);
      box([-15, 4, 4], [0, 3 * q, 0], [-13, -7, -1], [18, 6, 2], [0, 19]);
      box([15, 4, 0], [0, q, 0], [-8, -7, -1], [16, 6, 2], [0, 27]);
      box([0, 4, -9], [0, Math.PI, 0], [-14, -7, -1], [28, 6, 2], [0, 35]);
      box([0, 4, 9], [0, 0, 0], [-14, -7, -1], [28, 6, 2], [0, 43]);
    }
    for (let i = 0; i < 2; i++) {
      const time = entity.paddles[i] ? P.lerp(pt, entity.rowingTimeO[i], entity.rowingTime[i]) : 0;
      const x = P.lerp((Math.sin(-time) + 1) / 2, -Math.PI / 3, -Math.PI / 12);
      const y = P.lerp((Math.sin(-time + 1) + 1) / 2, -Math.PI / 4, Math.PI / 4);
      const pivot = [3, raft ? -4 : -5, i ? -9 : 9], rotation = [x, i ? Math.PI - y : y, Math.PI / 16];
      const uv = raft ? [40 * i, 24] : [62, 20 * i];
      box(pivot, rotation, [-1, 0, -5], [2, 2, 18], uv);
      box(pivot, rotation, [i ? 0.001 : -1.001, -3, 8], [1, 6, 7], uv);
    }
    if (entity.type === "minecraft:chest_boat") {
      const dy = raft ? -5.1 : 0;
      box([-2, -5 + dy, -6], [0, -q, 0], [0, 0, 0], [12, 8, 12], [0, 76]);
      box([-2, -9 + dy, -6], [0, -q, 0], [0, 0, 0], [12, 4, 12], [0, 59]);
      box([-1, -6 + dy, -1], [0, -q, 0], [0, 0, 0], [2, 4, 1], [0, 59]);
    }
    const water = [], top = entity.y + 0.5625 * scale[1], pos = [Math.floor(entity.x), Math.floor(top), Math.floor(entity.z)];
    const fluid = entity.world.getBlock(...pos), above = entity.world.getBlock(pos[0], pos[1] + 1, pos[2]);
    const submerged = P.liquidKind(fluid) === "water" && pos[1] + P.liquidHeight(fluid, above) > top;
    if (!raft && !submerged) P.modelCube(water, P.modelPart(m, 0, -3, 1, q, 0, 0), -14, -9, -3, 28, 16, 3, [0, 0], look);
    return [{ depth: M.apply(base, entity.x, entity.y, entity.z)[2], draw: d => {
      water.forEach(face => {
        if (base[8] * face.n[0] + base[9] * face.n[1] + base[10] * face.n[2] <= 0) return;
        const points = [face.o, face.u, face.u.map((v, i) => v + face.v[i] - face.o[i]), face.v].map(p => M.apply(base, ...p));
        d.waterMask(points);
      });
      P.drawModelQuads(d, base, quads, 1, Math.max(16, Math.round(blockPx * P.view.cssPerGui)), null, null, 0);
    } }];
  };
})();
