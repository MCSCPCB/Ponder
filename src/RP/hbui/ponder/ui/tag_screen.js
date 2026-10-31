// PonderTagScreen: a tag's items, its description, and a way into each item's scenes.
(function () {
  const P = window.Ponder;

  // LayoutHelper.centeredHorizontal
  const centeredHorizontal = (P.centeredHorizontal = function (count, rows, w, h, spacing) {
    const per = Math.floor(count / rows), rowCounts = [];
    let diff = count - per * rows;
    for (let i = 0; i < rows; i++) rowCounts.push(per + (diff-- > 0 ? 1 : 0));
    const l = { col: 0, row: 0, x: 0, y: 0 };
    const prepareX = () => { l.x = -P.int((rowCounts[l.row] * w + (rowCounts[l.row] - 1) * spacing) / 2); };
    l.totalWidth = rowCounts[0] * w + (rowCounts[0] - 1) * spacing;
    l.totalHeight = rows * h + (rows > 1 ? (rows - 1) * spacing : 0);
    l.area = { x: -P.int(l.totalWidth / 2), y: -P.int(l.totalHeight / 2), w: l.totalWidth, h: l.totalHeight };
    prepareX();
    l.y = -P.int(l.totalHeight / 2);
    l.next = () => {
      if (++l.col >= rowCounts[l.row]) {
        if (++l.row >= rows) { l.x = l.y = 0; return; }
        l.col = 0;
        prepareX();
        l.y += h + spacing;
        return;
      }
      l.x += w + spacing;
    };
    return l;
  });

  class PonderTagScreen extends P.Screen {
    constructor(tag) { super(); this.tag = tag; this.hoveredItem = null; }
    itemsY() { return P.int(0.15 * this.height + 85); }
    init() {
      super.init();
      const tag = this.tag, items = tag.items.filter(i => i !== tag.mainItem && P.isItem(i));
      this.items = items;
      const rows = P.clamp(Math.ceil(items.length / 11), 1, 3), layout = centeredHorizontal(items.length, rows, 28, 28, 8);
      this.itemArea = layout.area;
      const cx = P.int(this.width * 0.5), cy = this.itemsY();
      const button = (id, x, y) => {
        const b = new P.PonderButton(x, y).showingItem(id);
        if (P.doScenesExistForId(id)) b.withCallback((mx, my) => {
          this.centerScalingOn(mx, my);
          P.showScenes(id, tag);
        });
        else b.withBorderColors(/^minecraft:/.test(id) ? P.C.MISSING_VANILLA : P.C.MISSING_MODDED);
        this.widgets.push(b);
      };
      items.forEach(id => { button(id, cx + layout.x + 4, cy + layout.y + 4); layout.next(); });
      if (tag.mainItem && P.isItem(tag.mainItem)) button(tag.mainItem, cx - P.int(layout.totalWidth / 2) - 48, cy - 10);
      this.mouse = [0, 0];
    }
    initBackTrackIcon(b) { b.showingTag(this.tag); }
    isEquivalentTo(other) { return other instanceof PonderTagScreen && other.tag === this.tag; }
    tick() {
      super.tick();
      this.hoveredItem = null;
      this.widgets.forEach(w => { if (w !== this.backTrack && w.item && w.isMouseOver(this.mouse[0], this.mouse[1])) this.hoveredItem = w.item; });
    }
    render(mx, my, pt, previous) {
      const d = this.d, W = this.width, H = this.height;
      this.mouse = [mx, my];
      d.begin();
      this.renderBackTrack(d, mx, my, pt);
      this.renderItems(d);
      // Header
      const ox = W / 2 - 120, oy = H * 0.15 - 40, x = 59, y = 31, streakH = 35;
      P.streak(d, 0, ox + x - 4, oy + y - 12 + P.int(streakH / 2), streakH, 240);
      P.boxElement(d, ox + 21, oy + 21, 30, 30, P.C.BACKGROUND_FLAT, P.C.IDLE);
      d.text(P.translate("ponder.ui.pondering_tag"), ox + x, oy + y - 6, P.C.TEXT_DARKER, false);
      d.text(this.tag.title, ox + x, oy + y + 8, P.C.TEXT, false);
      P.renderTag(d, this.tag, ox + 23, oy + 23, 1, 1.66);
      // Description
      const w = P.int(W * 0.45), dx = P.int((W - w) / 2), dy = this.itemsY() - 10 + Math.max(this.itemArea.h, 48);
      const desc = this.tag.description, lines = P.splitLines(desc, w);
      P.boxElement(d, dx - 3, dy - 3, w + 6, lines.length * 9 + 6, P.C.BACKGROUND_FLAT, P.C.IDLE);
      lines.forEach((l, i) => d.text(l, dx, dy + 9 * i, P.C.TEXT, false));
      this.widgets.forEach(b => b.render(d, mx, my, pt));
      this.renderBackTrackCaption(d);
      if (this.hoveredItem) P.itemTooltip(d, mx, my, this.hoveredItem, pt, previous);
      d.end();
    }
    renderItems(d) {
      if (!this.items.length) return;
      const x = P.int(this.width * 0.5), y = this.itemsY(), a = this.itemArea, title = P.translate("ponder.ui.associated"), sw = P.textWidth(title);
      // The streaks are drawn last in Java but 200 behind the label (z), so first here.
      P.streak(d, 0, x, y, a.h + 10, P.int(a.w / 2) + 75);
      P.streak(d, 180, x, y, a.h + 10, P.int(a.w / 2) + 75);
      // windowWidth is 0 on this screen, so the label box is centred on x.
      P.boxElement(d, x - sw / 2 - 5, y + a.y - 21, sw + 10, 10, P.C.BACKGROUND_FLAT, P.C.IDLE);
      d.centeredText(title, x, y + a.y - 20, P.C.TEXT, true);
    }
  }
  P.PonderTagScreen = PonderTagScreen;
})();
