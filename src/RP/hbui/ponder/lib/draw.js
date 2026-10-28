// Immediate-mode drawing onto pooled DOM nodes, so the screens can keep Java's render code
// shape: each frame re-issues its draw calls in order, a node is reused per call position and
// only touched when its style changed. Coordinates are GUI pixels; DOM order is draw order.
(function () {
  const P = window.Ponder;
  // Java's 8 px font. Minecraft Seven v4 has the Java advances at 8 px (A = 6, i = 2, space = 4).
  P.FONT = '"Minecraft Seven v4", "Noto Sans", "Noto Sans SC", "Noto Sans TC", "Noto Sans JP", "Noto Sans KR"';
  const FONT_SIZE = 8, LINE_HEIGHT = 9;
  P.LINE_HEIGHT = LINE_HEIGHT;

  // Font.width: measured once per character at 10x, so sub-pixel advances add up exactly.
  const widths = new Map();
  let probe = null;
  function measure(ch) {
    if (!probe) {
      probe = document.createElement("span");
      probe.style.cssText = `position:absolute;left:-10000px;top:0;visibility:hidden;white-space:pre;font-family:${P.FONT};font-size:${FONT_SIZE * 10}px`;
      document.body.appendChild(probe);
    }
    probe.textContent = ch;
    return probe.getBoundingClientRect().width / 10;
  }
  P.fontReady = function () {
    return Math.abs(measure("A") - 6) < 0.5;
  };
  P.charWidth = function (ch) {
    let w = widths.get(ch);
    if (w === undefined) {
      w = measure(ch);
      // Before the font has loaded the fallback measures wrong; do not keep that.
      if (P.fontReady()) widths.set(ch, w);
    }
    return w;
  };
  P.textWidth = function (text) {
    let w = 0;
    for (const ch of text) w += P.charWidth(ch);
    return w;
  };
  // StringSplitter.splitLines: breaks at the last space that fits, or anywhere for text
  // without spaces (CJK), and at "\n".
  P.splitLines = function (text, maxWidth) {
    const out = [];
    for (const paragraph of String(text).split("\n")) {
      let line = "", width = 0, lastSpace = -1;
      for (const ch of paragraph) {
        const w = P.charWidth(ch);
        if (width + w > maxWidth && line.length > 0) {
          if (ch !== " " && lastSpace > 0) {
            out.push(line.slice(0, lastSpace));
            line = line.slice(lastSpace + 1);
          } else {
            out.push(line);
            line = "";
          }
          width = P.textWidth(line);
          lastSpace = -1;
          if (ch === " ") continue;
        }
        if (ch === " ") lastSpace = line.length;
        line += ch;
        width += w;
      }
      out.push(line);
    }
    return out;
  };
  P.wordWrapHeight = (text, maxWidth) => P.splitLines(text, maxWidth).length * LINE_HEIGHT;
  // FontHelper.cutTextComponent: words (with their trailing spaces; CJK one character each, as
  // BreakIterator splits them) fill lines up to maxWidth. "_" switches between the palette's two
  // colours and is not drawn; it is dropped here, so callers pass single-colour palettes only.
  const WORDS = /[　-鿿＀-￯]\s*|[^\s　-鿿＀-￯]*\s+|[^\s　-鿿＀-￯]+/g;
  P.cutText = function (text, maxWidth) {
    const lines = [];
    let line = "", width = 0;
    for (const word of String(text).match(WORDS) || []) {
      const w = P.textWidth(word.replace(/_/g, ""));
      if (width + w > maxWidth) {
        if (width > 0) { lines.push(line); line = ""; width = 0; }
        else { lines.push(word); continue; }
      }
      line += word;
      width += w;
    }
    if (width > 0) lines.push(line);
    return lines.map(l => l.replace(/_/g, ""));
  };

  class DrawList {
    constructor(container) {
      this.root = container;
      this.nodes = [];
      this.used = 0;
    }
    begin() { this.used = 0; }
    end() {
      for (let i = this.used; i < this.nodes.length; i++) this.style(this.nodes[i], "display:none");
    }
    // The next node, emptied when it held something else: "box" (no content), "text" or "image".
    take(kind) {
      let n = this.nodes[this.used];
      if (!n) {
        const el = document.createElement("div");
        this.root.appendChild(el);
        n = this.nodes[this.used] = { el: el, css: "", kind: "box", text: "", img: null, src: "", imgCss: "" };
      }
      this.used++;
      if (n.kind !== kind) {
        n.el.textContent = "";
        n.text = "";
        n.img = null;
        n.src = n.imgCss = "";
        n.kind = kind;
      }
      return n;
    }
    style(n, css) {
      if (n.css !== css) { n.el.style.cssText = css; n.css = css; }
      return n;
    }
    // A box at (x, y), w x h GUI pixels, with extra CSS.
    box(x, y, w, h, extra, kind) {
      return this.style(this.take(kind || "box"), `position:absolute;left:0;top:0;transform-origin:0 0;transform:translate(${P.px(x)},${P.px(y)});width:${P.px(w)};height:${P.px(h)};${extra || ""}`);
    }
    // A polygon (GUI points relative to x, y) filled with a horizontal gradient.
    polygon(x, y, w, h, points, stops) {
      const clip = points.map(p => `${P.px(p[0])} ${P.px(p[1])}`).join(",");
      const grad = stops.map(s => `${P.css(s[1])} ${(s[0] * 100).toFixed(2)}%`).join(",");
      this.box(x, y, w, h, `clip-path:polygon(${clip});background-image:linear-gradient(90deg,${grad})`);
    }
    fill(x0, y0, x1, y1, c) {
      if (c[3] <= 0) return;
      this.box(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0), `background-color:${P.css(c)}`);
    }
    // GuiGraphics.fillGradient: top colour to bottom colour.
    gradient(x0, y0, x1, y1, top, bottom) {
      if (top[3] <= 0 && bottom[3] <= 0) return;
      this.box(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0),
        `background-image:linear-gradient(180deg,${P.css(top)},${P.css(bottom)})`);
    }
    // drawString: one line, top-left at (x, y); `shadow` adds Java's dark copy 1 px down-right.
    text(str, x, y, c, shadow, scale) {
      if (c[3] <= 0 || str === "") return;
      const s = scale || 1;
      if (shadow) this.text(str, x + s, y + s, [c[0] >> 2, c[1] >> 2, c[2] >> 2, c[3]], false, s);
      const n = this.style(this.take("text"), `position:absolute;left:0;top:0;transform:translate(${P.px(x)},${P.px(y)});white-space:pre;font-family:${P.FONT};font-size:${P.px(FONT_SIZE * s)};line-height:${P.px(FONT_SIZE * s)};color:${P.css(c)}`);
      if (n.text !== str) { n.el.textContent = str; n.text = str; }
    }
    centeredText(str, x, y, c, shadow) { this.text(str, x - P.textWidth(str) / 2, y, c, shadow); }
    // Text rotated about the horizontal line y = pivotY, seen edge-on: scaled by `sy` vertically.
    flippedText(str, x, y, c, sy, pivotY) {
      if (c[3] <= 0 || str === "" || Math.abs(sy) < 1e-3) return;
      const n = this.style(this.take("text"), `position:absolute;left:0;top:0;transform-origin:0 0;transform:matrix(1,0,0,${sy.toFixed(4)},${P.num(x)},${P.num(pivotY + (y - pivotY) * sy)});white-space:pre;font-family:${P.FONT};font-size:${P.px(FONT_SIZE)};line-height:${P.px(FONT_SIZE)};color:${P.css(c)}`);
      if (n.text !== str) { n.el.textContent = str; n.text = str; }
    }
    // Text shown only inside x..x+clipW (RenderSystem.enableScissor), drawn at (x+dx, y+dy).
    clippedText(str, x, y, clipW, h, dx, dy, c) {
      if (clipW <= 0 || c[3] <= 0) return;
      const n = this.box(x, y, clipW, h, `overflow:hidden;white-space:pre;font-family:${P.FONT};font-size:${P.px(FONT_SIZE)};line-height:${P.px(FONT_SIZE)};color:${P.css(c)};padding-left:${P.px(dx)};padding-top:${P.px(dy)};box-sizing:border-box`, "text");
      if (n.text !== str) { n.el.textContent = str; n.text = str; }
    }
    // A u,v region of a texture (texW x texH) drawn into x, y, w, h.
    sprite(src, u, v, uw, vh, texW, texH, x, y, w, h, alpha, filter) {
      const sx = w / uw, sy = h / vh;
      const n = this.box(x, y, w, h, `overflow:hidden;opacity:${(alpha === undefined ? 1 : alpha).toFixed(3)}`, "image");
      if (!n.img) { n.img = document.createElement("img"); n.el.appendChild(n.img); }
      if (n.src !== src) { n.img.src = src; n.src = src; }
      const css = `position:absolute;left:0;top:0;transform-origin:0 0;transform:translate(${P.px(-u * sx)},${P.px(-v * sy)});width:${P.px(texW * sx)};height:${P.px(texH * sy)};image-rendering:pixelated${filter ? ";filter:" + filter : ""}`;
      if (n.imgCss !== css) { n.img.style.cssText = css; n.imgCss = css; }
    }
    // A texture whose corners (0,0), (1,0) and (0,1) land on the GUI points o, u, v, laid out
    // `size` CSS pixels square (about its size on screen, so the pixels stay sharp).
    // `filter` (a CSS filter) shades or tints it.
    texturedQuad(src, o, u, v, filter, size) {
      const s = size || 16, k = P.view.cssPerGui / s, f = n => n.toFixed(5);
      const n = this.style(this.take("image"), `position:absolute;left:0;top:0;width:${s}px;height:${s}px;transform-origin:0 0;` +
        `transform:matrix(${f((u[0] - o[0]) * k)},${f((u[1] - o[1]) * k)},${f((v[0] - o[0]) * k)},${f((v[1] - o[1]) * k)},${P.num(o[0])},${P.num(o[1])})`);
      if (!n.img) { n.img = document.createElement("img"); n.el.appendChild(n.img); }
      if (n.src !== src) { n.img.src = src; n.src = src; }
      const css = `position:absolute;left:0;top:0;width:${s}px;height:${s}px;image-rendering:pixelated${filter ? ";filter:" + filter : ""}`;
      if (n.imgCss !== css) { n.img.style.cssText = css; n.imgCss = css; }
    }
    // A line from GUI point a to b, `width` GUI pixels thick.
    line(a, b, width, c) {
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      if (len < 1e-3) return;
      const ux = dx / len, uy = dy / len, k = P.view.cssPerGui, f = n => n.toFixed(4);
      this.style(this.take("box"), `position:absolute;left:0;top:0;width:1px;height:1px;transform-origin:0 0;` +
        `transform:matrix(${f(ux * len * k)},${f(uy * len * k)},${f(-uy * width * k)},${f(ux * width * k)},${P.num(a[0] + uy * width / 2)},${P.num(a[1] - ux * width / 2)});background-color:${P.css(c)}`);
    }
    // GuiGameElement.of(item) at scale `s` (16 * s GUI pixels), as Ore UI draws item icons.
    item(id, x, y, s, alpha) {
      const size = Math.round(16 * s * P.view.cssPerGui);
      this.sprite(`geo-item://${id}?width=${size}&height=${size}`, 0, 0, 1, 1, 1, 1, x, y, 16 * s, 16 * s, alpha);
    }
  }
  P.DrawList = DrawList;
})();
