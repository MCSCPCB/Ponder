"use strict";
// A small Ore UI host for checking the actual scripts, form queries and dynamic script loads.
// It does not simulate Gameface's visual layout or claim in-game verification.
const vm = require("node:vm");

function runtime(read, options = {}) {
  const intervals = [], timers = new Map(), listeners = new Map(), subscriptions = new Map();
  const windowEvents = new Map(), requests = [], logs = [], scripts = [];
  const frames = [];
  let context, nextTimer = 0, now = Date.now();
  class HostDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.textContent = ""; this.attributes = {}; }
    set textContent(value) { this._textContent = value; this.children.forEach(c => { c.parentNode = null; }); this.children = []; }
    get textContent() { return this._textContent; }
    set src(value) { this._src = value; if (options.onImageSource && this.tagName === "IMG") options.onImageSource(this, value); }
    get src() { return this._src; }
    get firstChild() { return this.children[0]; }
    get nextSibling() { return this.parentNode ? this.parentNode.children[this.parentNode.children.indexOf(this) + 1] || null : null; }
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this; this.children.push(child);
      if (child.tagName === "SCRIPT") {
        scripts.push(child);
        if (!options.deferScripts) Promise.resolve().then(() => finishScript(child));
      }
      return child;
    }
    insertBefore(child, before) {
      if (!before) return this.appendChild(child);
      if (child === before) return child;
      if (before.parentNode !== this) throw new Error("insertBefore reference is not a child");
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this; this.children.splice(this.children.indexOf(before), 0, child);
      return child;
    }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; }
    addEventListener() {}
    getAttribute(name) { return this.attributes[name] || ""; }
    setAttribute(name, value) { this.attributes[name] = value; }
    getElementsByTagName(tag) { return this.children.flatMap(c => [c, ...c.getElementsByTagName("*")]).filter(c => tag === "*" || c.tagName === tag.toUpperCase()); }
    getBoundingClientRect() { return { width: 60, height: 80, left: 0, top: 0 }; }
  }
  const vanillaRoot = new Element("div");
  const document = {
    head: new Element("head"), body: new Element("body"), createElement: tag => new Element(tag),
    getElementById: id => id === "root" ? vanillaRoot : null, addEventListener() {},
  };
  const engine = {
    on(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    off(name, callback) { if (listeners.has(name)) listeners.get(name).delete(callback); },
    trigger(name, id, ...args) {
      if (name.startsWith("query:subscribe/")) subscriptions.set(id, { name: name.slice(16), args });
      else if (name === "query:unsubscribe") subscriptions.delete(id);
    },
  };
  const commands = {
    coreTranslateCommandGroup: { translate: { callable: key => key } },
    vanillaCoreDduiContentLogCommandGroup: { log: { callable: (message, level) => logs.push({ message, level }) } },
  };
  class XMLHttpRequest {
    open(method, url) { this.url = url; }
    send() {
      requests.push(this.url);
      Promise.resolve().then(() => {
        const data = read(this.url.replace(/^\//, ""));
        this.status = data ? 200 : 404;
        this.responseText = data ? data.toString() : "";
        this.response = data ? Uint8Array.from(data).buffer : new ArrayBuffer(0);
        this.onload();
      });
    }
  }
  const window = {
    engine, __commands__: commands, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener(name, callback) { windowEvents.set(name, callback); },
  };
  context = vm.createContext({
    window, document, console, XMLHttpRequest, Date: HostDate, requestAnimationFrame(callback) { frames.push(callback); },
    setInterval(callback) { intervals.push(callback); return intervals.length; },
    setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
  });
  function execute(file) {
    const data = read(file);
    if (!data) throw new Error("Missing runtime file: " + file);
    vm.runInContext(data.toString(), context, { filename: file });
  }
  function finishScript(script, fail = false) {
    const file = script.src.replace(/^\//, "");
    if (fail || !read(file)) { script.onerror(); return; }
    try { execute(file); }
    catch (error) { const handle = windowEvents.get("error"); if (handle) handle({ message: error.message, error, filename: file, lineno: 1 }); }
    // A fetched script can fire load even if execution threw before addPlugin.
    script.onload();
  }
  const html = read("hbui/gameplay.html").toString();
  for (const match of html.matchAll(/<script\b[^>]*\bsrc="\/(hbui\/ponder\/[^\"]+)"[^>]*>/g)) execute(match[1]);
  function publish(pattern, value, field) {
    for (const [id, q] of [...subscriptions]) if (pattern.test(q.name) && (field == null || q.args[2] === field)) {
      for (const callback of listeners.get("query:updated/" + id) || []) callback(value);
    }
  }
  return {
    P: window.Ponder, context, document, vanillaRoot, logs, requests, scripts, commands, windowEvents,
    finishScript,
    stepFrame(ms = 50) { now += ms; const due = frames.splice(0); due.forEach(callback => callback(now)); },
    screen(id = 1) {
      publish(/screenId|UIScreenId/, { screenId: id });
      if (id) publish(/UIDefinition/, { binding: "$.minecraft.custom_form_data_" + id });
    },
    field(field, text) { publish(/string|StoreString/, { value: text }, field); },
    poll() { intervals.forEach(callback => callback()); },
    expireTimers() { const due = [...timers.values()]; timers.clear(); due.forEach(callback => callback()); },
    settle: () => new Promise(resolve => setImmediate(resolve)),
  };
}

// Execute the behavior pack entry and each add-on's registration script with Script API events.
function behavior(main, addons) {
  const callbacks = {}, commands = new Map(), forms = [], logs = [];
  const signal = name => ({ subscribe(callback) { (callbacks[name] || (callbacks[name] = [])).push(callback); } });
  const fire = (name, event) => (callbacks[name] || []).forEach(callback => callback(event));
  const system = {
    afterEvents: { scriptEventReceive: signal("scriptEvent") }, beforeEvents: { startup: signal("startup") },
    sendScriptEvent(id, message) { fire("scriptEvent", { id, message }); }, run: callback => callback(),
  };
  const world = { afterEvents: { itemUse: signal("itemUse"), worldLoad: signal("worldLoad") } };
  class CustomForm {
    constructor(player, title) { this.title = title; this.labels = []; forms.push(this); }
    label(text) { this.labels.push(text); return this; }
    button() { return this; }
    closeButton() { return this; }
    show() { return Promise.resolve(); }
    close() {}
  }
  const globals = {
    system, world, CustomForm, console: { warn: (...args) => logs.push(args.join(" ")), log: (...args) => logs.push(args.join(" ")) },
    CommandPermissionLevel: { Any: 0 }, CustomCommandParamType: { String: 0 }, CustomCommandStatus: { Success: 0, Failure: 1 },
  };
  for (const code of [main, ...addons]) vm.runInNewContext(code.toString().replace(/^import .*;\r?\n/gm, ""), globals);
  fire("startup", { customCommandRegistry: { registerCommand(meta, handler) { commands.set(meta.name, handler); } } });
  fire("worldLoad");
  return {
    logs,
    open(item) { commands.get("ponder:ponder")({ sourceEntity: { typeId: "minecraft:player" } }, item); return forms[forms.length - 1]; },
  };
}

module.exports = { runtime, behavior };
