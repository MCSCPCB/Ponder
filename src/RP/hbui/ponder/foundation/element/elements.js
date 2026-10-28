// Scene elements (foundation/element) and PonderUI's base plate effects.
(function () {
  const P = window.Ponder;

  class PonderElement {
    constructor() { this.visible = true; }
    tick() {}
    reset() {}
  }
  class AnimatedSceneElement extends PonderElement {
    constructor() { super(); this.fade = P.linear().startWithValue(0); this.fadeVec = null; }
    forceApplyFade(f) { this.fade.startWithValue(f); }
    setFade(f) { this.fade.setValue(f); }
  }
  class AnimatedOverlayElement extends PonderElement {
    constructor() { super(); this.fade = P.linear().startWithValue(0); }
    setFade(f) { this.fade.setValue(f); }
    getFade(pt) { return this.fade.getValue(pt); }
  }
  // WorldSectionElementImpl: the shown part of the world. `version` changes when it must be redrawn.
  class WorldSectionElement extends AnimatedSceneElement {
    constructor(selection) {
      super();
      this.section = selection ? selection.copy() : null;
      this.centerOfRotation = selection ? selection.center() : [0, 0, 0];
      this.stabilizationAnchor = null;
      this.version = 0;
      this.resetAnimatedTransform();
    }
    resetAnimatedTransform() { this.animatedOffset = this.prevAnimatedOffset = [0, 0, 0]; this.animatedRotation = this.prevAnimatedRotation = [0, 0, 0]; }
    reset(scene) { super.reset(scene); this.resetAnimatedTransform(); }
    tick() { this.prevAnimatedOffset = this.animatedOffset; this.prevAnimatedRotation = this.animatedRotation; }
    isEmpty() { return this.section == null; }
    setEmpty() { this.section = null; this.queueRedraw(); }
    set(selection) { this.section = selection.copy(); this.queueRedraw(); }
    add(selection) { this.section = this.section.add(selection); this.queueRedraw(); }
    erase(selection) { this.section = this.section.substract(selection); this.queueRedraw(); }
    mergeOnto(other) { this.visible = false; if (other.isEmpty()) other.set(this.section); else other.add(this.section); }
    setAnimatedOffset(v, force) { this.animatedOffset = v; if (force) this.prevAnimatedOffset = v; }
    setAnimatedRotation(v, force) { this.animatedRotation = v; if (force) this.prevAnimatedRotation = v; }
    // transformMS: offset, then rotation X, Y, Z about the centre, undone about the anchor.
    transform(m, pt) {
      const M = P.Mat, a = this.prevAnimatedOffset, b = this.animatedOffset;
      m = M.translate(m, P.lerp(pt, a[0], b[0]), P.lerp(pt, a[1], b[1]), P.lerp(pt, a[2], b[2]));
      const r0 = this.prevAnimatedRotation, r1 = this.animatedRotation;
      if (r0.every(v => v === 0) && r1.every(v => v === 0)) return m;
      const rx = P.lerp(pt, r0[0], r1[0]), ry = P.lerp(pt, r0[1], r1[1]), rz = P.lerp(pt, r0[2], r1[2]);
      const around = (m, c, sign) => {
        m = M.translate(m, c[0], c[1], c[2]);
        m = sign > 0 ? M.rotZ(M.rotY(M.rotX(m, rx), ry), rz) : M.rotZ(M.rotY(M.rotX(m, -rx), -ry), -rz);
        return M.translate(m, -c[0], -c[1], -c[2]);
      };
      m = around(m, this.centerOfRotation, 1);
      return this.stabilizationAnchor ? around(m, this.stabilizationAnchor, -1) : m;
    }
    queueRedraw() { this.version++; }
  }

  // TextWindowElement: a box beside the scene, at `y` of a 0..200 window or pointing at `vec`.
  class TextWindowElement extends AnimatedOverlayElement {
    constructor() { super(); this.textGetter = () => "(?) No text was provided"; this.bakedText = null; this.y = 0; this.vec = null; this.nearScene = false; this.palette = P.Palette.WHITE; }
    render(scene, screen, d, pt, fade) {
      if (this.bakedText == null) this.bakedText = this.textGetter();
      if (fade < 1 / 16) return;
      const t = scene.transform;
      const s2s = this.vec ? t.sceneToScreen(this.vec, pt) : [screen.width / 2, (screen.height - 200) / 2 + this.y - 8];
      const settled = t.xRotation.settled() && t.yRotation.settled();
      const pY = settled ? P.int(s2s[1]) : s2s[1];
      const yDiff = (screen.height / 2 - s2s[1] - 10) / 100;
      let targetX = screen.width * P.lerp(yDiff * yDiff, 6 / 8, 5 / 8);
      if (this.nearScene) targetX = Math.min(targetX, s2s[0] + 50);
      if (settled) targetX = P.int(targetX);
      const textWidth = P.int(Math.min(screen.width - targetX, 180));
      const lines = P.splitLines(this.bakedText, textWidth);
      let boxWidth = 0;
      lines.forEach(l => { boxWidth = Math.max(boxWidth, P.textWidth(l)); });
      const boxHeight = P.wordWrapHeight(this.bakedText, boxWidth);
      P.boxElement(d, targetX - 10, pY + 3, boxWidth, boxHeight - 1, P.C.BACKGROUND_FLAT, P.C.WINDOW_BORDER);
      const brighter = P.mix(this.palette, P.color(0xffffffdd, true), 0.5);
      if (this.vec) {
        const len = (targetX - s2s[0]) * fade;
        d.fill(s2s[0], pY, s2s[0] + len, pY + 1, brighter);
        d.gradient(s2s[0], pY + 1, s2s[0] + len, pY + 2, P.color(0xff494949, true), P.color(0xff393939, true));
      }
      const c = P.withAlpha(brighter, Math.max(5, P.int(brighter[3] * P.clamp(fade, 0, 1))));
      lines.forEach((l, i) => d.text(l, P.int(targetX - 10), pY + 3 + 9 * i, c, false));
    }
  }
  // InputWindowElement: a speech box pointing at `sceneSpace` with a key label, a mouse icon and an item.
  class InputWindowElement extends AnimatedOverlayElement {
    constructor(sceneSpace, direction) { super(); this.sceneSpace = sceneSpace; this.direction = direction; this.key = null; this.icon = null; this.item = null; }
    builder() {
      const e = this, b = {
        withItem(item) { e.item = item; return b; },
        leftClick() { e.icon = P.Icons.LMB; return b; },
        scroll() { e.icon = P.Icons.SCROLL; return b; },
        rightClick() { e.icon = P.Icons.RMB; return b; },
        showing(icon) { e.icon = icon; return b; },
        whileSneaking() { e.key = "sneak_and"; return b; },
        whileCTRL() { e.key = "ctrl_and"; return b; },
      };
      return b;
    }
    render(scene, screen, d, pt, fade) {
      const dir = this.direction;
      const xFade = (dir === "RIGHT" ? -1 : dir === "LEFT" ? 1 : 0) * 10 * (1 - fade);
      const yFade = (dir === "DOWN" ? -1 : dir === "UP" ? 1 : 0) * 10 * (1 - fade);
      const text = this.key ? P.sharedText("ponder", this.key) : "";
      if (fade < 1 / 16) return;
      const s2s = scene.transform.sceneToScreen(this.sceneSpace, pt);
      let width = 0, height = 0, keyWidth = 0;
      if (this.icon) { width += 24; height = 24; }
      if (this.key) { keyWidth = P.textWidth(text); width += keyWidth; }
      if (this.item) { width += 24; height = 24; }
      const [bx, by] = P.speechBox(d, s2s[0] + xFade, s2s[1] + yFade, width, height, false, dir);
      if (this.key) d.text(text, bx + 2, by + P.int((height - 9) / 2 + 2), P.scaleAlpha(P.Palette.WHITE, fade), false);
      if (this.icon) d.sprite(P.WIDGETS, this.icon[0] * 16, this.icon[1] * 16, 16, 16, 256, 256, bx + keyWidth, by, 24, 24);
      if (this.item) d.item(this.item, bx + keyWidth + (this.icon ? 24 : 0), by, 1.5);
    }
  }
  Object.assign(P, { PonderElement, AnimatedSceneElement, AnimatedOverlayElement, WorldSectionElement, TextWindowElement, InputWindowElement });

  // A local rectangle (x0..x1, y0..y1 at z = 0) under matrix `m`, as a CSS affine transform
  // of a 100 x 100 box: the screen positions of its corners decide the matrix.
  P.quad = function (d, m, x0, y0, x1, y1, top, bottom) {
    const o = P.Mat.apply(m, x0, y0, 0), u = P.Mat.apply(m, x1, y0, 0), v = P.Mat.apply(m, x0, y1, 0);
    const k = P.view.cssPerGui / 100;
    const a = (u[0] - o[0]) * k, b = (u[1] - o[1]) * k, c = (v[0] - o[0]) * k, e = (v[1] - o[1]) * k;
    const css = `position:absolute;left:0;top:0;width:100px;height:100px;transform-origin:0 0;` +
      `transform:matrix(${a.toFixed(5)},${b.toFixed(5)},${c.toFixed(5)},${e.toFixed(5)},${P.num(o[0])},${P.num(o[1])});` +
      `background-image:linear-gradient(180deg,${P.css(top)},${P.css(bottom)})`;
    d.style(d.take("box"), css);
  };

  // PonderUI.renderScene's "kool shadow fx" and finishing flash: on each of the 4 base plate
  // edges a curtain fading down (shadow) and, while flashing, a green glow rising.
  P.renderPlateEffects = function (d, scene, pt, flashValue) {
    if (scene.hidePlatformShadow) return;
    const size = scene.basePlateSize;
    let flash = flashValue * 0.9;
    const alpha = flash;
    flash *= flash;
    flash = flash * 2 - 1;
    flash *= flash;
    flash = 1 - flash;
    let m = scene.transform.matrix(pt);
    m = P.Mat.translate(m, scene.basePlateOffsetX, 0, scene.basePlateOffsetZ);
    m = P.Mat.scale(m, 1, -1, 1);
    for (let f = 0; f < 4; f++) {
      m = P.Mat.translate(m, size, 0, 0);
      // Back-face culling: only the curtains whose plate side faces the viewer are drawn.
      const out = P.Mat.apply(m, -size / 2, 0, -1), mid = P.Mat.apply(m, -size / 2, 0, 0);
      if (out[2] - mid[2] > 0) {
        if (flash > 0) {
          const g = P.Mat.scale(P.Mat.translate(m, 0, 0, -1 / 1024), 1, 0.5 + flash * 0.75, 1);
          P.quad(d, g, 0, -1, -size, 0, P.color(0x00c6ffc9, true), P.scaleAlpha(P.color(0xaac6ffc9, true), alpha));
        }
        P.quad(d, P.Mat.translate(m, 0, 0, 1 / 1024), 0, 0, -size, 4, P.color(0x66000000, true), P.color(0x00000000, true));
      }
      m = P.Mat.rotY(m, -90);
    }
  };
})();
