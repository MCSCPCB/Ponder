// Ponder for Ore UI: a port of Create's Ponder screen (net.createmod.ponder) to the in-game
// HTML layer. Everything works in Java GUI pixels; `P.view` maps them to CSS pixels.
// Syntax stays at ES2017 (no ?. ?? or class fields): the vanilla bundle is transpiled below that.
(function () {
  const P = (window.Ponder = {});
  P.DEBUG = true;

  // Java's automatic GUI scale (Window.calculateScale): the largest whole scale that keeps
  // the scaled screen at least 320x240 GUI pixels.
  const view = (P.view = { width: 480, height: 270, scale: 1, cssPerGui: 1 });
  P.updateView = function () {
    const dpr = window.devicePixelRatio || 1;
    const fw = window.innerWidth * dpr, fh = window.innerHeight * dpr;
    let s = 1;
    while (fw / (s + 1) >= 320 && fh / (s + 1) >= 240) s++;
    view.scale = s;
    view.cssPerGui = s / dpr;
    view.width = Math.ceil(fw / s);
    view.height = Math.ceil(fh / s);
  };
  // GUI pixels to a CSS length, and to the unitless CSS pixels matrix() takes.
  P.px = n => (n * view.cssPerGui).toFixed(2) + "px";
  P.num = n => (n * view.cssPerGui).toFixed(2);

  // Mth
  P.lerp = (t, a, b) => a + (b - a) * t;
  P.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  P.equal = (a, b) => Math.abs(b - a) < 1.0e-5;
  P.signum = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
  // Java int casts truncate towards zero.
  P.int = v => (v < 0 ? Math.ceil(v) : Math.floor(v));

  // catnip LerpedFloat with its chasers.
  P.Chaser = {
    EXP: (c, s, t) => c + (t - c) * s,
    LINEAR: (c, s, t) => c + P.clamp(t - c, -s, s),
    exp: max => (c, s, t) => c + P.clamp((t - c) * s, -max, max),
  };
  const angleLerp = (pt, cur, tgt) => {
    let d = ((tgt - cur) % 360 + 540) % 360 - 180;
    return cur + d * pt;
  };
  class LerpedFloat {
    constructor(angular) {
      this.angular = !!angular;
      this.chaser = null;
      this.speed = 0;
      this.startWithValue(0);
    }
    startWithValue(v) { this.prev = this.value = this.target = v; return this; }
    chase(v, speed, chaser) { this.target = v; this.speed = speed; this.chaser = chaser; return this; }
    updateChaseTarget(v) { this.target = v; }
    tickChaser() {
      this.prev = this.value;
      if (!this.chaser) return;
      if (P.equal(this.value, this.target)) { this.value = this.target; return; }
      this.value = this.chaser(this.value, this.speed, this.target);
    }
    setValue(v) { this.prev = this.value; this.value = v; }
    getValue(pt) {
      if (pt === undefined) pt = 1;
      return this.angular ? angleLerp(pt, this.prev, this.value) : P.lerp(pt, this.prev, this.value);
    }
    settled() { return P.equal(this.prev, this.value) && (!this.chaser || P.equal(this.value, this.target)); }
  }
  P.LerpedFloat = LerpedFloat;
  P.linear = () => new LerpedFloat(false);
  P.angular = () => new LerpedFloat(true);

  // Colours are [r, g, b, a] with 0..255 channels, like catnip Color.
  // `hasAlpha` false forces an opaque colour, as `new Color(rgb)` does in Java.
  P.color = (argb, hasAlpha) => {
    const a = hasAlpha ? (argb >>> 24) & 255 : 255;
    return [(argb >>> 16) & 255, (argb >>> 8) & 255, argb & 255, a];
  };
  P.scaleAlpha = (c, f) => [c[0], c[1], c[2], P.int(c[3] * P.clamp(f, 0, 1))];
  P.withAlpha = (c, a) => [c[0], c[1], c[2], a];
  P.mix = (a, b, w) => [0, 1, 2, 3].map(i => P.int(a[i] + (b[i] - a[i]) * w));
  P.css = c => `rgba(${c[0]},${c[1]},${c[2]},${(c[3] / 255).toFixed(3)})`;
  const couple = (a, b) => [P.color(a, true), P.color(b, true)];
  P.C = {
    TEXT: P.color(0xffeeeeee, true),
    TEXT_DARKER: P.color(0xffa3a3a3, true),
    TEXT_ACCENT: P.color(0xffddeeff, true),
    STREAK: P.color(0x101010, false),
    BACKGROUND_FLAT: P.color(0xff000000, true),
    BACKGROUND_TRANSPARENT: P.color(0xdd000000, true),
    IDLE: couple(0x40ffeedd, 0x20ffeedd), // PonderUI.COLOR_IDLE
    BUTTON_IDLE: couple(0x60c0c0ff, 0x30c0c0ff),
    BUTTON_HOVER: couple(0xf0c0c0ff, 0xa0c0c0ff),
    BUTTON_CLICK: couple(0xffffffff, 0xddffffff),
    BUTTON_DISABLED: couple(0x80909090, 0x20909090),
    HOVER: couple(0x70ffffff, 0x30ffffff), // PonderUI.COLOR_HOVER
    BAR: couple(0x80aaaadd, 0x50aaaadd),
    WINDOW_BORDER: couple(0x607a6000, 0x207a6000),
    // new Color(0x30_aa9999) without hasAlpha is opaque in Java.
    NAV_ARROW: [P.color(0x80aa9999, true), P.color(0x30aa9999, false)],
    MISSING_VANILLA: couple(0x505000ff, 0x5028007f),
    MISSING_MODDED: couple(0x70984500, 0x70692400),
  };
  // PonderPalette
  P.Palette = { WHITE: P.color(0xeeeeee, false), BLACK: P.color(0x221111, false), RED: P.color(0xff5d6c, false),
    GREEN: P.color(0x8cba51, false), BLUE: P.color(0x5f6caf, false), SLOW: P.color(0x22ff22, false),
    MEDIUM: P.color(0x0084ff, false), FAST: P.color(0xff55ff, false), INPUT: P.color(0x7fcde0, false),
    OUTPUT: P.color(0xddc166, false) };

  // AnimationTickHolder: client ticks, counted while Ponder is open.
  P.ticks = 0;

  // On-screen log for testing without a console. Removed with P.DEBUG = false.
  const lines = [];
  P.log = function () {
    const text = Array.prototype.slice.call(arguments).join(" ");
    lines.push(text);
    if (lines.length > 14) lines.shift();
    if (P.DEBUG && P.logNode) P.logNode.textContent = lines.join("\n");
  };
  window.addEventListener("error", e => P.log("error:", e.message, "@" + e.lineno));
})();
