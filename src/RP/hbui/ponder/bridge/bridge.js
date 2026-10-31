// Talks to the server's data-driven form the way the current vanilla bundle does:
// queries go over window.engine ("query:subscribe/<name>" -> "query:updated/<id>"),
// button presses through window.__commands__. The form the behavior pack opens carries the
// marker "ponder:<item id>#<stamp>;"; while it is up, Ponder covers it and vanilla's #root is
// hidden. The stamp is new for every form, so one opened right after another for the same item
// still reads as a new form.
(function () {
  const P = window.Ponder;
  const MARKER = /ponder:([a-z0-9_.-]+:[a-z0-9_./-]+#\d+);/;
  const ADDONS = /ponder\.addons:(\[[^;]*\]);/;
  const CLOSE_LABEL = "ponder:close;"; // the behavior pack's own close button
  const GROUP = "vanillaCoreDataStoreSetCommandGroup";
  const bridge = (P.bridge = { screenId: "", definition: "", tree: null, data: {}, form: null, item: null, onOpen: null, onClose: null });

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
  // behavior pack puts the complete request in both the title and first label.
  const FIELDS = ["title", "layout[0].text"];
  let dropData = [], dataPath = "";
  function watchData() {
    const m = /^\$\.([^.\s]+)\.([^.\s]+)$/m.exec(bridge.definition);
    const path = m ? m[0] : "";
    if (path === dataPath) return;
    dataPath = path;
    dropData.forEach(drop => drop());
    bridge.data = {};
    dropData = m ? FIELDS.map(field => subscribe("vanillaCoreDataStoreStringQuery", [m[1], m[2], field, false], value => {
      if (path !== dataPath) return;
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
      bridge.tree = null;
      if (dropDefinition) dropDefinition();
      dropDefinition = screenId ? subscribe("vanilla.CoreDataDrivenUIDefinitionQuery", [1, screenId], def => {
        if (screenId !== bridge.screenId) return;
        bridge.tree = def;
        bridge.definition = strings(def, []).join("\n");
        if (P.DEBUG) P.log("definition", bridge.definition.slice(0, 300).replace(/\n/g, " | "));
        watchData();
      }) : null;
      watchData();
    });
  }

  // Keep fields separate: a title can arrive before the label, and a new title must never
  // borrow an old form's plugins. Each complete field carries both markers.
  function formTexts() {
    const texts = FIELDS.map(field => bridge.data[field] || "");
    strings(bridge.tree, texts);
    const root = document.getElementById("root");
    if (root) {
      texts.push(root.textContent || "");
      const nodes = root.getElementsByTagName("fast-text");
      for (let i = 0; i < nodes.length; i++) texts.push(nodes[i].getAttribute("text") || nodes[i].text || "");
    }
    return texts;
  }
  function find(pattern) {
    for (const text of formTexts()) {
      const m = pattern.exec(text);
      if (m) return m[1];
    }
    return null;
  }
  // null means that the request is still arriving; [] explicitly means no external plugins.
  function findAddons(form) {
    for (const text of formTexts()) {
      const marker = MARKER.exec(text), match = ADDONS.exec(text);
      if (!marker || marker[1] !== form || !match) continue;
      const addons = JSON.parse(match[1]);
      if (!Array.isArray(addons) || addons.some(a => !a || typeof a.modId !== "string" || typeof a.script !== "string")) {
        throw new Error("Invalid Ponder plugin list for " + form);
      }
      return addons;
    }
    return null;
  }

  function setVanillaHidden(hidden) {
    const root = document.getElementById("root");
    if (root) root.style.cssText = hidden ? "opacity:0;pointer-events:none" : "";
  }

  // bridge.form is the form on screen, "<item id>#<stamp>", and `closed` the last one Ponder
  // closed itself: a closed form's data can stay as it was (1.26.60), so that one is not read as
  // open again. `gaveUp` is set when Ponder shows nothing for the form, which is then vanilla's.
  let closed = null, gaveUp = false, started = false, waiting = false;
  function poll() {
    P.flushLogs();
    let form = find(MARKER);
    if (form === closed) form = null;
    if (form !== bridge.form) {
      if (bridge.form && !gaveUp && bridge.onClose) bridge.onClose();
      bridge.form = form;
      bridge.item = form && form.slice(0, form.lastIndexOf("#"));
      gaveUp = started = waiting = false;
      setVanillaHidden(false);
    }
    if (!form || started || gaveUp) return;
    const giveBack = () => {
      if (bridge.form !== form) return;
      gaveUp = true;
      if (bridge.onClose) bridge.onClose();
      setVanillaHidden(false);
    };
    let addons;
    try { addons = findAddons(form); }
    catch (e) { P.error("invalid form", form, e); giveBack(); return; }
    if (addons === null) {
      if (!waiting) P.log("waiting for complete form", form);
      waiting = true;
      return;
    }
    started = true;
    setVanillaHidden(true);
    P.log("request", form, "addons=" + JSON.stringify(addons));
    // onOpen resolves to false when there is nothing to show, and the vanilla form comes back,
    // as it does when opening fails.
    new Promise(resolve => resolve(bridge.onOpen(bridge.item, addons))).then(shown => { if (!shown) giveBack(); },
      e => { P.error("open failed:", form, e); giveBack(); });
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

  // The close button's binding, made absolute the way vanilla's renderer does: a "$relativePath"
  // is read from the nearest Context above it, whose data is a "$path" or relative itself. In
  // 1.26.60 it is "$.closeButton.onClick.closeAction" under "$.minecraft.custom_form_data_…".
  function closeAction(node, context) {
    if (!node || typeof node !== "object") return null;
    const attribs = typeof node.dynamicAttribs === "string" ? JSON.parse(node.dynamicAttribs) : null;
    const absolute = b => (b.$path != null ? b.$path : context + b.$relativePath.slice(1));
    if (node.component === "Context" && attribs && attribs.data) context = absolute(attribs.data);
    const click = attribs && attribs.onClick;
    if (click && /\.closeAction$/.test(click.$path || click.$relativePath || "")) return absolute(click);
    for (const child of node.children || []) {
      const found = closeAction(child, context);
      if (found) return found;
    }
    return null;
  }
  // "$.<datastore>.<property>.<path...>.closeAction" -> the press command's arguments, as
  // vanilla's "$.$datastore.$property.$path*.closeAction" binding gives them.
  function pressArgs(path) {
    const parts = path.split(".").slice(1);
    parts.pop();
    return [parts[0], parts[1], parts.slice(2).join(".")];
  }
  // Closes the form through its own close button, as pressing it would. Ponder steps aside at
  // once rather than waiting for the form's data to say it went.
  bridge.close = function () {
    const action = closeAction(bridge.tree, "$");
    const commands = window.__commands__ && window.__commands__[GROUP];
    const command = commands && commands.dataStoreCloseButtonPress;
    if (action && command) {
      const args = pressArgs(action);
      P.log("close", args.join(" | "));
      command.callable.apply(command, args);
    } else {
      P.log("close: no close button", action || "(no binding)", commands ? "" : "(no command group)");
      pressByLabel(CLOSE_LABEL);
    }
    closed = bridge.form;
    poll();
    // The form takes a moment to go; vanilla's #root stays hidden meanwhile so it does not flash,
    // and shows again if the form is still there (the close did not take).
    setVanillaHidden(true);
    setTimeout(() => { if (!bridge.form) setVanillaHidden(false); }, 500);
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
