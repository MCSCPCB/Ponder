import { world } from "@minecraft/server";
import { key, positions } from "./VecHelper.js";

/**
 * A schematic is the whole world of a scene: `size`, a sparse `blocks` table
 * (position key -> { blockId, states }) and the positions authored as air.
 * Storyboards decide when each part becomes visible.
 *
 * Two sources produce the same shape:
 *   - defineSchematic(): hand-written declarations
 *   - loadSchematic():   a `.mcstructure` shipped in the behavior pack
 */
export const fill = (blockId, from, to, states = {}, data) => ({ kind: "fill", blockId, from, to, states, data });
export const place = (blockId, position, states = {}, data) => ({ kind: "place", blockId, position, states, data });

/** Alternating two-block floor at y = 0, covering x/z in [1, width - 2]. */
export function checkerFloor(width, depth = width, even = "minecraft:snow", odd = "minecraft:light_gray_terracotta") {
  const entries = [];
  for (let x = 1; x < width - 1; x++)
    for (let z = 1; z < depth - 1; z++) entries.push(place((x + z) % 2 ? odd : even, { x, y: 0, z }));
  return entries;
}

const describeBlock = ({ blockId, states, data }) => data ? { blockId, states, data } : { blockId, states };

export function defineSchematic({ size, entries = [], air = [] }) {
  const blocks = new Map(), airKeys = new Set();
  for (const entry of entries) {
    if (entry.kind === "fill") {
      for (const p of positions({ from: entry.from, to: entry.to })) blocks.set(key(p), describeBlock(entry));
    } else blocks.set(key(entry.position), describeBlock(entry));
  }
  for (const box of air) for (const p of positions(box)) airKeys.add(key(p));
  return { size, blocks, air: airKeys };
}

/**
 * Reads a `.mcstructure` from the behavior pack. Must run in a writable tick.
 * Entities and block entity data (signs, containers) stored in the structure are not
 * exposed by the Structure API; author them with modifyBlockEntity instead.
 */
export function loadSchematic(structureName) {
  const structure = world.structureManager.get(resolveSchematicId(structureName));
  if (!structure) throw new Error(`Unknown schematic ${structureName}`);
  const size = structure.size, blocks = new Map(), air = new Set();
  for (let x = 0; x < size.x; x++)
    for (let y = 0; y < size.y; y++)
      for (let z = 0; z < size.z; z++) {
        const permutation = structure.getBlockPermutation({ x, y, z });
        if (!permutation) continue;
        if (permutation.type.id === "minecraft:air") air.add(key({ x, y, z }));
        else blocks.set(key({ x, y, z }), { blockId: permutation.type.id, states: permutation.getAllStates() });
      }
  return { size, blocks, air };
}

/** Resolves a short file name such as "assembly" to the identifier the game reports. */
export function resolveSchematicId(name) {
  const ids = world.structureManager.getPackStructureIds();
  if (ids.includes(name)) return name;
  const matches = ids.filter(id => id.endsWith(`:${name}`) || id.endsWith(`/${name}`));
  if (matches.length !== 1) throw new Error(`Schematic "${name}" not found or ambiguous (${ids.join(", ") || "none"})`);
  return matches[0];
}
