import { key, unkey } from "./VecHelper.js";

/**
 * A set of block positions in scene space. Mirrors Java's Selection: sets can be
 * combined, subtracted and queried; the schematic decides which positions hold blocks.
 */
export class SelectionImpl {
  /** @param {Iterable<string>} keys encoded with key() */
  constructor(keys = []) { this.keys = new Set(keys); }

  static fromTo(a, b) {
    const selection = new SelectionImpl();
    const lo = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) };
    const hi = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) };
    for (let x = lo.x; x <= hi.x; x++)
      for (let y = lo.y; y <= hi.y; y++)
        for (let z = lo.z; z <= hi.z; z++) selection.keys.add(key({ x, y, z }));
    return selection;
  }

  add(other) { return new SelectionImpl([...this.keys, ...other.keys]); }
  substract(other) { return new SelectionImpl([...this.keys].filter(k => !other.keys.has(k))); }
  copy() { return new SelectionImpl(this.keys); }
  test(position) { return this.keys.has(key(position)); }
  get size() { return this.keys.size; }

  *[Symbol.iterator]() { for (const k of this.keys) yield unkey(k); }

  /** Center of the bounding box in block coordinates (block centers, like Java). */
  getCenter() {
    const lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const p of this) for (const axis of ["x", "y", "z"]) {
      lo[axis] = Math.min(lo[axis], p[axis]); hi[axis] = Math.max(hi[axis], p[axis]);
    }
    if (!this.keys.size) return { x: 0, y: 0, z: 0 };
    return { x: (lo.x + hi.x) / 2 + .5, y: (lo.y + hi.y) / 2 + .5, z: (lo.z + hi.z) / 2 + .5 };
  }

  /** Axis-aligned box covering the selection, upper bound exclusive of the last block's far face. */
  getBounds() {
    const from = { x: Infinity, y: Infinity, z: Infinity }, to = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const p of this) for (const axis of ["x", "y", "z"]) {
      from[axis] = Math.min(from[axis], p[axis]); to[axis] = Math.max(to[axis], p[axis]);
    }
    return { from, to };
  }
}
