// PonderScene, its world (PonderLevel, a block map restored on every begin) and the scene
// transform (PonderScene.SceneTransform): an orthographic GUI projection, 30 * scale GUI
// pixels per block, X -35° / Y 145° by default.
(function () {
  const P = window.Ponder;
  const key = (x, y, z) => x + "," + y + "," + z;

  // Vec3 and BlockPos keep the renderer's indexed coordinates and the scene API's value methods.
  class Vec3 {
    constructor(x, y, z) { this.x = x; this.y = y; this.z = z; }
    get 0() { return this.x; }
    get 1() { return this.y; }
    get 2() { return this.z; }
    *[Symbol.iterator]() { yield this.x; yield this.y; yield this.z; }
    map(fn) { return [this.x, this.y, this.z].map(fn); }
    every(fn) { return [this.x, this.y, this.z].every(fn); }
    forEach(fn) { [this.x, this.y, this.z].forEach(fn); }
    slice() { return [this.x, this.y, this.z]; }
    add(x, y, z) { if (typeof x === "object") [x, y, z] = x; return new Vec3(this.x + x, this.y + y, this.z + z); }
    subtract(x, y, z) { if (typeof x === "object") [x, y, z] = x; return this.add(-x, -y, -z); }
    scale(s) { return new Vec3(this.x * s, this.y * s, this.z * s); }
    multiply(x, y, z) { if (typeof x === "object") [x, y, z] = x; return new Vec3(this.x * x, this.y * y, this.z * z); }
    lengthSqr() { return this.dot(this); }
    length() { return Math.sqrt(this.lengthSqr()); }
    normalize() { const n = Math.sqrt(this.lengthSqr()); return n < 1.0e-4 ? new Vec3(0, 0, 0) : this.scale(1 / n); }
    dot(v) { return this.x * v[0] + this.y * v[1] + this.z * v[2]; }
    cross(v) { return new Vec3(this.y * v[2] - this.z * v[1], this.z * v[0] - this.x * v[2], this.x * v[1] - this.y * v[0]); }
    distanceTo(v) { return Math.sqrt(this.subtract(v).lengthSqr()); }
    lerp(v, t) { return this.add(new Vec3(...v).subtract(this).scale(t)); }
    equals(v) { return v instanceof this.constructor && this.every((n, i) => n === v[i]); }
  }
  class BlockPos extends Vec3 {
    constructor(x, y, z) { super(Math.floor(x), Math.floor(y), Math.floor(z)); }
    getX() { return this.x; }
    getY() { return this.y; }
    getZ() { return this.z; }
    subtract(pos) { return this.offset(-pos[0], -pos[1], -pos[2]); }
    offset(x, y, z) { if (typeof x === "object") [x, y, z] = x; return new BlockPos(this.x + x, this.y + y, this.z + z); }
    relative(direction, distance) { const n = P.normalOf(direction), d = distance === undefined ? 1 : distance; return this.offset(n[0] * d, n[1] * d, n[2] * d); }
    above(n) { return this.relative("UP", n); }
    below(n) { return this.relative("DOWN", n); }
    north(n) { return this.relative("NORTH", n); }
    south(n) { return this.relative("SOUTH", n); }
    east(n) { return this.relative("EAST", n); }
    west(n) { return this.relative("WEST", n); }
  }
  class AABB extends Array {
    constructor(x0, y0, z0, x1, y1, z1) {
      super(2);
      if (typeof x0 === "object") {
        const a = x0, b = y0 || a.map(v => v + 1);
        [x0, y0, z0] = a; [x1, y1, z1] = b;
      }
      this[0] = [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)];
      this[1] = [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
    }
    static get [Symbol.species]() { return Array; }
    get minX() { return this[0][0]; }
    get minY() { return this[0][1]; }
    get minZ() { return this[0][2]; }
    get maxX() { return this[1][0]; }
    get maxY() { return this[1][1]; }
    get maxZ() { return this[1][2]; }
    inflate(x, y, z) { if (y === undefined) y = z = x; return new AABB(this.minX - x, this.minY - y, this.minZ - z, this.maxX + x, this.maxY + y, this.maxZ + z); }
    deflate(x, y, z) { if (y === undefined) y = z = x; return this.inflate(-x, -y, -z); }
    move(x, y, z) { if (typeof x === "object") [x, y, z] = x; return new AABB(this.minX + x, this.minY + y, this.minZ + z, this.maxX + x, this.maxY + y, this.maxZ + z); }
    expandTowards(x, y, z) { if (typeof x === "object") [x, y, z] = x; const v = [x, y, z]; return new AABB(this[0].map((n, i) => n + Math.min(0, v[i])), this[1].map((n, i) => n + Math.max(0, v[i]))); }
    contract(x, y, z) { const v = [x, y, z]; return new AABB(this[0].map((n, i) => n - Math.min(0, v[i])), this[1].map((n, i) => n - Math.max(0, v[i]))); }
    contains(v) { return v.every((n, i) => n >= this[0][i] && n < this[1][i]); }
    getCenter() { return new Vec3(...this[0].map((n, i) => (n + this[1][i]) / 2)); }
  }
  class BoundingBox extends AABB {
    getXSpan() { return this.maxX - this.minX + 1; }
    getYSpan() { return this.maxY - this.minY + 1; }
    getZSpan() { return this.maxZ - this.minZ + 1; }
    isInside(pos) { return pos.every((v, i) => v >= this[0][i] && v <= this[1][i]); }
    getCenter() { return new BlockPos(...this[0].map((v, i) => v + Math.floor((this[1][i] - v + 1) / 2))); }
  }
  Object.assign(P, { Vec3, BlockPos, AABB, BoundingBox });

  // Selection: a set of block positions.
  class Selection {
    constructor(keys) { this.keys = keys || new Set(); }
    static box(x0, y0, z0, x1, y1, z1) {
      const s = new Selection();
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
        for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
          for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) s.keys.add(key(x, y, z));
      return s;
    }
    copy() { return new Selection(new Set(this.keys)); }
    add(other) { other.keys.forEach(k => this.keys.add(k)); return this; }
    substract(other) { other.keys.forEach(k => this.keys.delete(k)); return this; }
    has(x, y, z) { return this.keys.has(key(x, y, z)); }
    test(pos) { return this.has(...pos); }
    *[Symbol.iterator]() { for (const k of this.keys) yield new BlockPos(...k.split(",").map(Number)); }
    forEach(fn) { for (const p of this) fn(p); }
    makeOutline() {
      if (!this.keys.size) return new P.BlockClusterOutline(this);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      this.forEach(p => p.forEach((v, i) => { min[i] = Math.min(min[i], v); max[i] = Math.max(max[i], v + 1); }));
      return max.reduce((n, v, i) => n * (v - min[i]), 1) === this.keys.size
        ? new P.ChasingAABBOutline(new AABB(min, max)) : new P.BlockClusterOutline(this);
    }
    // Compound.getCenter: the mean of the blocks' corners, plus half a block.
    getCenter() {
      const c = [0, 0, 0];
      if (!this.keys.size) return new Vec3(...c);
      this.keys.forEach(k => k.split(",").forEach((v, i) => { c[i] += +v; }));
      return new Vec3(...c.map(v => v / this.keys.size + 0.5));
    }
  }
  P.Selection = Selection;
  P.blockKey = key;

  // PonderLevel: blocks by position ("minecraft:stone" or { id, states }), restorable.
  class PonderWorld {
    constructor(size) {
      this.size = size; // { x, y, z } from the schematic
      this.blocks = new Map();
      this.blockEntities = new Map();
      this.backup = null;
      this.breaking = new Map(); // blockBreakingProgressions: position key -> destroy stage 0..8
      this.particles = new P.PonderWorldParticles(this);
      this.entities = [];
      this.nextEntityId = 0;
      this.gameTime = 0;
      this.blockVersion = 0;
    }
    setBlock(x, y, z, block) {
      const k = key(x, y, z), previous = this.blocks.get(k);
      if (P.blockEntityType && (P.blockEntityType(previous) !== P.blockEntityType(block) || P.blockNbt(previous) !== P.blockNbt(block))) this.blockEntities.delete(k);
      if (block == null || block === "minecraft:air") this.blocks.delete(key(x, y, z));
      else this.blocks.set(key(x, y, z), block);
      this.blockVersion++;
    }
    getBlock(x, y, z) { return this.blocks.get(key(x, y, z)) || null; }
    getBlockEntity(pos) {
      const k = key(...pos), block = this.getBlock(...pos), Type = P.blockEntityType && P.blockEntityType(block);
      if (!Type) return null;
      if (!this.blockEntities.has(k)) this.blockEntities.set(k, new Type(this, pos, block));
      return this.blockEntities.get(k);
    }
    tickBlockEntities(selection) {
      selection.forEach(pos => {
        const entity = this.getBlockEntity(pos);
        if (entity && entity.lastTick !== this.gameTime) { entity.lastTick = this.gameTime; entity.tick(); }
      });
    }
    inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.size.x && y < this.size.y && z < this.size.z; }
    // PonderLevel.restoreBlocks: only positions the schematic held go back.
    restoreBlocks(selection) {
      selection.keys.forEach(k => { if (this.backup.has(k)) { this.blocks.set(k, this.backup.get(k)); this.blockEntities.delete(k); } });
      this.blockVersion++;
    }
    createBackup() { this.backup = new Map(this.blocks); }
    restore() {
      this.blocks = new Map(this.backup); this.blockEntities.clear(); this.breaking.clear(); this.particles.clearEffects(); this.entities = [];
      this.blockVersion++;
      // PonderLevel.restore: every plugin's onPonderLevelRestore runs after the world is rebuilt.
      P.plugins.forEach(p => { if (p.onPonderLevelRestore) p.onPonderLevelRestore(this); });
    }
    // PonderLevel.tick: particles, then every entity; one below y -0.5 is discarded.
    tick() {
      this.gameTime++;
      this.particles.tick();
      this.entities.forEach(e => {
        e.tick();
        if (e.y <= -0.5) e.discard();
      });
      this.entities = this.entities.filter(e => e.alive);
    }
    addFreshEntity(entity) { entity.id = this.nextEntityId++; this.entities.push(entity); return entity; }
    entityList() { return this.entities; }
    addParticle(data, x, y, z, mx, my, mz) { this.particles.addParticle(data.make(this, x, y, z, mx, my, mz)); }
    // Level.addBlockDestroyEffects divides each box of the shape into at least two particles
    // per axis, no more than a quarter block apart.
    addBlockDestroyEffects(pos, block) {
      if (!block) return;
      const model = P.blockModel(block), bounds = P.blockBounds(model);
      if (!bounds) return;
      const boxes = model.boxes || [{ lo: bounds[0], hi: bounds[1], matrix: P.Mat.id() }];
      boxes.forEach(box => {
        const span = box.hi.map((v, i) => Math.min(1, v - box.lo[i])), count = span.map(v => Math.max(2, Math.ceil(v / 0.25)));
        for (let x = 0; x < count[0]; x++) for (let y = 0; y < count[1]; y++) for (let z = 0; z < count[2]; z++) {
          const f = [x, y, z].map((v, i) => (v + 0.5) / count[i]);
          const p = P.Mat.apply(box.matrix, ...f.map((v, i) => box.lo[i] + v * span[i]));
          this.addParticle(P.blockParticle(block), ...p.map((v, i) => pos[i] + v + P.blockOffset(block, pos)[i]), ...f.map(v => v - 0.5));
        }
      });
    }
    // setBlockBreakingProgress: 0 clears it, otherwise the stage is damage - 1.
    setBlockBreakingProgress(x, y, z, damage) {
      if (damage === 0) this.breaking.delete(key(x, y, z));
      else this.breaking.set(key(x, y, z), damage - 1);
    }
    // BoundingBox spans of the schematic.
    getBounds() { return new BoundingBox([0, 0, 0], [this.size.x - 1, this.size.y - 1, this.size.z - 1]); }
    xSpan() { return this.size.x; }
  }
  P.PonderWorld = PonderWorld;

  // 4x4 matrices, row-major, for PoseStack-style transforms (each step right-multiplies).
  const M = (P.Mat = {
    id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    mul: (a, b) => {
      const r = new Array(16);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++)
        r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j] + a[i * 4 + 3] * b[12 + j];
      return r;
    },
    translate: (m, x, y, z) => M.mul(m, [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1]),
    scale: (m, x, y, z) => M.mul(m, [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]),
    // Axis.XP / YP / ZP .rotationDegrees: right-handed rotation about +X / +Y / +Z.
    rotX: (m, deg) => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return M.mul(m, [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]); },
    rotY: (m, deg) => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return M.mul(m, [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]); },
    rotZ: (m, deg) => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return M.mul(m, [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
    apply: (m, x, y, z) => [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]],
    // Inverse of an affine matrix.
    invert: m => {
      const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
      const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g, det = a * A + b * B + c * C;
      const r = [A / det, (c * h - b * i) / det, (b * f - c * e) / det, 0, B / det, (a * i - c * g) / det, (c * d - a * f) / det, 0,
        C / det, (b * g - a * h) / det, (a * e - b * d) / det, 0, 0, 0, 0, 1];
      const t = M.apply(r, m[3], m[7], m[11]);
      r[3] = -t[0]; r[7] = -t[1]; r[11] = -t[2];
      return r;
    },
  });

  class SceneTransform {
    constructor(scene) {
      this.scene = scene;
      // LerpedFloat.angular().disableSmartAngleChasing()
      this.xRotation = P.angular().startWithValue(-35);
      this.yRotation = P.angular().startWithValue(55 + 90);
      this.width = this.height = 0;
      this.offset = 0;
    }
    tick() { this.xRotation.tickChaser(); this.yRotation.tickChaser(); }
    updateScreenParams(width, height, offset) { this.width = width; this.height = height; this.offset = offset; }
    // SceneTransform.apply as a matrix: scene space to GUI space (x, y in pixels, z depth).
    matrix(pt) {
      const s = this.scene;
      let m = M.translate(M.id(), this.width / 2, this.height / 2, 200 + this.offset);
      m = M.rotX(m, -35); m = M.rotY(m, 55);
      m = M.translate(m, this.offset, 0, 0);
      m = M.rotY(m, -55); m = M.rotX(m, 35);
      m = M.rotX(m, this.xRotation.getValue(pt));
      m = M.rotY(m, this.yRotation.getValue(pt));
      m = M.scale(m, 1, -1, 1); // UIRenderHelper.flipForGuiRender
      const f = 30 * s.scaleFactor;
      m = M.scale(m, f, f, f);
      return M.translate(m, s.basePlateSize / -2 - s.basePlateOffsetX, -1 + s.yOffset, s.basePlateSize / -2 - s.basePlateOffsetZ);
    }
    sceneToScreen(v, pt) { const p = M.apply(this.matrix(pt), v[0], v[1], v[2]); return [p[0], p[1]]; }
    screenToScene(x, y, depth, pt) { return M.apply(M.invert(this.matrix(pt)), x, y, depth); }
  }
  P.SceneTransform = SceneTransform;
})();
