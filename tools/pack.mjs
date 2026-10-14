import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { filesIn, check } from "./check.mjs";
import { path, readJson, write } from "./files.mjs";

/** Pure packaging keeps archive verification independent from writing dist/. */
export function buildAddon() {
  const options = { level: 9, mtime: new Date("2026-01-01T00:00:00Z") };
  const packs = {};
  for (const name of ["BP", "RP"]) {
    const root = path("src", name), files = {};
    for (const file of filesIn(root))
      files[relative(root, file).split(sep).join("/")] = new Uint8Array(readFileSync(file));
    packs[`Ponder-${name}.mcpack`] = zipSync(files, options);
  }
  const addon = zipSync(packs, options), version = readJson("src/BP/manifest.json").header.version.join(".");
  return { addon, filename: `Ponder-${version}.mcaddon`, sha256: createHash("sha256").update(addon).digest("hex") };
}
export function pack() {
  check();
  const { addon, filename, sha256 } = buildAddon();
  write(`dist/${filename}`, addon);
  write(`dist/${filename}.sha256`, `${sha256}  ${filename}\n`);
  console.log(`Packed ${path("dist", filename)} (${(addon.length / 1024).toFixed(0)} KiB).`);
  console.log("This is a test build, not a Minecraft visual/multiplayer/achievement acceptance result.");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) pack();
