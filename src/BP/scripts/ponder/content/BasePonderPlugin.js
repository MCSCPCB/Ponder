import { assemblyDemoScene } from "./scenes/AssemblyDemo.js";
import { forgeDemoScene } from "./scenes/ForgeDemo.js";
import { redstoneLampDemoScene } from "./scenes/RedstoneLampDemo.js";

// Add new scene modules here after choosing a stage preset and keeping their step count inside the supported progress presets.
export const PONDER_SCENES = [
  assemblyDemoScene,
  forgeDemoScene,
  redstoneLampDemoScene,
];
