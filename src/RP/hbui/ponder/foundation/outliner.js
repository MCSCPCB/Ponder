// Outliner (catnip/outliner): outlines shown per tick by slot. An outline stays for as many
// ticks as it was last shown for, then fades over FADE_TICKS; refreshing a slot resets that.
// Edges are drawn as the cuboid lines of bufferCuboidLine (width 1/16 of a block by default).
(function () {
  const P = window.Ponder, M = P.Mat;
  const FADE_TICKS = 8, AXES = ["x", "y", "z"];

  // BlockClusterOutline.Cluster.include: the faces and edges that touch an odd number of blocks.
  function cluster(positions) {
    const faces = new Map(), edges = new Map();
    const faceKey = (axis, x, y, z) => axis + ":" + x + "," + y + "," + z;
    const flip = (map, k) => { if (map.has(k)) map.delete(k); else map.set(k, true); };
    positions.forEach(p => {
      const [x, y, z] = p;
      flip(faces, faceKey("x", x, y, z)); flip(faces, faceKey("x", x + 1, y, z));
      flip(faces, faceKey("y", x, y, z)); flip(faces, faceKey("y", x, y + 1, z));
      flip(faces, faceKey("z", x, y, z)); flip(faces, faceKey("z", x, y, z + 1));
      flip(edges, faceKey("x", x, y, z)); flip(edges, faceKey("x", x, y + 1, z));
      flip(edges, faceKey("x", x, y, z + 1)); flip(edges, faceKey("x", x, y + 1, z + 1));
      flip(edges, faceKey("y", x, y, z)); flip(edges, faceKey("y", x + 1, y, z));
      flip(edges, faceKey("y", x, y, z + 1)); flip(edges, faceKey("y", x + 1, y, z + 1));
      flip(edges, faceKey("z", x, y, z)); flip(edges, faceKey("z", x + 1, y, z));
      flip(edges, faceKey("z", x, y + 1, z)); flip(edges, faceKey("z", x + 1, y + 1, z));
    });
    return { faces, edges };
  }

  class Outline {
    constructor() { this.color = P.Palette.WHITE; this.lineWidth = 1 / 32; this.alpha = 1; }
    tick() {}
  }
  class BlockClusterOutline extends Outline {
    constructor(selection) { super(); this.cluster = cluster(Array.from(selection.keys).map(k => k.split(",").map(Number))); }
  }
  // AABBOutline of a box given as [min, max] in scene space.
  class AABBOutline extends Outline {
    constructor(box) { super(); this.box = box; }
    boxAt() { return this.box; }
  }
  // ChasingAABBOutline: moves halfway to its target box every tick.
  const lerpBox = (t, a, b) => [a[0].map((v, i) => P.lerp(t, v, b[0][i])), a[1].map((v, i) => P.lerp(t, v, b[1][i]))];
  class ChasingAABBOutline extends AABBOutline {
    constructor(box) { super(box); this.prevBox = box; this.targetBox = box; }
    tick() { this.prevBox = this.box; this.box = lerpBox(0.5, this.box, this.targetBox); }
    boxAt(pt) { return lerpBox(pt, this.prevBox, this.box); }
  }
  class LineOutline extends Outline {
    constructor() { super(); this.start = this.end = [0, 0, 0]; }
  }

  class Outliner {
    constructor() { this.outlines = new Map(); }
    showCluster(slot, selection) {
      const entry = new OutlineEntry(selection.makeOutline());
      this.outlines.set(slotKey(slot), entry);
      return entry.outline;
    }
    showAABB(slot, box) {
      const entry = new OutlineEntry(new ChasingAABBOutline(new P.AABB(...box)));
      this.outlines.set(slotKey(slot), entry);
      return entry.outline;
    }
    chaseAABB(slot, box) {
      slot = slotKey(slot);
      box = new P.AABB(...box);
      const old = this.outlines.get(slot);
      if (!old || !(old.outline instanceof ChasingAABBOutline)) this.outlines.set(slot, new OutlineEntry(new ChasingAABBOutline(box)));
      const entry = this.outlines.get(slot);
      entry.ticksTillRemoval = 1;
      entry.outline.targetBox = box;
      return entry.outline;
    }
    showLine(slot, start, end) {
      slot = slotKey(slot);
      if (!this.outlines.has(slot) || !(this.outlines.get(slot).outline instanceof LineOutline)) this.outlines.set(slot, new OutlineEntry(new LineOutline()));
      const entry = this.outlines.get(slot);
      entry.ticksTillRemoval = 1;
      entry.outline.start = start;
      entry.outline.end = end;
      return entry.outline;
    }
    tick() {
      this.outlines.forEach((e, k) => { e.tick(); if (!e.isAlive()) this.outlines.delete(k); });
    }
    // renderOutlines, in the scene's GUI space (the camera is at the origin there).
    render(d, matrix, pt, blockPx) {
      this.outlines.forEach(entry => {
        const outline = entry.outline, prev = entry.ticksTillRemoval + 1;
        const last = prev >= 0 ? 1 : 1 + prev / FADE_TICKS, current = 1 + entry.ticksTillRemoval / FADE_TICKS;
        const alpha = entry.isFading() ? P.lerp(pt, last, current) : 1;
        outline.alpha = alpha * alpha * alpha;
        if (outline.alpha < 1 / 8) return;
        const color = P.withAlpha(outline.color, P.int(outline.color[3] * outline.alpha));
        const width = Math.max(outline.lineWidth * blockPx, 1 / P.view.cssPerGui);
        if (outline instanceof BlockClusterOutline) renderCluster(d, matrix, outline.cluster, color, width);
        else if (outline instanceof LineOutline) d.line(M.apply(matrix, ...outline.start), M.apply(matrix, ...outline.end), width, color);
        else renderBox(d, matrix, outline.boxAt(pt), color, width);
      });
    }
  }
  // BlockPos and Vec3 implement Java value equality; opaque scene slots retain their identity.
  const slotKey = slot => slot instanceof P.Vec3 ? slot.constructor.name + ":" + slot.slice().join(",")
    : Array.isArray(slot) && slot.length === 3 && slot.every(v => typeof v === "number") ? "Vec3:" + slot.join(",") : slot;
  class OutlineEntry {
    constructor(outline) { this.outline = outline; this.ticksTillRemoval = 1; }
    tick() { this.ticksTillRemoval--; this.outline.tick(); }
    isAlive() { return this.ticksTillRemoval >= -FADE_TICKS; }
    isFading() { return this.ticksTillRemoval < 0; }
  }

  // bufferCuboidLine of a unit edge along `axis` starting at `p`.
  function edge(d, matrix, p, axis, color, width) {
    const q = p.slice();
    q[AXES.indexOf(axis)] += 1;
    d.line(M.apply(matrix, p[0], p[1], p[2]), M.apply(matrix, q[0], q[1], q[2]), width, color);
  }
  function renderCluster(d, matrix, c, color, width) {
    c.edges.forEach((v, k) => {
      const [axis, pos] = k.split(":"), p = pos.split(",").map(Number);
      edge(d, matrix, p, axis, color, width);
    });
  }
  function renderBox(d, matrix, box, color, width) {
    const [a, b] = box;
    [[a[0], a[1], a[2], b[0], a[1], a[2]], [a[0], a[1], a[2], a[0], b[1], a[2]], [a[0], a[1], a[2], a[0], a[1], b[2]],
      [b[0], b[1], a[2], a[0], b[1], a[2]], [b[0], b[1], a[2], b[0], a[1], a[2]], [b[0], b[1], a[2], b[0], b[1], b[2]],
      [a[0], b[1], b[2], b[0], b[1], b[2]], [a[0], b[1], b[2], a[0], a[1], b[2]], [a[0], b[1], b[2], a[0], b[1], a[2]],
      [b[0], a[1], b[2], a[0], a[1], b[2]], [b[0], a[1], b[2], b[0], b[1], b[2]], [b[0], a[1], b[2], b[0], a[1], a[2]]
    ].forEach(e => d.line(M.apply(matrix, e[0], e[1], e[2]), M.apply(matrix, e[3], e[4], e[5]), width, color));
  }

  Object.assign(P, { Outliner, BlockClusterOutline, ChasingAABBOutline });
})();

// OutlinerElement: refreshes its outline every tick while it is shown and not fading out.
(function () {
  const P = window.Ponder;
  class OutlinerElement extends P.AnimatedSceneElement {
    constructor(outlinerCall) { super(); this.outlinerCall = outlinerCall; this.overrideColor = null; }
    setColor(color) { this.overrideColor = color; }
    tick(scene) {
      if (this.fade.getValue() < 1 / 16) return;
      if (this.fade.getValue(0) > this.fade.getValue(1)) return;
      const params = this.outlinerCall(scene.outliner);
      if (this.overrideColor) params.color = this.overrideColor;
    }
  }
  P.OutlinerElement = OutlinerElement;

  const I = P.Instructions;
  // OutlineSelectionInstruction
  class OutlineSelection extends I.Ticking {
    constructor(color, slot, selection, ticks) { super(false, ticks); this.color = color; this.slot = slot; this.selection = selection; }
    tick(scene) {
      super.tick(scene);
      const o = scene.outliner.showCluster(this.slot, this.selection);
      o.lineWidth = 1 / 16;
      o.color = this.color;
    }
  }
  // TextInstruction with a selection: the text window plus an outline in its colour.
  class TextWithOutline extends I.Text {
    constructor(element, duration, selection) {
      super(element, duration);
      this.outline = new OutlinerElement(o => { const p = o.showCluster(selection, selection); p.lineWidth = 1 / 16; return p; });
    }
    tick(scene) { super.tick(scene); this.outline.overrideColor = this.element.palette; }
    show(scene) { super.show(scene); scene.addElement(this.outline); this.outline.setFade(1); this.outline.visible = true; }
    hide(scene) { super.hide(scene); this.outline.setFade(0); this.outline.visible = false; }
  }
  // ChaseAABBInstruction
  class ChaseAABB extends I.Ticking {
    constructor(color, slot, box, ticks) { super(false, ticks); this.color = color; this.slot = slot; this.box = box; }
    tick(scene) {
      super.tick(scene);
      const o = scene.outliner.chaseAABB(this.slot, this.box);
      o.lineWidth = 1 / 16;
      o.color = this.color;
    }
  }
  // LineInstruction
  class Line extends I.Ticking {
    constructor(color, start, end, ticks, big) { super(false, ticks); this.color = color; this.start = start; this.end = end; this.big = big; }
    tick(scene) {
      super.tick(scene);
      const o = scene.outliner.showLine(this.start, this.start, this.end);
      o.lineWidth = this.big ? 1 / 8 : 1 / 16;
      o.color = this.color;
    }
  }
  // HighlightValueBoxInstruction: a white box chasing out of the point `vec` to `expands` around it.
  class HighlightValueBox extends I.Ticking {
    constructor(vec, expands, ticks) { super(false, ticks); this.vec = vec; this.expands = expands; }
    tick(scene) {
      super.tick(scene);
      const v = this.vec, e = this.expands, point = [v, v];
      const expanded = [[v[0] - e[0], v[1] - e[1], v[2] - e[2]], [v[0] + e[0], v[1] + e[1], v[2] + e[2]]];
      const o = scene.outliner.chaseAABB(this.vec, this.remainingTicks + 1 >= this.totalTicks ? point : expanded);
      o.lineWidth = 1 / 15;
      o.color = P.Palette.WHITE;
    }
  }
  I.HighlightValueBox = HighlightValueBox;
  I.OutlineSelection = OutlineSelection;
  I.ChaseAABB = ChaseAABB;
  I.Line = Line;
  I.TextWithOutline = TextWithOutline;
})();
