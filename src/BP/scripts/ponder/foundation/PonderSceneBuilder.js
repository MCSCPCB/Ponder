import { SelectionImpl } from "./SelectionImpl.js";
import { FADE_TICKS, FADE_IN_TICKS, DEFAULT_KEYFRAME_DELAY, DIRECTION_VECTORS } from "../enums/PonderConfig.js";

/**
 * Records a storyboard into an ordered instruction list, like Java's
 * PonderSceneBuilder. Only idle() advances the cursor; every other call is
 * scheduled at the current tick and does not block.
 *
 * The list is compiled by PonderSchedule into the event timeline.
 */
export class PonderSceneBuilder {
  constructor(sceneData) {
    this.data = sceneData;
    this.instructions = [];
    this.links = new Map();
    this.linkSerial = 0;
    this.textSerial = 0;
    this.slotSerial = 0;
    this.pendingKeyframeDelay = undefined;
    this._world = new WorldInstructions(this);
    this._overlay = new OverlayInstructions(this);
    this._effects = new EffectInstructions(this);
    this._special = new SpecialInstructions(this);
  }

  world() { return this._world; }
  overlay() { return this._overlay; }
  effects() { return this._effects; }
  special() { return this._special; }

  push(instruction) { this.instructions.push(instruction); return instruction; }

  title(id, title) { this.data.titleId = id; this.data.title = title; }
  configureBasePlate(xOffset, zOffset, size) { this.data.basePlate = { xOffset, zOffset, size }; }
  scaleSceneView(factor) { this.data.viewScale = factor; }
  setSceneOffsetY(offset) { this.data.viewOffsetY = offset; }
  removeShadow() { /* The platform shadow is a GUI effect with no counterpart here. */ }

  showBasePlate() {
    const { xOffset, zOffset, size } = this.data.basePlate;
    this.world().showSection(SelectionImpl.fromTo(
      { x: xOffset, y: 0, z: zOffset }, { x: xOffset + size - 1, y: 0, z: zOffset + size - 1 }), "up");
  }

  idle(ticks) { this.push({ op: "wait", ticks }); }
  idleSeconds(seconds) { this.idle(seconds * 20); }

  markAsFinished() { this.push({ op: "finish" }); }
  setNextUpEnabled(enabled) { this.data.nextUpEnabled = enabled; }

  /** Rotates the camera around the scene, relative to the current heading. */
  rotateCameraY(degrees) { this.push({ op: "camera", yawBy: degrees, duration: 20 }); }

  addKeyframe() { this.push({ op: "keyframe" }); }
  /** Java records lazy keyframes six ticks later so the preceding text is readable. */
  addLazyKeyframe() { this.push({ op: "keyframe", delay: DEFAULT_KEYFRAME_DELAY }); }

  /** Replaces the scene description with the recorded instructions. */
  finish() { return this.instructions; }

  newLink(kind) {
    const id = `${kind}_${++this.linkSerial}`;
    this.links.set(id, { id, kind });
    return { id, kind };
  }
}

const direction = name => DIRECTION_VECTORS[name ?? "none"];

class WorldInstructions {
  constructor(builder) { this.b = builder; }

  showSection(selection, from) {
    this.b.push({ op: "show", selection, fade: FADE_IN_TICKS, from: direction(from), independent: false });
  }
  showSectionAndMerge(selection, from, link) {
    this.b.push({ op: "show", selection, fade: FADE_IN_TICKS, from: direction(from), mergeInto: link.id });
  }
  glueBlockOnto(position, from, link) {
    this.b.push({ op: "show", selection: SelectionImpl.fromTo(position, position), fade: FADE_IN_TICKS,
      from: direction(from), mergeInto: link.id });
  }
  showIndependentSection(selection, from) {
    const link = this.b.newLink("section");
    this.b.push({ op: "show", selection, fade: FADE_IN_TICKS, from: direction(from), independent: true, link: link.id });
    return link;
  }
  showIndependentSectionImmediately(selection) {
    const link = this.b.newLink("section");
    this.b.push({ op: "show", selection, fade: 0, independent: true, link: link.id });
    return link;
  }
  hideSection(selection, to) {
    this.b.push({ op: "hide", selection, fade: FADE_TICKS, to: direction(to) });
  }
  hideIndependentSection(link, to) {
    this.b.push({ op: "hide", link: link.id, fade: FADE_TICKS, to: direction(to) });
  }
  makeSectionIndependent(selection) {
    const link = this.b.newLink("section");
    this.b.push({ op: "detach", selection, link: link.id });
    return link;
  }
  restoreBlocks(selection) { this.b.push({ op: "restore", selection }); }

  rotateSection(link, x, y, z, duration) { this.b.push({ op: "rotateSection", link: link.id, rotation: { x, y, z }, duration }); }
  moveSection(link, offset, duration) { this.b.push({ op: "moveSection", link: link.id, offset, duration }); }
  configureCenterOfRotation(link, anchor) { this.b.push({ op: "sectionAnchor", link: link.id, rotationCenter: anchor }); }
  configureStabilization(link, anchor) { this.b.push({ op: "sectionAnchor", link: link.id, stabilization: anchor }); }

  setBlocks(selection, block, spawnParticles = false) {
    this.b.push({ op: "block", selection, block, particles: spawnParticles });
  }
  setBlock(position, block, spawnParticles = false) {
    this.b.push({ op: "block", selection: SelectionImpl.fromTo(position, position), block, particles: spawnParticles });
  }
  destroyBlock(position) { this.setBlock(position, { blockId: "minecraft:air" }, true); }
  replaceBlocks(selection, block, spawnParticles = false) {
    this.b.push({ op: "block", selection, block, particles: spawnParticles, onlySolid: true });
  }
  modifyBlock(position, states, spawnParticles = false) {
    this.b.push({ op: "block", selection: SelectionImpl.fromTo(position, position), modifyStates: states, particles: spawnParticles });
  }
  modifyBlocks(selection, states, spawnParticles = false) {
    this.b.push({ op: "block", selection, modifyStates: states, particles: spawnParticles });
  }
  cycleBlockProperty(position, property) {
    this.b.push({ op: "block", selection: SelectionImpl.fromTo(position, position), cycleState: property });
  }
  toggleRedstonePower(selection) { this.b.push({ op: "block", selection, toggleState: ["powered", "power"] }); }
  incrementBlockBreakingProgress(position) { this.b.push({ op: "breakProgress", position }); }

  createEntity(entityTypeId, position, options = {}) {
    const link = this.b.newLink("entity");
    this.b.push({ op: "spawn", id: link.id, entityTypeId, position, ...options });
    return link;
  }
  createItemEntity(position, motion, itemId, amount = 1) {
    const link = this.b.newLink("entity");
    this.b.push({ op: "spawn", id: link.id, itemId, amount, position, impulse: motion });
    return link;
  }
  modifyEntity(link, changes) { this.b.push({ op: "updateEntity", id: link.id, ...changes }); }
}

class OverlayInstructions {
  constructor(builder) { this.b = builder; }

  showText(duration) { return new TextElementBuilder(this.b, duration); }
  showOutlineWithText(selection, duration) {
    const slot = `outline_${++this.b.slotSerial}`;
    this.b.push({ op: "outline", id: slot, selection, duration, color: "white" });
    return new TextElementBuilder(this.b, duration).pointAtSelection(selection);
  }
  showControls(location, pointing, duration) { return new InputElementBuilder(this.b, location, pointing, duration); }
  showOutline(color, slot, selection, duration) {
    this.b.push({ op: "outline", id: `slot_${String(slot)}`, selection, color, duration });
  }
  chaseBoundingBoxOutline(color, slot, boundingBox, duration) {
    this.b.push({ op: "outline", id: `slot_${String(slot)}`, box: boundingBox, color, duration, chase: true });
  }
  showLine(color, start, end, duration) { this.b.push({ op: "line", color, start, end, duration, width: 1 / 16 }); }
  showBigLine(color, start, end, duration) { this.b.push({ op: "line", color, start, end, duration, width: 1 / 8 }); }
  showScrollInput(location, side, duration) { this.b.push({ op: "valueBox", location, side, duration, kind: "scroll" }); }
  showCenteredScrollInput(position, side, duration) {
    this.b.push({ op: "valueBox", location: { x: position.x + .5, y: position.y + .5, z: position.z + .5 }, side, duration, kind: "scroll" });
  }
  showRepeaterScrollInput(position, duration) {
    this.b.push({ op: "valueBox", location: { x: position.x + .5, y: position.y + 1 / 8, z: position.z + .5 }, side: "up", duration, kind: "repeater" });
  }
  showFilterSlotInput(location, side, duration) { this.b.push({ op: "valueBox", location, side, duration, kind: "filter" }); }
}

/** Fluent text builder. The instruction is pushed on construction, then refined. */
class TextElementBuilder {
  constructor(builder, duration) {
    this.b = builder;
    this.event = builder.push({ op: "text", id: `text_${++builder.textSerial}`, duration, color: "white", side: "auto" });
  }
  colored(color) { this.event.color = color; return this; }
  pointAt(vec) { this.event.target = vec; return this; }
  pointAtSelection(selection) { this.event.target = selection.getCenter(); return this; }
  independent(y = 0) { this.event.independent = y; return this; }
  text(value) { this.event.text = value; return this; }
  sharedText(key) { this.event.text = { key }; return this; }
  placeNearTarget() { this.event.placeNear = true; return this; }
  attachKeyFrame() { this.b.push({ op: "keyframe", delay: DEFAULT_KEYFRAME_DELAY }); return this; }
}

class InputElementBuilder {
  constructor(builder, location, pointing, duration) {
    this.event = builder.push({ op: "controls", id: `controls_${++builder.textSerial}`, target: location,
      pointing, duration, action: "use",
      side: { left: "left", right: "right", up: "top", down: "bottom" }[pointing] ?? "auto" });
  }
  withItem(itemId) { this.event.itemId = itemId; return this; }
  leftClick() { this.event.action = "attack"; return this; }
  rightClick() { this.event.action = "use"; return this; }
  scroll() { this.event.action = "scroll"; return this; }
  showing(iconPath) { this.event.iconPath = iconPath; return this; }
  whileSneaking() { this.event.sneaking = true; return this; }
  whileCTRL() { this.event.ctrl = true; return this; }
}

class EffectInstructions {
  constructor(builder) { this.b = builder; }
  emitParticles(location, emitter, amountPerCycle, cycles) {
    this.b.push({ op: "particle", position: location, particleId: emitter.particleId, motion: emitter.motion,
      count: Math.max(1, Math.round(amountPerCycle)), interval: 1, duration: cycles });
  }
  simpleParticleEmitter(particleId, motion) { return { particleId, motion, inBlockSpace: false }; }
  particleEmitterWithinBlockSpace(particleId, motion) { return { particleId, motion, inBlockSpace: true }; }
  indicateRedstone(position) {
    this.b.push({ op: "particle", position: { x: position.x + .5, y: position.y + .5, z: position.z + .5 },
      particleId: "minecraft:redstone_ore_dust_particle", count: 3, interval: 1, duration: 2 });
  }
  indicateSuccess(position) {
    this.b.push({ op: "particle", position: { x: position.x + .5, y: position.y + .5, z: position.z + .5 },
      particleId: "minecraft:villager_happy", count: 3, interval: 1, duration: 2 });
  }
}

class SpecialInstructions {
  constructor(builder) { this.b = builder; }
  createCart(location, angle) {
    const link = this.b.newLink("entity");
    this.b.push({ op: "spawn", id: link.id, entityTypeId: "minecraft:minecart", position: location, rotation: { x: 0, y: angle } });
    return link;
  }
  createBirb(location) {
    const link = this.b.newLink("entity");
    this.b.push({ op: "spawn", id: link.id, entityTypeId: "minecraft:parrot", position: location });
    return link;
  }
  moveCart(link, offset, duration) { this.b.push({ op: "moveEntity", id: link.id, offset, duration }); }
  moveParrot(link, offset, duration) { this.b.push({ op: "moveEntity", id: link.id, offset, duration }); }
  rotateCart(link, yRotation, duration) { this.b.push({ op: "rotateEntity", id: link.id, yaw: yRotation, duration }); }
  hideElement(link, to) { this.b.push({ op: "removeEntity", id: link.id, fade: FADE_TICKS, to: direction(to) }); }
}
