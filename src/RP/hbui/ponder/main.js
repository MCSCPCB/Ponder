// Mounts Ponder over the game: opens PonderUI for the item when the bridge sees our form,
// ticks at 20 Hz, renders every frame with partial ticks, and feeds mouse, wheel and keys.
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
  // Concurrent opens share the pending load; failures may be retried on the next open.
  const loading = new Map();
  function loadAddons(addons) {
    return Promise.all(addons.map(a => {
      const registered = () => P.plugins.some(plugin => plugin.modId === a.modId);
      if (registered()) return Promise.resolve();
      if (loading.has(a.script)) return loading.get(a.script);
      const pending = new Promise((resolve, reject) => {
        const el = document.createElement("script");
        el.src = "/hbui/" + a.script;
        let settled = false;
        const finish = error => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (error) {
            if (el.parentNode) el.parentNode.removeChild(el);
            P.error("addon failed", a.modId, a.script, error);
            reject(error);
          } else { P.log("addon registered", a.modId, a.script); resolve(); }
        };
        const timeout = setTimeout(() => finish(new Error("Plugin load timed out: " + a.script)), 15000);
        el.onload = () => finish(registered() ? null : new Error("Script did not register plugin " + a.modId));
        el.onerror = () => finish(new Error("Cannot load plugin script " + a.script));
        P.log("load addon", a.modId, a.script);
        document.head.appendChild(el);
      });
      loading.set(a.script, pending);
      pending.then(() => loading.delete(a.script), () => loading.delete(a.script));
      return pending;
    }));
  }

  P.bridge.onOpen = function (item, addons) {
    const form = P.bridge.form;
    return Promise.all([loadAddons(addons), P.loadBlockData(addons), P.loadEntityData(addons)]).then(() => {
      if (P.bridge.form !== form) return;
      P.registerAll();
      P.log("scene registry", "plugins=" + P.plugins.map(p => p.modId).join(","), "items=" + P.indexedItems().length,
        "entities=" + Object.keys(P.entityData.entities).length);
      return P.loadStructures(P.structurePaths());
    }).then(() => {
      if (P.bridge.form !== form) return false; // the form closed, or another opened, while loading
      let screen = null;
      if (item === "ponder:index") screen = new P.PonderIndexScreen();
      else if (item === "ponder:tags") screen = new P.PonderTagIndexScreen();
      else if (P.indexedItems().includes(item)) screen = new P.PonderUI(item);
      else { P.error("no scenes for", item, "requested addons=" + JSON.stringify(addons), "registered plugins=" + P.plugins.map(p => p.modId).join(",")); return false; }
      P.updateView();
      P.screens.reset();
      root.style.display = "";
      open = true;
      P.screens.open(screen);
      P.log("open", item, `gui ${P.view.width}x${P.view.height} scale ${P.view.scale} font ${P.fontReady() ? "ok" : "not loaded"}`);
      return true;
    });
  };
  P.bridge.onClose = function () {
    open = false;
    root.style.display = "none";
    P.screens.reset();
  };

  // 20 ticks a second; frames in between are drawn at the partial tick.
  let last = Date.now(), acc = 0, mouse = [-1000, -1000], viewKey = "";
  let renderKey = "", lastRenderLog = 0, maxRenderMs = 0;
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
    while (acc >= 50) { acc -= 50; P.screens.current.tick(); }
    const pt = acc / 50, bg = P.background;
    bg.begin();
    P.menuBackground(bg);
    bg.end();
    const screen = P.screens.current, scene = screen.activeScene && screen.activeScene();
    const keyNow = scene ? scene.id + ":" + scene.world.entities.map(e => e.type).join(",") : screen.constructor.name;
    const changed = keyNow !== renderKey;
    if (changed) { renderKey = keyNow; P.log("render begin", keyNow); }
    const renderStart = Date.now();
    P.screens.render(mouse[0], mouse[1], pt);
    maxRenderMs = Math.max(maxRenderMs, Date.now() - renderStart);
    if (changed || now - lastRenderLog >= 5000) {
      const d = screen.d;
      P.log("render submitted", keyNow, "draws=" + d.used, "pooled=" + d.nodes.length,
        "imageBindings=" + d.imageBindings, "mappedFaces=" + d.mappedFaces,
        "faceFilterPx=" + Math.round(d.faceFilterPixels), "maxJsMs=" + maxRenderMs);
      lastRenderLog = now;
      maxRenderMs = 0;
    }
  }

  const toGui = e => [e.clientX / P.view.cssPerGui, e.clientY / P.view.cssPerGui];
  function listen() {
    // Gameface sends no `click` to plain elements; presses are mousedown.
    root.addEventListener("mousedown", e => {
      e.stopPropagation();
      mouse = toGui(e);
      if (P.screens.current) P.screens.current.mouseClicked(mouse[0], mouse[1]);
    });
    root.addEventListener("mousemove", e => { mouse = toGui(e); });
    root.addEventListener("wheel", e => {
      e.stopPropagation();
      if (P.screens.current) P.screens.current.mouseScrolled(e.deltaY);
    });
    // Escape stays with the game, which closes the form (and so Ponder).
    document.addEventListener("keydown", e => {
      if (!open || !P.screens.current || e.keyCode === 27) return;
      if (e.keyCode === 8 && P.screens.backStack.length) { P.screens.openPrevious(P.screens.current); e.stopPropagation(); return; }
      const key = (e.key || String.fromCharCode(e.keyCode)).toLowerCase();
      if (P.screens.current.keyPressed(key)) e.stopPropagation();
    }, true);
  }

  function start() {
    mount();
    listen();
    P.bridge.start();
    requestAnimationFrame(frame);
    P.log("ponder ready; form protocol 2");
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
