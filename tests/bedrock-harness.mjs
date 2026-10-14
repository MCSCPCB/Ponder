import { registerHooks } from "node:module";

const mapping = {
  "@minecraft/server": new URL("./mocks/server.mjs", import.meta.url).href,
  "@minecraft/server-ui": new URL("./mocks/server-ui.mjs", import.meta.url).href,
};
registerHooks({
  resolve(specifier, context, next) {
    return mapping[specifier] ? { url: mapping[specifier], shortCircuit: true } : next(specifier, context);
  },
});
const server = await import("./mocks/server.mjs");
const ui = await import("./mocks/server-ui.mjs");
export const reset = () => { server.resetServer(); ui.resetForms(); };
export const { world, system, MockPlayer, MockEntity, BlockPermutation, BlockVolume,
  InputPermissionCategory, step, until, settle, microtasks, deferred } = server;
export const { forms, uiManager, FormCancelationReason } = ui;
export const makeSession = (dimension = world.getDimension("overworld")) => ({
  player: new MockPlayer(dimension), dimension, closed: false, locale: "zh_CN", inputMode: "keyboard",
});
export const compactScene = () => ({
  room: { from: { x: -2, y: -2, z: -2 }, to: { x: 18, y: 10, z: 18 } },
});
