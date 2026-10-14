// Deliberately deterministic API double. It models ordering/ownership, not
// Bedrock lighting, native physics, chunk streaming or client rendering.
import { deferred } from "../fixtures.mjs";

export const InputPermissionCategory = {
  Camera: 1, Movement: 2, LateralMovement: 4, Sneak: 5, Jump: 6, Mount: 7,
  Dismount: 8, MoveForward: 9, MoveBackward: 10, MoveLeft: 11, MoveRight: 12,
};
export const HudVisibility = { Hide: 0, Reset: 1 };
export const InputMode = { Gamepad: "Gamepad", KeyboardAndMouse: "KeyboardAndMouse", Touch: "Touch" };
export const EntityInitializationCause = { Loaded: "Loaded", Spawned: "Spawned" };
const clone = value => structuredClone(value);
const inside = (p, b) => ["x", "y", "z"].every(k => p[k] >= b.from[k] && p[k] <= b.to[k]);
const overlaps = (a, b) => ["x", "y", "z"].every(k => a.from[k] <= b.to[k] && b.from[k] <= a.to[k]);
const box = volume => ({ from: clone(volume.from), to: clone(volume.to) });
const asPermutation = value => typeof value === "string" ? BlockPermutation.resolve(value) : value;

class Signal {
  listeners = new Set();
  subscribe(fn) { this.listeners.add(fn); return fn; }
  unsubscribe(fn) { this.listeners.delete(fn); }
  emit(event) { for (const fn of this.listeners) fn(event); }
}
const afterNames = ["itemUse", "entityHurt", "entityDie", "playerLeave", "playerDimensionChange",
  "playerSpawn", "entitySpawn", "worldLoad"];
export const world = {
  afterEvents: Object.fromEntries(afterNames.map(name => [name, new Signal()])),
  beforeEvents: { playerInteractWithBlock: new Signal() },
  properties: new Map(), dimensions: new Map(), players: [],
  getDynamicProperty(key) { return this.properties.get(key); },
  setDynamicProperty(key, value) {
    if (this.failProperty) throw new Error("world property write failed");
    if (value === undefined) this.properties.delete(key); else this.properties.set(key, value);
  },
  getDimension(id) {
    const dimension = this.dimensions.get(id.includes(":") ? id : `minecraft:${id}`);
    if (!dimension) throw new Error(`Missing mock dimension ${id}`);
    return dimension;
  },
  getAllPlayers() { return this.players.filter(p => p.isValid); },
};
let serial = 0;
export const system = {
  currentTick: 0, jobs: new Map(), timers: new Map(),
  run(fn) { return this.runTimeout(fn, 1); },
  runTimeout(fn, ticks = 1) {
    const id = ++serial;
    this.timers.set(id, { at: this.currentTick + Math.max(1, ticks), fn });
    return id;
  },
  runInterval(fn, ticks = 1) {
    const id = ++serial;
    this.timers.set(id, { at: this.currentTick + ticks, interval: ticks, fn });
    return id;
  },
  clearRun(id) { this.timers.delete(id); },
  runJob(generator) { const id = ++serial; this.jobs.set(id, generator); return id; },
  clearJob(id) { this.jobs.delete(id); },
};
export async function microtasks() { for (let i = 0; i < 16; i++) await Promise.resolve(); }
export async function step({ jobs = 16, timers = true } = {}) {
  system.currentTick++;
  if (timers) for (const [id, timer] of [...system.timers]) {
    if (timer.at > system.currentTick) continue;
    if (timer.interval) timer.at += timer.interval; else system.timers.delete(id);
    timer.fn();
  }
  await microtasks();
  for (const [id, generator] of [...system.jobs]) {
    for (let i = 0; i < jobs; i++) {
      if (generator.next().done) { system.jobs.delete(id); break; }
    }
  }
  await microtasks();
}
export async function until(predicate, options = {}) {
  await microtasks();
  for (let i = 0; i < (options.limit ?? 4000); i++) {
    if (predicate()) return;
    await step(options);
  }
  throw new Error(`Mock scheduler timed out (tick=${system.currentTick}, jobs=${system.jobs.size})`);
}
export async function settle(promise, options = {}) {
  let done = false, value, failure;
  promise.then(result => { value = result; done = true; }, error => { failure = error; done = true; });
  await until(() => done, options);
  if (failure) throw failure;
  return value;
}
export class BlockVolume {
  constructor(from, to) { this.from = clone(from); this.to = clone(to); }
}
export class BlockPermutation {
  static rejected = new Set();
  static resolve(typeId, states = {}) {
    if (this.rejected.has(typeId)) throw new Error(`Unknown block ${typeId}`);
    return { type: { id: typeId }, states: clone(states), getAllStates: () => clone(states) };
  }
}
export class ItemStack {
  constructor(typeId, amount = 1) { this.typeId = typeId; this.amount = amount; }
}
export class MockEntity {
  constructor(typeId, dimension, position = { x: 0, y: 64, z: 0 }) {
    Object.assign(this, { id: `entity_${++serial}`, typeId, dimension, location: clone(position),
      isValid: true, tags: new Set(), properties: new Map(), impulses: [], events: [], teleports: [], removed: 0 });
  }
  addTag(tag) { if (this.failTag) throw new Error("tag failed"); this.tags.add(tag); }
  hasTag(tag) { return this.tags.has(tag); }
  setProperty(key, value) { this.properties.set(key, value); }
  teleport(location, options = {}) {
    if (this.typeId === "minecraft:player") throw new Error("The runtime must never teleport a player");
    this.location = clone(location); this.teleports.push({ location: clone(location), ...options });
  }
  remove() { this.isValid = false; this.removed++; }
  triggerEvent(event) { this.events.push(event); }
  applyImpulse(impulse) { this.impulses.push(clone(impulse)); }
  getAABB() { return { center: clone(this.location), extent: { x: .3, y: .5, z: .3 } }; }
}
export class MockPlayer extends MockEntity {
  constructor(dimension = world.getDimension("overworld"), options = {}) {
    super("minecraft:player", dimension, options.location);
    this.messages = []; this.dynamic = new Map(); this.hidden = options.hidden ?? [0, 2];
    this.permissions = new Map(Object.values(InputPermissionCategory).map(n => [n, true]));
    this.permissions.set(InputPermissionCategory.Jump, false);
    this.clientSystemInfo = { locale: options.locale ?? "zh_CN" };
    this.inputInfo = { lastInputMode: options.inputMode ?? InputMode.KeyboardAndMouse };
    this.inputPermissions = {
      isPermissionCategoryEnabled: n => this.permissions.get(n),
      setPermissionCategory: (n, value) => {
        if (this.failInput) throw new Error("input unavailable");
        this.permissions.set(n, value);
        // Aggregate writes affect child permissions. Recovery order matters.
        const children = n === 2 ? [4, 5, 6, 7, 8, 9, 10, 11, 12] : n === 4 ? [9, 10, 11, 12] : [];
        children.forEach(child => this.permissions.set(child, value));
      },
    };
    this.onScreenDisplay = {
      getHiddenHudElements: () => [...this.hidden],
      setHudVisibility: (_value, elements) => { this.hidden = elements ? [...new Set([...this.hidden, ...elements])] : [...Array(13).keys()]; },
      resetHudElementsVisibility: () => { this.hidden = []; },
    };
    this.camera = {
      calls: [], active: undefined, fov: undefined,
      clear: () => {
        if (this.failCamera) throw new Error("camera unavailable");
        this.camera.active = undefined; this.camera.calls.push({ op: "clear" });
      },
      setCamera: (preset, options) => {
        this.camera.active = { preset, ...clone(options) };
        this.camera.calls.push({ op: "set", ...this.camera.active });
      },
      setFov: value => { this.camera.fov = value; },
    };
    world.players.push(this);
  }
  getDynamicProperty(key) { return this.dynamic.get(key); }
  setDynamicProperty(key, value) {
    if (this.failProperty) throw new Error("player property unavailable");
    if (value === undefined) this.dynamic.delete(key); else this.dynamic.set(key, value);
  }
  sendMessage(value) { this.messages.push(value); }
}
export class MockDimension {
  constructor(id, min, max) {
    Object.assign(this, { id, heightRange: { min, max }, writes: [], scans: [], entities: [], particles: [],
      fillCalls: 0, setCalls: 0, onFill: undefined, onScan: undefined });
  }
  getPlayers() { return world.getAllPlayers().filter(p => p.dimension === this); }
  getEntities(query = {}) {
    const volume = query.volume && { from: query.location,
      to: Object.fromEntries(["x", "y", "z"].map(k => [k, query.location[k] + query.volume[k]])) };
    return [...this.entities, ...this.getPlayers()].filter(e => e.isValid &&
      (!query.tags || query.tags.every(tag => e.hasTag(tag))) && (!volume || inside(e.location, volume)));
  }
  read(location) {
    for (let i = this.writes.length - 1; i >= 0; i--)
      if (inside(location, this.writes[i])) return this.writes[i].permutation;
    return BlockPermutation.resolve("minecraft:air");
  }
  getBlock(location) {
    if (this.unloaded) throw new Error("unloaded block");
    return {
      get typeId() { return this.permutation.type.id; },
      permutation: this.read(location),
      setPermutation: permutation => {
        if (this.failSet) throw new Error("block write failed");
        this.setCalls++;
        this.writes.push({ from: clone(location), to: clone(location), permutation });
      },
    };
  }
  fillBlocks(volume, value) {
    this.fillCalls++; this.onFill?.(volume, value);
    this.writes.push({ ...box(volume), permutation: asPermutation(value) });
  }
  containsBlock(volume, filter = {}, allowUnloadedChunks = false) {
    this.scans.push({ ...box(volume), allowUnloadedChunks });
    this.onScan?.(volume);
    if (this.unloaded) throw new Error("unloaded scan");
    // Exact partition of cuboid edits; avoids materializing a million air blocks.
    const cuts = Object.fromEntries(["x", "y", "z"].map(k => [k, new Set([volume.from[k], volume.to[k] + 1])]));
    for (const write of this.writes.filter(w => overlaps(w, volume))) for (const k of ["x", "y", "z"]) {
      cuts[k].add(Math.max(volume.from[k], write.from[k]));
      cuts[k].add(Math.min(volume.to[k] + 1, write.to[k] + 1));
    }
    const axes = Object.fromEntries(Object.entries(cuts).map(([k, values]) => [k, [...values].sort((a, b) => a - b).slice(0, -1)]));
    for (const x of axes.x) for (const y of axes.y) for (const z of axes.z) {
      const type = this.read({ x, y, z }).type.id;
      if ((!filter.excludeTypes || !filter.excludeTypes.includes(type)) && (!filter.includeTypes || filter.includeTypes.includes(type))) return true;
    }
    return false;
  }
  spawnEntity(typeId, position) {
    const entity = new MockEntity(typeId, this, position); this.entities.push(entity);
    world.afterEvents.entitySpawn.emit({ entity, cause: "Spawned" });
    return entity;
  }
  spawnItem(item, position) { const entity = this.spawnEntity("minecraft:item", position); entity.item = item; return entity; }
  spawnParticle(particleId, position) { this.particles.push({ particleId, position: clone(position) }); }
}
export class MockTickingAreaManager {
  areas = new Map();
  creates = [];
  removes = [];
  maxAreas = 8;
  maxChunkCount = 1000;
  beforeCreate;
  get chunkCount() { return this.areas.size * 49; }
  hasCapacity() { return this.areas.size < this.maxAreas; }
  hasTickingArea(id) { return this.areas.has(id); }
  getTickingArea(id) { return this.areas.get(id); }
  getAllTickingAreas() { return [...this.areas.values()]; }
  async createTickingArea(identifier, options) {
    this.creates.push({ identifier, options });
    if (!this.hasCapacity(options)) throw new Error("native ticking area capacity exceeded");
    // Reservations count while loading, just as the pack counts in-flight leases.
    this.areas.set(identifier, { identifier, ...options });
    await this.beforeCreate?.(identifier, options);
  }
  removeTickingArea(identifier) {
    if (this.failRemove) throw new Error("ticking area remove failed");
    this.removes.push(identifier); this.areas.delete(identifier);
  }
}
export function resetServer() {
  serial = 0;
  for (const signals of [world.afterEvents, world.beforeEvents])
    for (const signal of Object.values(signals)) signal.listeners.clear();
  world.properties.clear(); world.players = []; world.dimensions.clear(); world.failProperty = false;
  for (const [name, min, max] of [["overworld", -64, 320], ["nether", 0, 128], ["the_end", 0, 256]]) {
    const dimension = new MockDimension(`minecraft:${name}`, min, max);
    world.dimensions.set(dimension.id, dimension);
  }
  world.tickingAreaManager = new MockTickingAreaManager();
  system.currentTick = 0; system.timers.clear(); system.jobs.clear();
  BlockPermutation.rejected.clear();
}
resetServer();
export { deferred };
