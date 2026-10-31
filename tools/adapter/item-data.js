// Bedrock 1.26.51 item information. Java's client data is used only by the renderer.
const source = require("../data/bedrock-1.26.51/items.json");

function value(tag) {
  if (!tag) return null;
  if (tag.type === "compound") return Object.fromEntries(Object.entries(tag.value).map(([key, tag]) => [key, value(tag)]));
  if (tag.type === "list") return tag.value.value.map(entry => value({ type: tag.value.type, value: entry }));
  return tag.value;
}

function itemData(registry) {
  const items = {}, damage = {}, enchantments = {}, effects = {}, potions = {}, potionNames = {};
  const tiers = { wooden: 4, golden: 4, stone: 5, copper: 5, iron: 6, diamond: 7, netherite: 8 };
  for (const item of source) {
    const id = "minecraft:" + item.name;
    if (registry && !registry.items[id]) continue;
    const data = value(item.nbt).components || {}, properties = data.item_properties || {}, c = items[id] = { "minecraft:max_stack_size": item.stackSize };
    if (item.maxDurability) c["minecraft:max_damage"] = item.maxDurability;
    const tool = /^(wooden|golden|stone|copper|iron|diamond|netherite)_(sword|axe|pickaxe|shovel)$/.exec(item.name);
    if (tool) damage[id] = tiers[tool[1]] - ["sword", "axe", "pickaxe", "shovel"].indexOf(tool[2]);
    else if (data["minecraft:damage"]) damage[id] = data["minecraft:damage"].value;
    if (data["minecraft:rarity"]) c["minecraft:rarity"] = data["minecraft:rarity"].value;
    if (data["minecraft:foil"] || properties.foil) c["minecraft:enchantment_glint_override"] = true;
    if (/^(?:.*_)?bundle$/.test(item.name)) c["minecraft:bundle_contents"] = [];
    if (/^(?:splash_|lingering_)?potion$/.test(item.name)) c["minecraft:potion_contents"] = { potion: "minecraft:water" };
  }
  damage["minecraft:trident"] = 8; damage["minecraft:mace"] = 6;
  // Native rarity changes and enchantment promotion: Bedrock 1.21.30 release notes.
  const rarities = {
    uncommon: "dragon_breath netherite_upgrade_smithing_template nautilus_shell recovery_compass echo_shard goat_horn ominous_bottle heart_of_the_sea experience_bottle enchanted_book sniffer_egg chainmail_helmet chainmail_chestplate chainmail_leggings chainmail_boots disc_fragment_5 skeleton_skull creeper_head zombie_head player_head piglin_head",
    rare: "beacon conduit trident wither_skeleton_skull skull_banner_pattern thing_banner_pattern nether_star enchanted_golden_apple",
    epic: "elytra dragon_head dragon_egg heavy_core mace command_block chain_command_block repeating_command_block structure_block jigsaw structure_void barrier light_block",
  };
  Object.entries(rarities).forEach(([rarity, names]) => names.split(" ").forEach(name => {
    if (items["minecraft:" + name]) items["minecraft:" + name]["minecraft:rarity"] = rarity;
  }));
  for (const [id, c] of Object.entries(items)) {
    if (/_pottery_sherd$/.test(id)) c["minecraft:rarity"] = "uncommon";
    if (/_armor_trim_smithing_template$/.test(id)) c["minecraft:rarity"] = /:silence_/.test(id) ? "epic" : /:(ward|eye|vex|spire)_/.test(id) ? "rare" : "uncommon";
    if (/:music_disc_/.test(id)) c["minecraft:rarity"] = /:music_disc_(pigstep|otherside|creator)$/.test(id) ? "rare" : "uncommon";
  }
  // Single-level enchantments omit the numeral; these are the native language keys.
  const enchantmentKeys = {
    protection: ["protect.all", 4], fire_protection: ["protect.fire", 4], feather_falling: ["protect.fall", 4], blast_protection: ["protect.explosion", 4], projectile_protection: ["protect.projectile", 4],
    respiration: ["oxygen", 3], aqua_affinity: ["waterWorker", 1], thorns: ["thorns", 3], depth_strider: ["waterWalker", 3], frost_walker: ["frostwalker", 2], binding_curse: ["curse.binding", 1],
    sharpness: ["damage.all", 5], smite: ["damage.undead", 5], bane_of_arthropods: ["damage.arthropods", 5], knockback: ["knockback", 2], fire_aspect: ["fire", 2], looting: ["lootBonus", 3],
    efficiency: ["digging", 5], silk_touch: ["untouching", 1], unbreaking: ["durability", 3], fortune: ["lootBonusDigger", 3], power: ["arrowDamage", 5], punch: ["arrowKnockback", 2], flame: ["arrowFire", 1], infinity: ["arrowInfinite", 1],
    luck_of_the_sea: ["lootBonusFishing", 3], lure: ["fishingSpeed", 3], loyalty: ["tridentLoyalty", 3], impaling: ["tridentImpaling", 5], riptide: ["tridentRiptide", 3], channeling: ["tridentChanneling", 1],
    multishot: ["crossbowMultishot", 1], piercing: ["crossbowPiercing", 4], quick_charge: ["crossbowQuickCharge", 3], mending: ["mending", 1], vanishing_curse: ["curse.vanishing", 1], soul_speed: ["soul_speed", 3], swift_sneak: ["swift_sneak", 3],
    density: ["heavy_weapon.density", 5], breach: ["heavy_weapon.breach", 4], wind_burst: ["heavy_weapon.windburst", 3], lunge: ["lunge", 3],
  };
  Object.entries(enchantmentKeys).forEach(([id, [key, maxLevel]]) => { enchantments["minecraft:" + id] = { key: "enchantment." + key, maxLevel }; });
  // Durations are ticks before the splash, lingering or arrow delivery multiplier.
  const effect = (id, key, color, harmful, instant) => { effects["minecraft:" + id] = { key, color, harmful: !!harmful, instant: !!instant }; };
  const definitions = [
    ["speed", "moveSpeed", 0x7cafc6], ["slowness", "moveSlowdown", 0x5a6c81, true], ["haste", "digSpeed", 0xd9c043], ["mining_fatigue", "digSlowDown", 0x4a4217, true],
    ["strength", "damageBoost", 0x932423], ["instant_health", "heal", 0xf82423, false, true], ["instant_damage", "harm", 0x430a09, true, true], ["jump_boost", "jump", 0x22ff4c],
    ["nausea", "confusion", 0x551d4a, true], ["regeneration", "regeneration", 0xcd5cab], ["resistance", "resistance", 0x99453a], ["fire_resistance", "fireResistance", 0xe49a3a],
    ["water_breathing", "waterBreathing", 0x2e5299], ["invisibility", "invisibility", 0x7f8392], ["blindness", "blindness", 0x1f1f23, true], ["night_vision", "nightVision", 0x1f1fa1],
    ["hunger", "hunger", 0x587653, true], ["weakness", "weakness", 0x484d48, true], ["poison", "poison", 0x4e9331, true], ["wither", "wither", 0x352a27, true],
    ["health_boost", "healthBoost", 0xf87d23], ["absorption", "absorption", 0x2552a5], ["saturation", "saturation", 0xf82423, false, true], ["levitation", "levitation", 0xceffff, true],
    ["slow_falling", "slowFalling", 0xf3cfb9], ["conduit_power", "conduitPower", 0x1dc2d1], ["infested", "infested", 0x8c9b8c, true], ["oozing", "oozing", 0x99ffa3, true], ["weaving", "weaving", 0x78695a, true], ["wind_charged", "windCharged", 0xbdc9ff],
  ];
  definitions.forEach(([id, key, ...rest]) => effect(id, "potion." + key, ...rest));
  [["bad_omen", "badOmen", 0xb6138, true], ["hero_of_the_village", "villageHero", 0x44ff44], ["darkness", "darkness", 0x292721, true], ["trial_omen", "trial_omen", 0x16a6a6, true], ["raid_omen", "raid_omen", 0xde4058, true]]
    .forEach(([id, key, ...rest]) => effect(id, "effect." + key, ...rest));
  const potion = (name, id, seconds, amplifier, extended, strong) => {
    const entry = (seconds, amplifier) => [{ id: "minecraft:" + id, duration: seconds * 20, amplifier }];
    potions["minecraft:" + name] = entry(seconds, amplifier);
    potionNames[name] = effects["minecraft:" + id].key.slice(7);
    if (extended) potions["minecraft:long_" + name] = entry(extended, amplifier);
    if (strong) potions["minecraft:strong_" + name] = entry(strong, amplifier + 1);
  };
  potion("night_vision", "night_vision", 180, 0, 480);
  potion("invisibility", "invisibility", 180, 0, 480);
  potion("leaping", "jump_boost", 180, 0, 480, 90);
  potion("fire_resistance", "fire_resistance", 180, 0, 480);
  potion("swiftness", "speed", 180, 0, 480, 90);
  potion("slowness", "slowness", 90, 0, 240);
  potions["minecraft:strong_slowness"] = [{ id: "minecraft:slowness", duration: 400, amplifier: 3 }];
  potion("water_breathing", "water_breathing", 180, 0, 480);
  potion("healing", "instant_health", 0, 0, 0, 0.05);
  potion("harming", "instant_damage", 0, 0, 0, 0.05);
  potion("poison", "poison", 45, 0, 120, 22);
  potion("regeneration", "regeneration", 45, 0, 120, 22);
  potion("strength", "strength", 180, 0, 480, 90);
  potion("weakness", "weakness", 90, 0, 240);
  potion("slow_falling", "slow_falling", 90, 0, 240);
  potion("wither", "wither", 40, 1);
  for (const name of ["infested", "oozing", "weaving", "wind_charged"]) potion(name, name, 180, 0);
  for (const [prefix, seconds, slow, resistance] of [["", 20, 3, 2], ["long_", 40, 3, 2], ["strong_", 20, 5, 3]])
    potions["minecraft:" + prefix + "turtle_master"] = [{ id: "minecraft:slowness", duration: seconds * 20, amplifier: slow }, { id: "minecraft:resistance", duration: seconds * 20, amplifier: resistance }];
  Object.assign(potionNames, { water: "emptyPotion", mundane: "mundane", long_mundane: "mundane.extended", thick: "thick", awkward: "awkward", turtle_master: "turtleMaster" });
  return { items, damage, enchantments, effects, potions, potionNames };
}

module.exports = { itemData };
