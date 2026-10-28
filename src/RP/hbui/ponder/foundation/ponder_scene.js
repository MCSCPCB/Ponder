// PonderScene and the instructions of its schedule (foundation/instruction).
(function () {
  const P = window.Ponder;

  class PonderScene {
    constructor(world, id, tags) {
      this.world = world;
      this.id = id;
      this.title = "";
      this.tags = tags || [];
      this.elements = [];
      this.linked = new Map();
      this.schedule = [];
      this.activeSchedule = [];
      this.keyframeTimes = [];
      this.basePlateOffsetX = this.basePlateOffsetZ = 0;
      this.basePlateSize = world.xSpan();
      this.scaleFactor = 1;
      this.yOffset = 0;
      this.hidePlatformShadow = false;
      this.nextUpEnabled = true;
      this.finished = false;
      this.totalTime = this.currentTime = 0;
      this.stoppedCounting = false;
      this.transform = new P.SceneTransform(this);
      this.baseWorldSection = new P.WorldSectionElement();
      this.outliner = new P.Outliner();
      this.pointOfInterest = this.chasingPoi = [0, 4, 0];
    }
    reset() {
      this.currentTime = 0;
      this.activeSchedule = [];
      this.schedule.forEach(i => i.reset(this));
    }
    begin() {
      this.reset();
      this.elements.forEach(e => e.reset(this));
      this.world.restore();
      this.elements = [];
      this.linked.clear();
      this.keyframeTimes = [];
      this.transform = new P.SceneTransform(this);
      this.finished = false;
      this.pointOfInterest = this.chasingPoi = [0, 4, 0];
      this.baseWorldSection.setEmpty();
      this.baseWorldSection.forceApplyFade(1);
      this.addElement(this.baseWorldSection);
      this.totalTime = 0;
      this.stoppedCounting = false;
      this.activeSchedule = this.schedule.slice();
      this.activeSchedule.forEach(i => i.onScheduled(this));
    }
    getSceneProgress() { return this.totalTime === 0 ? 0 : this.currentTime / this.totalTime; }
    fadeOut() { this.reset(); this.activeSchedule.push(new HideAll(10, null)); }
    tick() {
      const t = this.chasingPoi;
      this.pointOfInterest = this.pointOfInterest.map((v, i) => P.lerp(0.25, v, t[i]));
      this.outliner.tick();
      this.transform.tick();
      this.elements.slice().forEach(e => e.tick(this));
      if (this.currentTime < this.totalTime) this.currentTime++;
      for (let i = 0; i < this.activeSchedule.length; i++) {
        const instruction = this.activeSchedule[i];
        instruction.tick(this);
        if (instruction.isComplete()) {
          this.activeSchedule.splice(i--, 1);
          if (instruction.isBlocking()) break;
          continue;
        }
        if (instruction.isBlocking()) break;
      }
      if (this.activeSchedule.length === 0) this.finished = true;
    }
    seekToTime(time) {
      while (this.currentTime < time && !this.finished) this.tick();
      this.forEach(P.WorldSectionElement, e => e.queueRedraw());
    }
    addToSceneTime(t) { if (!this.stoppedCounting) this.totalTime += t; }
    stopCounting() { this.stoppedCounting = true; }
    markKeyframe(offset) { if (!this.stoppedCounting) this.keyframeTimes.push(this.totalTime + offset); }
    addElement(e) { if (this.elements.indexOf(e) < 0) this.elements.push(e); }
    forEach(type, fn) { this.elements.forEach(e => { if (e instanceof type) fn(e); }); }
    forEachVisible(type, fn) { this.elements.forEach(e => { if (e instanceof type && e.visible) fn(e); }); }
  }
  P.PonderScene = PonderScene;

  class Instruction {
    isBlocking() { return false; }
    reset() {}
    onScheduled() {}
    isComplete() { return true; }
    tick() {}
  }
  class Simple extends Instruction {
    constructor(fn) { super(); this.fn = fn; }
    tick(scene) { this.fn(scene); }
  }
  class Ticking extends Instruction {
    constructor(blocking, ticks) { super(); this.blocking = blocking; this.remainingTicks = this.totalTicks = ticks; }
    reset() { this.remainingTicks = this.totalTicks; }
    firstTick() {}
    onScheduled(scene) { if (this.blocking) scene.addToSceneTime(this.totalTicks); }
    tick(scene) {
      if (this.remainingTicks === this.totalTicks) this.firstTick(scene);
      if (this.remainingTicks > 0) this.remainingTicks--;
    }
    isComplete() { return this.remainingTicks === 0; }
    isBlocking() { return this.blocking; }
  }
  class Delay extends Ticking { constructor(ticks) { super(true, ticks); } }
  class Keyframe extends Instruction {
    constructor(delayed) { super(); this.delayed = delayed; }
    onScheduled(scene) { scene.markKeyframe(this.delayed ? 6 : 0); }
  }
  class MarkAsFinished extends Instruction {
    tick(scene) { scene.finished = true; }
    onScheduled(scene) { scene.stopCounting(); }
  }
  class RotateScene extends Instruction {
    constructor(xRot, yRot, relative) { super(); this.xRot = xRot; this.yRot = yRot; this.relative = relative; }
    tick(scene) {
      const t = scene.transform;
      const x = this.relative ? t.xRotation.target + this.xRot : this.xRot;
      const y = this.relative ? t.yRotation.target + this.yRot : this.yRot;
      t.xRotation.chase(x, 0.1, P.Chaser.EXP);
      t.yRotation.chase(y, 0.1, P.Chaser.EXP);
    }
  }
  // Fades an overlay element in over 5 ticks, holds it, fades it out (fade * fade).
  const FADE_TIME = 5;
  class FadeInOut extends Ticking {
    constructor(duration) { super(false, duration + 2 * FADE_TIME); }
    firstTick(scene) { this.show(scene); this.applyFade(scene, 0); }
    tick(scene) {
      super.tick(scene);
      const elapsed = this.totalTicks - this.remainingTicks;
      if (elapsed < FADE_TIME) { const f = elapsed / FADE_TIME; this.applyFade(scene, f * f); }
      else if (this.remainingTicks < FADE_TIME) { const f = this.remainingTicks / FADE_TIME; this.applyFade(scene, f * f); }
      else this.applyFade(scene, 1);
      if (this.remainingTicks === 0) { this.applyFade(scene, 0); this.hide(scene); }
    }
  }
  class Text extends FadeInOut {
    constructor(element, duration) { super(duration); this.element = element; }
    show(scene) { scene.addElement(this.element); this.element.visible = true; }
    hide() { this.element.visible = false; }
    applyFade(scene, fade) { this.element.setFade(fade); }
  }
  // Direction.getNormal scaled by .5, for elements sliding in or out of the scene.
  const NORMALS = { DOWN: [0, -1, 0], UP: [0, 1, 0], NORTH: [0, 0, -1], SOUTH: [0, 0, 1], WEST: [-1, 0, 0], EAST: [1, 0, 0] };
  P.fadeVecOf = dir => (dir && NORMALS[dir] ? NORMALS[dir].map(v => v * 0.5) : null);

  class FadeIntoScene extends Ticking {
    constructor(ticks, fadeInFrom, element) { super(false, ticks); this.fadeInFrom = fadeInFrom; this.element = element; }
    firstTick(scene) {
      scene.addElement(this.element);
      this.element.visible = true;
      this.element.setFade(0);
      this.element.fadeVec = P.fadeVecOf(this.fadeInFrom) || [0, 0, 0];
      if (this.link) scene.linked.set(this.link, this.element);
    }
    tick(scene) {
      super.tick(scene);
      const f = this.totalTicks === 0 ? 1 : this.remainingTicks / this.totalTicks;
      this.element.setFade(1 - f * f);
      if (this.remainingTicks === 0) this.element.setFade(1);
    }
  }
  class DisplayWorldSection extends FadeIntoScene {
    constructor(ticks, fadeInFrom, selection, mergeOnto) {
      super(ticks, fadeInFrom, new P.WorldSectionElement(selection));
      this.selection = selection;
      this.mergeOnto = mergeOnto;
    }
    firstTick(scene) {
      super.firstTick(scene);
      if (this.mergeOnto) this.element.setAnimatedOffset(this.mergeOnto(scene).animatedOffset, true);
      this.element.set(this.selection);
      this.element.visible = true;
    }
    tick(scene) {
      super.tick(scene);
      if (this.remainingTicks > 0) return;
      if (this.mergeOnto) this.element.mergeOnto(this.mergeOnto(scene));
    }
  }
  class HideAll extends Ticking {
    constructor(ticks, fadeOutTo) { super(false, ticks); this.fadeOutTo = fadeOutTo; }
    firstTick(scene) {
      scene.elements.forEach(e => {
        if (e instanceof P.AnimatedSceneElement) { e.setFade(1); e.fadeVec = P.fadeVecOf(this.fadeOutTo); }
        else if (e instanceof P.AnimatedOverlayElement) e.setFade(1);
        else e.visible = false;
      });
    }
    tick(scene) {
      super.tick(scene);
      const f = this.remainingTicks / this.totalTicks;
      scene.elements.forEach(e => {
        if (e instanceof P.AnimatedSceneElement || e instanceof P.AnimatedOverlayElement) e.setFade(this.remainingTicks === 0 ? 0 : f * f);
      });
    }
  }
  // ReplaceBlocksInstruction: sets blocks of the selection that are inside the world.
  class ReplaceBlocks extends Instruction {
    constructor(selection, block, replaceAir) { super(); this.selection = selection; this.block = block; this.replaceAir = replaceAir; }
    tick(scene) {
      const w = scene.world;
      this.selection.keys.forEach(k => {
        const p = k.split(",").map(Number);
        if (p[0] < 0 || p[1] < 0 || p[2] < 0 || p[0] >= w.size.x || p[1] >= w.size.y || p[2] >= w.size.z) return;
        if (!this.replaceAir && !w.getBlock(p[0], p[1], p[2])) return;
        w.setBlock(p[0], p[1], p[2], this.block);
      });
      scene.forEach(P.WorldSectionElement, e => e.queueRedraw());
    }
  }
  P.Instructions = { Instruction, Simple, Ticking, Delay, Keyframe, MarkAsFinished, RotateScene, FadeInOut, Text,
    FadeIntoScene, DisplayWorldSection, HideAll, ReplaceBlocks };
})();
