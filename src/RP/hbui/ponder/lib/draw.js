// Immediate-mode drawing onto pooled DOM nodes, so the screens can keep Java's render code
// shape: each frame re-issues its draw calls in order, a node is reused per call position and
// only touched when its style changed. Coordinates are GUI pixels; overlapping draws keep
// their order. Texture faces share a filter layer when compositing them together is equivalent.
(function () {
  const P = window.Ponder;
  // GPU repeat addressing, expressed as clipped copies of the image for Ore UI. Splitting in
  // UV space preserves the face and its winding while either coordinate crosses a tile edge.
  P.repeatTexture = function (d, src, o, u, v, a, b, c, clip, filter, size, blend, glint) {
    const du = [b[0] - a[0], b[1] - a[1]], dv = [c[0] - a[0], c[1] - a[1]], det = du[0] * dv[1] - du[1] * dv[0];
    const area = (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]);
    if (Math.abs(det) < 1.0e-12 || Math.abs(area) < 1.0e-8) return;
    const cut = (points, distance) => {
      const out = [];
      for (let i = 0; i < points.length; i++) {
        const p = points[i], q = points[(i + 1) % points.length], x = distance(p), y = distance(q);
        if (x >= 0) out.push(p);
        if ((x < 0) !== (y < 0)) { const t = x / (x - y); out.push(p.map((n, j) => n + (q[j] - n) * t)); }
      }
      return out;
    };
    // Clip before tiling: beacon beams extend far outside the screen. Offscreen copies
    // would otherwise still allocate DOM nodes and native filter surfaces.
    const jx = [0, 1].map(i => ((u[i] - o[i]) * dv[1] - (v[i] - o[i]) * du[1]) / det);
    const jy = [0, 1].map(i => ((v[i] - o[i]) * du[0] - (u[i] - o[i]) * dv[0]) / det), pad = 1 / P.view.cssPerGui;
    for (let axis = 0; axis < 2; axis++) {
      const at = p => o[axis] + jx[axis] * (p[0] - a[0]) + jy[axis] * (p[1] - a[1]);
      clip = cut(cut(clip, p => at(p) + pad), p => (axis ? P.view.height : P.view.width) + pad - at(p));
    }
    if (clip.length < 3) return;
    const min = [0, 1].map(i => Math.floor(Math.min(...clip.map(p => p[i])))), max = [0, 1].map(i => Math.ceil(Math.max(...clip.map(p => p[i]))));
    for (let x = min[0]; x < max[0]; x++) for (let y = min[1]; y < max[1]; y++) {
      const points = cut(cut(cut(cut(clip, p => p[0] - x), p => x + 1 - p[0]), p => p[1] - y), p => y + 1 - p[1]);
      if (points.length < 3) continue;
      const area = points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0);
      if (Math.abs(area) < 1.0e-12) continue;
      const shift = p => [p[0] - x, p[1] - y];
      d.texturedQuadMap(src, o, u, v, shift(a), shift(b), shift(c), points.map(shift), filter, size, null, blend, null,
        glint && Object.assign({}, glint, { offset: [x, y] }));
    }
  };
  // Java's 8 px font. Minecraft Seven v4 has the Java advances at 8 px (A = 6, i = 2, space = 4).
  P.FONT = '"Minecraft Seven v4", "Noto Sans", "Noto Sans SC", "Noto Sans TC", "Noto Sans JP", "Noto Sans KR"';
  const FONT_SIZE = 8, LINE_HEIGHT = 9;
  P.LINE_HEIGHT = LINE_HEIGHT;

  // Font.width: each character's advance, from its own span at 10x so sub-pixel advances add up
  // exactly. Gameface lays out once per frame and getBoundingClientRect returns that layout, so
  // a span's text never changes and it is read once laid out; until then Java's advances stand in.
  const widths = new Map(), spans = new Map();
  let probe = null;
  function measure(ch) {
    let s = spans.get(ch);
    if (!s) {
      if (!probe) {
        probe = document.createElement("div");
        probe.style.cssText = `position:absolute;left:-10000px;top:0;width:10000px;visibility:hidden;font-family:${P.FONT};font-size:${FONT_SIZE * 10}px`;
        document.body.appendChild(probe);
      }
      s = document.createElement("span");
      s.style.cssText = "position:absolute;left:0;top:0;white-space:pre";
      s.textContent = ch;
      probe.appendChild(s);
      spans.set(ch, s);
    }
    return s.getBoundingClientRect().width / 10;
  }
  P.fontReady = function () {
    return Math.abs(measure("A") - 6) < 0.5;
  };
  P.charWidth = function (ch) {
    let w = widths.get(ch);
    if (w !== undefined) return w;
    w = measure(ch);
    // Not laid out yet, or still in the fallback font before Minecraft Seven has loaded.
    if (w > 0 && P.fontReady()) { widths.set(ch, w); return w; }
    return ch === " " ? 4 : ch >= "⺀" ? 9 : 6;
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
  P.styledWidth = runs => runs.reduce((w, run) => w + P.textWidth(run.text) + (run.bold ? Array.from(run.text).length : 0), 0);
  P.splitStyledLines = function (runs, maxWidth) {
    const lines = []; let line = [], width = 0;
    const flush = () => { lines.push(line); line = []; width = 0; };
    runs.forEach(run => {
      for (const ch of run.text) {
        if (ch === "\n") { flush(); continue; }
        const w = P.charWidth(ch) + (run.bold ? 1 : 0);
        if (width + w > maxWidth && line.length) {
          let space = line.length - 1;
          while (space > 0 && line[space].text !== " ") space--;
          if (ch !== " " && space > 0) {
            const rest = line.slice(space + 1); line.length = space; flush(); line = rest; width = P.styledWidth(line);
          } else { flush(); if (ch === " ") continue; }
        }
        line.push(Object.assign({}, run, { text: ch })); width += w;
      }
    });
    flush();
    return lines.map(line => {
      const merged = [];
      line.forEach(run => {
        const last = merged[merged.length - 1];
        if (last && ["color", "bold", "italic", "underlined", "strikethrough", "obfuscated"].every(k => last[k] === run[k])) last.text += run.text;
        else merged.push(Object.assign({}, run));
      });
      return merged;
    });
  };
  const textStyle = (style, size) => !style ? "" : (style.bold ? `;letter-spacing:${size}px;text-shadow:${size}px 0 currentColor` : "") +
    (style.italic ? ";font-style:italic" : "") + (style.underlined || style.strikethrough ? ";text-decoration:" + [style.underlined && "underline", style.strikethrough && "line-through"].filter(Boolean).join(" ") : "");
  const displayText = (text, style) => style && style.obfuscated ? Array.from(text).map((ch, i) => P.charWidth(ch) === 6 && ch !== " " ? "ABCDEFGH"[(i + P.ticks) % 8] : ch).join("") : text;
  // Request scene textures before their first visible frame. Keep one hidden image per URL
  // attached to the document so Gameface can load it while the scene is playing its intro.
  const preloadImages = new Map();
  P.preloadTexture = function (url) {
    if (!url || preloadImages.has(url)) return;
    const img = document.createElement("img");
    img.style.cssText = "position:absolute;left:-10000px;top:0;width:1px;height:1px;visibility:hidden";
    preloadImages.set(url, img);
    img.src = url;
    document.body.appendChild(img);
  };
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

  // A colour multiplier with unchanged alpha commutes with source-over compositing. Other
  // filters (including entity alpha tests) can only be shared by faces that do not overlap.
  const linearFilters = new Map();
  function linearFilter(filter) {
    if (!filter) return true;
    if (linearFilters.has(filter)) return linearFilters.get(filter);
    const m = /^coh-color-matrix\(([^)]+)\)$/.exec(filter), values = m ? m[1].split(",").map(Number) : [];
    const linear = values.length === 20 && values.every((v, i) =>
      i === 0 || i === 6 || i === 12 ? v >= 0 && v <= 1 : v === (i === 18 ? 1 : 0));
    linearFilters.set(filter, linear);
    return linear;
  }
  function faceBounds(points) {
    return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
      Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
  }
  // Convex texture faces are separated if either polygon has an edge whose normal separates
  // them. Leave a CSS pixel on each side for the rasterizer's antialiasing fringe.
  function facesOverlap(a, b) {
    const gap = 2 / P.view.cssPerGui, x = a.bounds, y = b.bounds;
    if (x[2] + gap < y[0] || y[2] + gap < x[0] || x[3] + gap < y[1] || y[3] + gap < x[1]) return false;
    for (const points of [a.points, b.points]) for (let i = 0; i < points.length; i++) {
      const p = points[i], q = points[(i + 1) % points.length], nx = q[1] - p[1], ny = p[0] - q[0], length = Math.hypot(nx, ny);
      if (length < 1e-7) continue;
      const project = v => (v[0] * nx + v[1] * ny) / length;
      const u = a.points.map(project), v = b.points.map(project);
      if (Math.max(...u) + gap < Math.min(...v) || Math.max(...v) + gap < Math.min(...u)) return false;
    }
    return true;
  }
  function placeChildren(parent, children) {
    children.forEach((child, i) => { if (parent.children[i] !== child) parent.insertBefore(child, parent.children[i] || null); });
  }

  // World faces keep their GUI depth until painting. A face's centre cannot order a long
  // banner against its pole, or intersecting model parts. Partition their planes instead,
  // splitting a crossing polygon while keeping its image mapping. GUI z grows towards us.
  const DEPTH_EPSILON = 1e-6;
  function facePlane(points) {
    const o = points[0];
    for (let i = 1; i + 1 < points.length; i++) {
      const u = points[i].map((n, k) => n - o[k]), v = points[i + 1].map((n, k) => n - o[k]), det = u[0] * v[1] - u[1] * v[0];
      if (Math.abs(det) < 1e-9) continue;
      const a = (u[2] * v[1] - v[2] * u[1]) / det, b = (v[2] * u[0] - u[2] * v[0]) / det;
      return [a, b, o[2] - a * o[0] - b * o[1]];
    }
    return null;
  }
  const planeDistance = (plane, p) => p[2] - plane[0] * p[0] - plane[1] * p[1] - plane[2];
  // BoatModel's water patch writes depth without colour. Remove only the water behind its
  // projected polygon; the remaining pieces keep their original texture mapping.
  function maskWater(face, mask) {
    const overlap = overlapDepth(face, mask);
    if (!overlap || overlap[0] > DEPTH_EPSILON) return [face];
    let area = 0;
    mask.points.forEach((p, i) => { const q = mask.points[(i + 1) % mask.points.length]; area += p[0] * q[1] - q[0] * p[1]; });
    const sign = Math.sign(area), planes = mask.points.map((p, i) => {
      const q = mask.points[(i + 1) % mask.points.length];
      return v => ((q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0])) * sign;
    });
    planes.push(p => -planeDistance(mask.plane, p));
    const out = [];
    let inside = face.points;
    planes.forEach(distance => {
      const keep = [], next = [];
      if (!inside.length) return;
      let p = inside[inside.length - 1], a = distance(p);
      inside.forEach(q => {
        const b = distance(q);
        if (a < 0 && b > 0 || a > 0 && b < 0) {
          const t = a / (a - b), at = p.map((v, i) => v + (q[i] - v) * t);
          keep.push(at); next.push(at);
        }
        if (b < 0) keep.push(q); else next.push(q);
        p = q; a = b;
      });
      if (keep.length >= 3 && facePlane(keep)) out.push({ node: face.node, points: keep, plane: face.plane, bounds: faceBounds(keep) });
      inside = next;
    });
    return out;
  }
  function partitionFaces(faces) {
    if (faces.length < 2) return faces;
    // Sample partition planes to limit both image fragments and tree depth.
    let plane = faces[0].plane, best = Infinity;
    for (const i of new Set([0, Math.floor(faces.length / 4), Math.floor(faces.length / 2), Math.floor(faces.length * 3 / 4), faces.length - 1])) {
      const p = faces[i].plane;
      let back = 0, front = 0, splits = 0;
      faces.forEach(f => {
        const d = f.points.map(v => planeDistance(p, v)), lo = Math.min(...d) < -DEPTH_EPSILON, hi = Math.max(...d) > DEPTH_EPSILON;
        if (lo) back++; if (hi) front++; if (lo && hi) splits++;
      });
      const score = splits * 8 + Math.abs(back - front);
      if (score < best) { best = score; plane = p; }
    }
    const back = [], front = [], same = [];
    faces.forEach(f => {
      const distances = f.points.map(v => planeDistance(plane, v));
      const lo = Math.min(...distances) < -DEPTH_EPSILON, hi = Math.max(...distances) > DEPTH_EPSILON;
      if (!lo && !hi) { same.push(f); return; }
      if (!hi) { back.push(f); return; }
      if (!lo) { front.push(f); return; }
      const neg = [], pos = [];
      let v = f.points[f.points.length - 1], d = distances[distances.length - 1];
      f.points.forEach((w, i) => {
        const e = distances[i];
        if ((d < -DEPTH_EPSILON && e > DEPTH_EPSILON) || (d > DEPTH_EPSILON && e < -DEPTH_EPSILON)) {
          const t = d / (d - e), at = v.map((n, k) => n + t * (w[k] - n));
          neg.push(at); pos.push(at);
        }
        if (e <= DEPTH_EPSILON) neg.push(w);
        if (e >= -DEPTH_EPSILON) pos.push(w);
        v = w; d = e;
      });
      back.push({ node: f.node, plane: f.plane, points: neg });
      front.push({ node: f.node, plane: f.plane, points: pos });
    });
    // Coplanar images retain their order (a banner's base, then its patterns).
    return partitionFaces(back).concat(same, partitionFaces(front));
  }
  // Only overlapping screen regions constrain the paint order. Partition just the cycles
  // in that order: extending every plane across the scene would split unrelated models too.
  // Pair tests run sequentially; reuse their clipped vertices instead of allocating them
  // for every overlapping pair. The original face vertices are never written into.
  const overlapBuffers = [[], []];
  function overlapDepth(a, b) {
    const x = a.bounds, y = b.bounds;
    if (x[2] <= y[0] || y[2] <= x[0] || x[3] <= y[1] || y[3] <= x[1]) return null;
    let points = a.points;
    const clip = b.points;
    let area = 0;
    for (let i = 0; i < clip.length; i++) {
      const p = clip[i], q = clip[(i + 1) % clip.length];
      area += p[0] * q[1] - q[0] * p[1];
    }
    const sign = Math.sign(area);
    let length = points.length, buffer = 0;
    for (let i = 0; i < clip.length && length; i++) {
      const p = clip[i], q = clip[(i + 1) % clip.length], dx = q[0] - p[0], dy = q[1] - p[1];
      let outside = false;
      for (let j = 0; j < length; j++) {
        const v = points[j];
        if ((dx * (v[1] - p[1]) - dy * (v[0] - p[0])) * sign < 0) { outside = true; break; }
      }
      if (!outside) continue;
      const next = overlapBuffers[buffer];
      buffer = 1 - buffer;
      let count = 0, v = points[length - 1], d = (dx * (v[1] - p[1]) - dy * (v[0] - p[0])) * sign;
      for (let j = 0; j < length; j++) {
        const w = points[j], e = (dx * (w[1] - p[1]) - dy * (w[0] - p[0])) * sign;
        if ((d < 0 && e > 0) || (d > 0 && e < 0)) {
          const t = d / (d - e), at = next[count] || (next[count] = [0, 0, 0]);
          for (let k = 0; k < 3; k++) at[k] = v[k] + t * (w[k] - v[k]);
          count++;
        }
        if (e >= 0) {
          const at = next[count] || (next[count] = [0, 0, 0]);
          at[0] = w[0]; at[1] = w[1]; at[2] = w[2]; count++;
        }
        v = w; d = e;
      }
      points = next; length = count;
    }
    if (length < 3) return null;
    area = 0;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < length; i++) {
      const p = points[i], q = points[(i + 1) % length], d = planeDistance(b.plane, p);
      area += p[0] * q[1] - q[0] * p[1];
      lo = Math.min(lo, d); hi = Math.max(hi, d);
    }
    return Math.abs(area) > 1e-8 ? [lo, hi] : null;
  }
  function depthOrder(faces) {
    const edges = faces.map(() => []);
    for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
      const range = overlapDepth(faces[i], faces[j]);
      if (!range) continue;
      const back = range[0] < -DEPTH_EPSILON, front = range[1] > DEPTH_EPSILON;
      if (back || !front) edges[i].push(j);
      if (front) edges[j].push(i);
    }
    // Tarjan's components put every intersecting pair and any longer ordering cycle in one
    // group. Their reverse completion order is a valid painter order for all other faces.
    const index = faces.map(() => -1), low = [], stack = [], active = new Set(), groups = [];
    let next = 0;
    const visit = i => {
      index[i] = low[i] = next++; stack.push(i); active.add(i);
      for (const j of edges[i]) {
        if (index[j] < 0) { visit(j); low[i] = Math.min(low[i], low[j]); }
        else if (active.has(j)) low[i] = Math.min(low[i], index[j]);
      }
      if (low[i] !== index[i]) return;
      const group = [];
      let j;
      do { j = stack.pop(); active.delete(j); group.push(j); } while (j !== i);
      groups.push(group.sort((a, b) => a - b));
    };
    for (let i = faces.length - 1; i >= 0; i--) if (index[i] < 0) visit(i);
    const ordered = [];
    groups.reverse().forEach(group => ordered.push(...partitionFaces(group.map(i => faces[i]))));
    return ordered;
  }

  class DrawList {
    constructor(container) {
      this.root = container;
      this.nodes = [];
      this.used = 0;
      this.layers = [];
      this.waterMasks = [];
    }
    begin() { this.used = 0; this.waterMasks = []; }
    waterMask(points) {
      const plane = facePlane(points);
      if (plane) this.waterMasks.push({ points, plane, bounds: faceBounds(points) });
    }
    // Grow the same pools in small steps during a scene's intro. These nodes stay hidden
    // until a draw uses them; reserving never submits faces or changes the current frame.
    reserve(nodes, layers) {
      const end = Math.min(nodes, this.nodes.length + 16);
      while (this.nodes.length < end) {
        const n = this.node();
        n.kind = "image";
        n.img = document.createElement("img"); n.el.appendChild(n.img);
        this.nodes.push(n);
      }
      const endLayers = Math.min(layers, this.layers.length + 16);
      while (this.layers.length < endLayers) this.layers.push(this.layer());
    }
    node() {
      const el = document.createElement("div");
      const n = { el, css: "", kind: "box", text: "", img: null, src: "", imgCss: "" };
      this.style(n, "display:none");
      this.root.appendChild(el);
      return n;
    }
    layer() {
      const el = document.createElement("div"), inner = document.createElement("div");
      el.appendChild(inner);
      return this.style({ el, inner, css: "", offset: "" }, "display:none");
    }
    end() {
      const ordered = [], original = this.used;
      for (let i = 0; i < original;) {
        const n = this.nodes[i];
        if (!n.face || !n.face.plane) { ordered.push(n); i++; continue; }
        const faces = [];
        while (i < original && this.nodes[i].face && this.nodes[i].face.plane) {
          const node = this.nodes[i++];
          let pieces = [{ node, points: node.face.points, plane: node.face.plane, bounds: node.face.bounds }];
          if (node.face.water) this.waterMasks.forEach(mask => { pieces = pieces.reduce((out, face) => out.concat(maskWater(face, mask)), []); });
          faces.push(...pieces);
          if (!pieces.length) this.style(node, "display:none");
        }
        const kept = new Set();
        depthOrder(faces).forEach(f => {
          const node = f.node;
          if (f.points === node.face.points) { ordered.push(node); kept.add(node); return; }
          // A fragment uses the original image-to-screen transform; only its clip changes.
          const map = node.face.map, clip = f.points.map(p => {
            const x = p[0] - map.x, y = p[1] - map.y, det = map.jx[0] * map.jy[1] - map.jx[1] * map.jy[0];
            return [(x * map.jy[1] - y * map.jy[0]) / det, (y * map.jx[0] - x * map.jx[1]) / det];
          });
          if (map.text) this.projectedText(map.text, map.o, map.u, map.v, map.color, clip, map.style);
          else this.texturedQuadMap(node.src, map.o, map.u, map.v, map.a, map.b, map.c, clip, node.filter, map.size, map.tile, node.blend, map.shade, map.glint, node.face.water);
          ordered.push(this.nodes[this.used - 1]);
        });
        faces.forEach(f => { if (!kept.has(f.node)) this.style(f.node, "display:none"); });
      }
      for (let i = this.used; i < this.nodes.length; i++) this.style(this.nodes[i], "display:none");
      const batches = [];
      for (const n of ordered) {
        if (!n.face) { batches.push({ node: n }); continue; }
        let batch = null;
        for (let j = batches.length - 1; j >= 0; j--) {
          const b = batches[j];
          if (b.node) break;
          // Appending to a previous layer moves this face behind the intervening layers.
          // Only cross layers whose faces are disjoint from it.
          if (b.filter === n.filter && b.blend === n.blend && !n.blend && linearFilter(n.filter)) { batch = b; break; }
          if (b.nodes.some(other => facesOverlap(n.face, other.face))) break;
          if (b.filter === n.filter && b.blend === n.blend) { batch = b; break; }
        }
        if (!batch) batches.push(batch = { filter: n.filter, blend: n.blend, nodes: [] });
        batch.nodes.push(n);
      }
      const children = [];
      let used = 0;
      batches.forEach(b => {
        if (b.node) { children.push(b.node.el); return; }
        if (!b.filter) { b.nodes.forEach(n => children.push(n.el)); return; }
        let layer = this.layers[used++];
        if (!layer) {
          layer = this.layer();
          this.layers.push(layer);
        }
        const boxes = b.nodes.map(n => n.face.bounds), pad = 1 / P.view.cssPerGui;
        const x = Math.min(...boxes.map(r => r[0])) - pad, y = Math.min(...boxes.map(r => r[1])) - pad;
        const w = Math.max(...boxes.map(r => r[2])) + pad - x, h = Math.max(...boxes.map(r => r[3])) + pad - y;
        this.style(layer, `position:absolute;left:${P.px(x)};top:${P.px(y)};width:${P.px(w)};height:${P.px(h)};filter:${b.filter}${b.blend ? ";mix-blend-mode:" + b.blend : ""}`);
        const offset = `position:absolute;left:${P.px(-x)};top:${P.px(-y)};width:0;height:0`;
        if (layer.offset !== offset) { layer.inner.style.cssText = offset; layer.offset = offset; }
        placeChildren(layer.inner, b.nodes.map(n => n.el));
        children.push(layer.el);
      });
      for (let i = used; i < this.layers.length; i++) this.style(this.layers[i], "display:none");
      placeChildren(this.root, children);
    }
    // The next node, emptied when it held something else: "box" (no content), "text" or "image".
    take(kind) {
      let n = this.nodes[this.used];
      if (!n) n = this.nodes[this.used] = this.node();
      this.used++;
      n.face = null;
      n.filter = null;
      n.blend = null;
      if (n.shade) n.shade.style.cssText = "display:none";
      if (n.glint) n.glint.style.cssText = "display:none";
      if (n.kind !== kind) {
        n.el.textContent = "";
        n.text = "";
        n.img = null;
        n.shade = null;
        n.glint = n.glintImage = null;
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
    text(str, x, y, c, shadow, scale, style) {
      if (c[3] <= 0 || str === "") return;
      const s = scale || 1;
      if (shadow) this.text(str, x + s, y + s, [c[0] >> 2, c[1] >> 2, c[2] >> 2, c[3]], false, s, style);
      const n = this.style(this.take("text"), `position:absolute;left:0;top:0;transform:translate(${P.px(x)},${P.px(y)});white-space:pre;font-family:${P.FONT};font-size:${P.px(FONT_SIZE * s)};line-height:${P.px(FONT_SIZE * s)};color:${P.css(c)}` + textStyle(style, s * P.view.cssPerGui));
      str = displayText(str, style);
      if (n.text !== str) { n.el.textContent = str; n.text = str; }
    }
    centeredText(str, x, y, c, shadow) { this.text(str, x - P.textWidth(str) / 2, y, c, shadow); }
    // Sign text lies on a world plane, so it participates in the same clipping and depth
    // ordering as the board. The text stays native Ore UI text; it is not a raster snapshot.
    projectedText(str, o, u, v, color, clip, style) {
      if (!str) return;
      clip = clip || [[0, 0], [1, 0], [1, 1], [0, 1]];
      const width = P.styledWidth([Object.assign({}, style, { text: str })]), jx = [u[0] - o[0], u[1] - o[1]], jy = [v[0] - o[0], v[1] - o[1]], k = P.view.cssPerGui;
      const n = this.style(this.take("text"), `position:absolute;left:0;top:0;transform-origin:0 0;` +
        `transform:matrix(${jx[0] * k / width},${jx[1] * k / width},${jy[0] * k / 8},${jy[1] * k / 8},${P.num(o[0])},${P.num(o[1])});` +
        `width:${width}px;height:8px;white-space:pre;font-family:${P.FONT};font-size:8px;line-height:8px;color:${P.css(color)};shape-rendering:optimizeSpeed;clip-path:polygon(${clip.map(p => (p[0] * width) + "px " + (p[1] * 8) + "px").join(",")})` + textStyle(style, 1));
      const shown = displayText(str, style);
      if (n.text !== shown) { n.el.textContent = shown; n.text = shown; }
      const plane = facePlane([o, u, v]), points = clip.map(p => o.map((x, i) => x + (u[i] - x) * p[0] + (v[i] - x) * p[1]));
      n.face = { points, bounds: faceBounds(points), plane, map: { text: str, color, style, o, u, v, x: o[0], y: o[1], jx, jy } };
    }
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
      // World faces use the same stencil-clipped boundary as model faces. This keeps a
      // shared edge sharp without enlarging either face to cover an antialiasing seam.
      if (o.length === 3) {
        this.texturedQuadMap(src, o, u, v, [0, 0], [1, 0], [0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]], filter, size);
        return;
      }
      const s = size || 16, k = P.view.cssPerGui / s, f = n => n.toFixed(5);
      const n = this.style(this.take("image"), `position:absolute;left:0;top:0;width:${s}px;height:${s}px;transform-origin:0 0;` +
        `transform:matrix(${f((u[0] - o[0]) * k)},${f((u[1] - o[1]) * k)},${f((v[0] - o[0]) * k)},${f((v[1] - o[1]) * k)},${P.num(o[0])},${P.num(o[1])})`);
      if (!n.img) { n.img = document.createElement("img"); n.el.appendChild(n.img); }
      if (n.src !== src) { n.img.src = src; n.src = src; }
      const css = `position:absolute;left:0;top:0;width:${s}px;height:${s}px;image-rendering:pixelated`;
      if (n.imgCss !== css) { n.img.style.cssText = css; n.imgCss = css; }
      const points = [o, u, o.map((p, i) => u[i] + v[i] - p), v];
      n.face = { points, bounds: faceBounds(points) };
      n.filter = filter || null;
    }
    // texturedQuad for any part of the texture: the GUI points o, u and v show the texture at
    // fractions a, b and c ([x, y]; turned or flipped as they come), and only the polygon `clip`
    // ([x, y] fractions) is drawn. With `tile` [x0,y0,x1,y1], those fractions are within that
    // part of the image. Like sprite(), only the inner image moves when the frame changes;
    // the face's transform and clip stay fixed instead of following a whole animation strip.
    // Pixel-art faces use Gameface's depth-stencil clipping instead of antialiased clip paths.
    // image-rendering only controls texture sampling, not the clip's antialiasing.
    texturedQuadMap(src, o, u, v, a, b, c, clip, filter, size, tile, blend, shade, glint, water) {
      const p1 = b[0] - a[0], q1 = b[1] - a[1], p2 = c[0] - a[0], q2 = c[1] - a[1], det = p1 * q2 - p2 * q1;
      const ux = u[0] - o[0], uy = u[1] - o[1], vx = v[0] - o[0], vy = v[1] - o[1];
      // GUI pixels per unit across and down the texture, and where its corner lands.
      const jx = [(ux * q2 - vx * q1) / det, (uy * q2 - vy * q1) / det], jy = [(vx * p1 - ux * p2) / det, (vy * p1 - uy * p2) / det];
      const x = o[0] - jx[0] * a[0] - jy[0] * a[1], y = o[1] - jx[1] * a[0] - jy[1] * a[1];
      const s = size || 16, k = P.view.cssPerGui / s, f = n => n.toFixed(5), at = n => (n * s).toFixed(3) + "px";
      // Bound the texture before native compositing. A portal samples a small region of a
      // screen-sized image; its full transformed image must not become the filter surface.
      const low = [0, 1].map(i => Math.min(...clip.map(p => p[i]))), high = [0, 1].map(i => Math.max(...clip.map(p => p[i])));
      const left = low[0] * s, top = low[1] * s, width = (high[0] - low[0]) * s, height = (high[1] - low[1]) * s;
      const n = this.style(this.take("image"), `position:absolute;left:0;top:0;width:${f(width)}px;height:${f(height)}px;overflow:hidden;transform-origin:0 0;` +
        `transform:matrix(${f(jx[0] * k)},${f(jx[1] * k)},${f(jy[0] * k)},${f(jy[1] * k)},${P.num(x + jx[0] * low[0] + jy[0] * low[1])},${P.num(y + jx[1] * low[0] + jy[1] * low[1])});shape-rendering:optimizeSpeed;clip-path:polygon(${clip.map(p => at(p[0] - low[0]) + " " + at(p[1] - low[1])).join(",")})${blend && !filter ? ";mix-blend-mode:" + blend : ""}`);
      if (!n.img) { n.img = document.createElement("img"); n.el.appendChild(n.img); }
      if (n.src !== src) { n.img.src = src; n.src = src; }
      const w = tile ? s / (tile[2] - tile[0]) : s, h = tile ? s / (tile[3] - tile[1]) : s;
      const offset = tile ? `;transform-origin:0 0;transform:translate(${(-tile[0] * w).toFixed(3)}px,${(-tile[1] * h).toFixed(3)}px)` : "";
      const css = `position:absolute;left:${f(-left)}px;top:${f(-top)}px;width:${w}px;height:${h}px;image-rendering:pixelated${offset}`;
      if (n.imgCss !== css) { n.img.style.cssText = css; n.imgCss = css; }
      if (glint) {
        n.img.style.cssText = "display:none"; n.imgCss = "";
        if (!n.glint) { n.glint = document.createElement("div"); n.glintImage = document.createElement("div"); n.glint.appendChild(n.glintImage); n.el.appendChild(n.glint); }
        // RenderStateShard's translated, ten-degree texture matrix. Keep the base skin's
        // alpha mask in its original coordinates while the glint moves underneath it.
        n.glint.style.cssText = `position:absolute;left:${f(-left)}px;top:${f(-top)}px;width:${s}px;height:${s}px;overflow:hidden;opacity:${0.5625 * (glint.alpha == null ? 1 : glint.alpha)};mask-image:url('${src}');mask-size:${w}px ${h}px;mask-position:${tile ? -tile[0] * w : 0}px ${tile ? -tile[1] * h : 0}px;mask-repeat:no-repeat`;
        // Java's default glintSpeed is 0.5 and glintStrength is 0.75. RGB is squared
        // before additive blending, so strength contributes its square as opacity.
        const time = glint.time * 200, scale = glint.scale, offset = glint.offset || [0, 0];
        const cs = Math.cos(Math.PI / 18), sn = Math.sin(Math.PI / 18), x0 = -sn * s, extent = (cs + sn) * s;
        const tx = -(time % 110000) / 110000 + scale * (cs * offset[0] - sn * offset[1]);
        const ty = (time % 30000) / 30000 + scale * (sn * offset[0] + cs * offset[1]);
        // Keep the drawn rectangle close to the face's size; only background sampling
        // scrolls. Scaling a whole repeated sheet would create a huge clipped surface.
        n.glintImage.style.cssText = `position:absolute;left:0;top:0;width:${extent}px;height:${extent}px;transform-origin:0 0;transform:matrix(${cs},${-sn},${sn},${cs},${cs * x0},${-sn * x0});background-image:url('${glint.src}');background-size:${s / scale}px ${s / scale}px;background-position:${-x0 - tx * s / scale}px ${-ty * s / scale}px;background-repeat:repeat`;
      }
      // A triangle's AO is linear in its texture coordinates. Masking the black gradient
      // with the same image preserves holes in leaves and other cutout faces.
      if (shade) {
        if (!n.shade) { n.shade = document.createElement("div"); n.el.appendChild(n.shade); }
        const dx = shade[1], dy = shade[2], lo = shade[0] + Math.min(0, dx) + Math.min(0, dy), hi = shade[0] + Math.max(0, dx) + Math.max(0, dy);
        const gradient = hi - lo < 1e-8 ? `background-color:rgba(0,0,0,${P.clamp(lo, 0, 1)})`
          : `background-image:linear-gradient(${Math.atan2(dx, -dy) * 180 / Math.PI}deg,rgba(0,0,0,0) ${-lo / (hi - lo) * 100}%,rgba(0,0,0,1) ${(1 - lo) / (hi - lo) * 100}%)`;
        n.shade.style.cssText = `position:absolute;left:${f(-left)}px;top:${f(-top)}px;width:${s}px;height:${s}px;${gradient};mask-image:url('${src}');mask-size:${w}px ${h}px;mask-position:${tile ? -tile[0] * w : 0}px ${tile ? -tile[1] * h : 0}px;mask-repeat:no-repeat`;
      } else if (n.shade) n.shade.style.cssText = "display:none";
      const plane = o.length === 3 ? facePlane([o, u, v]) : null;
      const points = clip.map(p => {
        const sx = x + jx[0] * p[0] + jy[0] * p[1], sy = y + jx[1] * p[0] + jy[1] * p[1];
        return plane ? [sx, sy, plane[0] * sx + plane[1] * sy + plane[2]] : [sx, sy];
      });
      n.face = { points, bounds: faceBounds(points), plane, water: !!water, map: plane ? { o, u, v, a, b, c, size, tile, shade, glint, x, y, jx, jy } : null };
      n.filter = filter || null;
      n.blend = blend || null;
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
      this.sprite(P.itemIcon(id, size), 0, 0, 1, 1, 1, 1, x, y, 16 * s, 16 * s, alpha);
    }
  }
  // Ore UI's item icon URL. The id is the URL's host, so a colon would read as a port: vanilla
  // ids go without "minecraft:", others have it escaped as the editor bundle does (%3A).
  P.itemIcon = (id, size) => `geo-item://${id.replace(/^minecraft:/, "").replace(/:/g, "%3A")}?width=${size}&height=${size}`;
  P.DrawList = DrawList;
})();
