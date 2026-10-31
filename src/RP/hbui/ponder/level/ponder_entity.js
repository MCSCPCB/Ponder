// Entities in the ponder world. Ponder spawns only what a scene asks for, and the entity
// it spawns itself is the dropped item (net.minecraft.world.entity.item.ItemEntity, 1.21.1).
(function () {
  const P = window.Ponder;

  // Entity, reduced to what an item entity uses. Collision is Entity.collideBoundingBox,
  // shared with the particles (P.collide).
  class PonderEntity {
    constructor(world, x, y, z) {
      this.world = world;
      this.x = this.xo = x; this.y = this.yo = y; this.z = this.zo = z;
      this.xd = this.yd = this.zd = 0;
      this.yRot = 0;
      this.tickCount = 0;
      this.alive = true;
      this.onGround = false;
      this.halfWidth = 0.25; this.height = 0.25;
    }
    discard() { this.alive = false; }
    setPos(x, y, z) { this.x = x; this.y = y; this.z = z; }
    setDeltaMovement(v) { this.xd = v[0]; this.yd = v[1]; this.zd = v[2]; }
    tick() { this.tickCount++; }
    move(x, y, z) {
      const x0 = x, y0 = y, z0 = z, box = this.box();
      y = P.collide(this.world, box, 1, y); box[0][1] += y; box[1][1] += y;
      const xFirst = Math.abs(x) >= Math.abs(z);
      if (xFirst) { x = P.collide(this.world, box, 0, x); box[0][0] += x; box[1][0] += x; }
      z = P.collide(this.world, box, 2, z); box[0][2] += z; box[1][2] += z;
      if (!xFirst) x = P.collide(this.world, box, 0, x);
      this.x += x; this.y += y; this.z += z;
      this.onGround = y0 !== y && y0 < 0;
      if (x0 !== x) this.xd = 0;
      if (z0 !== z) this.zd = 0;
      if (y0 !== y) this.yd = 0; // Block.updateEntityAfterFallOn
    }
    box() {
      return [[this.x - this.halfWidth, this.y, this.z - this.halfWidth], [this.x + this.halfWidth, this.y + this.height, this.z + this.halfWidth]];
    }
  }

  // ItemEntity. The ponder world is never a client world, so the client-only branches are skipped.
  class ItemEntity extends PonderEntity {
    constructor(world, x, y, z, item) {
      super(world, x, y, z);
      this.item = typeof item === "string" ? P.itemStack(item) : item;
      this.age = 0;
      this.bobOffs = Math.random() * Math.PI * 2;
      this.yRot = Math.random() * 360;
      this.halfWidth = 0.125; this.height = 0.25;
    }
    tick() {
      super.tick();
      this.xo = this.x; this.yo = this.y; this.zo = this.z;
      this.yd -= 0.04; // getDefaultGravity
      if (!this.onGround || this.xd * this.xd + this.zd * this.zd > 1.0e-5 || (this.tickCount + this.id) % 4 === 0) {
        this.move(this.xd, this.yd, this.zd);
        let drag = 0.98;
        if (this.onGround) drag *= 0.6; // getFriction of a full cube
        this.xd *= drag; this.yd *= 0.98; this.zd *= drag;
        if (this.onGround && this.yd < 0) this.yd *= -0.5;
      }
      this.age++;
      if (this.age >= 6000) this.discard();
    }
  }

  // ItemEntityRenderer.render: bob, then spin about Y. The item itself is drawn by the caller.
  P.itemEntityPose = function (entity, pt) {
    const bob = Math.sin((entity.age + pt) / 10 + entity.bobOffs) * 0.1 + 0.1;
    const spin = ((entity.age + pt) / 20 + entity.bobOffs) * 180 / Math.PI; // getSpin, in degrees
    return { bob, spin };
  };

  // ItemStack: an item id and a count. Scenes may pass a bare id for a single item.
  P.itemStack = (id, count) => ({ id, count: count == null ? 1 : count });
  P.itemComponents = function (stack) {
    if (typeof stack === "string") stack = { id: stack };
    const defaults = P.vanilla.itemData && P.vanilla.itemData.items[stack.id] || {};
    const addon = P.addonItems && P.addonItems.get(stack.id);
    const result = Object.assign({}, defaults, addon ? { "minecraft:max_stack_size": addon.maxStackSize || 64 } : {}, stack.components || {});
    Object.keys(result).forEach(key => { if (result[key] == null) delete result[key]; });
    return result;
  };
  P.itemEnchantments = function (value) {
    if (!value) return [];
    return Object.keys(value.levels || value).filter(id => id !== "show_in_tooltip" && Number((value.levels || value)[id]) > 0)
      .map(id => [id.indexOf(":") < 0 ? "minecraft:" + id : id, Number((value.levels || value)[id])]);
  };
  P.potionEffects = function (contents) {
    const data = P.vanilla.itemData || {}, name = contents.potion || "", id = name.indexOf(":") < 0 ? "minecraft:" + name : name;
    return (data.potions && data.potions[id] || []).concat(contents.custom_effects || []);
  };
  P.itemTint = function (stack, layer) {
    if (typeof stack === "string") stack = { id: stack };
    const name = stack.id.slice(10), c = P.itemComponents(stack), dye = c["minecraft:dyed_color"], rgb = dye && typeof dye === "object" ? dye.rgb : dye;
    const color = n => [(n >>> 16 & 255) / 255, (n >>> 8 & 255) / 255, (n & 255) / 255];
    if (name.startsWith("leather_") && layer === 0) return color(rgb == null ? 0xa06540 : rgb);
    if (name === "wolf_armor" && layer === 1) return rgb == null ? null : color(rgb);
    if (name === "filled_map" && layer === 1) return color(c["minecraft:map_color"] == null ? 0x46433e : c["minecraft:map_color"]);
    if (name === "firework_star" && layer === 1) {
      const colors = (c["minecraft:firework_explosion"] || {}).colors || [];
      return colors.length ? colors.map(color).reduce((a, b) => a.map((v, i) => v + b[i] / colors.length), [0, 0, 0]) : color(0x8a8a8a);
    }
    if ((name.endsWith("potion") || name === "tipped_arrow") && layer === 0) {
      const contents = c["minecraft:potion_contents"] || {};
      if (contents.custom_color != null) return color(contents.custom_color);
      const effects = P.potionEffects(contents).filter(e => e.show_particles !== false), data = P.vanilla.itemData && P.vanilla.itemData.effects || {};
      const sum = [0, 0, 0]; let count = 0;
      effects.forEach(e => {
        const effect = data[e.id.indexOf(":") < 0 ? "minecraft:" + e.id : e.id];
        if (!effect) return;
        const weight = (e.amplifier || 0) + 1, rgb = color(effect.color); count += weight;
        rgb.forEach((v, i) => { sum[i] += v * weight; });
      });
      return count ? sum.map(v => v / count) : color(contents.potion ? 0x385dc6 : 0xf800f8);
    }
    return [1, 1, 1];
  };
  P.hasFoil = stack => {
    if (!stack) return false;
    if (typeof stack === "string") stack = { id: stack };
    const components = P.itemComponents(stack), override = components["minecraft:enchantment_glint_override"];
    if (override != null) return !!override;
    return !!(stack.enchanted || P.itemEnchantments(components["minecraft:enchantments"]).length || /:(enchanted_book|enchanted_golden_apple)$/.test(stack.id));
  };
  // getSeedForItemStack seeds the copies' offsets with Item.getId, a Java registry number
  // Bedrock has no counterpart for; a hash of the id keeps them fixed per item the same way.
  P.itemSeed = id => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return h; };
  P.seededRandom = seed => {
    let s = seed >>> 0;
    return { nextFloat() { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; } };
  };
  // getRenderedAmount: how many copies a stack draws.
  P.renderedItemAmount = count => (count <= 1 ? 1 : count <= 16 ? 2 : count <= 32 ? 3 : count <= 48 ? 4 : 5);

  // EntityElement: tracks an entity and is valid while it is alive.
  class EntityElement extends P.PonderElement {
    constructor(entity) { super(); this.entity = entity; }
    ifPresent(fn) { if (this.entity) fn(this.entity); }
  }

  P.PonderEntity = PonderEntity;
  P.ItemEntity = ItemEntity;
  P.EntityElement = EntityElement;
})();
