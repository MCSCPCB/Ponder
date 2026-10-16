export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const length = (v) => Math.hypot(v.x, v.y, v.z);
export const distance = (a, b) => length(sub(a, b));
export const inside = (p, b) => ["x", "y", "z"].every(k => p[k] >= b.from[k] && p[k] <= b.to[k]);
export const overlaps = (a, b) => ["x", "y", "z"].every(k => a.from[k] <= b.to[k] && b.from[k] <= a.to[k]);
export const expand = (b, n) => ({
  from: { x: b.from.x - n, y: b.from.y - n, z: b.from.z - n },
  to: { x: b.to.x + n, y: b.to.y + n, z: b.to.z + n },
});
/** Camera location orbiting `focus` at the given yaw/pitch (degrees) and distance. */
export function orbit(camera) {
  const yaw = camera.yaw * Math.PI / 180, pitch = camera.pitch * Math.PI / 180;
  const offset = {
    x: Math.sin(yaw) * Math.cos(pitch) * camera.distance,
    y: Math.sin(pitch) * camera.distance,
    z: -Math.cos(yaw) * Math.cos(pitch) * camera.distance,
  };
  // Screen up: perpendicular to the line of sight, in its vertical plane.
  const up = { x: -Math.sin(yaw) * Math.sin(pitch), y: Math.cos(pitch), z: Math.cos(yaw) * Math.sin(pitch) };
  return { location: add(camera.focus, offset), focus: camera.focus, up };
}
