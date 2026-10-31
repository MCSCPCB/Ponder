// NavigatableSimiScreen and ScreenOpener: each screen draws into its own container; moving
// between screens zooms the old one away (scaled about where it was clicked) and the new one in.
(function () {
  const P = window.Ponder;

  class Screen {
    constructor() {
      this.el = document.createElement("div");
      this.el.className = "ponder-screen";
      this.d = new P.DrawList(this.el);
      this.widgets = [];
      this.transition = P.linear().startWithValue(0).chase(0, 0.1, P.Chaser.LINEAR);
      this.arrowAnimation = P.linear().startWithValue(0).chase(0, 0.075, P.Chaser.LINEAR);
      this.depthX = P.view.width / 2;
      this.depthY = P.view.height / 2;
      this.backTrack = null;
    }
    get width() { return P.view.width; }
    get height() { return P.view.height; }
    init() {
      this.widgets = [];
      this.focus = null;
      this.backTrack = null;
      if (!(this instanceof P.PonderSettingsScreen)) {
        const settings = this.settingsButton = new P.PonderButton(this.width - 31, 21).showing(P.Icons.USER_MODE).withCallback(() => P.screens.transitionTo(new P.PonderSettingsScreen()));
        this.widgets.push(settings);
      }
      this.exitButton = null;
      if (!P.screens.backStack.length) {
        if (!(this instanceof P.PonderUI)) {
          this.exitButton = new P.PonderButton(this.width - 61, 21).showing(P.Icons.CLOSE).withCallback(() => P.screens.close());
          this.widgets.push(this.exitButton);
        }
        return;
      }
      const b = (this.backTrack = new P.PonderButton(31, this.height - 31 - 20).enableFade(5));
      b.background = P.C.BACKGROUND_FLAT;
      b.fade.chase(1, 0.1, P.Chaser.EXP);
      b.withCallback(() => P.screens.openPrevious(this));
      P.screens.backStack[0].initBackTrackIcon(b);
      this.widgets.push(b);
    }
    initBackTrackIcon(b) { b.showing(P.Icons.DISABLE); }
    isEquivalentTo() { return false; }
    shareContextWith() {}
    tick() { this.transition.tickChaser(); this.arrowAnimation.tickChaser(); this.widgets.forEach(w => w.tick()); }
    centerScalingOn(x, y) { this.depthX = x; this.depthY = y; }
    // The back-track arrows (NavigatableSimiScreen.renderWindow), behind everything else.
    renderBackTrack(d, mx, my, pt) {
      const b = this.backTrack;
      if (!b) return;
      const x = P.int(P.lerp(this.arrowAnimation.getValue(pt), -9, 21)), maxX = b.x + b.width, c = P.C.NAV_ARROW;
      if (x + 30 < b.x) P.breadcrumbArrow(d, x + 30, this.height - 51, maxX - (x + 30), 20, 5, c[0], c[1]);
      P.breadcrumbArrow(d, x, this.height - 51, 30, 20, 5, c[0], c[1]);
      P.breadcrumbArrow(d, x - 30, this.height - 51, 30, 20, 5, c[0], c[1]);
    }
    renderBackTrackCaption(d) {
      const mode = P.input.mode, hint = mode === "gamepad" ? (this.identifyMode ? "controller_identify" : "controller") : mode === "touch" && this.identifyMode ? "touch_identify" : null;
      if (hint) d.centeredText(P.translate("ponder.ui." + hint), this.width / 2, this.height - 8, P.C.TEXT_DARKER, true);
      const b = this.backTrack;
      if (!b || !b.hovered) return;
      const text = P.translate(P.screens.backStack[0] instanceof Screen ? "ponder.ui.think_back" : "ponder.ui.exit");
      d.text(text, 41 - P.textWidth(text) / 2, this.height - 16, P.C.TEXT_DARKER, false);
      if (P.equal(this.arrowAnimation.getValue(), this.arrowAnimation.target)) { this.arrowAnimation.setValue(1); this.arrowAnimation.setValue(1); }
    }
    // AbstractWidget.mouseClicked: a mouse press plays the button sound; shortcuts do not.
    mouseClicked(mx, my, button) {
      if (button !== undefined && button !== 0) return false;
      for (const w of this.widgets) if (w.isVisible() && w.isMouseOver(mx, my)) {
        if (!(w instanceof P.PonderProgressBar)) P.playSound("random.click", 0.1);
        w.click(mx, my); return true;
      }
      return false;
    }
    keyPressed(key) {
      if (key === P.key("close")) { P.screens.close(); return true; }
      let consumed = false;
      this.widgets.forEach(w => { if (w.shortcut && w.shortcut === key && w.isVisible() && w.active) { w.click(); consumed = true; } });
      return consumed;
    }
    mouseScrolled() { return false; }
    focusableWidgets() { return this.widgets.filter(w => w.active !== false && w.isVisible()); }
    focusedWidget() {
      const widgets = this.focusableWidgets();
      if (widgets.indexOf(this.focus) < 0) this.focus = widgets.find(w => w.item || w.tag) || widgets[0] || null;
      return this.focus;
    }
    moveFocus(direction) {
      const current = this.focusedWidget(), widgets = this.focusableWidgets();
      if (!current) return false;
      if (current.moveFocus && current.moveFocus(direction)) return true;
      if (direction === "next" || direction === "previous") {
        const i = widgets.indexOf(current), delta = direction === "next" ? 1 : -1;
        this.focus = widgets[(i + delta + widgets.length) % widgets.length]; return true;
      }
      const axis = direction === "left" || direction === "right" ? 0 : 1, sign = direction === "left" || direction === "up" ? -1 : 1;
      const center = w => [w.x + w.width / 2, w.y + w.height / 2], origin = center(current);
      let best = null, score = Infinity;
      widgets.forEach(w => {
        const c = center(w), ahead = (c[axis] - origin[axis]) * sign, across = Math.abs(c[1 - axis] - origin[1 - axis]);
        if (ahead <= 0) return;
        const value = ahead + across * 3 + across * across / ahead;
        if (value < score) { score = value; best = w; }
      });
      if (best) this.focus = best;
      return !!best;
    }
    activateFocused() {
      const w = this.focusedWidget();
      if (!w) return false;
      const at = w.focusPosition ? w.focusPosition() : [w.x + w.width / 2, w.y + w.height / 2];
      return this.mouseClicked(at[0], at[1], 0);
    }
  }
  P.Screen = Screen;

  const screens = (P.screens = { current: null, previous: null, backStack: [] });
  // Only the current screen and, during a transition, the previous one stay in the document.
  function show(screen, root) {
    const old = screens.previous;
    if (old && old !== screen && old.el.parentNode) old.el.parentNode.removeChild(old.el);
    screens.previous = screens.current !== screen ? screens.current : null;
    screens.current = screen;
    root.appendChild(screen.el);
    if (P.ponderTooltip) P.ponderTooltip.reset();
    P.input.reset();
    screen.init();
  }
  screens.root = null;
  screens.open = function (screen) {
    const cur = screens.current;
    if (cur) {
      screens.backStack.unshift(cur);
      if (screens.backStack.length > 15) screens.backStack.pop();
    }
    show(screen, screens.root);
  };
  // ScreenOpener.transitionTo, or a step back when the screen equals the last one.
  screens.transitionTo = function (screen) {
    const prev = screens.backStack[0];
    if (prev && prev.isEquivalentTo(screen)) { screens.openPrevious(screens.current, screen); return; }
    screen.transition.startWithValue(0.001).chase(1, 0.3, P.Chaser.EXP);
    screens.open(screen);
  };
  screens.openPrevious = function (current, context) {
    if (!screens.backStack.length) return;
    screens.backSteppedFrom = current;
    const previous = screens.backStack.shift();
    if (context) context.shareContextWith(previous);
    previous.transition.startWithValue(-0.001).chase(-1, 0.3, P.Chaser.EXP);
    show(previous, screens.root);
  };
  screens.clear = () => { screens.backStack = []; };
  // Closes Ponder: the server form is closed, which brings the bridge's onClose back here.
  screens.close = function () { screens.clear(); P.bridge.close(); };
  screens.reset = function () {
    screens.current = screens.previous = null;
    screens.backStack = [];
    if (screens.root) while (screens.root.firstChild) screens.root.removeChild(screens.root.firstChild);
  };

  // Scales a container about (px, py) and fades it, as the framebuffer copy is drawn in Java.
  P.zoom = function (el, scale, px, py, opacity) {
    const k = P.view.cssPerGui, tx = px * k * (1 - scale), ty = py * k * (1 - scale);
    el.style.transform = `matrix(${scale.toFixed(4)},0,0,${scale.toFixed(4)},${tx.toFixed(2)},${ty.toFixed(2)})`;
    el.style.opacity = opacity.toFixed(3);
  };
  // Renders the current screen and, while it is transitioning, the one it came from.
  screens.render = function (mx, my, pt) {
    const cur = screens.current;
    if (!cur) return;
    const t = cur.transition.getValue(pt), abs = Math.abs(t), moving = !(cur.transition.target === 0 || cur.transition.settled());
    const prev = screens.previous;
    if (prev && prev !== cur && moving) {
      prev.el.style.display = "";
      prev.render(-1000, -1000, 0, true);
      const dp = t > 0 ? [prev.depthX, prev.depthY] : [cur.width / 2, cur.height / 2];
      P.zoom(prev.el, 1 + 0.2 * t, dp[0], dp[1], 1 - abs);
    } else if (prev && prev !== cur) {
      if (prev.el.parentNode) prev.el.parentNode.removeChild(prev.el);
      screens.previous = null;
    }
    const scale = !moving ? 1 : t > 0 ? 1 - 0.5 * (1 - abs) : 1 + 0.5 * (1 - abs);
    P.zoom(cur.el, scale, cur.width / 2, cur.height / 2, 1);
    cur.render(mx, my, pt, false);
  };
})();
