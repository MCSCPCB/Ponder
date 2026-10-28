// Named Binary Tag reader. Java's NbtIo (big-endian, usually gzipped) and Bedrock's
// .mcstructure (little-endian, uncompressed) differ only in byte order.
(function () {
  const P = window.Ponder;

  function read(buffer, littleEndian) {
    const view = new DataView(buffer), utf8 = new TextDecoder("utf-8");
    let at = 0;
    const u8 = () => view.getUint8(at++);
    const i16 = () => { const v = view.getInt16(at, littleEndian); at += 2; return v; };
    const i32 = () => { const v = view.getInt32(at, littleEndian); at += 4; return v; };
    const string = () => {
      const n = view.getUint16(at, littleEndian);
      at += 2;
      const s = utf8.decode(new Uint8Array(buffer, at, n));
      at += n;
      return s;
    };
    const array = (n, next) => { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = next(); return a; };
    // Longs come back as numbers; positions and palettes never need more than 53 bits.
    const payload = type => {
      switch (type) {
        case 1: return view.getInt8(at++);
        case 2: return i16();
        case 3: return i32();
        case 4: { const hi = i32(), lo = i32(); return littleEndian ? lo * 4294967296 + (hi >>> 0) : hi * 4294967296 + (lo >>> 0); }
        case 5: { const v = view.getFloat32(at, littleEndian); at += 4; return v; }
        case 6: { const v = view.getFloat64(at, littleEndian); at += 8; return v; }
        case 7: return array(i32(), () => view.getInt8(at++));
        case 8: return string();
        case 9: { const t = u8(); return array(i32(), () => payload(t)); }
        case 10: {
          const out = {};
          for (let t = u8(); t !== 0; t = u8()) { const name = string(); out[name] = payload(t); }
          return out;
        }
        case 11: return array(i32(), i32);
        case 12: return array(i32(), () => payload(4));
      }
      throw new Error("NBT tag type " + type + " at " + at);
    };
    const type = u8();
    string(); // root name
    return payload(type);
  }

  // Gunzips through the engine's DecompressionStream when the data starts with 1f 8b.
  function inflate(buffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return Promise.resolve(buffer);
    const stream = new DecompressionStream("gzip"), writer = stream.writable.getWriter(), reader = stream.readable.getReader();
    writer.write(bytes);
    writer.close();
    const chunks = [];
    const pump = () => reader.read().then(r => {
      if (!r.done) { chunks.push(r.value); return pump(); }
      const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let at = 0;
      chunks.forEach(c => { out.set(c, at); at += c.length; });
      return out.buffer;
    });
    return pump();
  }

  P.NBT = { read, inflate };
})();
