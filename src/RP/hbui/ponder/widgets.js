// PonderButton (BoxWidget + ElementWidget fade) and PonderProgressBar.
(function () {
  const P = window.Ponder;

  class PonderButton {
    constructor(x, y, w, h) {
      this.x = x; this.y = y; this.width = w || 20; this.height = h || 20;
      this.padding = 2;
      this.fade = P.linear().startWithValue(1);
      this.fadeModY = 0;
      this.flash = P.linear().startWithValue(0).chase(0, 0.1, P.Chaser.EXP);
      this.colorAnimation = P.linear();
      this.colors = { idle: P.C.BUTTON_IDLE, hover: P.C.BUTTON_HOVER, click: P.C.BUTTON_CLICK };
      this.animateColors = true;
      this.hovered = this.wasHovered = false;
      this.gradientColor = this.gradientTarget = this.previousGradient = this.colors.idle;
      this.icon = null; this.item = null; this.tag = null;
      this.shortcut = null; this.callback = null;
      this.background = P.C.BACKGROUND_TRANSPARENT;
    }
    showing(icon) { this.icon = icon; return this; }
    showingItem(id) { this.item = id; return this; }
    showingTag(tag) { this.tag = tag; return this; }
    withShortcut(key) { this.shortcut = key; return this; }
    withCallback(fn) { this.callback = fn; return this; }
    enableFade(modY) { this.fade.startWithValue(0); this.fadeModY = modY; return this; }
    withBorderColors(couple) { this.colors = { idle: couple, hover: couple, click: couple }; this.gradientColor = this.gradientTarget = couple; this.animateColors = false; return this; }
    flashOn() { this.flash.updateChaseTarget(1); }
    dim() { this.flash.updateChaseTarget(0); }
    isVisible() { return !(this.fade.getValue() < 0.1); }
    isMouseOver(mx, my) {
      const p = 2 + this.padding;
      return this.x - p <= mx && this.y - p <= my && mx < this.x + p + this.width && my < this.y + p + this.height;
    }
    colorForState() { return this.hovered ? this.colors.hover : this.colors.idle; }
    startGradientAnimation(target, speed) {
      if (!this.animateColors) return;
      this.colorAnimation.startWithValue(1).chase(0, speed, P.Chaser.EXP);
      this.colorAnimation.tickChaser();
      this.previousGradient = this.gradientColor;
      this.gradientTarget = target;
    }
    tick() { this.fade.tickChaser(); this.flash.tickChaser(); this.colorAnimation.tickChaser(); }
    click() {
      this.gradientColor = this.colors.click;
      this.startGradientAnimation(this.colorForState(), 0.15);
      if (this.callback) this.callback();
    }
    render(d, mx, my, pt) {
      const fadeValue = this.fade.getValue(pt);
      this.hovered = this.isMouseOver(mx, my);
      if (this.hovered !== this.wasHovered) this.startGradientAnimation(this.colorForState(), 0.6);
      if (this.colorAnimation.settled()) this.gradientColor = this.gradientTarget;
      else {
        const t = 1 - Math.abs(this.colorAnimation.getValue(pt));
        this.gradientColor = [0, 1].map(i => P.mix(this.previousGradient[i], this.gradientTarget[i], t));
      }
      const flashValue = this.flash.getValue(pt);
      if (flashValue > 0.1) {
        const sin = (0.5 + 0.5 * Math.sin((P.ticks + pt) / 10)) * flashValue;
        const n1 = [255, 255, 255, P.clamp(this.gradientColor[0][3] + 150, 0, 255)];
        const n2 = [155, 155, 155, P.clamp(this.gradientColor[1][3] + 150, 0, 255)];
        this.gradientColor = [P.mix(this.gradientColor[0], n1, sin), P.mix(this.gradientColor[1], n2, sin)];
      }
      this.wasHovered = this.hovered;
      if (fadeValue < 0.1) return;
      const dy = fadeValue < 1 ? (1 - fadeValue) * this.fadeModY : 0, x = this.x, y = this.y + dy;
      P.boxElement(d, x, y, this.width, this.height, this.background, this.gradientColor, fadeValue);
      if (this.icon) P.drawIcon(d, this.icon, x + 2, y + 2, fadeValue);
      if (this.item) d.item(this.item, x + 2 - 4, y + 2 - 4, 1.5, fadeValue);
      if (this.tag) P.renderTag(d, this.tag, x + 2, y + 2, fadeValue);
      if (this.shortcut) d.centeredText(this.shortcut, x + this.width / 2 + 8, y + this.height - 6, P.scaleAlpha(P.C.TEXT_DARKER, fadeValue), true);
    }
  }
  P.PonderButton = PonderButton;
  // PonderTag.render at (x, y), scaled by `s`: a 64x64 texture at 1/4, or an item at 1.25 from (-2, -2).
  P.renderTag = (d, tag, x, y, alpha, s) => {
    const k = s || 1;
    if (tag.texture) d.sprite(tag.texture, 0, 0, 64, 64, 64, 64, x, y, 16 * k, 16 * k, alpha);
    else d.item(tag.icon, x - 2 * k, y - 2 * k, 1.25 * k, alpha);
  };

  class PonderProgressBar {
    constructor(ui, x, y, w, h) { this.ui = ui; this.x = x; this.y = y; this.width = w; this.height = h; this.progress = P.linear().startWithValue(0); this.hovered = false; }
    isVisible() { return true; }
    tick() { this.progress.chase(this.ui.activeScene().getSceneProgress(), 0.5, P.Chaser.EXP); this.progress.tickChaser(); }
    isMouseOver(mx, my) {
      return this.ui.activeScene().keyframeTimes.length > 0 && mx >= this.x && mx < this.x + this.width + 4 && my >= this.y - 3 && my < this.y + this.height + 20;
    }
    hoveredKeyframeIndex(scene, mx) {
      const total = scene.totalTime, at = P.int((mx - this.x) / (this.width + 4) * total), kf = scene.keyframeTimes;
      const toEnd = total - at, toLast = at - kf[kf.length - 1];
      if (toEnd > 0 && toEnd < toLast / 2) return kf.length;
      let index = -1;
      for (let i = 0; i < kf.length && kf[i] <= at; i++) index = i;
      return index;
    }
    click(mx) {
      const scene = this.ui.activeScene(), i = this.hoveredKeyframeIndex(scene, mx);
      this.ui.seekToTime(i === -1 ? 0 : i === scene.keyframeTimes.length ? scene.totalTime : scene.keyframeTimes[i]);
    }
    render(d, mx, my, pt) {
      const scene = this.ui.activeScene();
      this.hovered = this.isMouseOver(mx, my);
      P.boxElement(d, this.x, this.y, this.width, this.height, P.C.BACKGROUND_FLAT, P.C.IDLE);
      const ox = this.x - 2, oy = this.y - 2, len = (this.width + 4) * this.progress.getValue(pt);
      d.fill(ox, oy + 1, ox + len, oy + 3, P.C.BAR[0]);
      d.fill(ox, oy + 3, ox + len, oy + 4, P.C.BAR[1]);
      const hover = P.C.HOVER.map(c => P.withAlpha(c, 0xe0)), idle = P.C.HOVER.map(c => P.withAlpha(c, 0x70));
      const hi = this.hovered ? this.hoveredKeyframeIndex(scene, mx) : -2, kf = scene.keyframeTimes;
      const mark = (selected, time, pos, c, h) => {
        if (selected) {
          d.gradient(ox + pos, oy + 9, ox + pos + 2, oy + 9 + h, c[1], c[0]);
          const ahead = scene.currentTime < time, text = ahead ? ">" : "<";
          d.text(text, ox + pos + (ahead ? -2 - P.textWidth(text) : 4), oy + 10, c[1], false);
        }
        d.gradient(ox + pos, oy, ox + pos + 2, oy + 1 + h, c[0], c[1]);
      };
      if (hi === -1) mark(true, 0, 0, hover, 8);
      else if (hi === kf.length) mark(true, scene.totalTime, this.width + 4, hover, 8);
      kf.forEach((time, i) => {
        const sel = i === hi;
        mark(sel, time, P.int(time / scene.totalTime * (this.width + 2)), sel ? hover : idle, sel ? 8 : 4);
      });
    }
  }
  P.PonderProgressBar = PonderProgressBar;
})();
