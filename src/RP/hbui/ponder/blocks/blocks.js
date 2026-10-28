// What a block looks like: per-face vanilla textures, shape, opacity and tint. A block in the
// world is an id ("minecraft:stone"), { id, power } for redstone wire, or { id, props } from a
// structure (Java Properties or Bedrock states; wire power is props.power / redstone_signal).
(function () {
  const P = window.Ponder;

  // Bedrock texture names (textures/blocks/<name>.png) by block id. Ids not listed use a
  // texture of their own name.
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

  const cache = new Map();
  P.blockId = block => (typeof block === "string" ? block : block.id);
  P.blockModel = function (block) {
    const id = P.blockId(block), power = typeof block === "string" ? 0 : +(block.power || block.props && (block.props.power || block.props.redstone_signal)) || 0, key = id + "#" + power;
    let model = cache.get(key);
    if (model) return model;
    const name = id.replace(/^minecraft:/, ""), entry = TABLE[name] || name;
    const texture = face => {
      const t = typeof entry === "string" ? entry : entry[face] || entry.side || entry.up;
      return `pack://textures/blocks/${t}.png?filtering=point`;
    };
    model = { id, shape: name === "redstone_wire" ? "wire" : "cube", opaque: !TRANSPARENT.test(name), faces: {},
      tint: name === "redstone_wire" ? wireColor(power) : null };
    ["up", "down", "north", "south", "west", "east"].forEach(f => { model.faces[f] = texture(f); });
    cache.set(key, model);
    return model;
  };
  // The item a block is picked as (getCloneItemFromBlockstate).
  P.blockItem = function (block) {
    const id = P.blockId(block);
    return id === "minecraft:lit_redstone_lamp" ? "minecraft:redstone_lamp" : id === "minecraft:redstone_wire" ? "minecraft:redstone" : id;
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
