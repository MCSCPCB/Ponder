// PonderIndexScreen (every item with scenes) and PonderTagIndexScreen (every listed tag, by mod),
// with catnip's PaginationState. Opened by /ponder index and /ponder (tags).
(function () {
  const P = window.Ponder;
  P.LOGO = "/hbui/ponder/assets/logo.png";

  class PaginationState {
    constructor(usesPagination, perPage, count) { this.uses = usesPagination; this.pageIndex = 0; this.perPage = perPage; this.count = count; }
    maxPages() { return this.uses ? Math.ceil(this.count / this.perPage) : 1; }
    startIndex() { return this.pageIndex * this.perPage; }
    currentPageCount() { return this.uses ? Math.min(this.perPage, this.count - this.pageIndex * this.perPage) : this.count; }
    forCurrentPage(fn) { for (let i = 0; i < this.currentPageCount(); i++) fn(i, i + this.startIndex()); }
    hasPrevious() { return this.uses && this.pageIndex > 0; }
    hasNext() { return this.uses && (this.pageIndex + 1) * this.perPage < this.count; }
    next() { if (this.hasNext()) this.pageIndex++; }
    previous() { if (this.hasPrevious()) this.pageIndex--; }
  }

  // ResourceLocation.compareTo: path first, then namespace.
  const byLocation = (a, b) => {
    const [an, ap] = a.split(":"), [bn, bp] = b.split(":");
    return ap < bp ? -1 : ap > bp ? 1 : an < bn ? -1 : an > bn ? 1 : 0;
  };

  // Previous and next page buttons; `changed` lays the page out again.
  function pageButtons(screen, state, prevX, nextX, y, changed) {
    const update = () => {
      changed();
      screen.prevPage.setActive(state.hasPrevious()).animateGradientFromState();
      screen.nextPage.setActive(state.hasNext()).animateGradientFromState();
    };
    screen.prevPage = new P.PonderButton(prevX, y).showing(P.Icons.LEFT).withCallback(() => { state.previous(); update(); }).setActive(false);
    screen.nextPage = new P.PonderButton(nextX, y).showing(P.Icons.RIGHT).withCallback(() => { state.next(); update(); }).setActive(true);
    screen.widgets.push(screen.prevPage, screen.nextPage);
  }

  // PonderIndexScreen: every item that has scenes, paged.
  class PonderIndexScreen extends P.Screen {
    init() {
      super.init();
      this.items = P.indexedItems().sort(byLocation);
      const W = this.width, H = this.height, cx = P.int(W / 2), cy = P.int(H / 2);
      const targetW = P.clamp(W - 180, 250, 400), targetH = P.clamp(H - 140, 150, 300);
      this.maxScreenArea = { x: cx - P.int(targetW / 2), y: cy - P.int(targetH / 2), w: targetW, h: targetH };
      // 28 per item plus 8 between.
      this.maxItemRows = P.int((this.maxScreenArea.h + 8) / 36);
      this.maxItemsPerRow = P.int((this.maxScreenArea.w + 8) / 36);
      this.pagination = new PaginationState(this.items.length > this.maxItemRows * this.maxItemsPerRow, this.maxItemRows * this.maxItemsPerRow, this.items.length);
      this.setupPage();
      if (!this.pagination.uses) return;
      const y = this.maxScreenArea.y + this.maxScreenArea.h + 10;
      pageButtons(this, this.pagination, cx - 100, cx + 80, y, () => this.setupPage());
      this.prevPage.updateGradientFromState();
      this.nextPage.updateGradientFromState();
    }
    setupPage() {
      const state = this.pagination, cx = P.int(this.width / 2), cy = P.int(this.height / 2);
      this.widgets = this.widgets.filter(w => w === this.backTrack || w === this.prevPage || w === this.nextPage);
      this.pageItems = [];
      const rows = P.clamp(Math.ceil(state.currentPageCount() / this.maxItemsPerRow), 1, this.maxItemRows);
      const layout = P.centeredHorizontal(state.currentPageCount(), rows, 28, 28, 8);
      this.usedArea = layout.area;
      state.forCurrentPage((iPage, iOverall) => {
        const id = this.items[iOverall];
        const b = new P.PonderButton(cx + layout.x + 4, cy + layout.y + 4).showingItem(id).withCallback((mx, my) => {
          this.centerScalingOn(mx, my);
          P.screens.transitionTo(new P.PonderUI(id));
        });
        this.pageItems.push(b);
        this.widgets.push(b);
        layout.next();
      });
    }
    initBackTrackIcon(b) { b.showing(P.Icons.IDENTIFY); }
    isEquivalentTo(other) { return other instanceof PonderIndexScreen; }
    tick() { super.tick(); P.ticks++; }
    render(mx, my, pt) {
      const d = this.d, cx = P.int(this.width / 2), cy = P.int(this.height / 2);
      d.begin();
      this.renderBackTrack(d, mx, my, pt);
      // Java draws this caption and the page count as literal English, not through lang.
      const a = this.usedArea;
      P.streak(d, 0, cx + a.x - 10, cy + a.y - 20, 20, 220);
      d.text("Items to inspect", cx + a.x - 5, cy + a.y - 25, P.C.TEXT, false);
      if (this.pagination.uses) {
        // Drawn at 1.5x about (cx, py): streaks at (0, 4) 14 x 85, text at (-width / 2, 0).
        const page = "Page " + (this.pagination.pageIndex + 1) + "/" + this.pagination.maxPages();
        const py = this.maxScreenArea.y + this.maxScreenArea.h + 14;
        P.streak(d, 0, cx, py + 6, 21, 127.5);
        P.streak(d, 180, cx, py + 6, 21, 127.5);
        d.text(page, cx + P.int(-P.textWidth(page) / 2) * 1.5, py, P.C.TEXT, false, 1.5);
      }
      this.widgets.forEach(b => b.render(d, mx, my, pt));
      this.renderBackTrackCaption(d);
      let hovered = null;
      this.pageItems.forEach(b => { if (b.item && b.isMouseOver(mx, my)) hovered = b.item; });
      if (hovered) P.tooltip(d, mx, my, [[P.itemName(hovered), P.color(0xffffffff, true)]], 9999);
      d.end();
    }
  }
  P.PonderIndexScreen = PonderIndexScreen;

  // PonderTagIndexScreen: listed tags grouped by the mod that registered them.
  class PonderTagIndexScreen extends P.Screen {
    init() {
      super.init();
      this.mods = Array.from(P.listedTagsByNamespace().entries()).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
      const maxOnScreen = P.int((this.height - 140 - 40) / 58);
      this.pagination = new PaginationState(this.mods.length > 1 && this.mods.length > maxOnScreen, maxOnScreen, this.mods.length);
      this.setupPage();
      if (!this.pagination.uses) return;
      pageButtons(this, this.pagination, P.int(this.width * 0.5) - 120, P.int(this.width * 0.5) + 100, this.height - 32, () => this.setupPage());
      this.prevPage.updateGradientFromState();
    }
    setupPage() {
      this.widgets = this.widgets.filter(w => w === this.backTrack || w === this.prevPage || w === this.nextPage);
      this.entries = [];
      const xOffset = P.int(this.width * 0.5);
      let yOffset = 140;
      this.pagination.forCurrentPage((iPage, iOverall) => {
        const entry = this.mods[iOverall], tags = entry[1];
        const layout = P.centeredHorizontal(tags.length, 1, 28, 28, 8);
        tags.forEach(tag => {
          const b = new P.PonderButton(xOffset + layout.x + 4, yOffset + layout.y + 18).showingTag(tag).withCallback((mx, my) => {
            this.centerScalingOn(mx, my);
            P.screens.transitionTo(new P.PonderTagScreen(tag));
          });
          this.widgets.push(b);
          layout.next();
        });
        const mod = P.plugins.find(p => p.modId === entry[0]);
        this.entries.push({ name: (mod && mod.name) || entry[0], count: tags.length, area: layout.area, y: yOffset });
        yOffset += 68;
      });
    }
    initBackTrackIcon(b) { b.showing(P.Icons.IDENTIFY); }
    tick() { super.tick(); P.ticks++; }
    render(mx, my, pt) {
      const d = this.d, W = this.width, cx = W / 2;
      d.begin();
      this.renderBackTrack(d, mx, my, pt);
      // Title: the logo in a 30x30 box, then the welcome text at double size.
      P.boxElement(d, cx - 120, 30, 30, 30, P.C.BACKGROUND_FLAT, P.C.IDLE);
      d.sprite(P.LOGO, 0, 0, 32, 32, 32, 32, cx - 121, 29, 32, 32);
      // 34 = 30 bounds + 2 padding + 2 box width; -3 = 2 padding + 1 pixel of the box.
      P.streak(d, 0, cx - 86, 27 + 18, 36, 280);
      d.text(P.translate("ponder.ui.welcome"), cx - 86 + 6, 27 + 10, P.C.TEXT, false, 2);
      // Description, wrapped to at most half the screen width, centred 80 px from the top.
      const desc = P.translate("ponder.ui.index_description");
      let maxW = P.int(W * 0.5);
      const descW = P.textWidth(desc);
      if (descW + 2 < maxW) maxW = descW + 2;
      const lines = P.splitLines(desc, maxW);
      const dx = cx - maxW / 2, dy = 80;
      P.boxElement(d, dx - 3, dy - 3, maxW + 6, lines.length * P.LINE_HEIGHT + 5, P.C.BACKGROUND_FLAT, P.C.IDLE);
      lines.forEach((l, i) => d.text(l, dx, dy + P.LINE_HEIGHT * i, P.C.TEXT, false));
      this.entries.forEach(e => {
        const label = P.translate("ponder.ui.categories", e.name), sw = P.textWidth(label);
        P.boxElement(d, cx - sw / 2 - 3, e.y - 20 - 1, sw + 6, 10, P.C.BACKGROUND_FLAT, P.C.IDLE);
        d.text(label, cx - sw / 2, e.y - 20, P.C.TEXT, false);
        const extra = P.clamp(e.count, 2, 8), len = P.int(e.area.w / 2) + extra * 15;
        P.streak(d, 0, cx, e.y + P.int(e.area.h / 2), e.area.h + 6, len);
        P.streak(d, 180, cx, e.y + P.int(e.area.h / 2), e.area.h + 6, len);
      });
      this.widgets.forEach(b => b.render(d, mx, my, pt));
      this.renderBackTrackCaption(d);
      let hovered = null;
      this.widgets.forEach(w => { if (w !== this.backTrack && w.tag && w.isMouseOver(mx, my)) hovered = w.tag; });
      if (hovered) {
        const gray = P.color(0xffaaaaaa, true);
        const lines2 = P.cutText(hovered.description, 200).map(l => [l, gray]);
        lines2.unshift([hovered.title, P.color(0xffffffff, true)]);
        P.tooltip(d, mx, my, lines2, 9999);
      }
      d.end();
    }
  }
  P.PonderTagIndexScreen = PonderTagIndexScreen;
})();
