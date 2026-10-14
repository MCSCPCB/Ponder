export const defineStagePreset = config => ({ ...config });
export const defineBoxStructure = (id, blockId, from, to, states = {}) => ({ id, kind: "box", blockId, from, to, states });
export const defineBlockStructure = (id, blockId, position, states = {}) => ({ id, kind: "block", blockId, position, states });
export const defineEntityStructure = (id, entityTypeId, position, options = {}) => ({ id, kind: "entity", entityTypeId, position, ...options });
export const defineStage = config => ({ duration: 100, add: [], remove: [], ...config });
export const wait = ticks => ({ op: "wait", ticks });
export const parallel = (...branches) => ({ op: "parallel", branches });
export function tiledBase(width, depth = width) {
  const blocks = [];
  for (let x = 1; x < width - 1; x++)
    for (let z = 1; z < depth - 1; z++)
      blocks.push(defineBlockStructure(`base_${x}_${z}`, (x + z) % 2 ? "minecraft:light_gray_terracotta" : "minecraft:snow", { x, y: 0, z }));
  return blocks;
}
