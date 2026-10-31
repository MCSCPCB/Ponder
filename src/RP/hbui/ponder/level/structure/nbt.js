// Named Binary Tag reader: Bedrock structures use little-endian; Java structures use big-endian.
// The adapter inflates compressed Java files before passing their bytes to this reader.
(function () {
  const P = window.Ponder;

  function read(buffer, littleEndian) {
    if (littleEndian === undefined) littleEndian = true;
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
    const array = (n, next) => { if (!Number.isInteger(n) || n < 0 || n > view.byteLength - at) throw new RangeError("Invalid NBT array length at " + at); const a = new Array(n); for (let i = 0; i < n; i++) a[i] = next(); return a; };
    // Longs come back as numbers; positions and palettes never need more than 53 bits.
    const payload = type => {
      switch (type) {
        case 1: return view.getInt8(at++);
        case 2: return i16();
        case 3: return i32();
        case 4: { const a = i32(), b = i32(), hi = littleEndian ? b : a, lo = littleEndian ? a : b; return hi * 4294967296 + (lo >>> 0); }
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

  P.NBT = { read };
})();
