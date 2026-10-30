// PonderUI drawing: renderVisibleScenes, renderWidgets and their parts, in Java's order.
(function () {
  const P = window.Ponder, UI = P.PonderUI.prototype;

  UI.render = function (mx, my, framePt, isPrevious) {
    const d = this.d, pt0 = isPrevious ? 0 : framePt;
    this.mouse = P.cursor = [mx, my];
    const pt = this.partialTicks(pt0);
    this.pt = pt;
    d.begin();
    this.renderBackTrack(d, mx, my, pt);
    this.renderVisibleScenes(d, this.skipCooling > 0 ? 0 : pt);
    this.renderWidgets(d, mx, my, pt);
    this.widgets.forEach(w => w.render(d, mx, my, pt));
    this.renderBackTrackCaption(d);
    d.end();
  };

  UI.renderVisibleScenes = function (d, pt) {
    this.renderScene(d, this.index, pt);
    const lazy = this.lazyIndex.getValue(pt);
    if (Math.abs(lazy - this.index) > 1 / 512) this.renderScene(d, lazy < this.index ? this.index - 1 : this.index + 1, pt);
  };
  UI.renderScene = function (d, i, pt) {
    const scene = this.scenes[i], diff = i - this.lazyIndex.getValue(pt);
    const slide = P.lerp(diff * diff, 200, 600) * diff;
    scene.transform.updateScreenParams(this.width, this.height, slide);
    P.renderWorldSections(d, scene, pt);
    P.renderSelection(d, scene);
    scene.outliner.render(d, scene.transform.matrix(pt), pt, 30 * scene.scaleFactor);
    P.renderPlateEffects(d, scene, pt, this.finishingFlash.getValue(pt));
  };

  UI.renderWidgets = function (d, mx, my, pt) {
    const fade = this.fadeIn.getValue(pt), lazy = this.lazyIndex.getValue(pt), indexDiff = lazy - this.index;
    const scene = this.activeScene(), nextScene = this.scenes[this.index + 1] || null;
    const noWidgetsHovered = this.widgets.every(w => !w.isMouseOver(mx, my));
    this.renderSceneInformation(d, fade, indexDiff, scene);
    if (this.identifyMode) {
      if (noWidgetsHovered && my < this.height - 80) {
        const white = P.color(0xffffffff, true);
        if (!this.hoveredTooltipItem) {
          // Java re-wraps the lines as plain literals, so their GRAY/WHITE styles are lost.
          const text = P.translate("ponder.ui.identify_mode", KEY_NAME);
          P.tooltip(d, mx, my, P.splitLines(text, P.int(this.width / 3)).map(l => [l, white]), 9999);
        } else P.tooltip(d, mx, my, [[P.itemName(this.hoveredTooltipItem), white]], 9999);
      }
      this.scan.flashOn();
    } else this.scan.dim();
    if (P.comfyReading) this.slowMode.flashOn(); else this.slowMode.dim();
    this.renderSceneOverlay(d, pt, lazy, Math.abs(indexDiff));
    this.renderNextUp(d, pt, nextScene);
    this.widgets.forEach(w => { if (w instanceof P.PonderButton && w !== this.backTrack) w.fade.startWithValue(fade); });
    if (this.index === 0 || (this.index === 1 && lazy < this.index)) this.left.fade.startWithValue(lazy);
    if (this.index === this.scenes.length - 1 || (this.index === this.scenes.length - 2 && lazy > this.index)) this.right.fade.startWithValue(this.scenes.length - lazy - 1);
    if (scene.finished) this.right.flashOn();
    else { this.right.dim(); this.nextUp.updateChaseTarget(0); }
    // Arrows behind the main widgets
    const base = P.C.NAV_ARROW[0], c1 = P.withAlpha(base, 0x40), c2 = P.withAlpha(base, 0x20), c3 = P.withAlpha(base, 0x10);
    const W = this.width, H = this.height;
    P.breadcrumbArrow(d, W / 2 - 20, H - 51, 20, 20, 5, c1, c2);
    P.breadcrumbArrow(d, W / 2 + 20, H - 51, -20, 20, -5, c1, c2);
    P.breadcrumbArrow(d, W / 2 - 90, H - 51, 70, 20, 5, c1, c3);
    P.breadcrumbArrow(d, W / 2 + 90, H - 51, -70, 20, -5, c1, c3);
    // Tags
    const highlightAll = scene.tags.indexOf("ponder:_all") >= 0;
    this.tagButtons.forEach((button, i) => {
      const tag = this.tags[i], chase = this.tagFades[i];
      chase.updateChaseTarget(button.isMouseOver(mx, my) ? 1 : 0);
      chase.tickChaser(); // per frame, as in Java
      if (highlightAll || scene.tags.indexOf(tag.id) >= 0) button.flashOn(); else button.dim();
      const x = button.x + button.width + 4, y = button.y - 2 + 5 * (1 - fade), w = 200 * chase.getValue(pt);
      P.streak(d, 0, x, y + 12, 26, P.int(w));
      d.clippedText(tag.title, x, y, w, 26, 3, 8, P.C.TEXT_ACCENT);
    });
    this.renderHoverTooltips(d);
  };
  const KEY_NAME = "Q"; // keyDrop's key name

  UI.renderHoverTooltips = function (d) {
    const y = this.height - 16, c = P.C.TEXT_DARKER, at = (b, key, dx) => { if (b.hovered) d.centeredText(P.translate(key), b.x + dx, y, c, true); };
    at(this.scan, "ponder.ui.identify", 10);
    if (this.index !== 0) at(this.left, "ponder.ui.previous", 10);
    at(this.closeButton, "ponder.ui.close", 10);
    if (this.index !== this.scenes.length - 1) at(this.right, "ponder.ui.next", 10);
    at(this.replayButton, "ponder.ui.replay", 10);
    at(this.slowMode, "ponder.ui.slow_text", 5);
  };

  UI.renderNextUp = function (d, pt, nextScene) {
    if (!this.activeScene().finished || !nextScene || !nextScene.nextUpEnabled || !(this.nextUp.getValue() > 1 / 16)) return;
    const x = this.right.x + 10, y = this.right.y - 6 + this.nextUp.getValue(pt) * 5;
    const label = P.translate("ponder.ui.next_up"), w = Math.max(P.textWidth(nextScene.title), P.textWidth(label)) + 5;
    P.speechBox(d, x, y, P.int(w), 20, this.right.hovered, "DOWN");
    d.centeredText(label, x, y - 29, P.C.TEXT_DARKER, true);
    d.centeredText(nextScene.title, x, y - 19, P.C.TEXT, true);
  };

  UI.renderSceneOverlay = function (d, pt, lazy, indexDiff) {
    const scenePt = this.skipCooling > 0 ? 0 : pt;
    this.renderOverlay(d, this.index, scenePt);
    if (indexDiff > 1 / 512) this.renderOverlay(d, lazy < this.index ? this.index - 1 : this.index + 1, scenePt);
  };
  UI.renderOverlay = function (d, i, pt) {
    if (this.identifyMode) return;
    this.scenes[i].forEachVisible(P.AnimatedOverlayElement, e => e.render(this.scenes[i], this, d, pt, e.getFade(pt)));
  };

  UI.renderSceneInformation = function (d, fade, indexDiff, scene) {
    const abs = Math.abs(indexDiff);
    let other = this.index;
    if (this.scenes.length !== 1 && abs >= 0.01) other = this.index + P.signum(indexDiff);
    const title = scene.title, otherTitle = this.scenes[other].title, maxW = 180;
    const tw = Math.min(P.int(P.textWidth(title)), maxW), otw = Math.min(P.int(P.textWidth(otherTitle)), maxW);
    const streakH = 35 - 9 + P.int(P.lerp(abs, P.wordWrapHeight(title, maxW), P.wordWrapHeight(otherTitle, maxW)));
    const streakW = 70 + P.int(P.lerp(abs, tw, otw));
    const ox = 55, oy = 19;
    P.streak(d, 0, ox, oy + P.int(streakH / 2), streakH, P.int(streakW * fade));
    P.streak(d, 180, ox, oy + P.int(streakH / 2), streakH, P.int(30 * fade));
    P.boxElement(d, ox - 34, oy + 2, 30, 30, P.C.BACKGROUND_FLAT, P.C.IDLE);
    d.item(this.item, ox - 35, oy + 1, 2);
    d.text(P.translate("ponder.ui.pondering"), ox + 4, oy + 6, P.C.TEXT_DARKER, false);
    const tx = ox + 4, ty = oy + 20;
    const draw = (text, alpha, sy, pivot) => P.splitLines(text, maxW).forEach((l, i) =>
      sy === 1 ? d.text(l, tx, ty + 9 * i, P.withAlpha(P.C.TEXT, Math.max(5, P.int(255 * alpha))), false)
        : d.flippedText(l, tx, ty + 9 * i, P.withAlpha(P.C.TEXT, Math.max(5, P.int(255 * alpha))), sy, pivot));
    if (this.scenes.length === 1 || abs < 0.01) { draw(title, fade, 1); return; }
    // The titles roll over a horizontal axis 6 px below the line while scenes switch.
    const pivot = ty + 6;
    draw(otherTitle, abs, Math.cos((indexDiff * -90 + P.signum(indexDiff) * 90) * Math.PI / 180), pivot);
    draw(title, 1 - abs, Math.cos(indexDiff * -90 * Math.PI / 180), pivot);
  };

  // GuiGraphics.renderComponentTooltip: lines wrapped to `maxW`, 12 px right of and above the mouse.
  P.tooltip = function (d, mx, my, lines, maxW) {
    const wrapped = [];
    lines.forEach(l => P.splitLines(l[0], maxW).forEach(t => wrapped.push([t, l[1]])));
    let w = 0;
    wrapped.forEach(l => { w = Math.max(w, P.textWidth(l[0])); });
    const h = wrapped.length === 1 ? 8 : 10 + (wrapped.length - 1) * 10;
    let x = mx + 12, y = my - 12;
    if (x + w > P.view.width) x -= 28 + w;
    if (y + h + 6 > P.view.height) y = P.view.height - h - 6;
    const bg = P.color(0xf0100010, true), b0 = P.color(0x505000ff, true), b1 = P.color(0x5028007f, true);
    d.fill(x - 3, y - 4, x + w + 3, y - 3, bg); d.fill(x - 3, y + h + 3, x + w + 3, y + h + 4, bg);
    d.fill(x - 3, y - 3, x + w + 3, y + h + 3, bg); d.fill(x - 4, y - 3, x - 3, y + h + 3, bg); d.fill(x + w + 3, y - 3, x + w + 4, y + h + 3, bg);
    d.gradient(x - 3, y - 2, x - 2, y + h + 2, b0, b1); d.gradient(x + w + 2, y - 2, x + w + 3, y + h + 2, b0, b1);
    d.fill(x - 3, y - 3, x + w + 3, y - 2, b0); d.fill(x - 3, y + h + 2, x + w + 3, y + h + 3, b1);
    wrapped.forEach((l, i) => d.text(l[0], x, y + i * 10 + (i > 0 ? 2 : 0), l[1], true));
  };
})();
