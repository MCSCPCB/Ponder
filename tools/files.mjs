import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const path = (...parts) => resolve(ROOT, ...parts);
export const readJson = file => JSON.parse(readFileSync(path(file), "utf8"));
export function write(file, data) {
  const target = path(file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, data);
}
export const json = (file, value, compact = false) =>
  write(file, JSON.stringify(value, null, compact ? undefined : 2) + "\n");
