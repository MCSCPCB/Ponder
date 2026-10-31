"use strict";
// Decode current Bedrock skins before Gameface premultiplies their alpha.
const zlib = require("node:zlib");
const crypto = require("node:crypto");

// Only alpha handling is prepared here. Lighting, tint masks and emissive layers are
// separate renderer features; the original RGB bytes must survive this conversion.
function materialPolicy(material) {
  const flags = material.defines || [], states = material.states || [];
  const blend = states.includes("Blending") && material.blendSrc !== "One";
  const test = flags.includes("ALPHA_TEST");
  const mode = states.includes("DisableColorWrite") ? "none" : blend ? "blend" : test ? "cutout" : "opaque";
  const alpha = blend ? test ? "blendCutout" : "blend" : test ? "cutout" : "opaque";
  const mask = flags.includes("USE_COLOR_MASK"), emissive = flags.includes("USE_EMISSIVE");
  const prefix = test ? emissive ? flags.includes("USE_ONLY_EMISSIVE") ? "only_" : "emissive_" : mask ? "mask_" : "" : "";
  return { mode, alpha: prefix + alpha };
}

function entityTextureImages(table, read, base) {
  const files = new Map(), used = new Map();
  Object.values(table.entities).forEach(def => {
    const policies = Object.values(def.materials).map(name => table.materials[name]
      || (base && base.materials[name]) || { mode: "cutout", alpha: "cutout" });
    if (!policies.length) policies.push({ mode: "cutout", alpha: "cutout" });
    for (const id of Object.values(def.textures)) {
      if (!used.has(id)) used.set(id, new Set());
      for (const p of policies) if (p.mode !== "none" && p.alpha !== "blend") used.get(id).add(p.alpha);
    }
  });
  for (const [id, modes] of used) {
    let entry = table.textures[id];
    if (!entry && base && base.textures[id]) entry = table.textures[id] = Object.assign({}, base.textures[id]);
    if (!entry || !modes.size) continue; // missing textures are reported by entityTable
    const pending = [...modes].filter(mode => !(entry.images && entry.images[mode]));
    if (!pending.length) continue;
    const bytes = read(entry);
    if (!bytes) throw new Error("entity texture not found: " + entry.file);
    const image = entry.file.endsWith(".tga") ? decodeTga(bytes, entry.file) : decodePng(bytes, entry.file);
    entry.images = Object.assign({}, entry.images);
    for (const mode of pending) {
      const pixels = Buffer.from(image.pixels), alpha = mode.replace(/^.*_/, "");
      for (let i = 0; i < pixels.length; i += 4) {
        const a = pixels[i + 3];
        // The mask/emissive shaders consume alpha as data before their alpha test.
        const visible = mode.startsWith("only_") ? a > 0 && a < 255
          : mode.startsWith("emissive_") ? a + pixels[i] + pixels[i + 1] + pixels[i + 2] > 0
          : mode.startsWith("mask_") ? a > 0 : a >= 128;
        pixels[i + 3] = /cutout/i.test(alpha) && !visible ? 0 : alpha.startsWith("blend") ? a : 255;
      }
      // Reuse the native texture if its pixels already have the required alpha.
      if (pixels.equals(image.pixels)) continue;
      const png = encodePng({ width: image.width, height: image.height, pixels });
      const file = "hbui/ponder/assets/entity_textures/" + crypto.createHash("sha256").update(png).digest("hex") + ".png";
      files.set(file, png);
      entry.images[mode] = "/" + file;
    }
    if (!Object.keys(entry.images).length) delete entry.images;
  }
  return files;
}

function decodePng(bytes, name) {
  const invalid = message => { throw new Error(name + ": " + message); };
  if (bytes.length < 33 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") invalid("invalid PNG header");
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), depth = bytes[24], type = bytes[25], interlace = bytes[28];
  const samples = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!width || !height || !samples || ![1, 2, 4, 8, 16].includes(depth) || (type === 3 && depth === 16)
    || (type !== 0 && type !== 3 && depth < 8) || bytes[26] || bytes[27] || interlace > 1) invalid("unsupported PNG format");
  const data = [];
  let palette = null, transparency = null;
  for (let p = 8; p + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(p);
    if (p + length + 12 > bytes.length) invalid("truncated PNG chunk");
    const kind = bytes.toString("latin1", p + 4, p + 8), chunk = bytes.subarray(p + 8, p + 8 + length);
    if (kind === "IDAT") data.push(chunk);
    if (kind === "PLTE") palette = chunk;
    if (kind === "tRNS") transparency = chunk;
    p += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(data)), pixels = Buffer.alloc(width * height * 4);
  const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  const step = Math.ceil(samples * depth / 8), byte = v => depth === 16 ? v >> 8 : Math.round(v * 255 / ((1 << depth) - 1));
  let offset = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const w = Math.ceil((width - x0) / dx), h = Math.ceil((height - y0) / dy);
    if (w <= 0 || h <= 0) continue;
    const stride = Math.ceil(w * samples * depth / 8);
    let previous = Buffer.alloc(stride);
    for (let y = 0; y < h; y++) {
      if (offset + stride + 1 > raw.length) invalid("truncated PNG pixels");
      const filter = raw[offset++], row = Buffer.alloc(stride);
      if (filter > 4) invalid("invalid PNG row filter");
      for (let i = 0; i < stride; i++) {
        const left = i >= step ? row[i - step] : 0, up = previous[i], corner = i >= step ? previous[i - step] : 0;
        let add = 0;
        if (filter === 1) add = left;
        else if (filter === 2) add = up;
        else if (filter === 3) add = (left + up) >> 1;
        else if (filter === 4) {
          const guess = left + up - corner, a = Math.abs(guess - left), b = Math.abs(guess - up), c = Math.abs(guess - corner);
          add = a <= b && a <= c ? left : b <= c ? up : corner;
        }
        row[i] = raw[offset++] + add;
      }
      const sample = i => depth === 16 ? row.readUInt16BE(i * 2) : (row[Math.floor(i * depth / 8)] >> (8 - depth - i * depth % 8)) & ((1 << depth) - 1);
      for (let x = 0; x < w; x++) {
        const v = Array.from({ length: samples }, (_, c) => sample(x * samples + c)), at = ((y0 + y * dy) * width + x0 + x * dx) * 4;
        let rgba;
        if (type === 3) {
          const p = v[0] * 3;
          if (!palette || p + 3 > palette.length) invalid("invalid PNG palette index");
          rgba = [palette[p], palette[p + 1], palette[p + 2], transparency && v[0] < transparency.length ? transparency[v[0]] : 255];
        } else if (type === 0 || type === 4) {
          const g = byte(v[0]), a = type === 4 ? byte(v[1]) : transparency && v[0] === transparency.readUInt16BE(0) ? 0 : 255;
          rgba = [g, g, g, a];
        } else {
          const a = type === 6 ? byte(v[3]) : transparency && v.every((n, i) => n === transparency.readUInt16BE(i * 2)) ? 0 : 255;
          rgba = [byte(v[0]), byte(v[1]), byte(v[2]), a];
        }
        pixels.set(rgba, at);
      }
      previous = row;
    }
  }
  if (offset !== raw.length) invalid("unexpected PNG pixel data");
  return { width, height, channels: 4, pixels };
}

// Bedrock's true-colour TGA files, raw or RLE, with either vertical and horizontal origin.
function decodeTga(bytes, name) {
  const invalid = message => { throw new Error(name + ": " + message); };
  if (bytes.length < 18) invalid("invalid TGA header");
  const width = bytes.readUInt16LE(12), height = bytes.readUInt16LE(14), type = bytes[2], bits = bytes[16], flags = bytes[17];
  if (!width || !height || bytes[1] || ![2, 10].includes(type) || ![24, 32].includes(bits)) invalid("unsupported TGA format");
  const step = bits / 8, pixels = Buffer.alloc(width * height * 4);
  let offset = 18 + bytes[0], count = 0;
  const put = at => {
    if (at + step > bytes.length || count >= width * height) invalid("truncated or oversized TGA pixels");
    const x = count % width, y = Math.floor(count / width), to = ((flags & 32 ? y : height - 1 - y) * width + (flags & 16 ? width - 1 - x : x)) * 4;
    pixels.set([bytes[at + 2], bytes[at + 1], bytes[at], step === 4 ? bytes[at + 3] : 255], to);
    count++;
  };
  while (count < width * height) {
    if (offset >= bytes.length) invalid("truncated TGA pixels");
    const packet = type === 10 ? bytes[offset++] : 0, length = (packet & 127) + 1;
    for (let i = 0; i < length; i++) { put(offset); if (!(packet & 128)) offset += step; }
    if (packet & 128) offset += step;
  }
  return { width, height, channels: 4, pixels };
}
function encodePng({ width, height, pixels }) {
  const chunk = (type, data) => {
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length); out.write(type, 4); data.copy(out, 8);
    out.writeUInt32BE(zlib.crc32(out.subarray(4, -4)), out.length - 4);
    return out;
  };
  const header = Buffer.alloc(13), raw = Buffer.alloc((width * 4 + 1) * height);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  for (let y = 0; y < height; y++) pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

module.exports = { decodePng, decodeTga, encodePng, materialPolicy, entityTextureImages };
