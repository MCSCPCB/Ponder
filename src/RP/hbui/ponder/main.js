// Mounts Ponder over the game: opens PonderUI for the item when the bridge sees our form,
// ticks at 20 Hz, renders every frame with partial ticks, and feeds pointer and keyboard input.
(function () {
  const P = window.Ponder;
  let root = null, open = false;

  function mount() {
    root = document.createElement("div");
    root.className = "ponder-root";
    root.style.display = "none";
    // The menu background sits under every screen, outside the zooming containers.
    const background = document.createElement("div");
    background.className = "ponder-screens";
    root.appendChild(background);
    P.background = new P.DrawList(background);
    const screens = document.createElement("div");
    screens.className = "ponder-screens";
    root.appendChild(screens);
    P.screens.root = screens;
    document.body.appendChild(root);
    if (P.DEBUG) {
      P.logNode = document.createElement("div");
      P.logNode.className = "ponder-log";
      document.body.appendChild(P.logNode);
    }
  }

  // Loads the other authors' plugins (their script calls P.addPlugin) before scenes are registered.
  const loaded = new Set();
  function loadScript(path) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      let failed = null;
      const error = event => { if (decodeURI(event.filename || "").split("?")[0].endsWith("/hbui/" + path)) failed = event.error || new Error(event.message); };
      const clean = () => { window.removeEventListener("error", error); el.parentNode.removeChild(el); };
      window.addEventListener("error", error);
      el.src = "/hbui/" + path;
      el.onload = () => { clean(); if (failed) reject(failed); else { loaded.add(path); resolve(); } };
      el.onerror = () => { clean(); reject(new Error("Plugin failed: " + path)); };
      document.head.appendChild(el);
    });
  }
  function loadAddons(addons) {
    return addons.filter(a => !loaded.has(a.script)).reduce((p, a) => p.then(() => loadScript(a.script)), Promise.resolve());
  }
  P.showScenes = function (item, tag) {
    if (!P.doScenesExistForId(item)) return false;
    try {
      P.screens.transitionTo(new P.PonderUI(item, tag)); return true;
    } catch (error) { P.log("scene failed", error.message); return false; }
  };

  P.bridge.onOpen = function (item, addons) {
    const form = P.bridge.form;
    return Promise.all([loadAddons(addons), P.loadBlockData(addons), P.loadEntityData(addons)]).then(() => {
      P.registerAll();
      return P.loadStructures(P.structurePaths());
    }).then(() => {
      if (P.bridge.form !== form) return false; // the form closed, or another opened, while loading
      let screen = null;
      if (item === "ponder:index") screen = new P.PonderIndexScreen();
      else if (item === "ponder:tags") screen = new P.PonderTagIndexScreen();
      else if (P.doScenesExistForId(item)) screen = new P.PonderUI(item);
      else { P.log("no scenes for", item); return false; }
      P.updateView();
      P.screens.reset();
      root.style.display = "";
      open = true;
      P.screens.transitionTo(screen);
      P.log("open", item, `gui ${P.view.width}x${P.view.height} scale ${P.view.scale} font ${P.fontReady() ? "ok" : "not loaded"}`);
      return true;
    });
  };
  P.bridge.onClose = function () {
    open = false;
    P.input.reset();
    root.style.display = "none";
    P.screens.reset();
  };

  // 20 ticks a second; frames in between are drawn at the partial tick.
  let last = Date.now(), acc = 0, viewKey = "";
  function frame() {
    requestAnimationFrame(frame);
    const now = Date.now();
    acc = P.clamp(acc + now - last, 0, 250);
    last = now;
    if (!open || !P.screens.current) return;
    const key = window.innerWidth + "x" + window.innerHeight + "@" + window.devicePixelRatio;
    if (key !== viewKey) {
      viewKey = key;
      P.updateView();
      P.screens.current.init();
    }
    while (acc >= 50) {
      acc -= 50; P.ticks++; P.input.tick();
      P.screens.current.mouse = P.input.position();
      P.screens.current.tick(); P.ponderTooltip.tick();
    }
    const pt = acc / 50, bg = P.background;
    bg.begin();
    P.menuBackground(bg);
    bg.end();
    P.ponderTooltip.seen = false;
    const mouse = P.input.position();
    P.screens.render(mouse[0], mouse[1], pt);
  }

  const toGui = e => [e.clientX / P.view.cssPerGui, e.clientY / P.view.cssPerGui];
  function listen() {
    let suppressMouseUntil = 0;
    const stop = e => { e.preventDefault(); e.stopPropagation(); };
    // Gameface sends no `click` to plain elements; presses are mousedown.
    root.addEventListener("mousedown", e => {
      e.stopPropagation();
      if (Date.now() < suppressMouseUntil) return;
      const mouse = P.input.pointer = toGui(e);
      P.input.mode = "mouse";
      if (P.screens.current) P.screens.current.mouseClicked(mouse[0], mouse[1], e.button);
    });
    root.addEventListener("mousemove", e => { if (Date.now() >= suppressMouseUntil) { P.input.mode = "mouse"; P.input.pointer = toGui(e); } });
    root.addEventListener("wheel", e => {
      e.stopPropagation();
      if (P.screens.current) P.screens.current.mouseScrolled(e.deltaY);
    });
    root.addEventListener("touchstart", e => {
      stop(e); suppressMouseUntil = Date.now() + 800;
      if (P.input.touch || !P.screens.current || !e.changedTouches.length) return;
      const t = e.changedTouches[0], mouse = P.input.pointer = toGui(t), screen = P.screens.current;
      P.input.mode = "touch";
      P.input.touch = { id: t.identifier, start: mouse, screen, widget: screen.widgets.find(w => w.isVisible() && w.isMouseOver(...mouse)), moved: false };
      screen.mouse = mouse;
      if (screen.identifyMode) screen.updateIdentifiedItem(screen.activeScene());
    });
    root.addEventListener("touchmove", e => {
      stop(e); suppressMouseUntil = Date.now() + 800;
      const touch = P.input.touch;
      if (!touch) return;
      const t = Array.from(e.changedTouches).find(t => t.identifier === touch.id);
      if (!t) return;
      const mouse = P.input.pointer = toGui(t);
      if (Math.hypot(mouse[0] - touch.start[0], mouse[1] - touch.start[1]) > 6) { touch.moved = true; P.ponderTooltip.reset(); }
    });
    const endTouch = (e, cancel) => {
      stop(e); suppressMouseUntil = Date.now() + 800;
      const touch = P.input.touch;
      if (!touch || !Array.from(e.changedTouches).some(t => t.identifier === touch.id)) return;
      P.input.touch = null;
      if (cancel || touch.moved || touch.screen !== P.screens.current) return;
      const mouse = P.input.pointer;
      if (!touch.widget || touch.widget.isMouseOver(...mouse)) touch.screen.mouseClicked(mouse[0], mouse[1], 0);
    };
    root.addEventListener("touchend", e => endTouch(e, false));
    root.addEventListener("touchcancel", e => endTouch(e, true));
    root.addEventListener("contextmenu", stop);
    // Escape stays with the game, which closes the form (and so Ponder).
    document.addEventListener("keydown", e => {
      if (!open || !P.screens.current || e.keyCode === 27) return;
      if (e.keyCode === 8) { P.input.back(); stop(e); return; }
      const key = e.code || P.keyCode(e.keyCode);
      if (key === "Tab" || /^Arrow/.test(key) || key === "Enter" || key === "Space") {
        P.input.mode = "keyboard";
        if (key === "Enter" || key === "Space") { if (!e.repeat) P.screens.current.activateFocused(); }
        else P.input.navigate(key === "Tab" ? (e.shiftKey ? "previous" : "next") : key.slice(5).toLowerCase());
        stop(e); return;
      }
      P.input.held.add(key);
      if (!e.repeat && P.screens.current.keyPressed(key)) stop(e);
    }, true);
    document.addEventListener("keyup", e => { P.input.held.delete(e.code || P.keyCode(e.keyCode)); }, true);
    window.addEventListener("blur", () => P.input.reset());
  }

  function start() {
    mount();
    listen();
    P.bridge.start();
    requestAnimationFrame(frame);
    P.log("ponder ready");
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
