// Java 1.21.1 StructureTemplate files become Bedrock palettes at build time. The page still
// reads one structure format; unknown ids and properties fail with the source filename.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), zlib = require("node:zlib");
const mapping = require("../data/java-1.21.1/blocks.json");
const context = vm.createContext({ window: { Ponder: {} }, TextDecoder, Uint8Array, DataView });
vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../../src/RP/hbui/ponder/level/structure/nbt.js"), "utf8"), context);
const read = (bytes, little) => context.window.Ponder.NBT.read(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), little);
const COLORS = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];
const PATTERNS = { base: "b", square_bottom_left: "bl", square_bottom_right: "br", square_top_left: "tl", square_top_right: "tr",
  stripe_bottom: "bs", stripe_top: "ts", stripe_left: "ls", stripe_right: "rs", stripe_center: "cs", stripe_middle: "ms",
  stripe_downright: "drs", stripe_downleft: "dls", small_stripes: "ss", cross: "cr", straight_cross: "sc", triangle_bottom: "bt", triangle_top: "tt",
  triangles_bottom: "bts", triangles_top: "tts", diagonal_left: "ld", diagonal_up_right: "rd", diagonal_up_left: "lud", diagonal_right: "rud",
  circle: "mc", rhombus: "mr", half_vertical: "vh", half_horizontal: "hh", half_vertical_right: "vhr", half_horizontal_bottom: "hhb",
  border: "bo", curly_border: "cbo", gradient: "gra", gradient_up: "gru", bricks: "bri", globe: "glb", creeper: "cre", skull: "sku", flower: "flo", mojang: "moj", piglin: "pig", flow: "flw", guster: "gus" };

function blockState(block) {
  const definition = mapping.blocks[block.Name];
  if (!definition) throw new Error("No Java block mapping: " + block.Name);
  const props = block.Properties || {}, defaults = {};
  let value = definition.default;
  for (let i = definition.properties.length - 1; i >= 0; i--) {
    const [key, values] = definition.properties[i]; defaults[key] = values[value % values.length]; value = Math.floor(value / values.length);
  }
  for (const key of Object.keys(props)) if (!definition.properties.some(p => p[0] === key)) throw new Error("Unknown Java property: " + block.Name + " " + key);
  let index = 0;
  for (const [key, values] of definition.properties) {
    const at = values.indexOf(key in props ? String(props[key]) : defaults[key]);
    if (at < 0) throw new Error("Invalid Java property: " + block.Name + " " + key + "=" + props[key]);
    index = index * values.length + at;
  }
  return mapping.palette[definition.values[index]];
}

// The preserved Java compound is the scene API's data. Native fields used by the block model
// are written alongside it, including data which Java stores in the block id rather than NBT.
function blockEntity(state, tag) {
  const out = tag ? { PonderJavaData: tag } : {};
  if (state.color != null) {
    const color = COLORS.indexOf(state.color);
    if (state.name === "minecraft:bed") Object.assign(out, { id: "Bed", color });
    else Object.assign(out, { id: "Banner", Base: 15 - color, Type: 0, Patterns: (tag && tag.patterns || []).map(p => {
      const pattern = PATTERNS[p.pattern.replace(/^minecraft:/, "")];
      if (!pattern || !COLORS.includes(p.color)) throw new Error("Unknown Java banner pattern: " + JSON.stringify(p));
      return { Pattern: pattern, Color: 15 - COLORS.indexOf(p.color) };
    }) });
  }
  if (state.rotation != null) out.Rotation = state.rotation;
  if (/^minecraft:(sticky_)?piston$/.test(state.name) && state.extended) out.State = 2;
  if (state.name === "minecraft:moving_block" && tag && tag.blockState) {
    const moved = blockState(tag.blockState);
    out.movingBlock = { name: moved.name, states: moved.states };
    const data = blockEntity(moved, null);
    if (data) out.movingBlockEntity = data;
  }
  return Object.keys(out).length ? out : null;
}

function convert(bytes) {
  if (bytes[0] === 31 && bytes[1] === 139) bytes = zlib.gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 });
  const tag = read(bytes, false), size = tag.size;
  if (!Array.isArray(size) || size.length !== 3 || size.some(n => !Number.isInteger(n) || n < 0)) throw new Error("Invalid Java structure size");
  const volume = size.reduce((a, b) => a * b, 1);
  if (!Number.isSafeInteger(volume) || volume > 16 * 1024 * 1024) throw new Error("Java structure is too large");
  const sourcePalette = tag.palette || tag.palettes && tag.palettes[0];
  if (!Array.isArray(sourcePalette) || !Array.isArray(tag.blocks)) throw new Error("Missing Java structure palette or blocks");
  const converted = sourcePalette.map(blockState), palette = converted.map(b => ({ name: b.name, states: b.states, version: 18168865 }));
  const water = palette.length;
  palette.push({ name: "minecraft:water", states: { liquid_depth: 0 }, version: 18168865 });
  const indices = [new Array(volume).fill(-1), new Array(volume).fill(-1)], data = {};
  tag.blocks.forEach(b => {
    if (!Array.isArray(b.pos) || b.pos.length !== 3 || b.pos.some((n, i) => !Number.isInteger(n) || n < 0 || n >= size[i])) throw new Error("Invalid Java block position");
    const state = converted[b.state];
    if (!state) throw new Error("Invalid Java palette index: " + b.state);
    const index = (b.pos[0] * size[1] + b.pos[1]) * size[2] + b.pos[2];
    if (indices[0][index] >= 0) throw new Error("Duplicate Java block position: " + b.pos.join(","));
    indices[0][index] = b.state;
    if (state.waterlogged) indices[1][index] = water;
    const nbt = blockEntity(state, b.nbt);
    if (nbt) data[index] = { block_entity_data: Object.assign({ x: b.pos[0], y: b.pos[1], z: b.pos[2] }, nbt) };
  });
  // PonderLevel clears structure entities on begin; entities in storyboards are explicit.
  return { format_version: 1, size, structure_world_origin: [0, 0, 0], structure: { block_indices: indices, entities: [], palette: { default: { block_palette: palette, block_position_data: data } } } };
}

// A small typed NBT writer for the adapter's palette output. Compound field numbers are ints
// unless fractional; list element types are chosen together so mixed numeric values survive.
function write(tag, little = true) {
  const parts = [], number = (value, bytes, method) => { const b = Buffer.alloc(bytes); b[method + (bytes === 1 ? "" : little ? "LE" : "BE")](value); parts.push(b); };
  const str = value => { const b = Buffer.from(value); number(b.length, 2, "writeUInt16"); parts.push(b); };
  const type = value => typeof value === "boolean" ? 1 : typeof value === "number" ? Number.isInteger(value) && value >= -2147483648 && value <= 2147483647 ? 3 : 6
    : typeof value === "string" ? 8 : Array.isArray(value) ? 9 : value && typeof value === "object" ? 10 : 0;
  function payload(t, value) {
    if (t === 1) number(+value, 1, "writeInt8");
    else if (t === 3) number(value, 4, "writeInt32");
    else if (t === 6) number(value, 8, "writeDouble");
    else if (t === 8) str(value);
    else if (t === 9) {
      let child = value.length ? type(value[0]) : 0;
      if (value.length && value.every(v => typeof v === "number")) child = value.some(v => type(v) === 6) ? 6 : 3;
      else if (value.some(v => type(v) !== child)) throw new Error("Mixed NBT list");
      number(child, 1, "writeUInt8"); number(value.length, 4, "writeInt32"); value.forEach(v => payload(child, v));
    } else if (t === 10) {
      Object.entries(value).forEach(([key, v]) => { const child = type(v); if (!child) throw new Error("Invalid NBT value: " + key); number(child, 1, "writeUInt8"); str(key); payload(child, v); });
      number(0, 1, "writeUInt8");
    }
  }
  number(10, 1, "writeUInt8"); str(""); payload(10, tag); return Buffer.concat(parts);
}

function adaptStructures(pack) {
  for (const [name, bytes] of Array.from(pack.files)) {
    if (!/^hbui\/ponder_addons\/[^/]+\/structures\/.+\.nbt$/.test(name)) continue;
    const output = name.slice(0, -4) + ".mcstructure";
    if (pack.files.has(output)) throw new Error("Two structures have the same name: " + name + " and " + output);
    try { pack.files.set(output, write(convert(bytes))); }
    catch (e) { throw new Error(name + ": " + e.message); }
    pack.files.delete(name);
    pack.report.changes.push(name + " -> " + output);
  }
}

module.exports = { blockState, convert, read, write, adaptStructures };
