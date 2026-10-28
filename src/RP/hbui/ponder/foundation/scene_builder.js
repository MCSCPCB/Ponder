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
    showIndependentSection(selection, fadeInDirection) {
      const i = new I.DisplayWorldSection(15, fadeInDirection, selection, null);
      i.link = {};
      this.b.addInstruction(i);
      return i.link;
    }
    setBlock(pos, block) { this.setBlocks(S.box(pos[0], pos[1], pos[2], pos[0], pos[1], pos[2]), block); }
    setBlocks(selection, block) { this.b.addInstruction(new I.ReplaceBlocks(selection, block, true)); }
    modifyBlocks(selection, block) { this.b.addInstruction(new I.ReplaceBlocks(selection, block, false)); }
  }

  // TextElementBuilder
  class OverlayInstructions {
    constructor(b) { this.b = b; }
    showText(duration) {
      const element = new P.TextWindowElement();
      this.b.addInstruction(new I.Text(element, duration));
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
