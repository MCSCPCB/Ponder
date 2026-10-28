// PonderScene, its world (PonderLevel, a block map restored on every begin) and the scene
// transform (PonderScene.SceneTransform): an orthographic GUI projection, 30 * scale GUI
// pixels per block, X -35° / Y 145° by default.
(function () {
  const P = window.Ponder;
  const key = (x, y, z) => x + "," + y + "," + z;

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
    add(other) { const s = this.copy(); other.keys.forEach(k => s.keys.add(k)); return s; }
    substract(other) { const s = this.copy(); other.keys.forEach(k => s.keys.delete(k)); return s; }
    has(x, y, z) { return this.keys.has(key(x, y, z)); }
    // Compound.getCenter: the mean of the blocks' corners, plus half a block.
    center() {
      const c = [0, 0, 0];
      if (!this.keys.size) return c;
      this.keys.forEach(k => k.split(",").forEach((v, i) => { c[i] += +v; }));
      return c.map(v => v / this.keys.size + 0.5);
    }
  }
  P.Selection = Selection;
  P.blockKey = key;

  // PonderLevel: blocks by position ("minecraft:stone" or { id, states }), restorable.
  class PonderWorld {
    constructor(size) {
      this.size = size; // { x, y, z } from the schematic
      this.blocks = new Map();
      this.backup = null;
      this.breaking = new Map(); // blockBreakingProgressions: position key -> destroy stage 0..8
    }
    setBlock(x, y, z, block) {
      if (block == null || block === "minecraft:air") this.blocks.delete(key(x, y, z));
      else this.blocks.set(key(x, y, z), block);
    }
    getBlock(x, y, z) { return this.blocks.get(key(x, y, z)) || null; }
    inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.size.x && y < this.size.y && z < this.size.z; }
    // PonderLevel.restoreBlocks: only positions the schematic held go back.
    restoreBlocks(selection) {
      selection.keys.forEach(k => { if (this.backup.has(k)) this.blocks.set(k, this.backup.get(k)); });
    }
    createBackup() { this.backup = new Map(this.blocks); }
    restore() { this.blocks = new Map(this.backup); this.breaking.clear(); }
    // setBlockBreakingProgress: 0 clears it, otherwise the stage is damage - 1.
    setBlockBreakingProgress(x, y, z, damage) {
      if (damage === 0) this.breaking.delete(key(x, y, z));
      else this.breaking.set(key(x, y, z), damage - 1);
    }
    // BoundingBox spans of the schematic.
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
