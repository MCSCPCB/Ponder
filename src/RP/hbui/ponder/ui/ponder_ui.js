// PonderUI: the scene screen of an item. State, layout (init), tick and actions here;
// drawing in ponder_ui_render.js.
(function () {
  const P = window.Ponder;
  // Java's default keys for the shortcuts: Q drop, A left, E inventory, D right, S back.
  const KEYS = { identify: "q", left: "a", right: "d", replay: "s" };
  P.comfyReading = false; // PonderConfig.client().comfyReading, kept for the session

  class PonderUI extends P.Screen {
    constructor(item, referredToByTag) {
      super();
      this.item = item;
      this.scenes = P.compileScenes(item);
      this.tags = [];
      P.listedTagsByNamespace().forEach(list => list.forEach(t => { if (t.items.indexOf(item) >= 0 || t.mainItem === item) this.tags.push(t); }));
      this.index = 0;
      this.lazyIndex = P.linear().startWithValue(0);
      this.fadeIn = P.linear().startWithValue(0).chase(1, 0.1, P.Chaser.EXP);
      this.finishingFlash = P.linear().startWithValue(0).chase(0, 0.1, P.Chaser.EXP);
      this.nextUp = P.linear().startWithValue(0).chase(0, 0.4, P.Chaser.EXP);
      this.finishingFlashWarmup = this.nextUpWarmup = 0;
      this.referredToByTag = referredToByTag || null;
      this.identifyMode = false;
      this.hoveredTooltipItem = null;
      this.partialTicksPaused = 0;
      this.skipCooling = 0;
      this.extendedTickLength = this.extendedTickTimer = 0;
    }
    activeScene() { return this.scenes[this.index]; }
    init() {
      super.init();
      const W = this.width, H = this.height, add = b => { this.widgets.push(b); return b; };
      this.tagButtons = this.tags.map((tag, i) => add(new P.PonderButton(31, 81 + i * 30).showingTag(tag).withCallback(() => {
        this.centerScalingOn(this.mouse[0], this.mouse[1]);
        P.screens.transitionTo(new P.PonderTagScreen(tag));
      })));
      this.tagFades = this.tags.map(() => P.linear().startWithValue(0).chase(0, 0.05, P.Chaser.exp(0.1)));
      const spacing = 8, bY = H - 20 - 31;
      let bX = P.int((W - 20) / 2) - (70 + 2 * spacing);
      const pX = P.int(W / 2) - 110;
      this.progressBar = add(new P.PonderProgressBar(this, pX, bY + 24, W - 2 * pX, 1));
      this.scan = add(new P.PonderButton(bX, bY).withShortcut(KEYS.identify).showing(P.Icons.IDENTIFY).enableFade(5).withCallback(() => {
        this.identifyMode = !this.identifyMode;
        if (!this.identifyMode) this.activeScene().forEach(P.WorldSectionElement, e => { e.selectedBlock = null; });
        else this.partialTicksPaused = this.pt;
      }));
      this.slowMode = add(new P.PonderButton(W - 20 - 31, bY).showing(P.Icons.SLOW_MODE).enableFade(5).withCallback(() => { P.comfyReading = !P.comfyReading; }));
      bX += 50 + spacing;
      this.left = add(new P.PonderButton(bX, bY).withShortcut(KEYS.left).showing(P.Icons.LEFT).enableFade(5).withCallback(() => this.scroll(false)));
      bX += 20 + spacing;
      this.closeButton = add(new P.PonderButton(bX, bY).withShortcut("e").showing(P.Icons.CLOSE).enableFade(5).withCallback(() => P.screens.close()));
      bX += 20 + spacing;
      this.right = add(new P.PonderButton(bX, bY).withShortcut(KEYS.right).showing(P.Icons.RIGHT).enableFade(5).withCallback(() => this.scroll(true)));
      bX += 50 + spacing;
      this.replayButton = add(new P.PonderButton(bX, bY).withShortcut(KEYS.replay).showing(P.Icons.REPLAY).enableFade(5).withCallback(() => this.replay()));
      this.mouse = [0, 0];
      this.pt = 0;
    }
    initBackTrackIcon(b) { b.showingItem(this.item); }
    isEquivalentTo(other) { return other instanceof PonderUI && other.item === this.item; }
    shareContextWith(other) { if (other instanceof PonderUI) other.referredToByTag = this.referredToByTag; }
    tick() {
      super.tick();
      if (this.skipCooling > 0) this.skipCooling--;
      if (this.referredToByTag) {
        for (let i = 0; i < this.scenes.length; i++) {
          if (this.scenes[i].tags.indexOf(this.referredToByTag.id) < 0) continue;
          if (i === this.index) break;
          this.scenes[this.index].fadeOut();
          this.index = i;
          this.scenes[i].begin();
          this.lazyIndex.chase(i, 1 / 4, P.Chaser.EXP);
          this.identifyMode = false;
          break;
        }
        this.referredToByTag = null;
      }
      this.lazyIndex.tickChaser();
      this.fadeIn.tickChaser();
      this.finishingFlash.tickChaser();
      this.nextUp.tickChaser();
      this.progressBar.tick();
      const scene = this.activeScene();
      this.extendedTickLength = 0;
      if (P.comfyReading) scene.forEachVisible(P.TextWindowElement, () => { this.extendedTickLength = 2; });
      if (this.extendedTickTimer === 0) {
        if (!this.identifyMode) {
          if (this.skipCooling === 0) scene.tick();
          const lazy = this.lazyIndex.getValue();
          if (Math.abs(lazy - this.index) > 1 / 512) this.scenes[lazy < this.index ? this.index - 1 : this.index + 1].tick();
        }
        this.extendedTickTimer = this.extendedTickLength;
      } else this.extendedTickTimer--;
      if (scene.currentTime === scene.totalTime - 1) { this.finishingFlashWarmup = 30; this.nextUpWarmup = 50; }
      if (this.finishingFlashWarmup > 0 && --this.finishingFlashWarmup === 0) { this.finishingFlash.setValue(1); this.finishingFlash.setValue(1); }
      if (this.nextUpWarmup > 0 && --this.nextUpWarmup === 0) this.nextUp.updateChaseTarget(1);
      this.updateIdentifiedItem(scene);
    }
    // The block under the mouse in identify mode: a ray through the scene at the cursor.
    updateIdentifiedItem(scene) {
      this.hoveredTooltipItem = null;
      if (!this.identifyMode) return;
      const t = scene.transform, from = t.screenToScene(this.mouse[0], this.mouse[1], 1000, 0), to = t.screenToScene(this.mouse[0], this.mouse[1], -100, 0);
      const hit = P.rayTraceSections(scene, from, to);
      if (!hit) return;
      const p = hit.pos, size = scene.world.size;
      if (p[0] < 0 || p[1] < 0 || p[2] < 0 || p[0] >= size.x || p[1] >= size.y || p[2] >= size.z) return;
      // The base plate is not identified.
      const ox = scene.basePlateOffsetX, oz = scene.basePlateOffsetZ, s = scene.basePlateSize;
      if (p[1] === 0 && p[0] >= ox && p[0] < ox + s && p[2] >= oz && p[2] < oz + s) return;
      hit.element.selectedBlock = p;
      this.hoveredTooltipItem = P.blockItem(hit.block);
    }
    // PonderUI.getPartialTicks: frozen in identify mode, slowed by comfy reading.
    partialTicks(pt) {
      if (this.identifyMode) return this.partialTicksPaused;
      return (pt + (this.extendedTickLength - this.extendedTickTimer)) / (this.extendedTickLength + 1);
    }
    seekToTime(time) {
      if (this.activeScene().currentTime > time) this.replay();
      this.activeScene().seekToTime(time);
      if (time !== 0) this.skipCooling = 15;
    }
    replay() { this.identifyMode = false; this.activeScene().begin(); }
    scroll(forward) {
      const prev = this.index;
      this.index = P.clamp(forward ? this.index + 1 : this.index - 1, 0, this.scenes.length - 1);
      if (prev === this.index) return false;
      this.scenes[prev].fadeOut();
      this.scenes[this.index].begin();
      this.lazyIndex.chase(this.index, 1 / 4, P.Chaser.EXP);
      this.identifyMode = false;
      return true;
    }
    mouseScrolled(dy) { return this.scroll(dy < 0); }
  }
  P.PonderUI = PonderUI;
})();
