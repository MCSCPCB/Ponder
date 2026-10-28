// Talks to the server's data-driven form the way the vanilla bundle does (read from its
// 1.26.40 build): queries go over window.engine ("query:subscribe/<name>" -> "query:updated/<id>"),
// button presses through window.__commands__. The form the behavior pack opens carries the
// marker "ponder:<item id>;"; while it is up, Ponder covers it and vanilla's #root is hidden.
(function () {
  const P = window.Ponder;
  const MARKER = /ponder:([a-z0-9_.-]+:[a-z0-9_./-]+);/;
  const ADDONS = /ponder\.addons:(\[[^;]*\]);/;
  const CLOSE_LABEL = "ponder:close;"; // the behavior pack's own close button
  const GROUP = "vanillaCoreDataStoreSetCommandGroup";
  const bridge = (P.bridge = { screenId: "", definition: "", item: null, onOpen: null, onClose: null });

  // Vanilla ids are uint32 hashes, passed as strings up to 1.26.51 and as numbers from 1.26.60;
  // tools/adapter sets QUERY_ID for the target version. Ours count down from the top of the range.
  const QUERY_ID = "ponder:query-id/string";
  let nextId = 0xffffffff;
  function subscribe(name, args, callback) {
    const engine = window.engine, n = nextId--, id = QUERY_ID.endsWith("/number") ? n : String(n);
    const handler = value => callback(value);
    engine.on(`query:subscribed/${id}`, handler);
    engine.on(`query:updated/${id}`, handler);
    engine.trigger.apply(engine, [`query:subscribe/${name}`, id].concat(args));
    return () => {
      engine.off(`query:subscribed/${id}`, handler);
      engine.off(`query:updated/${id}`, handler);
      engine.trigger("query:unsubscribe", id);
    };
  }

  // Every string in the definition tree, with dynamicAttribs (a JSON string per node) unpacked.
  function strings(value, out) {
    if (typeof value === "string") {
      out.push(value);
      if (value.charAt(0) === "{" || value.charAt(0) === "[") { try { strings(JSON.parse(value), out); } catch (e) { /* plain text */ } }
    } else if (value && typeof value === "object") {
      Object.keys(value).forEach(k => strings(value[k], out));
    }
    return out;
  }
  let dropDefinition = null;
  function watchScreen() {
    subscribe("vanillaCoreDataDrivenUIScreenIdQuery", [], value => {
      // Passed on as it came, the way vanilla does: the definition query checks its type.
      const screenId = value && value.screenId != null ? value.screenId : "";
      if (screenId === bridge.screenId) return;
      P.log("screen", screenId || "(none)");
      bridge.screenId = screenId;
      bridge.definition = "";
      if (dropDefinition) dropDefinition();
      dropDefinition = screenId ? subscribe("vanilla.CoreDataDrivenUIDefinitionQuery", [1, screenId], def => {
        bridge.definition = strings(def, []).join("\n");
        if (P.DEBUG) P.log("definition", bridge.definition.slice(0, 300).replace(/\n/g, " | "));
      }) : null;
    });
  }

  // A marker, from the form definition or else from the text Ore UI rendered.
  function find(pattern) {
    let m = pattern.exec(bridge.definition);
    if (m) return m[1];
    const root = document.getElementById("root");
    if (!root) return null;
    m = pattern.exec(root.textContent || "");
    if (m) return m[1];
    const texts = root.getElementsByTagName("fast-text");
    for (let i = 0; i < texts.length; i++) {
      m = pattern.exec(texts[i].getAttribute("text") || texts[i].text || "");
      if (m) return m[1];
    }
    return null;
  }
  // The other authors' plugins the behavior pack knows of: [{ modId, script }].
  const findAddons = () => JSON.parse(find(ADDONS) || "[]");

  function setVanillaHidden(hidden) {
    const root = document.getElementById("root");
    if (root) root.style.cssText = hidden ? "opacity:0;pointer-events:none" : "";
  }

  // Set when our close did not take: Ponder steps aside until the form goes away.
  let gaveUp = false;
  function poll() {
    const item = find(MARKER);
    if (item === bridge.item) return;
    if (bridge.item && !gaveUp && bridge.onClose) bridge.onClose();
    bridge.item = item;
    gaveUp = false;
    setVanillaHidden(!!item);
    if (!item) return;
    // onOpen resolves to false when there is nothing to show; the vanilla form then comes back.
    Promise.resolve(bridge.onOpen(item, findAddons())).then(shown => {
      if (shown || bridge.item !== item) return;
      gaveUp = true;
      setVanillaHidden(false);
    });
  }

  // Presses the vanilla button showing `label`: the innermost element with that text gets the
  // pointer and mouse events a press makes, bubbling to whatever handler the button has.
  function pressByLabel(label) {
    const all = document.getElementById("root").getElementsByTagName("*");
    let target = null;
    for (let i = 0; i < all.length; i++) {
      const el = all[i], text = el.textContent || el.getAttribute("text") || "";
      if (text.indexOf(label) >= 0) target = el; // later matches are deeper
    }
    if (!target) { P.log("close: no", label, "button"); return; }
    const rect = target.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(type => {
      let e;
      if (typeof MouseEvent === "function") e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 });
      else { e = document.createEvent("MouseEvents"); e.initMouseEvent(type, true, true, window, 1, x, y, x, y, false, false, false, false, 0, null); }
      target.dispatchEvent(e);
    });
    P.log("close: pressed", target.tagName, label);
  }

  // "$.<datastore>.<property>.<path...>.closeAction" -> the arguments of the press command.
  function pressArgs(path) {
    const parts = path.split(".").slice(1);
    parts.pop();
    return [parts[0], parts[1], parts.slice(2).join(".")];
  }
  // Closes the form through its own close button, as pressing it would.
  bridge.close = function () {
    const paths = bridge.definition.split("\n").filter(s => /^\$\..*\.(closeAction|action)$/.test(s));
    const close = paths.filter(p => /\.closeAction$/.test(p))[0] || paths[0];
    const commands = window.__commands__ && window.__commands__[GROUP];
    const name = close && /\.closeAction$/.test(close) ? "dataStoreCloseButtonPress" : "dataStoreButtonPress";
    const command = commands && commands[name];
    if (close && command && command.callable) {
      const args = pressArgs(close);
      P.log("close via", name, args.join(" | "));
      command.callable.apply(command, args);
    } else {
      P.log("close: no command", close || "(no path)", commands ? Object.keys(commands).join(",") : "(no group)");
      pressByLabel(CLOSE_LABEL);
    }
    // Still open a second later: give the player the vanilla form (and its close button) back.
    const item = bridge.item;
    setTimeout(() => {
      if (bridge.item !== item || gaveUp) return;
      P.log("close failed; vanilla form shown");
      gaveUp = true;
      setVanillaHidden(false);
      if (bridge.onClose) bridge.onClose();
    }, 1000);
  };

  // Test aid: shows the data-driven queries vanilla itself sends, to compare with ours.
  function traceVanilla(engine) {
    const trigger = engine.trigger;
    engine.trigger = function (name) {
      if (/DataDriven|dataStore/i.test(String(name))) P.log("vanilla", Array.prototype.slice.call(arguments).map(String).join(" ").slice(0, 160));
      return trigger.apply(this, arguments);
    };
  }

  bridge.start = function () {
    const engine = window.engine;
    if (engine && engine.on) {
      if (P.DEBUG) traceVanilla(engine);
      watchScreen();
    } else P.log("no window.engine; marker found from the DOM only");
    setInterval(poll, 100);
  };
})();
