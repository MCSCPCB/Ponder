import { normalizeScene } from "../src/BP/scripts/ponder/core/scene.js";

export const rawScene = (overrides = {}) => ({
  id: "fixture", title: { en_US: "Fixture", zh_CN: "测试" }, entryItems: ["minecraft:stick"],
  size: { x: 4, y: 4, z: 4 }, iconPath: "textures/items/stick",
  structures: [{ id: "cube", kind: "block", blockId: "minecraft:stone", position: { x: 1, y: 0, z: 1 } }],
  initial: ["cube"], instructions: [{ op: "wait", ticks: 40 }], ...overrides,
});
export const scene = overrides => normalizeScene(rawScene(overrides));
export const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
