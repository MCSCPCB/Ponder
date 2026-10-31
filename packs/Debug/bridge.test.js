"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { runtime, behavior } = require("./runtime.js");
const root = path.resolve(__dirname, "../..");
const read = name => {
  for (const dir of ["src/RP", "packs/Debug/RP"]) {
    if (!fs.existsSync(path.join(root, dir, "content.zipe"))) continue;
    const file = path.join(root, dir, name);
    if (fs.existsSync(file)) return fs.readFileSync(file);
  }
  return null;
};
const addon = { modId: "ponder_batch1", script: "ponder_addons/ponder_batch1/plugin.js" };
const marker = stamp => `ponder:minecraft:slime_ball#${stamp};`;
const addons = "ponder.addons:" + JSON.stringify([addon]) + ";";
const server = () => behavior(fs.readFileSync(path.join(root, "src/BP/scripts/index.js")), [fs.readFileSync(path.join(__dirname, "BP/scripts/index.js"))]);

test("title arriving before add-on data does not permanently lose the scene", async () => {
  const ui = runtime(read);
  ui.screen(); ui.field("title", marker(1)); ui.poll(); await ui.settle();
  assert.equal(ui.P.screens.current, null);
  assert.equal(ui.P.logNode.textContent.includes("no scenes"), false, "do not decide with an incomplete request");
  ui.field("layout[0].text", marker(1) + addons); ui.poll(); await ui.settle();
  assert.equal(ui.P.screens.current.item, "minecraft:slime_ball");
  assert.equal(ui.P.screens.current.scenes.length, 2);
});

test("the behavior pack sends item and registered add-ons in the same field", () => {
  const form = server().open("minecraft:slime_ball");
  assert.ok(form.title.includes("ponder:minecraft:slime_ball#"));
  assert.ok(form.title.includes(addons), "native title must include the complete plugin list");
});

test("the command opens both slime scenes when only the native title has arrived", async () => {
  const ui = runtime(read), form = server().open("minecraft:slime_ball");
  ui.screen(); ui.field("title", form.title); ui.poll(); await ui.settle();
  assert.equal(ui.P.screens.current.item, "minecraft:slime_ball");
  assert.deepEqual(Array.from(ui.P.screens.current.scenes, scene => scene.id), ["ponder_batch1:defaults", "ponder_batch1:collision"]);
});

test("a new title cannot consume an old form's plugin list", async () => {
  const ui = runtime(read);
  ui.screen(); ui.field("title", marker(1) + "ponder.addons:[];"); ui.poll(); await ui.settle();
  ui.field("layout[0].text", marker(1) + "ponder.addons:[];");
  ui.field("title", marker(2)); ui.poll(); await ui.settle();
  assert.equal(ui.P.screens.current, null);
  assert.equal(ui.scripts.length, 0);
  ui.field("layout[0].text", marker(2) + addons); ui.poll(); await ui.settle();
  assert.equal(ui.P.screens.current.item, "minecraft:slime_ball");
});

test("failed script loads are logged and can succeed on the next open", async () => {
  const ui = runtime(read, { deferScripts: true });
  ui.screen(); ui.field("title", marker(1) + addons); ui.poll();
  ui.finishScript(ui.scripts[0], true); await ui.settle();
  assert.equal(ui.P.screens.current, null);
  assert.equal(ui.vanillaRoot.style.cssText, "");
  assert.ok(ui.logs.some(entry => entry.level === 3 && entry.message.includes("Cannot load plugin script")));
  ui.field("title", marker(2) + addons); ui.poll();
  assert.equal(ui.scripts.length, 2, "a failure must not mark the plugin as loaded");
  ui.finishScript(ui.scripts[1]); await ui.settle();
  assert.equal(ui.P.screens.current.scenes.length, 2);
});

test("two requests await the same pending plugin and only the current one opens", async () => {
  const ui = runtime(read, { deferScripts: true });
  ui.screen(); ui.field("title", marker(1) + addons); ui.poll();
  ui.field("title", "ponder:minecraft:beetroot#2;" + addons); ui.poll(); await ui.settle();
  assert.equal(ui.scripts.length, 1);
  assert.equal(ui.P.screens.current, null);
  ui.finishScript(ui.scripts[0]); await ui.settle();
  assert.equal(ui.P.screens.current.item, "minecraft:beetroot");
  assert.equal(ui.P.screens.current.scenes.length, 1);
  assert.equal(ui.logs.filter(entry => entry.message.includes("open minecraft:slime_ball")).length, 0);
});

test("closing a form while its plugin loads does not reopen it", async () => {
  const ui = runtime(read, { deferScripts: true });
  ui.screen(); ui.field("title", marker(1) + addons); ui.poll();
  ui.screen(0); ui.poll(); ui.finishScript(ui.scripts[0]); await ui.settle();
  assert.equal(ui.P.screens.current, null);
  assert.equal(ui.vanillaRoot.style.cssText, "");
});

test("a fetched script that throws before registration reports the actual failure", async () => {
  const ui = runtime(name => name === "hbui/" + addon.script ? Buffer.from('throw new Error("registration probe");') : read(name));
  ui.screen(); ui.field("title", marker(1) + addons); ui.poll(); await ui.settle();
  assert.equal(ui.P.screens.current, null);
  assert.ok(ui.logs.some(entry => entry.level === 3 && entry.message.includes("registration probe") && entry.message.includes(addon.script)));
  assert.ok(ui.logs.some(entry => entry.message.includes("Script did not register plugin ponder_batch1")));
});

test("a stalled plugin gives back the form and reports its path", async () => {
  const ui = runtime(read, { deferScripts: true });
  ui.screen(); ui.field("title", marker(1) + addons); ui.poll();
  ui.expireTimers(); await ui.settle();
  assert.equal(ui.P.screens.current, null);
  assert.equal(ui.vanillaRoot.style.cssText, "");
  assert.ok(ui.logs.some(entry => entry.level === 3 && entry.message.includes("Plugin load timed out: " + addon.script)));
});

test("malformed plugin metadata is logged without crashing the poll", async () => {
  const ui = runtime(read);
  ui.screen(); ui.field("title", marker(1) + "ponder.addons:[broken];");
  assert.doesNotThrow(() => ui.poll()); await ui.settle();
  assert.equal(ui.P.screens.current, null);
  assert.ok(ui.logs.some(entry => entry.level === 3 && entry.message.includes("invalid form")));
});

test("the fast-text fallback also loads a complete request", async () => {
  const ui = runtime(read), text = ui.document.createElement("fast-text");
  text.setAttribute("text", marker(1) + addons); ui.vanillaRoot.appendChild(text);
  ui.poll(); await ui.settle();
  assert.equal(ui.P.screens.current.scenes.length, 2);
});

test("native logs preserve queued messages, errors and rejected promise stacks without the overlay", () => {
  const ui = runtime(read), group = ui.commands.vanillaCoreDduiContentLogCommandGroup;
  delete ui.commands.vanillaCoreDduiContentLogCommandGroup;
  ui.P.DEBUG = false;
  ui.P.log("queued marker");
  ui.P.error("queued failure", new Error("stack probe"));
  assert.equal(ui.logs.some(entry => entry.message.includes("queued marker")), false);
  ui.commands.vanillaCoreDduiContentLogCommandGroup = group;
  ui.poll();
  assert.equal(ui.logs.filter(entry => entry.message.includes("queued marker")).length, 1);
  assert.ok(ui.logs.some(entry => entry.level === 3 && entry.message.includes("stack probe") && entry.message.includes("bridge.test.js")));
  ui.windowEvents.get("unhandledrejection")({ reason: new Error("promise probe") });
  assert.ok(ui.logs.some(entry => entry.level === 3 && entry.message.includes("promise probe")));
});
