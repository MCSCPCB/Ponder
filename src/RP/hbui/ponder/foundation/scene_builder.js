// Scene registration and the SceneBuilder API storyboards are written in, after
// PonderSceneBuilder / PonderSceneBuildingUtil. A storyboard is (scene, util) => { ... }.
(function () {
  const P = window.Ponder;
  const I = P.Instructions;
  const scenesByItem = (P.scenesByItem = new Map());
  const tags = (P.tags = new Map());

  // Java's ResourceLocation namespace of our scenes and tags; lang keys are <namespace>.ponder.*.
  const NAMESPACE = "ponder";

  // PonderTag: { id, title, description, icon (item id), mainItem, items: [] }. title and
  // description are the English defaults, shown through <namespace>.ponder.tag.<id>[.description].
  P.registerTag = function (tag) {
    const key = NAMESPACE + ".ponder.tag." + tag.id, title = tag.title, description = tag.description;
    const entry = Object.assign({ items: [], mainItem: null }, tag);
    Object.defineProperties(entry, {
      title: { get: () => P.localize(key, title) },
      description: { get: () => P.localize(key + ".description", description) },
    });
    tags.set(tag.id, entry);
  };
  P.addToTag = function (tagId, items) { items.forEach(i => tags.get(tagId).items.push(i)); };

  // One scene of an item: `schematic` is a path under hbui/ponder/structures/ (.nbt or
  // .mcstructure) or { size: {x, y, z}, fill(world) }; `storyboard` builds the instructions. Scenes of an item keep their registration order.
  P.registerScene = function (entry) {
    entry.items.forEach(item => {
      if (!scenesByItem.has(item)) scenesByItem.set(item, []);
      scenesByItem.get(item).push(entry);
    });
  };

  // Every structure path the registered scenes use.
  P.structurePaths = function () {
    const paths = new Set();
    scenesByItem.forEach(list => list.forEach(e => { if (typeof e.schematic === "string") paths.add(e.schematic); }));
    return Array.from(paths);
  };

  // PonderSceneRegistry.compile
  P.compileScenes = function (item) {
    return (scenesByItem.get(item) || []).map(entry => {
      const template = typeof entry.schematic === "string" ? P.structureTemplate(entry.schematic) : null;
      const world = new P.PonderWorld(template ? template.size : entry.schematic.size);
      if (template) P.placeStructure(world, template); else entry.schematic.fill(world);
      world.createBackup();
      const scene = new P.PonderScene(world, entry.id, entry.tags || []);
      entry.storyboard(new SceneBuilder(scene), util);
      scene.begin();
      return scene;
    });
  };

  const S = P.Selection;
  const util = (P.util = {
    select: {
      everywhere: () => null, // filled per scene below
      position: (x, y, z) => S.box(x, y, z, x, y, z),
      fromTo: (x, y, z, x2, y2, z2) => S.box(x, y, z, x2, y2, z2),
      cuboid: (o, size) => S.box(o[0], o[1], o[2], o[0] + size[0], o[1] + size[1], o[2] + size[2]),
    },
    grid: { at: (x, y, z) => [x, y, z] },
    vector: {
      of: (x, y, z) => [x, y, z],
      centerOf: (x, y, z) => [x + 0.5, y + 0.5, z + 0.5],
      topOf: (x, y, z) => [x + 0.5, y + 1, z + 0.5],
    },
  });

  class SceneBuilder {
    constructor(scene) {
      this.scene = scene;
      this.textIndex = 0;
      const size = scene.world.size;
      // Selections that need the world's size.
      util.select.everywhere = () => S.box(0, 0, 0, size.x - 1, size.y - 1, size.z - 1);
      util.select.layer = y => S.box(0, y, 0, size.x - 1, y, size.z - 1);
      util.select.layers = (y, h) => S.box(0, y, 0, size.x - 1, y + h - 1, size.z - 1);
      util.select.layersFrom = y => S.box(0, y, 0, size.x - 1, size.y - 1, size.z - 1);
      util.select.column = (x, z) => S.box(x, 0, z, x, size.y - 1, z);
      this.world = new WorldInstructions(this);
      this.overlay = new OverlayInstructions(this);
      this.special = new SpecialInstructions(this);
      this.effects = new EffectInstructions(this);
    }
    addInstruction(i) { this.scene.schedule.push(typeof i === "function" ? new I.Simple(i) : i); }
    // PonderLocalization.getSpecific: <namespace>.ponder.<scene>.header, text_1, text_2...
    title(id, title) { this.scene.id = id; this.scene.title = P.localize(this.specificKey("header"), title); }
    specificKey(k) { return NAMESPACE + ".ponder." + this.scene.id + "." + k; }
    configureBasePlate(xOffset, zOffset, size) { const s = this.scene; s.basePlateOffsetX = xOffset; s.basePlateOffsetZ = zOffset; s.basePlateSize = size; }
    scaleSceneView(factor) { this.scene.scaleFactor = factor; }
    removeShadow() { this.scene.hidePlatformShadow = true; }
    setSceneOffsetY(y) { this.scene.yOffset = y; }
    showBasePlate() {
      const s = this.scene;
      this.world.showSection(util.select.cuboid([s.basePlateOffsetX, 0, s.basePlateOffsetZ], [s.basePlateSize - 1, 0, s.basePlateSize - 1]), "UP");
    }
    idle(ticks) { this.addInstruction(new I.Delay(ticks)); }
    idleSeconds(seconds) { this.idle(seconds * 20); }
    markAsFinished() { this.addInstruction(new I.MarkAsFinished()); }
    setNextUpEnabled(enabled) { this.addInstruction(s => { s.nextUpEnabled = enabled; }); }
    rotateCameraY(degrees) { this.addInstruction(new I.RotateScene(0, degrees, true)); }
    addKeyframe() { this.addInstruction(new I.Keyframe(false)); }
    addLazyKeyframe() { this.addInstruction(new I.Keyframe(true)); }
  }

  class WorldInstructions {
    constructor(b) { this.b = b; }
    showSection(selection, fadeInDirection) {
      this.b.addInstruction(new I.DisplayWorldSection(15, fadeInDirection, selection, s => s.baseWorldSection));
    }
    showSectionAndMerge(selection, fadeInDirection, link) {
      this.b.addInstruction(new I.DisplayWorldSection(15, fadeInDirection, selection, s => s.resolve(link)));
    }
    glueBlockOnto(pos, fadeInDirection, link) { this.showSectionAndMerge(at(pos), fadeInDirection, link); }
    showIndependentSection(selection, fadeInDirection) { return this.independent(15, fadeInDirection, selection); }
    showIndependentSectionImmediately(selection) { return this.independent(0, "DOWN", selection); }
    independent(ticks, fadeInDirection, selection) {
      const i = new I.DisplayWorldSection(ticks, fadeInDirection, selection, null);
      i.link = {};
      this.b.addInstruction(i);
      return i.link;
    }
    hideSection(selection, fadeOutDirection) {
      const link = {};
      this.b.addInstruction(scene => {
        const e = new P.WorldSectionElement(selection);
        scene.baseWorldSection.erase(selection);
        scene.linkElement(e, link);
        scene.addElement(e);
        e.queueRedraw();
      });
      this.hideIndependentSection(link, fadeOutDirection);
    }
    hideIndependentSection(link, fadeOutDirection) { this.b.addInstruction(new I.FadeOutOfScene(15, fadeOutDirection, link)); }
    restoreBlocks(selection) { this.b.addInstruction(scene => { scene.world.restoreBlocks(selection); redraw(scene); }); }
    makeSectionIndependent(selection) {
      const link = {};
      this.b.addInstruction(scene => {
        const e = new P.WorldSectionElement(selection);
        scene.baseWorldSection.erase(selection);
        scene.linkElement(e, link);
        scene.addElement(e);
        e.queueRedraw();
        e.resetAnimatedTransform();
        e.visible = true;
        e.forceApplyFade(1);
      });
      return link;
    }
    rotateSection(link, xRotation, yRotation, zRotation, duration) {
      this.b.addInstruction(I.AnimateElement.rotateSection(link, [xRotation, yRotation, zRotation], duration));
    }
    configureCenterOfRotation(link, anchor) { this.b.addInstruction(scene => { const e = scene.resolve(link); if (e) e.centerOfRotation = anchor; }); }
    configureStabilization(link, anchor) { this.b.addInstruction(scene => { const e = scene.resolve(link); if (e) e.stabilizationAnchor = anchor; }); }
    moveSection(link, offset, duration) { this.b.addInstruction(I.AnimateElement.moveSection(link, offset, duration)); }
    incrementBlockBreakingProgress(pos) {
      this.b.addInstruction(scene => {
        const w = scene.world, k = P.blockKey(pos[0], pos[1], pos[2]);
        const progress = (w.breaking.has(k) ? w.breaking.get(k) : -1) + 1;
        if (progress === 9) {
          w.addBlockDestroyEffects(pos, w.getBlock(pos[0], pos[1], pos[2]));
          w.setBlock(pos[0], pos[1], pos[2], null);
          w.setBlockBreakingProgress(pos[0], pos[1], pos[2], 0);
          redraw(scene);
        } else w.setBlockBreakingProgress(pos[0], pos[1], pos[2], progress + 1);
      });
    }
    // Blocks are Bedrock ids or { id, states } (P.block); state functions map one to the next.
    setBlocks(selection, block, spawnParticles) { this.b.addInstruction(new I.ReplaceBlocks(selection, () => block, true, spawnParticles)); }
    destroyBlock(pos) { this.setBlock(pos, null, true); }
    setBlock(pos, block, spawnParticles) { this.setBlocks(at(pos), block, spawnParticles); }
    replaceBlocks(selection, block, spawnParticles) { this.modifyBlocks(selection, () => block, spawnParticles); }
    modifyBlock(pos, stateFunc, spawnParticles) { this.modifyBlocks(at(pos), stateFunc, spawnParticles); }
    // Boolean and 0/1 states flip; any other state steps through `values`.
    cycleBlockProperty(pos, state, values) {
      this.modifyBlocks(at(pos), b => {
        const states = P.blockStates(b);
        if (!(state in states)) return b;
        const v = states[state];
        const next = values ? values[(values.indexOf(v) + 1) % values.length] : typeof v === "number" ? 1 - v : !v;
        return P.withStates(b, { [state]: next });
      }, false);
    }
    modifyBlocks(selection, stateFunc, spawnParticles) { this.b.addInstruction(new I.ReplaceBlocks(selection, stateFunc, false, spawnParticles)); }
    toggleRedstonePower(selection) { this.modifyBlocks(selection, P.toggleRedstonePower, false); }
  }
  const at = pos => S.box(pos[0], pos[1], pos[2], pos[0], pos[1], pos[2]);
  const redraw = scene => scene.forEach(P.WorldSectionElement, e => e.queueRedraw());

  class EffectInstructions {
    constructor(b) { this.b = b; }
    emitParticles(location, emitter, amountPerCycle, cycles) { this.b.addInstruction(new I.EmitParticles(location, emitter, amountPerCycle, cycles)); }
    simpleParticleEmitter(data, motion) { return (w, x, y, z) => w.addParticle(data, x, y, z, motion[0], motion[1], motion[2]); }
    particleEmitterWithinBlockSpace(data, motion) { return (w, x, y, z) => w.addParticle(data, Math.floor(x) + Math.random(), Math.floor(y) + Math.random(), Math.floor(z) + Math.random(), motion[0], motion[1], motion[2]); }
    indicateRedstone(pos) { this.createRedstoneParticles(pos, 0xff0000, 10); }
    indicateSuccess(pos) { this.createRedstoneParticles(pos, 0x80ffaa, 10); }
    createRedstoneParticles(pos, color, amount) {
      this.emitParticles(util.vector.centerOf(pos[0], pos[1], pos[2]), this.particleEmitterWithinBlockSpace(P.dust(color, 1), [0, 0, 0]), amount, 2);
    }
  }

  class SpecialInstructions {
    constructor(b) { this.b = b; }
    // MovePoiInstruction; a block position means its centre.
    movePointOfInterest(location) { this.b.addInstruction(scene => scene.setPointOfInterest(location)); }
    movePointOfInterestTo(pos) { this.movePointOfInterest(util.vector.centerOf(pos[0], pos[1], pos[2])); }
    hideElement(link, direction) { this.b.addInstruction(new I.FadeOutOfScene(15, direction, link)); }
  }

  // TextElementBuilder
  class OverlayInstructions {
    constructor(b) { this.b = b; }
    showOutline(color, slot, selection, duration) { this.b.addInstruction(new I.OutlineSelection(color, slot, selection, duration)); }
    // Boxes are [[minX, minY, minZ], [maxX, maxY, maxZ]] in scene space.
    chaseBoundingBoxOutline(color, slot, box, duration) { this.b.addInstruction(new I.ChaseAABB(color, slot, box, duration)); }
    showLine(color, start, end, duration) { this.b.addInstruction(new I.Line(color, start, end, duration, false)); }
    showBigLine(color, start, end, duration) { this.b.addInstruction(new I.Line(color, start, end, duration, true)); }
    showOutlineWithText(selection, duration) {
      return this.textBuilder(new P.TextWindowElement(), e => new I.TextWithOutline(e, duration, selection)).pointAt(selection.center());
    }
    showText(duration) { return this.textBuilder(new P.TextWindowElement(), e => new I.Text(e, duration)); }
    textBuilder(element, instruction) {
      this.b.addInstruction(instruction(element));
      const b = this.b, builder = {
        text: t => { const key = b.specificKey("text_" + ++b.textIndex); element.textGetter = () => P.localize(key, t); return builder; },
        pointAt: v => { element.vec = v; return builder; },
        independent: y => { element.y = y || 0; return builder; },
        colored: c => { element.palette = c; return builder; },
        placeNearTarget: () => { element.nearScene = true; return builder; },
        attachKeyFrame: () => { b.addLazyKeyframe(); return builder; },
      };
      return builder;
    }
  }
})();
