const addVector = (a, b) => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});

const subtractVector = (a, b) => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});

const getLocalMax = (size) => ({
  x: size.x - 1,
  y: size.y - 1,
  z: size.z - 1,
});

const getDefaultFocus = (size) => ({
  x: Math.floor((size.x - 1) / 2),
  y: Math.floor((size.y - 1) / 2),
  z: Math.floor((size.z - 1) / 2),
});

export const defineStagePreset = (config) => {
  const mirrorOrigin = config.mirrorOrigin ?? config.origin ?? { x: 0, y: 0, z: 0 };
  const size = config.size;
  const focus =
    config.focus ??
    (config.preview?.focus
      ? subtractVector(config.preview.focus, mirrorOrigin)
      : getDefaultFocus(size));

  return {
    ...config,
    mirrorOrigin,
    origin: mirrorOrigin,
    focus,
    preview: {
      ...config.preview,
      focus: addVector(mirrorOrigin, focus),
      bottomLeftBlock: mirrorOrigin,
      topRightBlock: addVector(mirrorOrigin, getLocalMax(size)),
    },
  };
};

export const defineBoxStructure = (id, blockId, from, to) => ({
  id,
  kind: "box",
  blockId,
  from,
  to,
});

export const defineBlockStructure = (id, blockId, position) => ({
  id,
  kind: "block",
  blockId,
  position,
});

export const defineStage = ({ description, add = [], remove = [], bubbleSlot }) => ({
  description,
  add,
  remove,
  ...(bubbleSlot !== undefined ? { bubbleSlot } : {}),
});

export const defineScene = (config) => config;
