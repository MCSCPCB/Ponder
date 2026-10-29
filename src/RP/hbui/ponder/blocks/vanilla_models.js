// Vanilla's blocks that are not a plain cube: levers, buttons, pistons, repeaters, stairs,
// fences... Their shapes are Scaffold's (github.com/EvilSlimeLabs/Scaffold), which tools/adapter
// puts into vanilla_blocks.json ("shapes", with Scaffold's licence beside it). A shape family has
// forms, each a few cubes in a .geo.json's frame (blocks from the cell's low corner, x mirrored,
// the block at rest facing north), and rules: which form a block's states pick, which state turns
// it (Minecraft's angles, shapes.rotations) and which entry of a texture list its faces read. A
// face reads what the block declares for it in blocks.json, unless it names a slot (what the
// block declares for another face) or a file.
(function () {
  const P = window.Ponder, M = P.Mat;
  const shapes = () => P.vanilla.shapes;
  const FACES = ["up", "down", "north", "south", "west", "east"];

  // A state's value as Scaffold matches it: true and false as 1 and 0.
  const plain = v => (typeof v === "boolean" ? (v ? "1" : "0") : String(v));
  const matches = (states, when) => Object.keys(when).every(s => {
    if (!(s in states)) return false;
    const wanted = Array.isArray(when[s]) ? when[s] : [when[s]];
    return wanted.some(w => plain(w) === plain(states[s]));
  });
  // The form drawn: the first of "<mounting>-<value>", "<value>", "<mounting>" and "default" the
  // family has, the mounting from the first `pick` rule that matches, the value from `data`.
  function formOf(family, states) {
    const pick = (family.pick || []).filter(r => matches(states, r.when))[0];
    const mount = pick ? pick.form : "default", data = family.data || {};
    let value = "0";
    (data.number || []).forEach(s => { if (s in states) value = String(parseInt(plain(states[s]), 10)); });
    const joined = (data.join || []).filter(s => s in states).map(s => plain(states[s]));
    if (joined.length) value = joined.join("-");
    return [mount + "-" + value, value, mount].filter(n => n in family.forms)[0] || "default";
  }
  // The value of the state the block turns by: the first `turn_by` rule whose state it has.
  function turnOf(family, states) {
    const rule = (family.turn_by || []).filter(r => r.state && r.state in states && matches(states, r.when || {}))[0];
    return rule ? plain(states[rule.state]) : null;
  }
  // Which entry of a texture list the faces read (`texture_by`), or null.
  function textureIndexOf(family, states) {
    const r = family.texture_by;
    if (!r) return null;
    if (r.join) {
      const present = r.join.filter(s => s in states).map(s => plain(states[s])).join("-");
      return present && r.values[present] != null ? r.values[present] : null;
    }
    if (!(r.state in states)) return null;
    const v = plain(states[r.state]);
    return r.values ? (r.values[v] != null ? r.values[v] : null) : parseInt(v, 10);
  }
  // Which entry of a list several blocks share is this block's, by its name: the longest leading
  // part of the id that names exactly one entry (oak doors read the oak door's). Else the first.
  function namedEntry(name, list) {
    const parts = name.split("_"), files = list.map(e => (e ? e.split("/").pop() : ""));
    for (let end = parts.length; end > 0; end--) {
      const stem = parts.slice(0, end).join("_");
      const found = files.map((f, i) => (f.split("_").indexOf(stem) >= 0 || ("_" + f + "_").indexOf("_" + stem + "_") >= 0 ? i : -1)).filter(i => i >= 0);
      if (found.length === 1) return found[0];
      if (found.length) return 0;
    }
    return 0;
  }
  // The texture path a face reads, or null: its own file; else what the block declares for the
  // face (or for the slot it names), the entry of that list its state, or else its name, picks.
  function facePath(name, face, texture, index) {
    if (texture && texture.texture) return texture.texture;
    const declared = shapes().faces[name];
    if (!declared) return null;
    const terrain = typeof declared === "string" ? declared : declared[(texture && texture.slot) || face];
    const list = terrain && shapes().terrain[terrain];
    if (!list || !list.length) return null;
    return list[Math.min(index != null ? index : namedEntry(name, list), list.length - 1)] || null;
  }

  const isWhole = c => c.size.every(v => v === 1) && c.offset.every(v => v === 0);
  // A turn as a .geo.json bone makes it about `pivot` (cell space): about z, then y, then x, and x
  // and y the other way since the frame is x mirrored.
  function bone(m, pivot, r) {
    if (!r || !r.some(Boolean)) return m;
    m = M.translate(m, pivot[0], pivot[1], pivot[2]);
    m = M.rotX(M.rotY(M.rotZ(m, r[2]), -r[1]), -r[0]);
    return M.translate(m, -pivot[0], -pivot[1], -pivot[2]);
  }

  // The model of a vanilla block with a shape, or null for one drawn as a plain cube (a whole
  // cube that nothing turns, re-textures or picks a texture for keeps blocks.json's inventory
  // look). shape "model", as an add-on's (block_models.js).
  const cache = new Map();
  P.vanillaShapeModel = function (block) {
    const name = P.blockId(block).replace(/^minecraft:/, ""), family = shapes().blocks[name];
    if (!family) return null;
    const key = JSON.stringify(block);
    if (!cache.has(key)) cache.set(key, build(block, name, family));
    return cache.get(key);
  };
  function build(block, name, familyName) {
    const id = P.blockId(block);
    if (familyName === "ignore") return { id, shape: "model", quads: [], faces: {}, tint: null, full: false, opaque: false };
    const family = shapes().families[familyName];
    if (!family) return null;
    const states = P.blockStates(block), formName = formOf(family, states), form = family.forms[formName];
    const turn = turnOf(family, states), table = shapes().rotations[familyName];
    const angles = turn != null && table ? table[formName + ":" + turn] || table[turn] || null : null;
    const turned = !!angles && angles.some(Boolean), index = textureIndexOf(family, states);
    const only = form.cubes.length === 1 && form.cubes[0];
    if (only && isWhole(only) && !turned && index == null && FACES.every(f => !only.faces[f] || !only.faces[f].texture)) return null;
    // Minecraft's angles about the form's centre, as the bone Scaffold writes would turn.
    const m = turned ? bone(M.id(), [1 - form.center[0], form.center[1], form.center[2]], [angles[0], -angles[1], -angles[2]]) : M.id();
    const tint = id === "minecraft:redstone_wire" ? P.wireColor(states.redstone_signal || 0) : null;
    const quads = [];
    form.cubes.forEach(c => {
      const o = c.offset, s = c.size;
      const lo = [1 - o[0] - s[0], o[1], o[2]], hi = [1 - o[0], o[1] + s[1], o[2] + s[2]];
      const t = c.rotation ? bone(m, [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], c.rotation) : m;
      Object.keys(c.faces).forEach(face => {
        const f = c.faces[face], tex = f.texture || null, p = facePath(name, face, tex, index), entry = p && P.vanilla.textures[p];
        if (!entry) return;
        let u0 = f.uv[0], v0 = f.uv[1], u1 = u0 + f.size[0], v1 = v0 + f.size[1];
        if (face === "up" || face === "down") { [u0, u1] = [u1, u0]; [v0, v1] = [v1, v0]; }
        P.blockBox(quads, t, lo, hi, face, [u0, v0, u1, v1], {
          tex: P.textureOf(entry), window: tex && tex.window, turn: (tex && tex.turn) || 0, crop: true,
          tint: !!(tex && tex.tint), dim: true, solid: true, twoSided: false });
      });
    });
    const whole = !!only && isWhole(only) && (!angles || angles.every(a => a % 90 === 0));
    const first = quads[0] ? quads[0].look.tex.url : null, faces = {};
    FACES.forEach(f => { const p = facePath(name, f, null, index), e = p && P.vanilla.textures[p]; faces[f] = e ? P.textureOf(e).url : first; });
    return { id, shape: "model", quads, faces, tint, full: whole, opaque: whole && !P.isTransparent(name) };
  }

  // Redstone dust's joins. Bedrock keeps none before 26.60 (redstone_<side> after), so they are
  // worked out from the blocks round it, as the game does when it draws and with Scaffold's
  // rules (shapes.dust): each side "none", "side" or "up", handed to the dust's family as the
  // states scaffold:dust_<side>.
  const SIDES = { north: [0, 0, -1], east: [1, 0, 0], south: [0, 0, 1], west: [-1, 0, 0] };
  const OPPOSITE = { north: "south", south: "north", east: "west", west: "east", up: "down", down: "up" };
  const EVERY = ["north", "south", "east", "west", "up", "down"];
  const patterns = new Map();
  // A block id against a shell pattern (* and ?), minecraft: optional on either.
  function named(pattern, id) {
    const test = p => {
      let re = patterns.get(p);
      if (!re) patterns.set(p, (re = new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$")));
      return re;
    };
    return test(pattern).test(id) || test(pattern.replace(/^minecraft:/, "")).test(id.replace(/^minecraft:/, ""));
  }
  function listed(entries, block) {
    const id = P.blockId(block), states = P.blockStates(block);
    return entries.some(e => (typeof e === "string" ? named(e, id)
      : named(e.block, id) && Object.keys(e.when || {}).every(s => s in states && e.when[s].some(v => plain(v) === plain(states[s])))));
  }
  // The sides of a block that draw dust toward them.
  function drawsToward(block) {
    const d = shapes().dust, id = P.blockId(block), states = P.blockStates(block);
    const rule = d.attract.filter(r => r.blocks.some(p => named(p, id)))[0];
    if (!rule) return [];
    if (rule.faces === "all") return EVERY;
    const front = rule.facing && rule.facing.state in states ? d.directions[rule.facing.by][plain(states[rule.facing.state])] : null;
    const out = [];
    rule.faces.forEach(f => {
      if (EVERY.indexOf(f) >= 0) out.push(f);
      else if (front && f === "front") out.push(front);
      else if (front && f === "back") out.push(OPPOSITE[front]);
      else if (front && f === "sides") EVERY.forEach(s => { if (s !== front && s !== OPPOSITE[front]) out.push(s); });
    });
    return out;
  }
  const isDust = b => !!b && listed(shapes().dust.dust, b);
  const solid = b => !!b && P.blockModel(b).full;
  const conductor = b => !!b && !listed(shapes().dust.not_conductors, b) && solid(b);
  const holdsDust = b => !!b && (conductor(b) || listed(shapes().dust.holds_dust, b));
  // The dust at x, y, z of `world` with its joins as states, or any other block as it is.
  P.withDustJoins = function (world, x, y, z, block) {
    if (!block || !shapes().dust || !isDust(block)) return block;
    const states = P.blockStates(block), joins = {};
    if (Object.keys(SIDES).every(s => /^(none|side|up)$/.test(states["redstone_" + s]))) {
      Object.keys(SIDES).forEach(s => { joins["scaffold:dust_" + s] = states["redstone_" + s]; });
      return P.withStates(block, joins);
    }
    const at = (dx, dy, dz) => world.getBlock(x + dx, y + dy, z + dz);
    const clearAbove = !conductor(at(0, 1, 0));
    Object.keys(SIDES).forEach(side => {
      const d = SIDES[side], beside = at(d[0], 0, d[2]);
      let joined = "none";
      if (clearAbove && isDust(at(d[0], 1, d[2])) && holdsDust(beside)) joined = solid(beside) ? "up" : "side";
      else if (beside && drawsToward(beside).indexOf(OPPOSITE[side]) >= 0) joined = "side";
      else if (!conductor(beside) && isDust(at(d[0], -1, d[2]))) joined = "side";
      joins["scaffold:dust_" + side] = joined;
    });
    return P.withStates(block, joins);
  };
})();
