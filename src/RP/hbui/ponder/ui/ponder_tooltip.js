// PonderTooltipHandler: hold the ponder key on any of Ponder's item tooltips.
(function () {
  const P = window.Ponder, callbacks = new Set();
  const idOf = id => id.indexOf(":") < 0 ? "minecraft:" + id : id;
  P.vanillaText = function (key, ...args) {
    return P.format(P.translate(key).replace(/%((?:\d+\$)?)d/g, "%$1s"), ...args);
  };
  const colorName = name => name === "light_blue" ? "lightBlue" : name === "light_gray" ? "silver" : name;
  const levels = value => P.itemEnchantments(value).map(([id, level]) => {
    const data = P.vanilla.itemData && P.vanilla.itemData.enchantments[id], name = P.translate(data ? data.key : "enchantment." + id.replace(":", "."));
    return [name + (level === 1 && data && data.maxLevel === 1 ? "" : " " + P.vanillaText("enchantment.level." + level)), P.color(/(?:binding|vanishing)_curse$/.test(id) ? 0xff5555 : 0xaaaaaa)];
  });
  const duration = ticks => {
    const seconds = Math.floor(ticks / 20), minutes = Math.floor(seconds / 60);
    return (minutes >= 60 ? Math.floor(minutes / 60) + ":" + String(minutes % 60).padStart(2, "0") : minutes) + ":" + String(seconds % 60).padStart(2, "0");
  };
  P.bundleWeight = function (items) {
    return items.reduce((total, item) => {
      const c = P.itemComponents(item), nested = c["minecraft:bundle_contents"];
      const weight = nested ? 4 + P.bundleWeight(nested) : c["minecraft:bees"] && c["minecraft:bees"].length ? 64 : 64 / (c["minecraft:max_stack_size"] || 64);
      return total + weight * (item.count == null ? 1 : item.count);
    }, 0);
  };
  // Native item information over the scene's item components and the Bedrock baseline registry.
  P.itemTooltipLines = function (item) {
    const stack = typeof item === "string" ? { id: item } : item, c = P.itemComponents(stack), data = P.vanilla.itemData || {};
    if (c["minecraft:hide_tooltip"]) return [];
    const extra = !c["minecraft:hide_additional_tooltip"], visible = value => value != null && value.show_in_tooltip !== false;
    const pot = c["minecraft:potion_contents"], book = c["minecraft:written_book_content"], name = stack.id.slice(10);
    let title = P.itemName(stack.id), rarity = stack.rarity || c["minecraft:rarity"] || (P.addonItems.get(stack.id) || {}).rarity || "common";
    if (name === "compass" && c["minecraft:lodestone_tracker"]) title = P.vanillaText("item.lodestonecompass.name");
    if (pot && /^(potion|splash_potion|lingering_potion)$/.test(name)) {
      const potion = (pot.potion || "water").replace(/^minecraft:/, ""), key = data.potionNames && (data.potionNames[potion] || data.potionNames[potion.replace(/^(?:strong|long)_/, "")]);
      title = P.vanillaText("potion." + (key || potion) + (name === "splash_potion" ? ".splash" : name === "lingering_potion" ? ".linger" : "") + ".name");
    }
    if (name === "shield" && c["minecraft:base_color"]) title = P.vanillaText("item.shield." + colorName(c["minecraft:base_color"]) + ".name");
    if (book && book.title) title = typeof book.title === "object" ? book.title.raw : book.title;
    const componentTitle = c["minecraft:custom_name"] || c["minecraft:item_name"] || stack.name || title;
    title = P.componentText(componentTitle);
    if (stack.enchanted || P.itemEnchantments(c["minecraft:enchantments"]).length || P.itemEnchantments(c["minecraft:stored_enchantments"]).length)
      rarity = rarity === "common" || rarity === "uncommon" ? "rare" : "epic";
    const lines = [[title, P.color(({ common: 0xffffff, uncommon: 0xffff55, rare: 0x55ffff, epic: 0xff55ff })[rarity] || 0xffffff)]];
    lines[0][2] = P.componentRuns(componentTitle, { color: lines[0][1], italic: c["minecraft:custom_name"] != null });
    const add = (text, color) => lines.push([text, P.color(color == null ? 0xaaaaaa : color)]);
    if (extra) {
      const trim = c["minecraft:trim"];
      if (visible(trim)) {
        for (const part of ["pattern", "material"]) {
          const id = trim[part];
          if (typeof id === "string") add(P.vanillaText("trim_" + part + "." + id.replace(/^minecraft:/, "") + ".name"));
          else if (id && id.description) add(P.componentText(id.description));
        }
      }
      if (visible(c["minecraft:stored_enchantments"])) lines.push(...levels(c["minecraft:stored_enchantments"]));
      if (pot || name === "ominous_bottle") {
        const effects = name === "ominous_bottle" ? [{ id: "minecraft:bad_omen", amplifier: c["minecraft:ominous_bottle_amplifier"] || 0, duration: 120000 }] : P.potionEffects(pot);
        const factor = name === "lingering_potion" ? 0.25 : name === "tipped_arrow" || name === "arrow" ? 0.125 : name === "splash_potion" ? 0.75 : 1;
        if (!effects.length) add(P.vanillaText("potion.empty"));
        effects.forEach(effect => {
          const id = idOf(effect.id), def = data.effects && data.effects[id] || {}, level = effect.amplifier || 0;
          if (effect.show_in_tooltip === false) return;
          let text = P.vanillaText(def.key || "effect." + id.replace(":", "."));
          if (level > 0) text += " " + P.vanillaText("potion.potency." + level);
          if (!def.instant && (effect.duration > 20 || effect.duration === -1)) text += " (" + (effect.duration === -1 ? P.vanillaText("effect.duration.infinite") : duration(effect.duration * factor)) + ")";
          add(text, def.harmful ? 0xff5555 : 0x5555ff);
        });
      }
      if (book) { if (book.author) add(P.vanillaText("book.byAuthor") + " " + book.author); add(P.vanillaText("book.generation." + (book.generation || 0))); }
      if (c["minecraft:map_id"] != null) {
        const map = c["minecraft:map_data"];
        if (map && map.scale != null) { add(P.vanillaText("map.toolTip.scaling", Math.pow(2, map.scale))); add(P.vanillaText("map.toolTip.level", map.scale, 4)); }
        if (map && map.locked) add(P.vanillaText("map.toolTip.locked"));
      }
      const explosion = value => {
        const shape = ["small_ball", "large_ball", "star", "creeper", "burst"].indexOf(value.shape || "small_ball");
        add(P.vanillaText("item.fireworksCharge.type" + (shape < 0 ? "" : "." + shape)));
        const colors = list => list.map(n => {
          const names = P.vanilla.client && P.vanilla.client.fireworkColors || {};
          return P.vanillaText("item.fireworksCharge." + colorName(names[n] || "customColor"));
        }).join(", ");
        if (value.colors && value.colors.length) add(colors(value.colors));
        if (value.fade_colors && value.fade_colors.length) add(P.vanillaText("item.fireworksCharge.fadeTo") + " " + colors(value.fade_colors));
        if (value.has_trail) add(P.vanillaText("item.fireworksCharge.trail"));
        if (value.has_twinkle) add(P.vanillaText("item.fireworksCharge.flicker"));
      };
      if (c["minecraft:firework_explosion"]) explosion(c["minecraft:firework_explosion"]);
      if (c["minecraft:fireworks"]) { const fireworks = c["minecraft:fireworks"]; add(P.vanillaText("item.fireworks.flight") + " " + (fireworks.flight_duration || 0)); (fireworks.explosions || []).forEach(explosion); }
      const contents = c["minecraft:container"];
      if (/shulker_box$/.test(name)) {
        const items = (contents || []).map(entry => entry.item).filter(item => item && item.id && item.count !== 0);
        if (c["minecraft:container_loot"]) add("???????");
        items.slice(0, 5).forEach(item => {
          const child = P.itemComponents(item), title = child["minecraft:custom_name"] || child["minecraft:item_name"] || P.itemName(item.id);
          const runs = P.componentRuns([title, " x" + (item.count || 1)]);
          lines.push([runs.map(run => run.text).join(""), P.color(0xaaaaaa), runs]);
        });
        if (items.length > 5) add(P.vanillaText("container.shulkerboxContains", items.length - 5));
      }
      if (c["minecraft:banner_patterns"]) c["minecraft:banner_patterns"].slice(0, 6).forEach(pattern => {
        if (typeof pattern.pattern === "string") add(P.vanillaText("item.banner." + pattern.pattern.replace(/^minecraft:/, "") + "." + colorName(pattern.color)));
        else if (pattern.pattern && pattern.pattern.description) add(P.componentText(pattern.pattern.description));
      });
      if (typeof c["minecraft:instrument"] === "string") {
        const instrument = c["minecraft:instrument"].replace(/^minecraft:|_goat_horn$/g, ""), index = ["ponder", "sing", "seek", "feel", "admire", "call", "yearn", "dream"].indexOf(instrument);
        if (index >= 0) add(P.vanillaText("item.minecraft.goat_horn.sound." + index));
      }
      if (c["minecraft:bundle_contents"]) {
        const remaining = Math.max(0, 64 - Math.ceil(P.bundleWeight(c["minecraft:bundle_contents"])));
        add(P.vanillaText(remaining === 64 ? "item.bundle.empty" : remaining === 0 ? "item.bundle.full" : "item.bundle.fullness", remaining));
      }
      if (c["minecraft:pot_decorations"] && c["minecraft:pot_decorations"].some(id => id !== "minecraft:brick")) {
        add(""); [3, 1, 2, 0].forEach(i => add(P.itemName(c["minecraft:pot_decorations"][i] || "minecraft:brick")));
      }
      if (/_smithing_template$/.test(name)) {
        const netherite = name === "netherite_upgrade_smithing_template", kind = netherite ? "netherite_upgrade" : "armor_trim";
        add(P.vanillaText(netherite ? "item.netherite_upgrade_smithing_template.name" : "trim_pattern." + name.replace(/_armor_trim_smithing_template$/, "") + ".name"));
        add(""); add(P.vanillaText("item.smithing_template.applies_to"));
        add(" " + P.vanillaText("item.smithing_template." + kind + ".applies_to"), 0x5555ff);
        add(P.vanillaText("item.smithing_template.ingredients"));
        add(" " + P.vanillaText("item.smithing_template." + kind + ".ingredients"), 0x5555ff);
      }
      const bucket = c["minecraft:bucket_entity_data"];
      if (name === "tropical_fish_bucket" && bucket) {
        const variant = bucket.BucketVariantTag, shape = variant == null ? bucket.Variant : variant & 255;
        const pattern = variant == null ? bucket.MarkVariant : variant >>> 8 & 255;
        const base = variant == null ? bucket.Color : variant >>> 16 & 255, mark = variant == null ? bucket.Color2 : variant >>> 24 & 255;
        const patterns = ["Kob", "Sunstreak", "Snooper", "Dasher", "Brinely", "Spotty", "Flopper", "Stripey", "Glitter", "Blockfish", "Betty", "Clayfish"];
        const colors = ["White", "Orange", "Magenta", "Sky", "Yellow", "Lime", "Rose", "Gray", "Silver", "Teal", "Plum", "Blue", "Brown", "Green", "Red", "Black"];
        const color = index => P.vanillaText(index === 15 ? "item.fireworksCharge.black" : "item.tropicalColor" + colors[index] + ".name");
        if (patterns[shape * 6 + pattern] && colors[base] && colors[mark]) add(P.vanillaText("item.tropicalBody" + patterns[shape * 6 + pattern] + (base === mark ? "Single" : "Multi") + ".name", color(base), color(mark)));
      }
      if (/^music_disc_/.test(name)) add(P.vanillaText("item.record_" + name.slice(11) + ".desc"));
    }
    if (visible(c["minecraft:enchantments"])) lines.push(...levels(c["minecraft:enchantments"]));
    const dye = c["minecraft:dyed_color"];
    if (visible(dye)) add(P.vanillaText("item.dyed"), 0x555555);
    (c["minecraft:lore"] || stack.lore || []).forEach(line => lines.push([P.componentText(line), P.color(0xaa00aa), P.componentRuns(line, { color: P.color(0xaa00aa), italic: true })]));
    const addon = P.addonItems.get(stack.id), baseDamage = addon ? addon.attackDamage : data.damage && data.damage[stack.id];
    if (baseDamage != null && (!c["minecraft:attribute_modifiers"] || visible(c["minecraft:attribute_modifiers"]))) {
      const sharpness = P.itemEnchantments(c["minecraft:enchantments"]).find(([id]) => id === "minecraft:sharpness");
      const amount = baseDamage + (sharpness ? sharpness[1] * 1.25 : 0);
      if (amount > 0) { add(""); add(P.vanillaText("attribute.modifier.plus.0", amount, P.vanillaText("attribute.name.minecraft:attack_damage")), 0x5555ff); }
    }
    if (visible(c["minecraft:unbreakable"])) add(P.vanillaText("item.unbreakable"), 0x5555ff);
    for (const [key, label] of [["minecraft:can_break", "item.canBreak"], ["minecraft:can_place_on", "item.canPlace"]]) {
      const value = c[key];
      if (!visible(value)) continue;
      add(""); add(P.vanillaText(label));
      (value.predicates || []).forEach(predicate => [].concat(predicate.blocks || []).forEach(id => add(id[0] === "#" ? id : P.itemName(idOf(id)), 0x555555)));
    }
    return lines;
  };
  const handler = (P.ponderTooltip = { enable: true, item: null, screen: null, mouse: [0, 0], subject: false, seen: false, progress: P.linear() });
  handler.registerHoveredPonderStackCallback = callback => callbacks.add(callback);
  handler.removeHoveredPonderStackCallback = callback => callbacks.delete(callback);
  handler.reset = function () { this.item = this.screen = null; this.seen = false; this.progress.startWithValue(0); };
  handler.hover = function (item, mx, my) {
    const screen = P.screens.current;
    if (this.item !== item || this.screen !== screen) this.progress.startWithValue(0);
    this.item = item; this.screen = screen; this.mouse = [mx, my]; this.seen = true;
    this.subject = screen instanceof P.PonderUI && screen.item === item;
    callbacks.forEach(fn => fn(item));
  };
  handler.tick = function () {
    if (!this.enable || !this.seen || this.screen !== P.screens.current) { this.reset(); return; }
    const value = this.progress.getValue();
    if (!this.subject && P.input.ponderHeld()) {
      if (value >= 1) {
        const item = this.item;
        this.screen.centerScalingOn(...this.mouse);
        this.reset();
        P.showScenes(item);
      } else this.progress.setValue(Math.min(1, value + Math.max(0.25, value) * 0.25));
    } else this.progress.setValue(Math.max(0, value - 0.05));
  };
  P.itemTooltip = function (d, mx, my, item, pt, previous) {
    const stack = typeof item === "string" ? { id: item } : item;
    item = stack.id;
    const lines = P.itemTooltipLines(stack);
    if (!lines.length) return;
    let border = null, progress = 0, tip = "";
    if (handler.enable && !previous && P.doScenesExistForId(item)) {
      handler.hover(item, mx, my);
      progress = Math.min(1, handler.progress.getValue(pt) * 8 / 7);
      tip = P.input.mode === "touch" ? P.translate("ponder.ui.touch_ponder") : P.translate("ponder.ui.hold_to_ponder", P.input.mode === "gamepad" ? "Y / △" : P.keyLabel("ponder"));
      if (handler.subject) lines.push([P.translate("ponder.ui.subject"), P.color(0x55ff55)]);
      else lines.push([progress > 0 ? "|".repeat(Math.floor(P.textWidth(tip) / P.textWidth("|"))) : tip, P.color(0x555555)]);
      if (progress > 0) {
        const c = progress < 0.5 ? P.mix(P.color(0x5000ff), P.color(0x5555ff), progress * 2) : P.mix(P.color(0x5555ff), P.color(0xffffff), (progress - 0.5) * 2);
        border = [c, c];
      }
    }
    const box = P.tooltip(d, mx, my, lines, 9999, border);
    if (progress > 0 && !handler.subject) d.text("|".repeat(Math.floor(P.textWidth(tip) / P.textWidth("|") * progress)), box[0], box[1] + (box[4] - 1) * 10 + 2, P.color(0xaaaaaa), true);
  };
})();
