import { defineStagePreset } from "./factories.js";

export const STAGE_PRESETS = {
  demo_8x8x8: defineStagePreset({
    uiTitleMarker: "§4§r§1§r",
    mirrorOrigin: { x: 0, y: 100, z: 0 },
    size: { x: 8, y: 8, z: 8 },
    focus: { x: 3, y: 3, z: 3 },
  }),
  demo_16x16x16: defineStagePreset({
    uiTitleMarker: "§4§r§2§r",
    mirrorOrigin: { x: 20, y: 100, z: 0 },
    size: { x: 16, y: 16, z: 16 },
    focus: { x: 7, y: 4, z: 7 },
  }),
  /*注释
  demo_XxYxZ: defineStagePreset({
    uiTitleMarker: "SIZE_MARKER",
    mirrorOrigin: { 
      x: MIRROR_X, // MIRROR_X = preview structure mirror origin x
      y: MIRROR_Y, // same for Y
      z: MIRROR_Z // same for Z
    },
    size: { 
      x: X, // X = stage width
      y: Y, // Y = stage height
      z: Z // Z = stage depth
    },
    focus: { 
      x: FOCUS_X, // FOCUS_X = relative structure center x
      y: FOCUS_Y, // same for Y
      z: FOCUS_Z // same for Z
    },
  }),
  */
};
