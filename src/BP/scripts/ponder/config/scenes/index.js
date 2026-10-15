import { assemblyDemoScene } from "./assemblyDemo.js";
import { forgeDemoScene } from "./forgeDemo.js";
import { redstoneLampDemoScene } from "./redstoneLampDemo.js";

// Add new scene modules here after choosing a stage preset and keeping their step count inside the supported progress presets.
export const PONDER_SCENES = [
  assemblyDemoScene,
  forgeDemoScene,
  redstoneLampDemoScene,
];
