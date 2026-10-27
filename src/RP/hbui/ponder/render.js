// catnip's GUI helpers (UIRenderHelper, BoxElement) and PonderUI.renderSpeechBox, drawn
// with a DrawList `d`. Numbers and colours are Java's.
(function () {
  const P = window.Ponder;
  P.WIDGETS = "/hbui/ponder/assets/widgets.png";
  // PonderGuiTextures: 16x16 icons in widgets.png at (column, row).
  P.Icons = { LEFT: [0, 2], CLOSE: [1, 2], RIGHT: [2, 2], IDENTIFY: [3, 2], REPLAY: [4, 2], USER_MODE: [5, 2],
    SLOW_MODE: [6, 2], DISABLE: [8, 3], LMB: [0, 4], SCROLL: [1, 4], RMB: [2, 4] };
  P.drawIcon = (d, icon, x, y, alpha) => d.sprite(P.WIDGETS, icon[0] * 16, icon[1] * 16, 16, 16, 256, 256, x, y, 16, 16, alpha);

  // UIRenderHelper.streak: a band `breadth` wide, `length` long from (x, y) in direction `angle`
  // (0 = right, 180 = left), fading 0.625 -> 0.5 -> 0.0625 -> 0 at 0, 50, 75 and 100 %.
  P.streak = function (d, angle, x, y, breadth, length, color) {
    if (length <= 0) return;
    const c = color || P.C.STREAK, half = P.int(breadth / 2);
    const a = f => P.css(P.scaleAlpha(c, f));
    const s1 = P.int(0.5 * length) / length * 100, s2 = P.int(0.75 * length) / length * 100;
    d.box(x, y - half, length, 2 * half,
      `transform-origin:0 50%;transform:translate(${P.px(x)},${P.px(y - half)}) rotate(${angle}deg);` +
      `background-image:linear-gradient(90deg,${a(0.625)} 0%,${a(0.5)} ${s1}%,${a(0.5)} ${s1}%,${a(0.0625)} ${s2}%,${a(0.0625)} ${s2}%,${a(0)} 100%)`);
  };

  // BoxElement: flat background with notched corners and a 1 px gradient border,
  // `offset` (borderOffset, default 2) outside the w x h content at (x, y).
  P.boxElement = function (d, x, y, w, h, background, border, alpha, offset) {
    const f = offset === undefined ? 2 : offset, al = alpha === undefined ? 1 : alpha;
    const c1 = P.scaleAlpha(background, al), c2 = P.scaleAlpha(border[0], al), c3 = P.scaleAlpha(border[1], al);
    const L = x - f - 2, T = y - f - 2, W = w + 2 * f + 4, H = h + 2 * f + 4;
    if (c1[3] > 0) {
      const p = [[1, 0], [W - 1, 0], [W - 1, 1], [W, 1], [W, H - 1], [W - 1, H - 1], [W - 1, H], [1, H], [1, H - 1], [0, H - 1], [0, 1], [1, 1]];
      d.box(L, T, W, H, `clip-path:polygon(${p.map(q => P.px(q[0]) + " " + P.px(q[1])).join(",")});background-color:${P.css(c1)}`);
    }
    const ix0 = x - f - 1, iy0 = y - f - 1, ix1 = x + f + 1 + w, iy1 = y + f + 1 + h;
    d.fill(ix0, iy0, ix1, iy0 + 1, c2);
    d.gradient(ix0, iy0 + 1, ix0 + 1, iy1 - 1, c2, c3);
    d.fill(ix0, iy1 - 1, ix1, iy1, c3);
    d.gradient(ix1 - 1, iy0 + 1, ix1, iy1 - 1, c2, c3);
  };

  // UIRenderHelper.breadcrumbArrow: a chevron from (x - indent, y), `width` long (negative
  // points left), coloured c1 -> c2 along its length.
  P.breadcrumbArrow = function (d, x, y, width, height, indent, c1, c2) {
    const xs = [0, indent, width, indent + width];
    const ai = Math.abs(indent), aw = Math.abs(width);
    const fc = [c1, P.mix(c1, c2, ai / (aw + 2 * ai)), P.mix(c1, c2, (ai + aw) / (aw + 2 * ai)), c2];
    const lo = Math.min.apply(null, xs), hi = Math.max.apply(null, xs), span = hi - lo || 1;
    const y1 = height / 2;
    const pts = [[xs[0], y1], [xs[1], 0], [xs[3], 0], [xs[2], y1], [xs[3], height], [xs[1], height]];
    const stops = xs.map((v, i) => [(v - lo) / span, fc[i]]).sort((a, b) => a[0] - b[0]);
    d.polygon(x - indent + lo, y, span, height, pts.map(p => [p[0] - lo, p[1]]), stops);
  };

  // widgets.png SPEECH_TOOLTIP_BACKGROUND (black funnel) and _COLOR (tinted V), 8x8, pointing down.
  const DIVOT_BG = ["########", "########", "########", "########", ".######.", "..####..", "...##...", "........"];
  const DIVOT_V = ["........", "........", "W......W", ".W....W.", "..W..W..", "...WW...", "........", "........"];
  function divot(d, x, y, rotation, tint) {
    const rot = (px, py) => rotation === 90 ? [7 - py, px] : rotation === 180 ? [7 - px, 7 - py] : rotation === 270 ? [py, 7 - px] : [px, py];
    for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) {
      const p = rot(px, py);
      if (DIVOT_BG[py][px] === "#") d.fill(x + p[0], y + p[1], x + p[0] + 1, y + p[1] + 1, P.C.BACKGROUND_FLAT);
      if (DIVOT_V[py][px] === "W") d.fill(x + p[0], y + p[1], x + p[0] + 1, y + p[1] + 1, tint);
    }
  }
  // PonderUI.renderSpeechBox. Returns the box's top-left.
  P.speechBox = function (d, x, y, w, h, highlighted, pointing) {
    const size = 8, distance = 1, radius = size / 2;
    const border = highlighted ? P.C.BUTTON_HOVER : P.C.IDLE;
    let bx = x, by = y, dx = x, dy = y, rotation = 0, tint;
    if (pointing === "LEFT") { rotation = 90; bx += size + 1 + distance; by -= P.int(h / 2); dx += distance; dy -= radius; tint = P.mix(border[0], border[1], 0.5); }
    else if (pointing === "RIGHT") { rotation = 270; bx -= w + size + 1 + distance; by -= P.int(h / 2); dx -= size + distance; dy -= radius; tint = P.mix(border[0], border[1], 0.5); }
    else if (pointing === "UP") { rotation = 180; bx -= P.int(w / 2); by += size + 1 + distance; dx -= radius; dy += distance; tint = border[0]; }
    else { bx -= P.int(w / 2); by -= h + size + 1 + distance; dx -= radius; dy -= size + distance; tint = border[1]; }
    P.boxElement(d, bx, by, w, h, P.C.BACKGROUND_FLAT, border);
    divot(d, dx, dy, rotation, tint);
    return [bx, by];
  };

  // Menu background behind every Ponder screen (Screen.renderBackground over the game).
  P.menuBackground = d => d.fill(0, 0, P.view.width, P.view.height, [16, 16, 16, 150]);
})();
