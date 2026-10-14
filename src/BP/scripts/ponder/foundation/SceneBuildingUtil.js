import { SelectionImpl } from "./SelectionImpl.js";
import { DIRECTION_VECTORS } from "../enums/PonderConfig.js";

/** Mirrors Java's SceneBuildingUtil: select(), vector() and grid(), bound to one schematic. */
export function createSceneBuildingUtil(schematic) {
  const { size } = schematic;
  const all = (x0, y0, z0, x1, y1, z1) => SelectionImpl.fromTo({ x: x0, y: y0, z: z0 }, { x: x1, y: y1, z: z1 });
  return {
    select: () => ({
      everywhere: () => all(0, 0, 0, size.x - 1, size.y - 1, size.z - 1),
      position: (x, y, z) => all(x, y, z, x, y, z),
      fromTo: all,
      column: (x, z) => all(x, 0, z, x, size.y - 1, z),
      layer: y => all(0, y, 0, size.x - 1, y, size.z - 1),
      layersFrom: y => all(0, y, 0, size.x - 1, size.y - 1, size.z - 1),
      layers: (y, height) => all(0, y, 0, size.x - 1, y + height - 1, size.z - 1),
      cuboid: (origin, extent) => all(origin.x, origin.y, origin.z, origin.x + extent.x, origin.y + extent.y, origin.z + extent.z),
    }),
    vector: () => ({
      centerOf: (x, y, z) => ({ x: x + .5, y: y + .5, z: z + .5 }),
      topOf: (x, y, z) => ({ x: x + .5, y: y + 1, z: z + .5 }),
      blockSurface: (pos, face, margin = 0) => {
        const n = DIRECTION_VECTORS[face] ?? { x: 0, y: 0, z: 0 };
        return { x: pos.x + .5 + n.x * (.5 + margin), y: pos.y + .5 + n.y * (.5 + margin), z: pos.z + .5 + n.z * (.5 + margin) };
      },
      of: (x, y, z) => ({ x, y, z }),
    }),
    grid: () => ({ at: (x, y, z) => ({ x, y, z }), zero: () => ({ x: 0, y: 0, z: 0 }) }),
  };
}
