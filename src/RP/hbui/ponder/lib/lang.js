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

  // ItemStack.getHoverName: the vanilla name key, tile.* for blocks and item.* otherwise.
  P.itemName = function (id) {
    const path = id.replace(/^minecraft:/, "").replace(":", ".");
    const tile = `tile.${path}.name`, item = `item.${path}.name`;
    if (P.hasTranslation(tile)) return P.translate(tile);
    if (P.hasTranslation(item)) return P.translate(item);
    return tile;
  };
})();
