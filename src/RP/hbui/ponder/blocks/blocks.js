// What a block looks like: per-face vanilla textures, shape, opacity and tint. A block in the
// world is a Bedrock block id ("minecraft:stone") or { id, states } with Bedrock block states
// (redstone_wire's signal is states.redstone_signal).
(function () {
  const P = window.Ponder;

  // A block with states, and with what Bedrock keeps beside them: `liquid`, the water in a
  // waterlogged block (a block itself), and `nbt`, its block entity's data as the game saves it
  // (a bed's colour, a banner's patterns). Ids alone stay strings.
  P.block = (id, states, extra) => ((states && Object.keys(states).length) || (extra && (extra.liquid || extra.nbt))
    ? Object.assign({ id, states: states || {} }, extra && extra.liquid ? { liquid: extra.liquid } : {}, extra && extra.nbt ? { nbt: extra.nbt } : {}) : id);
  P.blockStates = block => (typeof block === "string" ? {} : block.states);
  P.liquidOf = block => (block && typeof block === "object" && block.liquid) || null;
  P.blockNbt = block => (block && typeof block === "object" && block.nbt) || null;
  const extraOf = block => ({ liquid: P.liquidOf(block), nbt: P.blockNbt(block) });
  P.withStates = (block, changes) => P.block(P.blockId(block), Object.assign({}, P.blockStates(block), changes), extraOf(block));
  P.withLiquid = (block, liquid) => P.block(P.blockId(block), P.blockStates(block), Object.assign(extraOf(block), { liquid }));
  P.withNbt = (block, nbt) => P.block(P.blockId(block), P.blockStates(block), Object.assign(extraOf(block), { nbt }));
  // Shade brightness, light/view blocking, collision/solid fullness, emission and canOcclude.
  P.blockLighting = function (block) {
    if (!block) return [1, 0, false, false, false, 0, false];
    const table = P.vanilla.client && P.vanilla.client.lighting, entry = table && table.blocks[P.blockId(block)];
    let index = entry;
    if (entry && typeof entry === "object") {
      const states = P.blockStates(block) || {}, nbt = P.blockNbt(block) || {};
      const key = entry.keys.map((key, i) => key === "@water" ? +!!P.liquidOf(block) : key === "@extended" ? +(nbt.State === 2 || nbt.NewState === 2)
        : states[key] == null ? entry.defaults[i] : typeof states[key] === "boolean" ? +states[key] : states[key]).join(";");
      index = entry.values[key];
    }
    if (index != null) return table.palette[index];
    const model = P.blockModel(block), full = !!(model.full && model.opaque);
    return [full ? 0.2 : 1, full ? 15 : 0, full, !!model.full, full, 0, full];
  };

  // Files under textures/blocks/ for packs not run through tools/adapter, which have no table
  // (grass in its inventory look, as the game tints it). A block in neither uses its own name.
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
  // { path: { file, w, h, frames, tick, seq, tint, alpha, under } } (P.textureOf), cubes { block:
  // path or { face: path } }, liquids { block: { still, flow } } (liquid_models.js), blockEntities
  // { bed: [path by colour], banner: { base, illager, patterns: { code: path } } }
  // (block_entity_models.js) and shapes (vanilla_models.js). (pack://blocks.json gives only the
  // topmost pack's file, which another pack can hide.) A pack not run through tools/adapter has
  // none of it.
  P.vanilla = { textures: {}, cubes: {}, liquids: {}, blockEntities: null, shapes: { blocks: {}, families: {}, rotations: {}, faces: {}, terrain: {} } };
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
  P.registerBlockModel = (id, model) => { custom.set(id, model); cache.clear(); };

  const cache = new Map();
  P.blockId = block => (typeof block === "string" ? block : block.id);
  // A model's shape is "cube" (a texture per side), "wire" (redstone dust), "model" (quads,
  // block_models.js) or "liquid" (quads made with its neighbours, liquid_models.js). `full` when
  // it fills its cell: faces against it are then hidden, unless it is see-through (`opaque`
  // false) and another block.
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
    const addon = P.addonBlockModel(block) || P.liquidModel(block) || P.blockEntityModel(block) || P.vanillaShapeModel(block);
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
    // A face with an animation (a strip of frames: magma, sea lantern) is drawn a frame at a time,
    // and a tinted one (grass, leaves) with its own tint.
    if (files && !wire && SIX.some(f => files[f].frames > 1 || files[f].tint)) {
      model.shape = "model";
      model.quads = [];
      SIX.forEach(f => P.blockBox(model.quads, P.Mat.id(), [0, 0, 0], [1, 1, 1], f, [0, 0, 1, 1], { tex: files[f], crop: true, dim: true, solid: model.opaque }));
    }
    cache.set(key, model);
    return model;
  };
  const bounds = new WeakMap();
  P.blockBounds = function (model) {
    if (bounds.has(model)) return bounds.get(model);
    let box = null;
    if (model.shape !== "liquid") {
      if (!model.quads) box = [[0, 0, 0], [1, model.shape === "wire" ? 1 / 16 : 1, 1]];
      else if (model.quads.length) {
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        model.quads.forEach(q => {
          (q.uvs && q.uvs.length === 3 ? [q.o, q.u, q.v] : [q.o, q.u, q.v, q.u.map((v, i) => v + q.v[i] - q.o[i])]).forEach(p => p.forEach((v, i) => {
            lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v);
          }));
        });
        box = [lo, hi];
      }
    }
    bounds.set(model, box);
    return box;
  };
  // Intersect the model's faces, including thin and rotated shapes, without treating empty
  // space in its cell as a hit. Returns a fraction along the ray or null.
  P.clipBlock = function (model, from, to) {
    if (!P.blockBounds(model)) return null;
    const box = P.blockBounds(model);
    const quads = model.quads || Object.values(P.FACES).map(face => ({ n: face.n,
      o: face.o.map((v, i) => box[0][i] + v * (box[1][i] - box[0][i])),
      u: face.u.map((v, i) => box[0][i] + v * (box[1][i] - box[0][i])),
      v: face.v.map((v, i) => box[0][i] + v * (box[1][i] - box[0][i])) }));
    const sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
    const dir = sub(to, from);
    let best = null;
    quads.forEach(q => {
      const denom = dot(q.n, dir);
      if (Math.abs(denom) < 1e-10) return;
      const t = dot(q.n, sub(q.o, from)) / denom;
      if (t < 0 || t > 1 || best != null && t >= best) return;
      const p = sub(from.map((v, i) => v + t * dir[i]), q.o), u = sub(q.u, q.o), v = sub(q.v, q.o);
      const uu = dot(u, u), uv = dot(u, v), vv = dot(v, v), d = uu * vv - uv * uv;
      if (d < 1e-12) return;
      const s = (dot(p, u) * vv - dot(p, v) * uv) / d, r = (dot(p, v) * uu - dot(p, u) * uv) / d;
      if (s < -1e-7 || s > 1 + 1e-7 || r < -1e-7 || r > 1 + 1e-7 || q.uvs && q.uvs.length === 3 && s + r > 1 + 1e-7) return;
      best = t;
    });
    return best;
  };

  // BlockBehaviour.OffsetType uses Mth.getSeed(x, 0, z), so stacked plants share an offset.
  // Four 16-bit limbs preserve Java's long overflow without rounding through a JS double.
  const longProduct = (a, b) => {
    const out = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      let sum = out[i];
      for (let j = 0; j <= i; j++) sum += a[j] * b[i - j];
      out[i] = sum & 65535;
      if (i < 3) out[i + 1] = Math.floor(sum / 65536);
    }
    return out;
  };
  const longParts = n => { const lo = n >>> 0, hi = Math.floor(n / 4294967296) >>> 0; return [lo & 65535, lo >>> 16, hi & 65535, hi >>> 16]; };
  const offsetSeed = (x, z) => {
    const a = longParts(Math.imul(x, 3129871)), b = longProduct(longParts(z), longParts(116129781)), seed = a.map((v, i) => v ^ b[i]);
    const square = longProduct(longProduct(seed, seed), longParts(42317861)), linear = longProduct(seed, longParts(11));
    let carry = 0;
    for (let i = 0; i < 4; i++) { const n = square[i] + linear[i] + carry; square[i] = n & 65535; carry = n >>> 16; }
    return square[2];
  };
  const OFFSET_XYZ = /^(short_grass|tall_grass|tallgrass|fern|large_fern)$/;
  const OFFSET_XZ = /^(dandelion|poppy|blue_orchid|allium|azure_bluet|red_tulip|orange_tulip|white_tulip|pink_tulip|oxeye_daisy|cornflower|lily_of_the_valley|wither_rose|sunflower|lilac|rose_bush|peony|torchflower|open_eyeblossom|closed_eyeblossom|bamboo|bamboo_sapling|pointed_dripstone|crimson_roots|warped_roots)$/;
  P.blockOffset = function (block, pos) {
    const id = P.blockId(block);
    if (!id.startsWith("minecraft:")) return [0, 0, 0];
    const name = id.slice(10), xyz = OFFSET_XYZ.test(name);
    if (!xyz && !OFFSET_XZ.test(name)) return [0, 0, 0];
    const seed = offsetSeed(pos[0], pos[2]);
    const max = name === "bamboo" || name === "bamboo_sapling" || name === "pointed_dripstone" ? 0.125 : 0.25;
    return [P.clamp(((seed & 15) / 15 - 0.5) * 0.5, -max, max), xyz ? (((seed >>> 4) & 15) / 15 - 1) * 0.2 : 0,
      P.clamp((((seed >>> 8) & 15) / 15 - 0.5) * 0.5, -max, max)];
  };

  // Whether an item is drawn as its block (Java: a block/* parent model) rather than a flat
  // icon (item/generated). Bedrock names block items tile.*; the non-cube ones stay flat.
  const FLAT_BLOCK_ITEM = /(?:^|_)(?:torch|rail|door|pane|bars|sapling|flower|ladder|vine|sign|hanging_sign)$|^redstone_wire$|^trip_wire$|^wheat$|^carrots$|^potatoes$|^beetroot$/;
  P.itemGroundModel = id => {
    const models = P.vanilla.client && P.vanilla.client.models;
    const aliases = { "minecraft:banner": "minecraft:white_banner", "minecraft:bed": "minecraft:red_bed", "minecraft:iron_chain": "minecraft:chain" };
    return models && models[aliases[id] || id];
  };
  P.isBlockItem = id => {
    const model = P.itemGroundModel(id);
    if (model) return !model.flat;
    const name = id.replace(/^minecraft:/, "");
    if (name === "shield" || name === "banner" || /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_(?:bed|banner)$/.test(name)) return true;
    return !!(P.addonBlockStates(id) || (P.vanilla.registry ? P.vanilla.registry.blocks[id] : P.hasTranslation(P.nameKeys(id)[0]))) && !FLAT_BLOCK_ITEM.test(name);
  };
  // The item a block is picked as (getCloneItemFromBlockstate).
  P.blockItem = function (block) {
    const id = P.blockId(block);
    const names = { redstone_wire: "redstone", unpowered_repeater: "repeater", powered_repeater: "repeater", unpowered_comparator: "comparator", powered_comparator: "comparator",
      wall_torch: "torch", unlit_redstone_torch: "redstone_torch", redstone_wall_torch: "redstone_torch", soul_wall_torch: "soul_torch",
      lit_redstone_lamp: "redstone_lamp", lit_furnace: "furnace", lit_blast_furnace: "blast_furnace", lit_smoker: "smoker",
      piston_arm_collision: "piston", sticky_piston_arm_collision: "sticky_piston", piston_head: "piston", wall_banner: "banner", standing_banner: "banner",
      standing_sign: "oak_sign", wall_sign: "oak_sign", water: "water_bucket", flowing_water: "water_bucket", lava: "lava_bucket", flowing_lava: "lava_bucket",
      wheat: "wheat_seeds", carrots: "carrot", potatoes: "potato", beetroot: "beetroot_seeds", melon_stem: "melon_seeds", pumpkin_stem: "pumpkin_seeds",
      sugar_cane: "reeds", trip_wire: "string", cocoa: "cocoa_beans", cake: "cake", flower_pot: "flower_pot", brewing_stand: "brewing_stand", cauldron: "cauldron" };
    if (!id.startsWith("minecraft:")) return id;
    let name = id.slice(10);
    name = names[name] || name.replace(/_(wall|standing)_sign$/, "_sign").replace(/_wall_hanging_sign$/, "_hanging_sign").replace(/_double_slab$/, "_slab");
    if (name === "bed") return "minecraft:bed";
    return "minecraft:" + name;
  };

  P.blockPropertyValues = (block, state) => {
    const own = P.addonBlockStates(P.blockId(block));
    if (own && own[state]) return own[state];
    const registry = P.vanilla.registry;
    return registry && registry.properties[state] || null;
  };
  P.isItem = id => P.vanilla.registry ? !!P.vanilla.registry.items[id] || !!P.addonBlockStates(id) || P.addonItems.has(id) : true;
  P.addonItems = new Map();

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
    Object.keys(states).forEach(state => {
      if (!state.includes(":")) return;
      const name = state.slice(state.indexOf(":") + 1), values = P.blockPropertyValues(block, state);
      if (/^(power|redstone_signal)$/.test(name) && values && values.every(v => typeof v === "number")) states[state] = states[state] === 0 ? Math.max(...values) : 0;
      else if (/^(powered|lit|powered_bit|output_lit_bit)$/.test(name)) states[state] = flip(states[state]);
    });
    if (id === "minecraft:lever") states.open_bit = flip(states.open_bit);
    return P.block(SWAP.get(id) || id, states, extraOf(block));
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
