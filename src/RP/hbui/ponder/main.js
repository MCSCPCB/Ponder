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

  P.bridge.onOpen = function (item) {
    if (!P.scenesByItem.has(item)) { P.log("no scenes for", item); return false; }
    P.updateView();
    P.screens.reset();
    root.style.display = "";
    open = true;
    P.screens.open(new P.PonderUI(item));
    P.log("open", item, `gui ${P.view.width}x${P.view.height} scale ${P.view.scale} font ${P.fontReady() ? "ok" : "not loaded"}`);
    return true;
  };
  P.bridge.onClose = function () {
    open = false;
    root.style.display = "none";
    P.screens.reset();
  };

  // 20 ticks a second; frames in between are drawn at the partial tick.
  let last = Date.now(), acc = 0, mouse = [-1000, -1000], viewKey = "";
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
    P.screens.render(mouse[0], mouse[1], pt);
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
    P.log("ponder ready", P.language());
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
