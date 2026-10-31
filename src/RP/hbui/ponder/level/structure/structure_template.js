// StructureTemplate: the schematic a scene is built on, loaded like PonderScene's
// loadSchematic from hbui/ponder_addons/<modId>/structures/<path>.mcstructure. Blocks become
// { size: {x, y, z}, blocks: [{ pos, block: { id, states } }] }.
(function () {
  const P = window.Ponder;
  const BASE = "/hbui/";
  const templates = new Map();

  // block_indices[0] is the block layer, indexed z fastest, then y, then x; -1 is nothing.
  // block_indices[1] is the water a waterlogged block holds, and block_position_data, by the same
  // index, a block's block entity (as StructureTemplate keeps a block's NBT).
  function fromTag(tag) {
    const [sx, sy, sz] = tag.size, s = tag.structure, indices = s.block_indices[0], liquids = s.block_indices[1] || [];
    const palette = s.palette.default.block_palette.map(b => P.block(b.name, b.states)), data = s.palette.default.block_position_data || {};
    const blocks = [];
    for (let x = 0, i = 0; x < sx; x++) for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++, i++) {
      if (indices[i] < 0) continue;
      const entity = data[i] && data[i].block_entity_data;
      const liquid = liquids[i] >= 0 ? palette[liquids[i]] : null;
      blocks.push({ pos: [x, y, z], block: liquid || entity ? P.block(P.blockId(palette[indices[i]]), P.blockStates(palette[indices[i]]), { liquid, nbt: entity }) : palette[indices[i]] });
    }
    return { size: { x: sx, y: sy, z: sz }, blocks };
  }

  P.structureFromTag = fromTag;

  function load(path) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", BASE + path);
      xhr.responseType = "arraybuffer";
      xhr.onload = () => (xhr.status === 200 || xhr.status === 0 ? resolve(xhr.response) : reject(new Error("HTTP " + xhr.status)));
      xhr.onerror = () => reject(new Error("XHR error"));
      xhr.send();
    }).then(buffer => fromTag(P.NBT.read(buffer)));
  }

  // Reads every scene's structure before Ponder opens; compiling a scene stays synchronous.
  P.loadStructures = function (paths) {
    return Promise.all(paths.map(path => load(path).then(t => {
      templates.set(path, t);
      P.log("structure", path, `${t.size.x}x${t.size.y}x${t.size.z}`, t.blocks.length + " blocks");
    }, e => P.log("structure failed", path, String(e)))));
  };

  // PonderScene.loadSchematic: a structure that failed to load is an empty one.
  P.structureTemplate = path => templates.get(path) || { size: { x: 0, y: 0, z: 0 }, blocks: [] };

  // StructureTemplate.placeInWorld
  P.placeStructure = function (world, template) {
    template.blocks.forEach(b => world.setBlock(b.pos[0], b.pos[1], b.pos[2], b.block));
  };
})();
