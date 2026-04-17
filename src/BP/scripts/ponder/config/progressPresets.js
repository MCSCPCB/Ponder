export const PROGRESS_STAGE_PRESETS = {
  steps_4: { stageCount: 4 },
  steps_6: { stageCount: 6 },
  /*注释
  steps_C: { stageCount: C }, // C = stage count
  */
};

export const SUPPORTED_PROGRESS_STAGE_COUNTS = new Set(
  Object.values(PROGRESS_STAGE_PRESETS).map((preset) => preset.stageCount),
);
