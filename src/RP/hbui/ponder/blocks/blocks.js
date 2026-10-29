// What a block looks like: per-face vanilla textures, shape, opacity and tint. A block in the
// world is a Bedrock block id ("minecraft:stone") or { id, states } with Bedrock block states
// (redstone_wire's signal is states.redstone_signal).
(function () {
  const P = window.Ponder;

  // A block with states; ids alone stay strings.
  P.block = (id, states) => (states && Object.keys(states).length ? { id, states } : id);
  P.blockStates = block => (typeof block === "string" ? {} : block.states);
  P.withStates = (block, changes) => P.block(P.blockId(block), Object.assign({}, P.blockStates(block), changes));

  // Files under textures/blocks/ for the common blocks vanilla_blocks.json leaves out (grass: the
  // game tints it), and for packs not run through tools/adapter, which have no table. A block in
  // neither uses its own name.
  const TABLE = {
    grass_block: { up: "grass_carried", down: "dirt", side: "grass_side_carried" },
    oak_log: { up: "log_oak_top", down: "log_oak_top", side: "log_oak" },
    spruce_log: { up: "log_spruce_top", down: "log_spruce_top", side: "log_spruce" },
    birch_log: { up: "log_birch_top", down: "log_birch_top", side: "log_birch" },
    oak_planks: "planks_oak", spruce_planks: "planks_spruce", birch_planks: "planks_birch",
    stone_bricks: "stonebrick", bricks: "brick", terracotta: "hardened_clay",
    granite: "stone_granite", diorite: "stone_diorite", andesite: "stone_andesite",
    sandstone: { up: "sandstone_top", down: "sandstone_bottom", side: "sandstone_normal" },
    quartz_block: { up: "quartz_block_top", down: "quartz_block_bottom", side: "quartz_block_side" },
    furnace: { up: "furnace_top", down: "furnace_top", north: "furnace_front_off", side: "furnace_side" },
    farmland: { up: "farmland_dry", side: "dirt", down: "dirt" },
    redstone_lamp: "redstone_lamp_off", lit_redstone_lamp: "redstone_lamp_on",
    redstone_wire: "redstone_dust_cross",
  };
  const COLORS = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];
  COLORS.forEach(c => {
    const legacy = c === "light_gray" ? "silver" : c;
    TABLE[c + "_wool"] = "wool_colored_" + legacy;
    TABLE[c + "_concrete"] = "concrete_" + legacy;
    TABLE[c + "_terracotta"] = "hardened_clay_stained_" + legacy;
    TABLE[c + "_stained_glass"] = "glass_" + legacy;
    TABLE[c + "_glazed_terracotta"] = "glazed_terracotta_" + legacy;
  });
  // Blocks the faces of their neighbours show through.
  const TRANSPARENT = /glass|^ice$|leaves|redstone_wire|torch|rail|carpet|slab|stairs|fence|wall|door|pane|bars/;

  // RedStoneWireBlock.getColorForPower
  const wireColor = power => {
    const f = power / 15;
    return [f * 0.6 + (f > 0 ? 0.4 : 0.3), P.clamp(f * f * 0.7 - 0.5, 0, 1), P.clamp(f * f * 0.6 - 0.7, 0, 1)];
  };

  P.wireColor = wireColor;
  P.isTransparent = name => TRANSPARENT.test(name);

  // Vanilla's look, from hbui/ponder/blocks/vanilla_blocks.json, which tools/adapter writes from
  // the game's blocks.json, terrain_texture.json and textures, and Scaffold's shapes: textures
  // { path: { file, w, h, frames, tick, seq } }, cubes { block: path or { face: path } }, and
  // shapes (vanilla_models.js). (pack://blocks.json gives only the topmost pack's file, which
  // another pack can hide.) A pack not run through tools/adapter has none of it.
  P.vanilla = { textures: {}, cubes: {}, shapes: { blocks: {}, families: {}, rotations: {}, faces: {}, terrain: {} } };
  // A JSON file; a missing one reads as {}.
  P.readJson = url => new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.onload = () => resolve((xhr.status === 200 || xhr.status === 0) && xhr.responseText ? JSON.parse(xhr.responseText) : {});
    xhr.onerror = () => resolve({});
    xhr.send();
  });
  // Vanilla's table once, and the block index of each add-on not read yet (block_models.js).
  let vanillaLoaded = null;
  P.loadBlockData = addons => Promise.all([
    vanillaLoaded || (vanillaLoaded = P.readJson("/hbui/ponder/blocks/vanilla_blocks.json").then(t => { Object.assign(P.vanilla, t); })),
    P.loadAddonBlocks(addons),
  ]);
  const SIX = ["up", "down", "north", "south", "west", "east"];
  // Face -> texture (P.textureOf) from vanilla's table, or null when it does not have the block.
  function tableFaces(name) {
    const entry = P.vanilla.cubes[name];
    if (!entry) return null;
    const faces = {};
    for (const f of SIX) {
      const e = P.vanilla.textures[typeof entry === "string" ? entry : entry[f]];
      if (!e) return null;
      faces[f] = P.textureOf(e);
    }
    return faces;
  }

  // Models a plugin supplies for its own blocks:
  //   P.registerBlockModel("my_mod:widget", block => ({ shape: "cube", opaque: true, faces, tint: null }))
  // faces maps up/down/north/south/west/east to texture URLs (a pack's own files sit under
  // /hbui/ponder_addons/<modId>/). The function runs once per distinct block and states.
  const custom = new Map();
  P.registerBlockModel = (id, model) => { custom.set(id, model); };

  const cache = new Map();
  P.blockId = block => (typeof block === "string" ? block : block.id);
  // A model's shape is "cube" (a texture per side), "wire" (redstone dust) or "model" (an add-on's
  // quads, block_models.js). `full` when it fills its cell: faces against it are then hidden,
  // unless it is see-through (`opaque` false) and another block.
  P.blockModel = function (block) {
    const make = custom.get(P.blockId(block));
    if (make) {
      const key = JSON.stringify(block);
      if (!cache.has(key)) {
        const made = Object.assign({ id: P.blockId(block), tint: null }, make(block));
        made.full = made.shape === "cube";
        cache.set(key, made);
      }
      return cache.get(key);
    }
    const addon = P.addonBlockModel(block) || P.vanillaShapeModel(block);
    if (addon) return addon;
    const id = P.blockId(block), power = P.blockStates(block).redstone_signal || 0, key = id + "#" + power;
    let model = cache.get(key);
    if (model) return model;
    const name = id.replace(/^minecraft:/, ""), files = tableFaces(name);
    if (!files && !TABLE[name]) P.log("texture: vanilla_blocks.json has no", name);
    const entry = TABLE[name] || name;
    const texture = face => {
      if (files) return files[face].url;
      const t = typeof entry === "string" ? entry : entry[face] || entry.side || entry.up;
      return `pack://textures/blocks/${t}.png?filtering=point`;
    };
    const wire = name === "redstone_wire";
    model = { id, shape: wire ? "wire" : "cube", full: !wire, opaque: !TRANSPARENT.test(name), faces: {},
      tint: wire ? wireColor(power) : null };
    SIX.forEach(f => { model.faces[f] = texture(f); });
    // A face with an animation (a strip of frames: magma, sea lantern) is drawn a frame at a time.
    if (files && !wire && SIX.some(f => files[f].frames > 1)) {
      model.shape = "model";
      model.quads = [];
      SIX.forEach(f => P.blockBox(model.quads, P.Mat.id(), [0, 0, 0], [1, 1, 1], f, [0, 0, 1, 1], { tex: files[f], crop: true, dim: true, solid: model.opaque }));
    }
    cache.set(key, model);
    return model;
  };
  // Whether an item is drawn as its block (Java: a block/* parent model) rather than a flat
  // icon (item/generated). Bedrock names block items tile.*; the non-cube ones stay flat.
  const FLAT_BLOCK_ITEM = /torch|rail|door|pane|bars|lever|sapling|flower|ladder|vine|redstone_wire|button|carpet/;
  P.isBlockItem = id => {
    const name = id.replace(/^minecraft:/, "");
    return P.hasTranslation(P.nameKeys(id)[0]) && !FLAT_BLOCK_ITEM.test(name);
  };
  // The item a block is picked as (getCloneItemFromBlockstate).
  P.blockItem = function (block) {
    const id = P.blockId(block);
    return id === "minecraft:lit_redstone_lamp" ? "minecraft:redstone_lamp" : id === "minecraft:redstone_wire" ? "minecraft:redstone" : id;
  };

  // toggleRedstonePower in Bedrock terms. Java's POWER is redstone_signal (0 <-> 15). POWERED
  // and LIT are bit states, or the id itself where Bedrock keeps them in it. A lever's open_bit
  // is its POWERED; a door's open_bit is OPEN, which Java leaves alone.
  const BITS = ["button_pressed_bit", "powered_bit", "output_lit_bit", "rail_data_bit", "lit", "extinguished"];
  const ID_PAIRS = [
    ["redstone_lamp", "lit_redstone_lamp"], ["unlit_redstone_torch", "redstone_torch"],
    ["unpowered_repeater", "powered_repeater"], ["unpowered_comparator", "powered_comparator"],
    ["redstone_ore", "lit_redstone_ore"], ["deepslate_redstone_ore", "lit_deepslate_redstone_ore"],
    ["furnace", "lit_furnace"], ["blast_furnace", "lit_blast_furnace"], ["smoker", "lit_smoker"],
  ];
  const SWAP = new Map();
  ID_PAIRS.forEach(([a, b]) => { SWAP.set("minecraft:" + a, "minecraft:" + b); SWAP.set("minecraft:" + b, "minecraft:" + a); });
  const flip = v => (typeof v === "number" ? 1 - v : !v);
  P.toggleRedstonePower = function (block) {
    const id = P.blockId(block), states = Object.assign({}, P.blockStates(block));
    if ("redstone_signal" in states) states.redstone_signal = states.redstone_signal === 0 ? 15 : 0;
    BITS.forEach(bit => { if (bit in states) states[bit] = flip(states[bit]); });
    if (id === "minecraft:lever") states.open_bit = flip(states.open_bit);
    return P.block(SWAP.get(id) || id, states);
  };

  // Each face: outward normal and where its texture's (0,0), (16,0) and (0,16) corners lie in
  // the block, as Minecraft maps block textures (up: north edge at the top, sides: upright).
  P.FACES = {
    up: { n: [0, 1, 0], o: [0, 1, 0], u: [1, 1, 0], v: [0, 1, 1] },
    down: { n: [0, -1, 0], o: [0, 0, 1], u: [1, 0, 1], v: [0, 0, 0] },
    north: { n: [0, 0, -1], o: [1, 1, 0], u: [0, 1, 0], v: [1, 0, 0] },
    south: { n: [0, 0, 1], o: [0, 1, 1], u: [1, 1, 1], v: [0, 0, 1] },
    west: { n: [-1, 0, 0], o: [0, 1, 0], u: [0, 1, 1], v: [0, 0, 0] },
    east: { n: [1, 0, 0], o: [1, 1, 1], u: [1, 1, 0], v: [1, 0, 1] },
  };
  // Redstone dust: one flat face a quarter pixel above the block below.
  const H = 0.25 / 16;
  P.WIRE_FACE = { n: [0, 1, 0], o: [0, H, 0], u: [1, H, 0], v: [0, H, 1] };
  // Direction.getShade, as the block renderer shades faces.
  P.SHADE = { down: 0.5, up: 1, north: 0.8, south: 0.8, west: 0.6, east: 0.6 };
})();
