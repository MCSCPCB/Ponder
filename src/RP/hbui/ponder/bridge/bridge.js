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
  const bridge = (P.bridge = { screenId: "", definition: "", data: {}, item: null, onOpen: null, onClose: null });

  // Vanilla ids are uint32 hashes, passed as strings up to 1.26.51 and as numbers from 1.26.60;
  // tools/adapter sets QUERY_ID for the target version. Ours count down from the top of the range.
  const QUERY_ID = "ponder:query-id/string";
  let nextId = 0xffffffff;
  // Set while Ponder itself triggers, so the debug trace can tell its calls from vanilla's.
  let ours = false;
  function send(args) {
    ours = true;
    try { return window.engine.trigger.apply(window.engine, args); } finally { ours = false; }
  }
  function subscribe(name, args, callback) {
    const engine = window.engine, n = nextId--, id = QUERY_ID.endsWith("/number") ? n : String(n);
    const handler = value => callback(value);
    engine.on(`query:subscribed/${id}`, handler);
    engine.on(`query:updated/${id}`, handler);
    send([`query:subscribe/${name}`, id].concat(args));
    return () => {
      engine.off(`query:subscribed/${id}`, handler);
      engine.off(`query:updated/${id}`, handler);
      send(["query:unsubscribe", id]);
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
  // The definition only binds the form's text to a data store path ("$.minecraft.custom_form_data_
  // {instanceId}"); the text itself is read from there, as vanilla's getString binding does. The
  // behavior pack puts the markers in the title and the first two labels.
  const FIELDS = ["title", "layout[0].text", "layout[1].text"];
  let dropData = [], dataPath = "";
  function watchData() {
    const m = /^\$\.([^.\s]+)\.([^.\s]+)$/m.exec(bridge.definition);
    const path = m ? m[0] : "";
    if (path === dataPath) return;
    dataPath = path;
    dropData.forEach(drop => drop());
    bridge.data = {};
    dropData = m ? FIELDS.map(field => subscribe("vanillaCoreDataStoreStringQuery", [m[1], m[2], field, false], value => {
      bridge.data[field] = value && value.value != null ? String(value.value) : "";
      if (P.DEBUG) P.log("data", field, bridge.data[field].slice(0, 80));
    })) : [];
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
        watchData();
      }) : null;
      watchData();
    });
  }

  // A marker, from the form's data, its definition, or else the text Ore UI rendered.
  function find(pattern) {
    let m = pattern.exec(FIELDS.map(field => bridge.data[field] || "").join("\n"));
    if (m) return m[1];
    m = pattern.exec(bridge.definition);
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

  // Test aid (P.DEBUG). Logs the first time vanilla sends each data-driven query, and checks each
  // query Ponder sends against vanilla's own call of it: the argument count and every argument's
  // type, the subscription id included. A version that changes one shows up as a "mismatch" line,
  // logged before the call goes out, so even a call the engine rejects is reported.
  function traceVanilla(engine) {
    const trigger = engine.trigger, calls = { ours: {}, vanilla: {} }, reported = {};
    const kind = v => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
    function compare(query) {
      const a = calls.ours[query], b = calls.vanilla[query];
      if (!a || !b || reported[query]) return;
      reported[query] = true;
      const diffs = [];
      if (a.length !== b.length) diffs.push(`${a.length} args, vanilla ${b.length}`);
      for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) diffs.push(`arg${i}: ours ${a[i]}, vanilla ${b[i]}`);
      P.log(diffs.length ? "mismatch" : "match", query, diffs.join("; "));
    }
    engine.trigger = function (name) {
      const args = Array.prototype.slice.call(arguments, 1), who = ours ? "ours" : "vanilla";
      const m = /^query:subscribe\/(.+)$/.exec(String(name));
      if (m) {
        if (who === "vanilla" && !calls.vanilla[m[1]] && /ddui|DataDriven|DataStore/i.test(m[1])) {
          P.log("vanilla", [name].concat(args).map(String).join(" ").slice(0, 160));
        }
        calls[who][m[1]] = args.map(kind);
        compare(m[1]);
      }
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
