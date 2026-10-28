// I18n.get through the game's language table: coreTranslateCommandGroup.translate(key, args),
// as vanilla's Ore UI does. Ponder's strings are in RP/texts/*.lang under Java's keys
// (ponder.ui.*, <namespace>.ponder.<scene>.*); a missing key comes back as the key itself.
(function () {
  const P = window.Ponder;

  P.translate = function (key) {
    const args = Array.prototype.slice.call(arguments, 1).map(String);
    const group = window.__commands__.coreTranslateCommandGroup;
    // Bedrock .lang files write line breaks as ~LINEBREAK~.
    return group.translate.callable.call(group.translate, key, args).split("~LINEBREAK~").join("\n");
  };
  // Language.has: the table knows the key.
  P.hasTranslation = key => P.translate(key) !== key;

  // PonderLocalization: text registered by a scene or tag in English (Java's datagen default),
  // shown through its key when the .lang files have it.
  P.localize = (key, fallback) => {
    const text = P.translate(key);
    return text === key && fallback != null ? fallback : text;
  };

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
    const [tile, item] = P.nameKeys(id);
    if (P.hasTranslation(tile)) return P.translate(tile);
    if (P.hasTranslation(item)) return P.translate(item);
    return tile;
  };
})();
