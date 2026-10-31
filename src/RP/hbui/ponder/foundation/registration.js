// Plugin registration, after Java's PonderIndex and the helpers in
// api/registration (PonderPlugin, PonderSceneRegistrationHelper, PonderTagRegistrationHelper,
// MultiSceneBuilder, MultiTagBuilder, StoryBoardEntry, TagBuilder, SharedTextRegistrationHelper,
// IndexExclusionHelper). A plugin is { getModId(), name, registerScenes(helper), registerTags(helper),
// registerSharedText(helper), onPonderLevelRestore(level), indexExclusions(helper) }; everything
// is optional except getModId. `name` is the mod name the tag index shows (Java asks the mod loader;
// Bedrock has none), getModId() otherwise. Plugins are sorted "create" first, then by id, as Java does.
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
    const key = p => (p.getModId() === "create" ? "" : p.getModId());
    let i = 0;
    while (i < plugins.length && cmp(key(plugins[i]), key(plugin)) < 0) i++;
    plugins.splice(i, 0, plugin);
  };

  // ResourceLocation is a "namespace:path" string; a bare path takes the plugin's namespace.
  const loc = (namespace, path) => (path.indexOf(":") >= 0 ? path : namespace + ":" + path);
  const pathOf = l => l.slice(l.indexOf(":") + 1);
  const unpack = values => values.length === 1 && typeof values[0] !== "string" && values[0] && values[0][Symbol.iterator] ? Array.from(values[0]) : values;

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
        items: { get: () => Array.from(tagItems.get(key) || []) },
      });
      tags.set(key, tag);
      P.registerText(ns + ".ponder.tag." + path, title);
      P.registerText(ns + ".ponder.tag." + path + ".description", description);
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
    constructor(namespace, keyFunction) { this.namespace = namespace; this.keyFunction = keyFunction || (id => id); }
    withKeyFunction(fn) { return new SceneHelper(this.namespace, fn); }
    asLocation(path) { return loc(this.namespace, path); }
    // addStoryBoard(component, schematic, storyboard, tag...)
    addStoryBoard(component, schematic, storyboard, ...tags) {
      component = this.keyFunction(component);
      const entry = new StoryBoardEntry(this.namespace, component, schematic, storyboard);
      entry.highlightTags(...tags);
      if (!scenes.has(component)) scenes.set(component, []);
      scenes.get(component).push(entry);
      return entry;
    }
    // MultiSceneBuilder: forComponents(component...).addStoryBoard(schematic, storyboard, tag...),
    // where the last argument may instead be a function that gets each StoryBoardEntry (extras).
    forComponents(...components) {
      components = unpack(components);
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
    constructor(namespace, keyFunction) { this.namespace = namespace; this.keyFunction = keyFunction || (id => id); }
    withKeyFunction(fn) { return new TagHelper(this.namespace, fn); }
    registerTag(id) { return new TagBuilder(loc(this.namespace, id)); }
    addTagToComponent(component, tag) {
      const key = loc(this.namespace, tag);
      if (!tagItems.has(key)) tagItems.set(key, new Set());
      tagItems.get(key).add(this.keyFunction(component));
    }
    // MultiTagBuilder.Tag: addToTag(tag...).add(component).add(...)
    addToTag(...tags) {
      tags = unpack(tags);
      const builder = { add: (...components) => { unpack(components).forEach(c => tags.forEach(t => this.addTagToComponent(c, t))); return builder; } };
      return builder;
    }
    // MultiTagBuilder.Component: addToComponent(component...).add(tag).add(...)
    addToComponent(...components) {
      components = unpack(components);
      const builder = { add: (...tags) => { unpack(tags).forEach(t => components.forEach(c => this.addTagToComponent(c, t))); return builder; } };
      return builder;
    }
  }

  class ExclusionHelper {
    constructor() { this.predicates = []; }
    exclude(itemOrPredicate) {
      this.predicates.push(typeof itemOrPredicate === "function" ? itemOrPredicate : item => item === itemOrPredicate);
      return this;
    }
    // Bedrock item and block types are ids. A predicate selects the class of variants.
    excludeItemVariants(matches, original) { return this.exclude(id => id !== original && matches(id)); }
    excludeBlockVariants(matches, original) { return this.exclude(id => id !== original && P.isBlockItem(id) && matches(id)); }
  }

  // PonderIndex.registerAll + gatherSharedText. Called once, after every plugin has been added.
  // Rebuild the registries when another pack's plugins arrive.
  P.registerAll = function () {
    scenes.clear(); tags.clear(); listedTags.length = 0; tagItems.clear(); shared.clear(); P.registeredText.clear();
    plugins.forEach(p => { if (p.registerScenes) p.registerScenes(new SceneHelper(p.getModId())); });
    plugins.forEach(p => { if (p.registerTags) p.registerTags(new TagHelper(p.getModId())); });
    plugins.forEach(p => { if (p.registerSharedText) p.registerSharedText({ registerSharedText: (key, en) => {
      const id = loc(p.getModId(), key); shared.set(id, en);
      P.registerText(id.replace(":", ".ponder.shared."), en);
    } }); });
    const exclusions = [];
    plugins.forEach(p => {
      if (!p.indexExclusions) return;
      const helper = new ExclusionHelper();
      p.indexExclusions(helper);
      exclusions.push.apply(exclusions, helper.predicates);
    });
    P.indexExclusions = exclusions;
  };

  // PonderLocalization.getShared: <namespace>.ponder.shared.<path>.
  P.sharedText = (namespace, key) => { const id = loc(namespace, key); return P.localize(id.replace(":", ".ponder.shared."), shared.get(id)); };
  P.getSpecific = (id, key, ...params) => P.format(P.localize(id.replace(":", ".ponder.") + "." + key, P.registeredText.get(id.replace(":", ".ponder.") + "." + key)), ...params);
  P.getTagName = id => P.tag(id).title;
  P.getTags = item => Array.from(tagItems).filter(entry => entry[1].has(item)).map(entry => P.tag(entry[0]));

  // SceneRegistryAccess: index exclusions affect listing only, never whether a scene opens.
  P.doScenesExistForId = item => scenes.has(item);

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
  P.tag = id => tags.get(id) || { id, namespace: id.split(":")[0], icon: "minecraft:barrier", mainItem: null, items: Array.from(tagItems.get(id) || []),
    title: P.translate("ponder.tag.not_registered"), description: id };

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
      const builder = new SceneBuilder(scene);
      entry.storyboard(builder, builder.util);
      scene.registeredText = new Map(Array.from(P.registeredText).filter(([key]) => key.indexOf(scene.id.replace(":", ".ponder.") + ".") === 0));
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

  // Every scene owns its selection bounds; vectors and positions keep Java's chainable API.
  const S = P.Selection;
  const coords = (x, y, z) => typeof x === "object" ? Array.from(x) : [x, y, z];
  const vector = {
    of: (x, y, z) => new P.Vec3(x, y, z),
    centerOf: (x, y, z) => new P.Vec3(...coords(x, y, z).map(v => v + 0.5)),
    topOf: (x, y, z) => new P.Vec3(...coords(x, y, z).map((v, i) => v + (i === 1 ? 1 : 0.5))),
    blockSurface: (pos, face, margin) => vector.centerOf(pos).add(new P.Vec3(...P.normalOf(face)).scale(0.5 + (margin || 0))),
  };
  const grid = { at: (x, y, z) => new P.BlockPos(x, y, z), zero: () => new P.BlockPos(0, 0, 0) };
  function sceneUtil(size) {
    const select = {
      position: (x, y, z) => { const p = coords(x, y, z); return S.box(...p, ...p); },
      fromTo: (x, y, z, x2, y2, z2) => typeof x === "object" ? S.box(...x, ...y) : S.box(x, y, z, x2, y2, z2),
      cuboid: (o, span) => S.box(...o, ...o.map((v, i) => v + span[i])),
      everywhere: () => S.box(0, 0, 0, size.x - 1, size.y - 1, size.z - 1),
      layer: y => select.layers(y, 1),
      layers: (y, h) => S.box(0, y, 0, size.x - 1, y + Math.min(size.y - y, h) - 1, size.z - 1),
      layersFrom: y => select.layers(y, size.y - y),
      column: (x, z) => S.box(x, 1, z, x, size.y + 1, z),
    };
    return { select: () => select, grid: () => grid, vector: () => vector };
  }
  P.sceneUtil = sceneUtil;
  P.util = sceneUtil({ x: 1, y: 1, z: 1 });

  class SceneBuilder {
    constructor(scene) {
      this.scene = scene;
      this.textIndex = 0;
      this.util = sceneUtil(scene.world.size);
      this._world = new WorldInstructions(this);
      this._overlay = new OverlayInstructions(this);
      this._special = new SpecialInstructions(this);
      this._effects = new EffectInstructions(this);
    }
    world() { return this._world; }
    overlay() { return this._overlay; }
    special() { return this._special; }
    effects() { return this._effects; }
    debug() {
      return { addInstructionInstance: i => this.addInstruction(i), enqueueCallback: fn => this.addInstruction(fn) };
    }
    getScene() { return this.scene; }
    addInstruction(i) { this.scene.schedule.push(typeof i === "function" ? new I.Simple(i) : i); }
    // PonderLocalization.getSpecific: <namespace>.ponder.<scene>.header, text_1, text_2...
    title(id, title) { this.scene.id = this.scene.namespace + ":" + id; P.registerText(this.specificKey("header"), title); this.scene.title = P.localize(this.specificKey("header"), title); }
    specificKey(k) { return this.scene.namespace + ".ponder." + this.scene.id.split(":")[1] + "." + k; }
    configureBasePlate(xOffset, zOffset, size) { const s = this.scene; s.basePlateOffsetX = xOffset; s.basePlateOffsetZ = zOffset; s.basePlateSize = size; }
    scaleSceneView(factor) { this.scene.scaleFactor = factor; }
    removeShadow() { this.scene.hidePlatformShadow = true; }
    setSceneOffsetY(y) { this.scene.yOffset = y; }
    showBasePlate() {
      const s = this.scene;
      this.world().showSection(this.util.select().cuboid([s.basePlateOffsetX, 0, s.basePlateOffsetZ], [s.basePlateSize - 1, 0, s.basePlateSize - 1]), "UP");
    }
    idle(ticks) { this.addInstruction(new I.Delay(ticks)); }
    idleSeconds(seconds) { this.idle(seconds * 20); }
    markAsFinished() { this.addInstruction(new I.MarkAsFinished()); }
    setNextUpEnabled(enabled) { this.addInstruction(s => { s.nextUpEnabled = enabled; }); }
    rotateCameraY(degrees) { this.addInstruction(new I.RotateScene(0, degrees, true)); }
    addKeyframe() { this.addInstruction(new I.Keyframe(false)); }
    addLazyKeyframe() { this.addInstruction(new I.Keyframe(true)); }
  }

  P.SceneBuilder = SceneBuilder;
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
      i.link = new P.ElementLink(P.WorldSectionElement);
      this.b.addInstruction(i);
      return i.link;
    }
    hideSection(selection, fadeOutDirection) {
      const link = new P.ElementLink(P.WorldSectionElement);
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
      const link = new P.ElementLink(P.WorldSectionElement);
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
    // Property.cycle walks the declared domain; arbitrary values never turn into booleans.
    cycleBlockProperty(pos, state) {
      this.modifyBlocks(at(pos), b => {
        const states = P.blockStates(b);
        const values = P.blockPropertyValues(b, state);
        if (!values || !values.length) throw new Error("Unknown property domain: " + P.blockId(b) + " " + state);
        const v = state in states ? states[state] : values[0];
        const next = values[(values.findIndex(n => n === v || typeof n === "boolean" && +n === v) + 1) % values.length];
        return P.withStates(b, { [state]: next });
      }, false);
    }
    modifyBlocks(selection, stateFunc, spawnParticles) { this.b.addInstruction(new I.ReplaceBlocks(selection, stateFunc, false, spawnParticles)); }
    toggleRedstonePower(selection) { this.modifyBlocks(selection, P.toggleRedstonePower, false); }
    modifyBlockEntity(pos, type, consumer) {
      this.b.addInstruction(scene => {
        const entity = scene.world.getBlockEntity(pos);
        if (entity instanceof type) consumer(entity);
      });
    }
    // BlockEntityDataInstruction passes Java-shaped NBT and only rebuilds block geometry when
    // explicitly requested. Block entity renderers read their live objects each frame.
    modifyBlockEntityNBT(selection, type, consumer, reDrawBlocks) {
      this.b.addInstruction(scene => {
        selection.forEach(pos => {
          if (!scene.world.getBounds().isInside(pos)) return;
          const entity = scene.world.getBlockEntity(pos);
          if (!(entity instanceof type)) return;
          const tag = entity.saveWithFullMetadata();
          consumer(tag);
          entity.loadWithComponents(tag);
        });
        if (reDrawBlocks) redraw(scene);
      });
    }
    // Entities. createEntity spawns one from a factory that gets the world.
    createEntity(factory) {
      const link = new P.ElementLink(P.EntityElement);
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
      this.b.addInstruction(scene => scene.world.entityList().forEach(e => { if (e instanceof type) callback(e); }));
    }
    modifyEntitiesInside(type, area, callback) {
      this.b.addInstruction(scene => scene.world.entityList().forEach(e => {
        if (e instanceof type && area.has(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z))) callback(e);
      }));
    }
    // An entity of a type the game or an add-on defines (P.ClientEntity), at `location` facing
    // `yRot` degrees (0 south, 90 west), set up by `setup(entity)` if given. Java's
    // createEntity(world -> new Sheep(...)).
    createClientEntity(type, location, yRot, setup) {
      this.b.scene.entityTypes.push(type);
      return this.createEntity(world => {
        const e = new P.ClientEntity(world, type, location[0], location[1], location[2]);
        e.yRot = e.yRotO = e.yHeadRot = e.yHeadRotO = yRot || 0;
        if (setup) setup(e);
        return e;
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
      this.emitParticles(vector.centerOf(pos[0], pos[1], pos[2]), this.particleEmitterWithinBlockSpace(P.dust(color, 1), [0, 0, 0]), amount, 2);
    }

  }

  class SpecialInstructions {
    constructor(b) { this.b = b; }
    // MovePoiInstruction; a block position means its centre.
    movePointOfInterest(location) { this.b.addInstruction(scene => scene.setPointOfInterest(location instanceof P.BlockPos ? vector.centerOf(location) : location)); }
    hideElement(link, direction) { this.b.addInstruction(new I.FadeOutOfScene(15, direction, link)); }
    // A parrot at `location` in a ParrotPose (P.ParrotPose.FacePointOfInterestPose, ...),
    // fading in from above.
    createBirb(location, pose) {
      this.b.scene.entityTypes.push("minecraft:parrot");
      const link = new P.ElementLink(P.ParrotElement), parrot = new P.ParrotElement(location, pose);
      this.b.addInstruction(new I.FadeIntoScene(10, "DOWN", parrot));
      this.b.addInstruction(scene => scene.linkElement(parrot, link));
      return link;
    }
    changeBirbPose(link, pose) {
      this.b.addInstruction(scene => { const e = scene.resolve(link); if (e) e.setPose(P.makeParrotPose(pose)); });
    }
    rotateParrot(link, xRotation, yRotation, zRotation, duration) {
      this.b.addInstruction(new I.AnimateElement(link, [xRotation, yRotation, zRotation], duration, (e, v) => e.setRotation(v, duration === 0), e => e.getRotation()));
    }
    moveParrot(link, offset, duration) {
      this.b.addInstruction(new I.AnimateElement(link, offset, duration, (e, v) => e.setPositionOffset(v, duration === 0), e => e.getPositionOffset()));
    }
    // MinecartConstructor receives the level and spawn coordinates and may configure the cart.
    createCart(location, angle, factory) {
      const link = new P.ElementLink(P.MinecartElement), cart = new P.MinecartElement(location, angle, factory);
      this.b.scene.entityTypes.push("minecraft:minecart", "minecraft:chest_minecart", "minecraft:hopper_minecart", "minecraft:tnt_minecart", "minecraft:command_block_minecart");
      this.b.scene.prepare.push(() => cart.prepare());
      this.b.addInstruction(new I.FadeIntoScene(10, "DOWN", cart));
      this.b.addInstruction(scene => scene.linkElement(cart, link));
      return link;
    }
    rotateCart(link, yRotation, duration) {
      this.b.addInstruction(new I.AnimateElement(link, [0, yRotation, 0], duration, (e, v) => e.setRotation(v[1], duration === 0), e => e.getRotation()));
    }
    moveCart(link, offset, duration) {
      this.b.addInstruction(new I.AnimateElement(link, offset, duration, (e, v) => e.setPositionOffset(v, duration === 0), e => e.getPositionOffset()));
    }
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
      return this.textBuilder(new P.TextWindowElement(), e => new I.TextWithOutline(e, duration, selection)).pointAt(selection.getCenter());
    }
    showText(duration) { return this.textBuilder(new P.TextWindowElement(), e => new I.Text(e, duration)); }
    // Value box highlights. `side` is a Direction name ("UP", "NORTH", ...).
    showCenteredScrollInput(pos, side, duration) { this.showScrollInput(vector.blockSurface(pos, side), side, duration); }
    showScrollInput(location, side, duration) {
      const axis = P.normalOf(side).findIndex(v => v !== 0), s = 1 / 16, q = 1 / 4;
      this.b.addInstruction(new I.HighlightValueBox(location, [0, 1, 2].map(i => (i === axis ? s : q)), duration));
    }
    showRepeaterScrollInput(pos, duration) {
      const s = 1 / 16, q = 1 / 6, v = vector.blockSurface(pos, "DOWN");
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
        text: (t, ...params) => { const key = b.specificKey("text_" + ++b.textIndex); P.registerText(key, t); element.textGetter = () => P.format(P.localize(key, t), ...params); return builder; },
        // sharedText(key) or sharedText(key, ...params), from this plugin's registerSharedText.
        sharedText: (key, ...params) => { element.textGetter = () => P.format(P.sharedText(b.scene.namespace, key), ...params); return builder; },
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
