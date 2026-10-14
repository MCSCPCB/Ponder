export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const mul = (a, n) => ({ x: a.x * n, y: a.y * n, z: a.z * n });
export const length = (v) => Math.hypot(v.x, v.y, v.z);
export const distance = (a, b) => length(sub(a, b));
export const normalize = (v) => mul(v, 1 / (length(v) || 1));
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x,
});
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const smooth = (t) => t * t * (3 - 2 * t);
export const key = (p) => `${p.x},${p.y},${p.z}`;
export const unkey = (s) => {
  const [x, y, z] = s.split(",").map(Number);
  return { x, y, z };
};
export const inside = (p, b) => ["x", "y", "z"].every(k => p[k] >= b.from[k] && p[k] <= b.to[k]);
export const overlaps = (a, b) => ["x", "y", "z"].every(k => a.from[k] <= b.to[k] && b.from[k] <= a.to[k]);
export const volume = (b) => (b.to.x - b.from.x + 1) * (b.to.y - b.from.y + 1) * (b.to.z - b.from.z + 1);
export const expand = (b, n) => ({
  from: { x: b.from.x - n, y: b.from.y - n, z: b.from.z - n },
  to: { x: b.to.x + n, y: b.to.y + n, z: b.to.z + n },
});
export function* positions(b) {
  for (let x = b.from.x; x <= b.to.x; x++)
    for (let z = b.from.z; z <= b.to.z; z++)
      for (let y = b.from.y; y <= b.to.y; y++) yield { x, y, z };
}
export function orbit(camera) {
  const yaw = camera.yaw * Math.PI / 180, pitch = camera.pitch * Math.PI / 180;
  const offset = {
    x: Math.sin(yaw) * Math.cos(pitch) * camera.distance,
    y: Math.sin(pitch) * camera.distance,
    z: -Math.cos(yaw) * Math.cos(pitch) * camera.distance,
  };
  const location = add(camera.focus, offset), forward = normalize(mul(offset, -1));
  const right = normalize(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = normalize(cross(right, forward));
  return { location, forward, right, up, focus: camera.focus };
}
/**
 * Camera pose at `tick`. A later move interrupts an earlier one where it starts,
 * continuing from the pose reached there, like Java's chased rotation.
 */
export function cameraAt(initial, tracks, tick) {
  let current = { ...initial };
  tracks.forEach((event, i) => {
    if (event.at > tick) return;
    const until = Math.min(tick, tracks[i + 1]?.at ?? Infinity);
    const t = event.duration ? smooth(clamp((until - event.at) / event.duration, 0, 1)) : 1;
    const from = { ...current };
    for (const k of ["yaw", "pitch", "distance"]) {
      const target = k === "yaw" && event.yawBy !== undefined ? from.yaw + event.yawBy : event[k];
      if (target !== undefined) current[k] = lerp(from[k], target, t);
    }
    if (event.focus) current.focus = add(from.focus, mul(sub(event.focus, from.focus), t));
  });
  return current;
}
