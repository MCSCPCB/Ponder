import { assemblyDemoScene } from "./assemblyDemo.js";
import { forgeDemoScene } from "./forgeDemo.js";
import { redstoneLampDemoScene, lampStatesScene } from "./redstoneLampDemo.js";

// UI progress/keyframe presets are generated from this list by `npm run build`.
export const PONDER_SCENES = [
  assemblyDemoScene,
  forgeDemoScene,
  redstoneLampDemoScene,
  lampStatesScene,
];
