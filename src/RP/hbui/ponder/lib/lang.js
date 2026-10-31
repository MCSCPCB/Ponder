// I18n.get through the game's language table: coreTranslateCommandGroup.translate(key, args),
// as vanilla's Ore UI does. Ponder's strings are in RP/texts/*.lang under Java's keys
// (ponder.ui.*, <namespace>.ponder.<scene>.*); a missing key comes back as the key itself.
(function () {
  const P = window.Ponder;
  P.registeredText = new Map();
  P.registerText = (key, text) => P.registeredText.set(key, text);

  // java.util.Formatter's conversions over JS values. Numeric rounding works on decimal
  // digits, so 2.675 rounds as Formatter does instead of Number.toFixed's binary tie.
  const pad = (value, width, ch) => String(value).padStart(width, ch || "0");
  function decimal(value, precision) {
    const parts = value.toString().split("e"), digits = parts[0].replace(".", "");
    const point = (parts[0].indexOf(".") < 0 ? parts[0].length : parts[0].indexOf(".")) + +(parts[1] || 0), end = point + precision;
    let kept = end > 0 ? digits.slice(0, end).padEnd(end, "0") : "0";
    if (end >= 0 && +(digits[end] || 0) >= 5) {
      const list = kept.split(""); let carry = 1;
      for (let i = list.length - 1; i >= 0 && carry; i--) { const n = +list[i] + carry; list[i] = n % 10; carry = n > 9 ? 1 : 0; }
      kept = (carry ? "1" : "") + list.join("");
    }
    kept = kept.padStart(precision + 1, "0");
    return precision ? kept.slice(0, -precision) + "." + kept.slice(-precision) : kept;
  }
  function scientific(value, precision) {
    const p = value.toExponential().split("e"); let exponent = +p[1], mantissa = decimal(+p[0], precision);
    if (+mantissa >= 10) { exponent++; mantissa = decimal(1, precision); }
    return mantissa + "e" + (exponent < 0 ? "-" : "+") + pad(Math.abs(exponent), 2);
  }
  function hexadecimal(value, precision) {
    if (!value) return "0x0." + "0".repeat(Math.max(1, precision || 0)) + "p0";
    const bits = new DataView(new ArrayBuffer(8)); bits.setFloat64(0, value);
    const high = bits.getUint32(0), power = (high >>> 20) & 2047;
    let exponent = power ? power - 1023 : -1022, leading = power ? 1 : 0, fraction = pad((high & 0xfffff).toString(16), 5) + pad(bits.getUint32(4).toString(16), 8);
    if (precision !== undefined && precision < 13) {
      const count = Math.max(1, precision);
      if (!power) { exponent = Math.floor(Math.log2(value)); return hexadecimal(value / Math.pow(2, exponent), count).replace(/p0$/, "p" + exponent); }
      let kept = parseInt(leading + fraction.slice(0, count), 16);
      const rest = fraction.slice(count), round = parseInt(rest[0], 16);
      if (round > 8 || round === 8 && (/[1-9a-f]/.test(rest.slice(1)) || kept % 2)) kept++;
      if (kept >= 2 * Math.pow(16, count)) { kept /= 2; exponent++; }
      const out = kept.toString(16).padStart(count + 1, "0"); leading = +out[0]; fraction = out.slice(1);
    } else fraction = precision === undefined ? fraction.replace(/0+$/, "") || "0" : fraction.padEnd(precision, "0");
    return "0x" + leading + "." + fraction + "p" + exponent;
  }
  const hashes = new WeakMap(); let nextHash = 0;
  function hash(value) {
    if (value && typeof value.hashCode === "function") return value.hashCode() >>> 0;
    if (typeof value === "string") { let n = 0; for (let i = 0; i < value.length; i++) n = Math.imul(n, 31) + value.charCodeAt(i) | 0; return n >>> 0; }
    if (typeof value === "boolean") return value ? 1231 : 1237;
    if (typeof value === "number") { if (Number.isInteger(value)) return value >>> 0; const data = new DataView(new ArrayBuffer(8)); data.setFloat64(0, value); return (data.getUint32(0) ^ data.getUint32(4)) >>> 0; }
    if (!hashes.has(value)) hashes.set(value, ++nextHash);
    return hashes.get(value);
  }
  function datePart(value, kind) {
    if (!(typeof value === "number" && Number.isSafeInteger(value)) && Object.prototype.toString.call(value) !== "[object Date]") throw new TypeError("Invalid date format argument");
    const d = new Date(Number(value));
    if (!Number.isFinite(d.getTime())) throw new TypeError("Invalid date format argument");
    const year = d.getFullYear(), hour = d.getHours(), minute = d.getMinutes(), second = d.getSeconds();
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const zone = () => {
      const parts = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(d);
      return parts.find(p => p.type === "timeZoneName").value;
    };
    const offset = -d.getTimezoneOffset(), clock = pad(hour, 2) + ":" + pad(minute, 2);
    const fields = {
      H: () => pad(hour, 2), I: () => pad(hour % 12 || 12, 2), k: () => String(hour), l: () => String(hour % 12 || 12), M: () => pad(minute, 2), S: () => pad(second, 2),
      L: () => pad(d.getMilliseconds(), 3), N: () => pad(d.getMilliseconds() * 1000000, 9), p: () => hour < 12 ? "am" : "pm", z: () => (offset < 0 ? "-" : "+") + pad(Math.floor(Math.abs(offset) / 60), 2) + pad(Math.abs(offset) % 60, 2), Z: zone,
      s: () => String(Math.trunc(d.getTime() / 1000)), Q: () => String(d.getTime()), B: () => months[d.getMonth()], b: () => months[d.getMonth()].slice(0, 3), h: () => months[d.getMonth()].slice(0, 3),
      A: () => days[d.getDay()], a: () => days[d.getDay()].slice(0, 3), C: () => pad(Math.floor(year / 100), 2), Y: () => pad(year, 4), y: () => pad(year % 100, 2),
      j: () => pad(Math.round((Date.UTC(year, d.getMonth(), d.getDate()) - Date.UTC(year, 0, 1)) / 86400000) + 1, 3), m: () => pad(d.getMonth() + 1, 2), d: () => pad(d.getDate(), 2), e: () => String(d.getDate()),
      R: () => clock, T: () => clock + ":" + pad(second, 2), r: () => pad(hour % 12 || 12, 2) + ":" + pad(minute, 2) + ":" + pad(second, 2) + (hour < 12 ? " AM" : " PM"),
      D: () => pad(d.getMonth() + 1, 2) + "/" + pad(d.getDate(), 2) + "/" + pad(year % 100, 2), F: () => pad(year, 4) + "-" + pad(d.getMonth() + 1, 2) + "-" + pad(d.getDate(), 2),
      c: () => days[d.getDay()].slice(0, 3) + " " + months[d.getMonth()].slice(0, 3) + " " + pad(d.getDate(), 2) + " " + clock + ":" + pad(second, 2) + " " + zone() + " " + pad(year, 4),
    };
    if (!fields[kind]) throw new Error("Unknown date conversion: " + kind);
    return fields[kind]();
  }
  P.format = function (text, ...args) {
    text = String(text);
    let next = 0, previous = -1, end = 0, result = "";
    for (let start = text.indexOf("%"); start >= 0; start = text.indexOf("%", end)) {
      result += text.slice(end, start);
      const m = /^%(?:(\d+)\$)?([-#+ 0,(<]*)(\d+)?(?:\.(\d+))?([tT][a-zA-Z]|[a-zA-Z%])/.exec(text.slice(start));
      if (!m) throw new Error("Invalid format at " + text.slice(start));
      end = start + m[0].length;
      const index = m[1], flags = m[2], width = +m[3] || 0, precision = m[4] === undefined ? undefined : +m[4], conversion = m[5], date = conversion.length === 2, kind = date ? "t" : conversion.toLowerCase();
      const has = flag => flags.includes(flag), invalid = message => { throw new Error(message + ": " + m[0]); };
      if (new Set(flags).size !== flags.length) invalid("Duplicate format flag");
      if (width > 10000 || precision > 1000) invalid("Format is too large");
      if ((has("-") || has("0")) && !width || has("+") && has(" ") || has("-") && has("0")) invalid("Conflicting format flags");
      const allowed = { s: "-#<", b: "-<", h: "-<", c: "-<", d: "-+ 0,(<", o: "-#0<", x: "-#0<", f: "-#+ 0,(<", e: "-#+ 0(<", g: "-+ 0,(<", a: "-#+ 0<", t: "-<", "%": "-", n: "" }[kind];
      if (allowed === undefined || Array.from(flags).some(f => !allowed.includes(f))) invalid("Invalid format conversion or flag");
      if (date && !"HIk lMSLNpzZsQBbhAaCYyjmdeRTrDFc".replace(/ /g, "").includes(conversion[1])) invalid("Unknown date conversion");
      if (precision !== undefined && !"sbhfega".includes(kind) || kind === "n" && width) invalid("Invalid format precision or width");
      if (kind === "n") { result += "\n"; continue; }
      let value = null;
      if (kind !== "%") {
        const at = has("<") ? previous : index ? +index - 1 : next++;
        if (at < 0 || at >= args.length) invalid("Missing format argument");
        previous = at; value = args[at];
      }
      let out, prefix = "", suffix = "", numeric = false;
      if (kind === "%") out = "%";
      else if (value == null) out = kind === "b" ? "false" : "null";
      else if (date) out = datePart(value, conversion[1]);
      else if (kind === "s") {
        if (value && typeof value.formatTo === "function") {
          let str = ""; const formatter = { append: s => { str += s; return formatter; } };
          value.formatTo(formatter, (has("-") ? 1 : 0) | (conversion === "S" ? 2 : 0) | (has("#") ? 4 : 0), m[3] ? width : -1, precision === undefined ? -1 : precision);
          result += str; continue;
        }
        if (has("#")) invalid("Alternate string format requires formatTo");
        out = String(value);
      } else if (kind === "b") out = value === false ? "false" : "true";
      else if (kind === "h") out = hash(value).toString(16);
      else if (kind === "c") {
        if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0x10ffff) out = String.fromCodePoint(value);
        else if (typeof value === "string" && Array.from(value).length === 1) out = value;
        else invalid("Invalid character argument");
      } else {
        if (typeof value !== "number" || "dox".includes(kind) && !Number.isSafeInteger(value)) invalid("Invalid numeric argument");
        numeric = true;
        const negative = value < 0 || Object.is(value, -0), absolute = Math.abs(value), digits = precision === undefined ? 6 : precision;
        if (Number.isNaN(value)) { out = "NaN"; numeric = false; }
        else {
          prefix = negative ? has("(") ? "(" : "-" : has("+") ? "+" : has(" ") ? " " : "";
          suffix = negative && has("(") ? ")" : "";
          if (!Number.isFinite(value)) { out = "Infinity"; numeric = false; }
          else if (kind === "d") out = absolute.toString();
          else if (kind === "x" || kind === "o") {
            prefix = has("#") ? kind === "x" ? "0x" : "0" : "";
            const radix = kind === "x" ? 16 : 8;
            if (value >= -2147483648) out = (value < 0 ? value >>> 0 : value).toString(radix);
            else {
              let lo = -value >>> 0, hi = Math.floor(-value / 4294967296);
              hi = (~hi + (lo === 0 ? 1 : 0)) >>> 0; lo = -lo >>> 0; out = "";
              do { const carry = hi % radix * 4294967296 + lo; out = (carry % radix).toString(radix) + out; hi = Math.floor(hi / radix); lo = Math.floor(carry / radix); } while (hi || lo);
            }
          }
          else if (kind === "f") out = decimal(absolute, digits);
          else if (kind === "e") out = scientific(absolute, digits);
          else if (kind === "a") { out = hexadecimal(absolute, precision).slice(2); prefix += "0x"; }
          else {
            const sig = Math.max(1, digits), rounded = scientific(absolute, sig - 1), exponent = +rounded.split("e")[1];
            out = exponent < -4 || exponent >= sig ? rounded : decimal(absolute, Math.max(0, sig - 1 - exponent));
          }
          if (has("#") && "fe".includes(kind) && !out.includes(".")) out = out.replace(/e|$/, match => "." + match);
          if (has(",")) out = out.replace(/^\d+/, n => n.replace(/\B(?=(\d{3})+(?!\d))/g, ","));
        }
      }
      if ("sbh".includes(kind) && precision !== undefined) out = out.slice(0, precision);
      if ((date ? conversion[0] === "T" : conversion !== kind)) { out = out.toUpperCase(); prefix = prefix.toUpperCase(); }
      const fill = Math.max(0, width - prefix.length - out.length - suffix.length), padding = (numeric && has("0") ? "0" : " ").repeat(fill);
      result += has("-") ? prefix + out + suffix + padding : numeric && has("0") ? prefix + padding + out + suffix : padding + prefix + out + suffix;
    }
    return result + text.slice(end);
  };

  P.translate = function (key) {
    const args = Array.prototype.slice.call(arguments, 1).map(String);
    const group = window.__commands__.coreTranslateCommandGroup;
    // Bedrock .lang files write line breaks as ~LINEBREAK~.
    return group.translate.callable.call(group.translate, key, args).split("~LINEBREAK~").join("\n");
  };
  // Language.has: the table knows the key.
  P.hasTranslation = key => P.translate(key) !== key;

  // PonderLocalization: missing translations show their key, as in Java's player view.
  P.localize = key => P.translate(key);

  // Bedrock's flattened block ids keep the names of the blocks they were split from: vanilla's
  // .lang has tile.wool.white.name, not tile.white_wool.name. Colour words come in two spellings.
  const COLOR = "(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|silver|cyan|purple|blue|brown|green|red|black)";
  const snake = c => (c === "light_gray" ? "silver" : c);
  const camel = c => snake(c).replace(/_(.)/g, (m, ch) => ch.toUpperCase());
  const upper = c => camel(c).replace(/^./, ch => ch.toUpperCase());
  const WOOD = "(oak|spruce|birch|jungle|acacia|dark_oak)";
  const big = w => (w === "dark_oak" ? "big_oak" : w);
  const LEGACY = [
    [RegExp(`^${COLOR}_stained_glass$`), m => `stained_glass.${snake(m[1])}`],
    [RegExp(`^${COLOR}_stained_glass_pane$`), m => `stained_glass_pane.${snake(m[1])}`],
    [RegExp(`^${COLOR}_glazed_terracotta$`), m => `glazedTerracotta.${snake(m[1])}`],
    [RegExp(`^${COLOR}_terracotta$`), m => `stained_hardened_clay.${camel(m[1])}`],
    [RegExp(`^${COLOR}_wool$`), m => `wool.${camel(m[1])}`],
    [RegExp(`^${COLOR}_carpet$`), m => `carpet.${camel(m[1])}`],
    [RegExp(`^${COLOR}_concrete$`), m => `concrete.${camel(m[1])}`],
    [RegExp(`^${COLOR}_concrete_powder$`), m => `concretePowder.${camel(m[1])}`],
    [RegExp(`^${COLOR}_shulker_box$`), m => `shulkerBox${upper(m[1])}`],
    [RegExp(`^${WOOD}_log$`), m => `log.${big(m[1])}`],
    [RegExp(`^${WOOD}_planks$`), m => `planks.${big(m[1])}`],
    [RegExp(`^${WOOD}_leaves$`), m => `leaves.${big(m[1])}`],
    [RegExp(`^${WOOD}_sapling$`), m => `sapling.${big(m[1])}`],
    [RegExp(`^${WOOD}_slab$`), m => `wooden_slab.${big(m[1])}`],
    [RegExp(`^${WOOD}_wood$`), m => `wood.${m[1]}`],
    [RegExp(`^stripped_${WOOD}_wood$`), m => `wood.stripped.${m[1]}`],
    [/^(granite|diorite|andesite)$/, m => `stone.${m[1]}`],
    [/^polished_(granite|diorite|andesite)$/, m => `stone.${m[1]}Smooth`],
    [/^(mossy|cracked|chiseled)_stone_bricks$/, m => `stonebrick.${m[1]}`],
    [/^stone_bricks$/, () => "stonebrick.default"],
    [/^stone$/, () => "stone.stone"],
    [/^bricks$/, () => "brick_block"],
    [/^terracotta$/, () => "hardened_clay"],
    [/^grass_block$/, () => "grass"],
    [/^dirt_path$/, () => "grass_path"],
    [/^coarse_dirt$/, () => "dirt.coarse"],
    [/^red_sand$/, () => "sand.red"],
    [/^(chiseled|cut|smooth)_(red_sandstone|sandstone)$/, m => `${m[2]}.${m[1]}`],
    [/^(chiseled|smooth)_quartz(_block)?$/, m => `quartz_block.${m[1]}`],
    [/^quartz_pillar$/, () => "quartz_block.lines"],
    [/^(sponge)$/, () => "sponge.dry"],
    [/^wet_sponge$/, () => "sponge.wet"],
  ];
  function legacyPath(path) {
    for (const [re, key] of LEGACY) {
      const m = path.match(re);
      if (m) return key(m);
    }
    return path;
  }

  // ItemStack.getHoverName: the vanilla name key, tile.* for blocks and item.* otherwise.
  P.nameKeys = function (id) {
    const name = id.replace(/^minecraft:/, "");
    const path = (name === id ? name : legacyPath(name)).replace(":", ".");
    return [`tile.${path}.name`, `item.${path}.name`];
  };
  P.itemName = function (id) {
    const registry = P.vanilla && P.vanilla.registry, definition = P.addonItems && P.addonItems.get(id);
    const known = definition && definition.name || registry && (registry.names[id] || registry.items[id]);
    if (known && P.hasTranslation(known)) return P.translate(known);
    if (known && P.hasTranslation(known.replace(/\.name$/, ""))) return P.translate(known.replace(/\.name$/, ""));
    if (/^minecraft:music_disc_/.test(id)) return P.translate("item.record.name");
    const [tile, item] = P.nameKeys(id);
    if (P.hasTranslation(tile)) return P.translate(tile);
    if (P.hasTranslation(item)) return P.translate(item);
    return tile;
  };

  const colors = [0x000000, 0x0000aa, 0x00aa00, 0x00aaaa, 0xaa0000, 0xaa00aa, 0xffaa00, 0xaaaaaa, 0x555555, 0x5555ff, 0x55ff55, 0x55ffff, 0xff5555, 0xff55ff, 0xffff55, 0xffffff];
  const colorNames = "black dark_blue dark_green dark_aqua dark_red dark_purple gold gray dark_gray blue green aqua red light_purple yellow white".split(" ");
  // Component styles inherit through siblings, translation arguments and Bedrock rawtext.
  P.componentRuns = function (value, defaults) {
    const out = [], append = (text, style) => {
      let current = Object.assign({}, style), part = "";
      const flush = () => { if (part) out.push(Object.assign({}, current, { text: part })); part = ""; };
      const chars = Array.from(String(text));
      for (let i = 0; i < chars.length; i++) {
        if (chars[i] !== "§" || i + 1 === chars.length) { part += chars[i]; continue; }
        flush(); const code = chars[++i].toLowerCase(), color = "0123456789abcdef".indexOf(code);
        if (color >= 0) current = Object.assign({}, style, { color: P.color(colors[color]), bold: false, italic: false, underlined: false, strikethrough: false, obfuscated: false });
        else if (code === "r") current = Object.assign({}, style);
        else { const key = { k: "obfuscated", l: "bold", m: "strikethrough", n: "underlined", o: "italic" }[code]; if (key) current[key] = true; }
      }
      flush();
    };
    const visit = (value, inherited) => {
      if (typeof value === "string" && /^[\s]*[\[{\"]/.test(value)) { try { value = JSON.parse(value); } catch (e) { /* literal text */ } }
      if (Array.isArray(value)) {
        if (!value.length) return inherited;
        const parent = visit(value[0], inherited);
        value.slice(1).forEach(v => visit(v, parent)); return parent;
      }
      if (!value || typeof value !== "object") { append(value == null ? "" : value, inherited); return inherited; }
      const style = Object.assign({}, inherited);
      for (const key of ["bold", "italic", "underlined", "strikethrough", "obfuscated"]) if (value[key] != null) style[key] = !!value[key];
      if (value.color != null) {
        const index = colorNames.indexOf(value.color);
        if (index >= 0) style.color = P.color(colors[index]);
        else if (/^#[0-9a-f]{6}$/i.test(value.color)) style.color = P.color(parseInt(value.color.slice(1), 16));
      }
      if (value.text != null) append(value.text, style);
      else if (value.translate) {
        const format = P.translate(value.translate);
        const source = format === value.translate && value.fallback != null ? value.fallback : format;
        const args = value.with || [], pattern = /%%|%(?:(\d+)\$)?s/g;
        let start = 0, index = 0, match;
        while ((match = pattern.exec(source))) {
          append(source.slice(start, match.index), style);
          if (match[0] === "%%") append("%", style);
          else { const at = match[1] ? +match[1] - 1 : index++; if (at < args.length) visit(args[at], style); else append(match[0], style); }
          start = pattern.lastIndex;
        }
        append(source.slice(start), style);
      } else if (value.keybind) append(value.keybind, style);
      else if (value.score && value.score.value != null) append(value.score.value, style);
      (value.rawtext || value.extra || []).forEach(v => visit(v, style));
      return style;
    };
    visit(value, defaults || {});
    return out;
  };
  P.componentText = value => P.componentRuns(value).map(run => run.text).join("");
})();
