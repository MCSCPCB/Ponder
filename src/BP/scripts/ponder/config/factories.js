export const defineStagePreset = (config) => {
  return {
    ...config,
    origin: config.mirrorOrigin,
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

export const defineEntityStructure = (id, entityTypeId, position, options = {}) => ({
  id,
  kind: "entity",
  entityTypeId,
  position,
  ...options,
});

export const defineStage = ({ description, add = [], remove = [], bubbleSlot }) => ({
  description,
  add,
  remove,
  ...(bubbleSlot !== undefined ? { bubbleSlot } : {}),
});
