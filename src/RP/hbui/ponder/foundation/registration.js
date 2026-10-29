// Plugin registration, after Java's PonderIndex and the helpers in
// api/registration (PonderPlugin, PonderSceneRegistrationHelper, PonderTagRegistrationHelper,
// MultiSceneBuilder, MultiTagBuilder, StoryBoardEntry, TagBuilder, SharedTextRegistrationHelper,
// IndexExclusionHelper). A plugin is { modId, name, registerScenes(helper), registerTags(helper),
// registerSharedText(helper), onPonderLevelRestore(level), indexExclusions(helper) }; everything
// is optional except modId. `name` is the mod name the tag index shows (Java asks the mod loader;
// Bedrock has none), modId otherwise. Plugins are sorted "create" first, then by modId, as Java does.
(function () {
  const P = window.Ponder;
  const plugins = (P.plugins = []);
  const scenes = new Map(); // item id -> [{ namespace, schematic, storyboard, component, tags, ordering }]
  const tags = new Map(); // "namespace:path" -> tag
  const listedTags = []; // tags added to the index, in registration order
  const tagItems = new Map(); // "namespace:path" -> item ids, in registration order
  const shared = new Map(); // "namespace:path" -> English default

  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  P.addPlugin = function (plugin) {
    const key = p => (p.modId === "create" ? "" : p.modId);
    let i = 0;
    while (i < plugins.length && cmp(key(plugins[i]), key(plugin)) < 0) i++;
    plugins.splice(i, 0, plugin);
  };

  // ResourceLocation is a "namespace:path" string; a bare path takes the plugin's namespace.
  const loc = (namespace, path) => (path.indexOf(":") >= 0 ? path : namespace + ":" + path);
  const pathOf = l => l.slice(l.indexOf(":") + 1);

  // TagBuilder. `icon` is an item id, `texture` a 64x64 image path, `mainItem` the item the tag
  // screen shows beside the list. A tag is registered only when register() is called.
  class TagBuilder {
    constructor(id) {
      this.id = id;
      this.namespace = id.slice(0, id.indexOf(":"));
      this._title = "NO_TITLE";
      this._description = "NO_DESCRIPTION";
      this._addToIndex = false;
      this._icon = null;
      this._texture = null;
      this._mainItem = null;
    }
    title(t) { this._title = t; return this; }
    description(t) { this._description = t; return this; }
    addToIndex() { this._addToIndex = true; return this; }
    // textures/ponder/tag/<path>.png of the location's namespace, which on Bedrock is the
    // plugin's own folder hbui/ponder_addons/<namespace>/. A bare path uses the tag's namespace.
    icon(location) {
      const l = loc(this.namespace, location), ns = l.slice(0, l.indexOf(":"));
      this._texture = `/hbui/ponder_addons/${ns}/textures/ponder/tag/${pathOf(l)}.png`;
      return this;
    }
    idAsIcon() { return this.icon(this.id); }
    // item(item) uses it as both icon and main item, as Java's single-argument overload does.
    item(item, useAsIcon, useAsMainItem) {
      if (useAsIcon === undefined || useAsIcon) this._icon = item;
      if (useAsMainItem === undefined || useAsMainItem) this._mainItem = item;
      return this;
    }
    // PonderTagRegistry.registerTag plus PonderLocalization.registerTag. Lang keys are
    // <namespace>.ponder.tag.<path>[.description], with the builder's strings as English defaults.
    register() {
      const key = this.id, ns = this.namespace, path = pathOf(key);
      const title = this._title, description = this._description;
      const tag = { id: key, icon: this._icon, texture: this._texture, mainItem: this._mainItem, namespace: ns };
      Object.defineProperties(tag, {
        title: { get: () => P.localize(ns + ".ponder.tag." + path, title) },
        description: { get: () => P.localize(ns + ".ponder.tag." + path + ".description", description) },
        items: { get: () => (tagItems.get(key) || []).slice() },
      });
      tags.set(key, tag);
      if (this._addToIndex) listedTags.push(tag);
    }
  }

  // StoryBoardEntry. The scene id is the schematic's path, as PonderSceneBuilder.title sets it.
  class StoryBoardEntry {
    constructor(namespace, component, schematic, storyboard) {
      this.namespace = namespace;
      this.component = component;
      this.schematic = schematic; // a path under the plugin's structures/, or { size, fill(world) }
      this.storyboard = storyboard;
      this.tags = [];
      this.ordering = [];
    }
    orderBefore(namespace, sceneId) {
      if (sceneId === undefined) { sceneId = namespace; namespace = this.namespace; }
      this.ordering.push({ type: "BEFORE", scene: namespace + ":" + sceneId });
      return this;
    }
    orderAfter(namespace, sceneId) {
      if (sceneId === undefined) { sceneId = namespace; namespace = this.namespace; }
      this.ordering.push({ type: "AFTER", scene: namespace + ":" + sceneId });
      return this;
    }
    highlightTag(tag) { this.tags.push(loc(this.namespace, tag)); return this; }
    highlightTags(...tags) { tags.forEach(t => this.highlightTag(t)); return this; }
    highlightAllTags() { this.tags.push("ponder:_all"); return this; }
  }

  class SceneHelper {
    constructor(namespace) { this.namespace = namespace; }
    asLocation(path) { return loc(this.namespace, path); }
    // addStoryBoard(component, schematic, storyboard, tag...)
    addStoryBoard(component, schematic, storyboard, ...tags) {
      const entry = new StoryBoardEntry(this.namespace, component, schematic, storyboard);
      entry.highlightTags(...tags);
      if (!scenes.has(component)) scenes.set(component, []);
      scenes.get(component).push(entry);
      return entry;
    }
    // MultiSceneBuilder: forComponents(component...).addStoryBoard(schematic, storyboard, tag...),
    // where the last argument may instead be a function that gets each StoryBoardEntry (extras).
    forComponents(...components) {
      const helper = this;
      const builder = {
        addStoryBoard(schematic, storyboard, ...rest) {
          const extras = typeof rest[0] === "function" ? rest[0] : null;
          components.forEach(c => {
            const entry = helper.addStoryBoard(c, schematic, storyboard, ...(extras ? [] : rest));
            if (extras) extras(entry);
          });
          return builder;
        },
      };
      return builder;
    }
  }

  // Tags and components are linked through PonderTagRegistry's componentTagMap; a tag id is
  // "namespace:path" (a bare path takes the plugin's namespace), a component an item id.
  class TagHelper {
    constructor(namespace) { this.namespace = namespace; }
    registerTag(id) { return new TagBuilder(loc(this.namespace, id)); }
    addTagToComponent(component, tag) {
      const key = loc(this.namespace, tag);
      if (!tagItems.has(key)) tagItems.set(key, []);
      tagItems.get(key).push(component);
    }
    // MultiTagBuilder.Tag: addToTag(tag...).add(component).add(...)
    addToTag(...tags) {
      const builder = { add: component => { tags.forEach(t => this.addTagToComponent(component, t)); return builder; } };
      return builder;
    }
    // MultiTagBuilder.Component: addToComponent(component...).add(tag).add(...)
    addToComponent(...components) {
      const builder = { add: tag => { components.forEach(c => this.addTagToComponent(c, tag)); return builder; } };
      return builder;
    }
  }

  class ExclusionHelper {
    constructor() { this.predicates = []; }
    exclude(itemOrPredicate) {
      this.predicates.push(typeof itemOrPredicate === "function" ? itemOrPredicate : item => item === itemOrPredicate);
      return this;
    }
  }

  // PonderIndex.registerAll + gatherSharedText. Called once, after every plugin has been added.
  // PonderIndex.reload clears the registries first, so this can run again when plugins arrive.
  P.registerAll = function () {
    scenes.clear(); tags.clear(); listedTags.length = 0; tagItems.clear(); shared.clear();
    plugins.forEach(p => { if (p.registerScenes) p.registerScenes(new SceneHelper(p.modId)); });
    plugins.forEach(p => { if (p.registerTags) p.registerTags(new TagHelper(p.modId)); });
    plugins.forEach(p => { if (p.registerSharedText) p.registerSharedText({ registerSharedText: (key, en) => shared.set(p.modId + ":" + key, en) }); });
    const exclusions = [];
    plugins.forEach(p => {
      if (!p.indexExclusions) return;
      const helper = new ExclusionHelper();
      p.indexExclusions(helper);
      exclusions.push.apply(exclusions, helper.predicates);
    });
    P.indexExclusions = exclusions;
  };

  // PonderLocalization.getShared: <namespace>.ponder.shared.<path>, the English default otherwise.
  P.sharedText = (namespace, key) => P.localize(namespace + ".ponder.shared." + key, shared.get(namespace + ":" + key));

  // The items the index lists: everything a scene was registered for, minus the exclusions.
  P.indexedItems = function () {
    const items = [];
    scenes.forEach((_, item) => { if (!P.indexExclusions.some(p => p(item))) items.push(item); });
    return items;
  };
  // TagRegistryAccess.getListedTags, grouped by the plugin that added them (PonderTagIndexScreen).
  P.listedTagsByNamespace = function () {
    const by = new Map();
    listedTags.forEach(t => { if (!by.has(t.namespace)) by.set(t.namespace, []); by.get(t.namespace).push(t); });
    return by;
  };
  P.tag = id => tags.get(id);

  // Every structure path the registered scenes use, as the page fetches it.
  P.structurePaths = function () {
    const paths = new Set();
    scenes.forEach(list => list.forEach(e => { if (typeof e.schematic === "string") paths.add(structurePath(e)); }));
    return Array.from(paths);
  };
  // A plugin's structures live in its own pack: hbui/ponder_addons/<modId>/structures/<path>.mcstructure.
  const structurePath = e => `ponder_addons/${e.namespace}/structures/${e.schematic}.mcstructure`;

  // PonderSceneRegistry.compile plus PonderUI.orderScenes. Scene order is registration order, except
  // where an entry's orderBefore/orderAfter says otherwise; a cycle throws, as Java's sort does.
  P.compileScenes = function (item) {
    const entries = (scenes.get(item) || []).slice();
    const compiled = entries.map(entry => {
      const template = typeof entry.schematic === "string" ? P.structureTemplate(structurePath(entry)) : null;
      const world = new P.PonderWorld(template ? template.size : entry.schematic.size);
      if (template) P.placeStructure(world, template); else entry.schematic.fill(world);
      world.createBackup();
      const scene = new P.PonderScene(world, entry.namespace + ":" + entry.schematic, entry.tags);
      scene.namespace = entry.namespace;
      entry.storyboard(new SceneBuilder(scene), util);
      scene.begin();
      scene.ordering = entry.ordering;
      return scene;
    });
    return orderScenes(compiled);
  };

  function orderScenes(list) {
    const plain = list.filter(s => !s.ordering.length);
    if (plain.length === list.length) return list;
    const byId = new Map(list.map(s => [s.id, s]));
    const edges = new Map(list.map(s => [s, []]));
    plain.forEach((s, i) => { if (i > 0) edges.get(plain[i - 1]).push(s); });
    list.forEach(s => s.ordering.forEach(o => {
      const other = byId.get(o.scene);
      if (!other) return;
      edges.get(o.type === "BEFORE" ? s : other).push(o.type === "BEFORE" ? other : s);
    }));
    // Graph nodes are inserted in reverse; a cycle leaves the scenes unordered, as Java does.
    const result = [], visited = new Set(), visiting = new Set();
    const dfs = node => {
      if (visiting.has(node)) return false;
      if (visited.has(node)) return true;
      visiting.add(node);
      if (!edges.get(node).every(dfs)) return false;
      visiting.delete(node);
      visited.add(node);
      result.push(node);
      return true;
    };
    if (!list.slice().reverse().every(dfs)) { P.log("Unable to sort PonderScenes, using unordered List"); return list; }
    return result.reverse();
  }

  // PonderSceneBuildingUtil. `select` selections that depend on the world size are filled in per scene.
  const S = P.Selection;
  const util = (P.util = {
    select: {
      position: (x, y, z) => S.box(x, y, z, x, y, z),
      fromTo: (x, y, z, x2, y2, z2) => S.box(x, y, z, x2, y2, z2),
      cuboid: (o, size) => S.box(o[0], o[1], o[2], o[0] + size[0], o[1] + size[1], o[2] + size[2]),
    },
    grid: { at: (x, y, z) => [x, y, z], zero: () => [0, 0, 0] },
    vector: {
      of: (x, y, z) => [x, y, z],
      centerOf: (x, y, z) => [x + 0.5, y + 0.5, z + 0.5],
      topOf: (x, y, z) => [x + 0.5, y + 1, z + 0.5],
      // centerOf(pos) + the face normal * (.5 + margin)
      blockSurface: (pos, face, margin) => {
        const n = P.normalOf(face), s = 0.5 + (margin || 0);
        return [pos[0] + 0.5 + n[0] * s, pos[1] + 0.5 + n[1] * s, pos[2] + 0.5 + n[2] * s];
      },
    },
  });

  class SceneBuilder {
    constructor(scene) {
      this.scene = scene;
      this.textIndex = 0;
      const size = scene.world.size;
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
    title(id, title) { this.scene.id = this.scene.namespace + ":" + id; this.scene.title = P.localize(this.specificKey("header"), title); }
    specificKey(k) { return this.scene.namespace + ".ponder." + this.scene.id.split(":")[1] + "." + k; }
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

  const I = P.Instructions;

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
    // The block entity data (P.blockEntityData) of each block in the selection whose block entity
    // is `type`, Bedrock's id for it ("Bed", "Banner"), handed to `consumer` to change. Blocks are
    // drawn again either way: Ponder's are made once per change, where Java's block entity
    // renderers draw every frame.
    modifyBlockEntityNBT(selection, type, consumer) {
      this.b.addInstruction(scene => {
        const w = scene.world;
        selection.keys.forEach(k => {
          const p = k.split(",").map(Number), block = w.getBlock(p[0], p[1], p[2]), nbt = block && P.blockEntityData(block);
          if (!nbt || nbt.id !== type) return;
          consumer(nbt);
          w.setBlock(p[0], p[1], p[2], P.withNbt(block, nbt));
        });
        redraw(scene);
      });
    }
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
    // Entities. createEntity spawns one from a factory that gets the world.
    createEntity(factory) {
      const link = {};
      this.b.addInstruction(scene => {
        const entity = factory(scene.world);
        const handle = new P.EntityElement(entity);
        scene.addElement(handle);
        scene.linkElement(handle, link);
        scene.world.addFreshEntity(entity);
      });
      return link;
    }
    createItemEntity(location, motion, item) {
      return this.createEntity(world => {
        const entity = new P.ItemEntity(world, location[0], location[1], location[2], item);
        entity.setDeltaMovement(motion);
        return entity;
      });
    }
    modifyEntity(link, callback) {
      this.b.addInstruction(scene => { const e = scene.resolve(link); if (e) e.ifPresent(callback); });
    }
    modifyEntities(type, callback) {
      this.b.addInstruction(scene => scene.world.entityList().forEach(e => { if (e instanceof type && e.alive) callback(e); }));
    }
    modifyEntitiesInside(type, area, callback) {
      this.b.addInstruction(scene => scene.world.entityList().forEach(e => {
        if (e instanceof type && e.alive && area.has(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z))) callback(e);
      }));
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
    // Value box highlights. `side` is a Direction name ("UP", "NORTH", ...).
    showCenteredScrollInput(pos, side, duration) { this.showScrollInput(util.vector.blockSurface(pos, side), side, duration); }
    showScrollInput(location, side, duration) {
      const axis = P.normalOf(side).findIndex(v => v !== 0), s = 1 / 16, q = 1 / 4;
      this.b.addInstruction(new I.HighlightValueBox(location, [0, 1, 2].map(i => (i === axis ? s : q)), duration));
    }
    showRepeaterScrollInput(pos, duration) {
      const s = 1 / 16, q = 1 / 6, v = util.vector.blockSurface(pos, "DOWN");
      this.b.addInstruction(new I.HighlightValueBox([v[0], v[1] + 3 / 16, v[2]], [q, s, q], duration));
    }
    // showFilterSlotInput(location, duration) or showFilterSlotInput(location, side, duration)
    showFilterSlotInput(location, side, duration) {
      if (typeof side === "number") { this.b.addInstruction(new I.HighlightValueBox(location, [0.1, 0.1, 0.1], side)); return; }
      const n = P.normalOf(side);
      location = location.map((v, i) => v - n[i] * 3 / 128);
      this.b.addInstruction(new I.HighlightValueBox(location, n.map(v => (1 - Math.abs(v)) * 11 / 128), duration));
    }
    // InputWindowElement: the builder fills in the key, mouse icon and item before the scene runs.
    showControls(sceneSpace, direction, duration) {
      const element = new P.InputWindowElement(sceneSpace, direction);
      this.b.addInstruction(new I.ShowInput(element, duration));
      return element.builder();
    }
    textBuilder(element, instruction) {
      this.b.addInstruction(instruction(element));
      const b = this.b, builder = {
        text: t => { const key = b.specificKey("text_" + ++b.textIndex); element.textGetter = () => P.localize(key, t); return builder; },
        // sharedText(key) or sharedText(key, ...params), from this plugin's registerSharedText.
        sharedText: (key, ...params) => { element.textGetter = () => P.sharedText(b.scene.namespace, key).replace(/%(\d+)\$s/g, (m, n) => params[n - 1]); return builder; },
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
