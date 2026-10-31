// CClient preferences and Ponder's fixed keyboard shortcuts.
(function () {
  const P = window.Ponder;
  const keys = { identify: "KeyQ", left: "KeyA", close: "KeyE", right: "KeyD", replay: "KeyS", ponder: "KeyW" };
  let saved = {};
  try { saved = JSON.parse(window.localStorage.getItem("ponder.client") || "{}"); } catch (e) { /* storage is unavailable */ }
  P.settings = { comfyReading: !!saved.comfyReading };
  P.saveSettings = function () {
    try { window.localStorage.setItem("ponder.client", JSON.stringify(P.settings)); return true; }
    catch (e) { P.log("Client settings could not be saved"); return false; }
  };
  const input = P.input = { held: new Set(), mode: "mouse", pointer: [-1000, -1000], buttons: new Set(), axes: [0, 0, 0, 0], touch: null };
  P.keyCode = code => code >= 65 && code <= 90 ? "Key" + String.fromCharCode(code) : code >= 48 && code <= 57 ? "Digit" + String.fromCharCode(code) : ({ 32: "Space", 13: "Enter", 27: "Escape", 8: "Backspace", 9: "Tab", 37: "ArrowLeft", 38: "ArrowUp", 39: "ArrowRight", 40: "ArrowDown" })[code] || "";
  P.keyName = code => String(code).replace(/^Key|^Digit/, "");
  P.key = action => keys[action];
  P.keyLabel = action => P.keyName(P.key(action));

  input.reset = function () {
    this.held.clear(); this.buttons.clear(); this.axes = [0, 0, 0, 0]; this.touch = null;
    this.direction = null; this.repeatAt = 0; this.useCursor = false;
  };
  input.back = function () {
    const screen = P.screens.current;
    if (screen && screen.identifyMode) { screen.scan.click(); return; }
    if (P.screens.backStack.length) P.screens.openPrevious(screen);
    else P.screens.close();
  };
  input.ponderHeld = function () { return this.held.has(P.key("ponder")) || this.buttons.has(3) || !!(this.touch && !this.touch.widget && !this.touch.moved); };
  input.position = function () {
    const screen = P.screens.current;
    if (this.mode === "gamepad" || this.mode === "keyboard") {
      if (screen.identifyMode && this.useCursor) return this.pointer;
      const w = screen.focusedWidget();
      if (w) return w.focusPosition ? w.focusPosition() : [w.x + w.width / 2, w.y + w.height / 2];
    }
    return this.pointer;
  };
  // Vanilla's engine buttons: A/B/X/Y, d-pad, sticks, shoulders, back and start.
  input.gamepad = function (event, args) {
    const screen = P.screens.current;
    if (!screen) return;
    this.mode = "gamepad";
    if (event === "onJoystickMovement") { this.axes = args.map(v => Number.isFinite(v) ? P.clamp(v, -1, 1) : 0); return; }
    const button = args[0], directions = { 4: "up", 5: "down", 6: "left", 7: "right" };
    if (event === "onRelease") { this.buttons.delete(button); return; }
    if (event === "onLongPress") { if (directions[button]) this.navigate(directions[button]); return; }
    if (this.buttons.has(button)) return;
    this.buttons.add(button);
    if (directions[button]) { this.navigate(directions[button]); return; }
    if (button === 1 || button === 12) { this.back(); return; }
    if (button === 2 && screen.scan) { screen.scan.click(); return; }
    if (button === 0) {
      if (screen.identifyMode && this.useCursor) screen.mouseClicked(this.pointer[0], this.pointer[1], 0);
      else screen.activateFocused();
    }
    if (button === 10 || button === 11) {
      const page = button === 10 ? screen.prevPage : screen.nextPage;
      if (page && page.active) page.click(page.x + 10, page.y + 10);
      else if (screen.scroll) screen.scroll(button === 11);
    }
  };
  input.navigate = function (direction) {
    const screen = P.screens.current;
    this.useCursor = false;
    screen.moveFocus(direction);
  };
  input.moveCursor = function (dx, dy) {
    if (!dx && !dy) return;
    this.useCursor = true;
    const screen = P.screens.current;
    this.pointer = [P.clamp(this.pointer[0] + dx, 0, screen.width), P.clamp(this.pointer[1] + dy, 0, screen.height - 80)];
  };
  input.tick = function () {
    if (this.mode !== "gamepad") return;
    const screen = P.screens.current, a = this.axes;
    if (screen.identifyMode) {
      const axis = v => Math.abs(v) > 0.2 ? v * 7 : 0;
      this.moveCursor(axis(a[0]) + axis(a[2]), -axis(a[1]) - axis(a[3]));
      return;
    }
    const direction = Math.max(Math.abs(a[0]), Math.abs(a[1])) < 0.5 ? null : Math.abs(a[0]) > Math.abs(a[1]) ? (a[0] < 0 ? "left" : "right") : (a[1] < 0 ? "down" : "up");
    if (direction !== this.direction) { this.direction = direction; this.repeatAt = 0; }
    if (direction && --this.repeatAt <= 0) { screen.moveFocus(direction); this.repeatAt = this.repeatAt === -1 ? 7 : 3; }
  };
})();
