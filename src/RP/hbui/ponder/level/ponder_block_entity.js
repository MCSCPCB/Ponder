// Client block entities owned by PonderLevel. Structures store Bedrock NBT; scene callbacks
// use typed objects and CompoundTag, as BlockEntityDataInstruction does on Java.
(function () {
  const P = window.Ponder;
  class CompoundTag {
    constructor(value) { Object.keys(value || {}).forEach(key => { this[key] = copy(value[key]); }); }
    copy() { return new CompoundTag(this); }
    contains(key) { return Object.prototype.hasOwnProperty.call(this, key); }
    get(key) { return this[key]; }
    put(key, value) { this[key] = copy(value); }
    remove(key) { delete this[key]; }
    getInt(key) { return Math.trunc(this[key] || 0); }
    getFloat(key) { return Number(this[key]) || 0; }
    getDouble(key) { return this.getFloat(key); }
    getLong(key) { return this.getInt(key); }
    getByte(key) { return this.getInt(key); }
    getShort(key) { return this.getInt(key); }
    getBoolean(key) { return !!this[key]; }
    getString(key) { return typeof this[key] === "string" ? this[key] : ""; }
    getCompound(key) { return this[key] instanceof CompoundTag ? this[key] : new CompoundTag(); }
    getList(key) { return Array.isArray(this[key]) ? this[key] : []; }
    getIntArray(key) { return this.getList(key); }
    putInt(key, value) { this[key] = Math.trunc(value); }
    putByte(key, value) { this.putInt(key, value); }
    putShort(key, value) { this.putInt(key, value); }
    putLong(key, value) { this.putInt(key, value); }
    putFloat(key, value) { this[key] = Number(value); }
    putDouble(key, value) { this.putFloat(key, value); }
    putBoolean(key, value) { this[key] = !!value; }
    putString(key, value) { this[key] = String(value); }
    putIntArray(key, value) { this[key] = Array.from(value); }
  }
  const copy = value => Array.isArray(value) ? value.map(copy) : value && typeof value === "object" ? new CompoundTag(value) : value;
  const TYPES = new Map(), RENDERERS = new Map();
  class BlockEntity {
    constructor(world, pos, block) {
      this.world = world; this.pos = new P.BlockPos(...pos); this.block = block;
      this.time = 0; this.lastTick = -1;
      this.native = new CompoundTag(P.blockNbt(block) || {});
      this.data = new CompoundTag(this.native.PonderJavaData || this.fromBedrock(this.native));
      delete this.data.PonderJavaData;
    }
    getLevel() { return this.world; }
    getBlockPos() { return this.pos; }
    getBlockState() { return this.world.getBlock(...this.pos); }
    saveWithFullMetadata() { return new CompoundTag(Object.assign({}, this.data, { id: this.constructor.id, x: this.pos.x, y: this.pos.y, z: this.pos.z })); }
    fromBedrock(tag) { return tag; }
    loadWithComponents(tag) { this.data = new CompoundTag(tag); this.setChanged(); }
    setChanged() { this.world.blocks.set(P.blockKey(...this.pos), P.withNbt(this.getBlockState(), this.bedrockData())); }
    bedrockData() { return Object.assign({}, this.native, { PonderJavaData: this.saveWithFullMetadata() }); }
    tick() { this.time++; }
  }
  const COLORS = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];
  P.dyeNames = COLORS;
  class BedBlockEntity extends BlockEntity {
    constructor(world, pos, block) { super(world, pos, block); this.color = this.native.color == null ? 14 : this.native.color; }
    fromBedrock() { return {}; }
    getColor() { return this.color; }
    setColor(color) { const value = typeof color === "string" ? COLORS.indexOf(color) : color; if (value < 0 || value > 15) throw new RangeError("Invalid bed color"); this.color = value; this.setChanged(); }
    bedrockData() { return Object.assign(super.bedrockData(), { id: "Bed", color: this.color }); }
  }
  class BannerBlockEntity extends BlockEntity {
    constructor(world, pos, block) {
      super(world, pos, block);
      this.baseColor = this.native.Base == null ? 0 : 15 - this.native.Base;
    }
    fromBedrock(tag) {
      const patterns = P.vanilla.blockEntities && P.vanilla.blockEntities.banner.patterns || {};
      return { patterns: (tag.Patterns || []).map(p => ({ pattern: "minecraft:" + (patterns[p.Pattern] || p.Pattern).split("banner_").pop(), color: COLORS[15 - p.Color] })) };
    }
    getBaseColor() { return this.baseColor; }
    bedrockData() {
      const patterns = P.vanilla.blockEntities && P.vanilla.blockEntities.banner.patterns || {};
      const codes = Object.keys(patterns);
      return Object.assign(super.bedrockData(), { id: "Banner", Base: 15 - this.baseColor,
        Patterns: (this.data.patterns || []).map(p => {
          const id = typeof p.pattern === "string" ? p.pattern : p.pattern && p.pattern.asset_id;
          const name = id && id.split(":").pop();
          return name ? { Pattern: codes.find(code => patterns[code].endsWith("banner_" + name)) || name, Color: 15 - COLORS.indexOf(p.color) } : null;
        }).filter(Boolean) });
    }
  }
  class ContainerBlockEntity extends BlockEntity {
    fromBedrock(tag) { return Object.assign({}, tag, { Items: (tag.Items || []).map(item => ({ Slot: item.Slot || 0, id: item.Name, count: item.Count, components: item.tag || {} })) }); }
    bedrockData() { return Object.assign(super.bedrockData(), { Items: this.getItems().map(item => ({ Slot: item.Slot || 0, Name: item.id, Count: item.count, tag: item.components || {} })) }); }
    getItems() { return this.data.Items || []; }
    getItem(slot) { return this.getItems().find(item => (item.Slot || 0) === slot) || null; }
    setItem(slot, item) {
      this.data.Items = this.getItems().filter(stack => (stack.Slot || 0) !== slot);
      if (item) this.data.Items.push(Object.assign({ Slot: slot }, typeof item === "string" ? { id: item, count: 1 } : item));
      this.setChanged();
    }
  }
  class ChestBlockEntity extends ContainerBlockEntity {
    constructor(world, pos, block) { super(world, pos, block); this.open = this.openO = 0; this.openers = 0; }
    startOpen() { this.openers++; }
    stopOpen() { this.openers = Math.max(0, this.openers - 1); }
    triggerEvent(id, count) { if (id !== 1) return false; this.openers = count; return true; }
    getOpenNess(pt) { return P.lerp(pt, this.openO, this.open); }
    tick() { super.tick(); this.openO = this.open; this.open = P.clamp(this.open + (this.openers ? 0.1 : -0.1), 0, 1); }
  }
  class SignBlockEntity extends BlockEntity {
    fromBedrock(tag) {
      const side = value => ({ messages: Array.from({ length: 4 }, (_, i) => JSON.stringify({ text: String(value.Text || "").split("\n")[i] || "" })),
        color: dyeName(value.SignTextColor), has_glowing_text: !!value.IgnoreLighting });
      return { front_text: side(tag.FrontText || tag), back_text: side(tag.BackText || {}), is_waxed: !!tag.IsWaxed };
    }
    getText(front) { return this.data[front === false ? "back_text" : "front_text"]; }
    setText(text, front) { this.data[front === false ? "back_text" : "front_text"] = copy(text); this.setChanged(); }
    bedrockData() {
      const side = text => ({ Text: (text.messages || []).map(P.componentText).join("\n"), SignTextColor: (0xff000000 | TEXT_COLORS[COLORS.indexOf(text.color)]) >> 0, IgnoreLighting: !!text.has_glowing_text });
      return Object.assign(super.bedrockData(), { id: "Sign", FrontText: side(this.data.front_text || {}), BackText: side(this.data.back_text || {}), IsWaxed: !!this.data.is_waxed });
    }
  }
  class ShulkerBoxBlockEntity extends ContainerBlockEntity {
    constructor(world, pos, block) { super(world, pos, block); this.progress = this.progressO = 0; this.openCount = 0; }
    startOpen() { this.openCount++; }
    stopOpen() { this.openCount = Math.max(0, this.openCount - 1); }
    triggerEvent(id, count) { if (id !== 1) return false; this.openCount = count; return true; }
    getProgress(pt) { return P.lerp(pt, this.progressO, this.progress); }
    tick() { super.tick(); this.progressO = this.progress; this.progress = P.clamp(this.progress + (this.openCount ? 0.1 : -0.1), 0, 1); }
  }
  class TheEndPortalBlockEntity extends BlockEntity {
    shouldRenderFace(direction) { return direction === "up" || direction === "down"; }
  }
  class TheEndGatewayBlockEntity extends TheEndPortalBlockEntity {
    constructor(world, pos, block) { super(world, pos, block); this.teleportCooldown = 0; }
    shouldRenderFace(direction) {
      const normal = P.FACES[direction].n, other = this.world.getBlock(...this.pos.map((v, i) => v + normal[i]));
      const opposite = { up: "down", down: "up", north: "south", south: "north", east: "west", west: "east" }[direction];
      return !other || !P.blockLighting(other)[6] || !P.closedBlockFaces(P.blockModel(other)).has(opposite);
    }
    tick() { super.tick(); this.data.Age = (this.data.Age || 0) + 1; if (this.teleportCooldown > 0) this.teleportCooldown--; }
    isSpawning() { return (this.data.Age || 0) < 200; }
    isCoolingDown() { return this.teleportCooldown > 0; }
    getSpawnPercent(pt) { return P.clamp(((this.data.Age || 0) + pt) / 200, 0, 1); }
    getCooldownPercent(pt) { return 1 - P.clamp((this.teleportCooldown - pt) / 40, 0, 1); }
    triggerEvent(id) { if (id !== 1) return false; this.teleportCooldown = 40; return true; }
  }
  class DecoratedPotBlockEntity extends ContainerBlockEntity {
    constructor(world, pos, block) { super(world, pos, block); this.wobbleStartedAtTick = -100; this.lastWobbleStyle = null; }
    fromBedrock(tag) { return { sherds: tag.sherds || ["minecraft:brick", "minecraft:brick", "minecraft:brick", "minecraft:brick"], Items: tag.item ? [{ Slot: 0, id: tag.item.Name, count: tag.item.Count, components: tag.item.tag || {} }] : [] }; }
    bedrockData() {
      const tag = super.bedrockData();
      tag.sherds = (this.data.sherds || []).slice(); tag.item = tag.Items[0] || {};
      delete tag.Items;
      return tag;
    }
    getDecorations() { const s = this.data.sherds || []; return { back: s[0], left: s[1], right: s[2], front: s[3] }; }
    wobble(style) { this.lastWobbleStyle = style; this.wobbleStartedAtTick = this.world.gameTime; }
    triggerEvent(id, style) { if (id !== 1) return false; this.wobble(style === 0 ? "POSITIVE" : "NEGATIVE"); return true; }
  }
  class BellBlockEntity extends BlockEntity {
    constructor(world, pos, block) { super(world, pos, block); this.ticks = 0; this.shaking = false; this.clickDirection = "NORTH"; }
    onHit(direction) { this.clickDirection = direction; this.ticks = 0; this.shaking = true; }
    tick() { super.tick(); if (this.shaking && ++this.ticks >= 50) this.shaking = false; }
  }
  class EnchantmentTableBlockEntity extends BlockEntity {
    constructor(world, pos, block) { super(world, pos, block); this.open = this.openO = 0; this.flip = this.flipO = 0; this.rot = this.rotO = 0; }
    tick() {
      super.tick(); this.openO = this.open; this.flipO = this.flip; this.rotO = this.rot;
      // PonderLevel has no nearby player: the book stays shut and slowly turns.
      this.open = Math.max(0, this.open - 0.1); this.rot += 0.02;
    }
  }
  class CampfireBlockEntity extends ContainerBlockEntity {
    fromBedrock(tag) {
      const items = [1, 2, 3, 4].map(i => tag["Item" + i] && Object.assign({ Slot: i - 1 }, tag["Item" + i])).filter(item => item && item.Name);
      return super.fromBedrock(Object.assign({}, tag, { Items: items }));
    }
    bedrockData() { const tag = super.bedrockData(); for (let i = 0; i < 4; i++) tag["Item" + (i + 1)] = tag.Items.find(item => item.Slot === i) || {}; return tag; }
    tick() {
      super.tick();
      const state = P.blockStates(this.getBlockState());
      if (state.extinguished || P.liquidOf(this.getBlockState())) return;
      if (Math.random() < 0.11) {
        const below = this.world.getBlock(this.pos.x, this.pos.y - 1, this.pos.z), signal = below && P.blockId(below) === "minecraft:hay_block";
        for (let i = 0, count = 2 + Math.floor(Math.random() * 2); i < count; i++) {
          const x = this.pos.x + 0.5 + (Math.random() < 0.5 ? -1 : 1) * Math.random() / 3;
          const z = this.pos.z + 0.5 + (Math.random() < 0.5 ? -1 : 1) * Math.random() / 3;
          this.world.addParticle(signal ? P.ParticleTypes.CAMPFIRE_SIGNAL_SMOKE : P.ParticleTypes.CAMPFIRE_COSY_SMOKE, x, this.pos.y + Math.random() + 0.5, z, 0, 0.07, 0);
        }
      }
      const turn = { south: 0, west: 90, north: 180, east: 270 }[state["minecraft:cardinal_direction"] || "south"];
      this.getItems().forEach(item => {
        if (Math.random() >= 0.2) return;
        const angle = -(turn + (item.Slot || 0) * 90) * Math.PI / 180, x = -0.3125 * (Math.cos(angle) + Math.sin(angle)), z = 0.3125 * (Math.sin(angle) - Math.cos(angle));
        for (let i = 0; i < 4; i++) this.world.addParticle(P.ParticleTypes.SMOKE, this.pos.x + 0.5 + x, this.pos.y + 0.5, this.pos.z + 0.5 + z, 0, 0.0005, 0);
      });
    }
  }
  class LecternBlockEntity extends BlockEntity {
    fromBedrock(tag) { return { Page: tag.page || 0, Book: tag.book ? { id: tag.book.Name, count: tag.book.Count, components: tag.book.tag || {} } : {} }; }
    getPage() { return this.data.Page || 0; }
    setPage(page) { this.data.Page = Math.max(0, Math.trunc(page)); this.setChanged(); }
    hasBook() { return !!(this.data.Book && this.data.Book.id); }
    bedrockData() { return Object.assign(super.bedrockData(), { page: this.getPage(), book: this.data.Book && { Name: this.data.Book.id, Count: this.data.Book.count, tag: this.data.Book.components || {} } }); }
  }
  class BeaconBlockEntity extends BlockEntity {
    getLevels() {
      for (let level = 1; level <= 4; level++) {
        for (let x = -level; x <= level; x++) for (let z = -level; z <= level; z++) {
          const block = this.world.getBlock(this.pos.x + x, this.pos.y - level, this.pos.z + z);
          if (!block || !/^minecraft:(iron|gold|diamond|emerald|netherite)_block$/.test(P.blockId(block))) return level - 1;
        }
      }
      return 4;
    }
    getBeamSections() {
      if (!this.getLevels()) return [];
      const out = [{ color: [1, 1, 1], height: 1 }];
      for (let y = this.pos.y + 1; y < this.world.size.y; y++) {
        const block = this.world.getBlock(this.pos.x, y, this.pos.z), id = block && P.blockId(block), model = block && P.blockModel(block);
        const name = id && id.replace(/^minecraft:/, "").replace(/_stained_glass(?:_pane)?$/, ""), index = COLORS.indexOf(name);
        if (index >= 0) {
          const previous = out[out.length - 1].color, color = P.dyeColors[index];
          out.push({ color: out.length === 1 ? color : color.map((v, i) => (v + previous[i]) / 2), height: 1 });
        } else if (model && model.full && model.opaque && id !== "minecraft:bedrock") return [];
        else out[out.length - 1].height++;
      }
      out[out.length - 1].height += 1024;
      return out;
    }
  }
  class SpawnerBlockEntity extends BlockEntity {
    constructor(world, pos, block) { super(world, pos, block); this.spin = this.spinO = 0; this.displayEntity = null; }
    fromBedrock(tag) { return { Delay: tag.Delay == null ? 20 : tag.Delay, SpawnData: { entity: { id: tag.EntityIdentifier || "minecraft:pig" } } }; }
    tick() {
      super.tick(); this.spinO = this.spin;
      // SchematicLevel has no nearby players, so BaseSpawner remains inactive.
    }
    getDisplayEntity() {
      const type = this.getSpawnData().id || "minecraft:pig";
      if (!this.displayEntity || this.displayEntity.type !== type) this.displayEntity = new P.ClientEntity(this.world, type, 0, 0, 0);
      return this.displayEntity;
    }
    getSpawnData() { return this.data.SpawnData && this.data.SpawnData.entity || {}; }
  }
  class TrialSpawnerBlockEntity extends SpawnerBlockEntity {
    fromBedrock(tag) { return tag; }
    getState() { return ["inactive", "waiting_for_players", "active", "waiting_for_reward_ejection", "ejecting_reward", "cooldown"][P.blockStates(this.getBlockState()).trial_spawner_state || 0]; }
    getSpawnData() { return this.data.spawn_data && this.data.spawn_data.entity || {}; }
    getDisplayEntity() { return ["waiting_for_players", "active"].includes(this.getState()) && this.getSpawnData().id ? super.getDisplayEntity() : null; }
    tick() {
      super.tick();
      const state = this.getState(), speed = { waiting_for_players: 200, active: 1000 }[state];
      if (speed) this.spin = (this.spin + speed / (Math.max(0, (this.data.next_mob_spawns_at || 0) - this.world.gameTime) + 200)) % 360;
      const ominous = P.blockStates(this.getBlockState()).ominous, type = P.ParticleTypes;
      const at = spread => this.pos.map(v => v + 0.5 + (Math.random() - 0.5) * spread);
      const add = (particle, pos) => this.world.addParticle(particle, ...pos, 0, 0, 0);
      if (state === "active") {
        const pos = at(1); add(type.SMOKE, pos); add(ominous ? type.SOUL_FIRE_FLAME : type.FLAME, pos);
      } else if (["waiting_for_players", "waiting_for_reward_ejection", "ejecting_reward"].includes(state)) {
        if (Math.random() < 0.5) add(ominous ? type.SOUL_FIRE_FLAME : type.SMALL_FLAME, at(0.9));
      } else if (state === "cooldown") {
        if (Math.random() < 1 / 3) add(type.SMOKE, at(0.9));
        if (this.world.gameTime % 20 === 0) for (let i = 0, n = 20 + Math.floor(Math.random() * 4); i < n; i++) add(type.SMOKE, this.pos.map((v, axis) => v + (axis === 1 ? 1 : 0.5)));
      }
    }
  }
  class VaultBlockEntity extends BlockEntity {
    constructor(world, pos, block) { super(world, pos, block); this.spin = this.spinO = 0; }
    getSharedData() {
      if (!this.data.shared_data) this.data.shared_data = new CompoundTag();
      const shared = this.data.shared_data;
      return { getDisplayItem: () => shared.display_item || null, hasDisplayItem: () => !!(shared.display_item && shared.display_item.id),
        setDisplayItem: item => { shared.display_item = typeof item === "string" ? P.itemStack(item) : copy(item); this.setChanged(); } };
    }
    tick() {
      super.tick(); this.spinO = this.spin; this.spin = (this.spin + 10) % 360;
      if (Math.random() < 0.5) {
        const pos = this.pos.map((v, axis) => v + (axis === 1 ? 0.25 + Math.random() * 0.5 : 0.1 + Math.random() * 0.8));
        this.world.addParticle(P.ParticleTypes.SMOKE, ...pos, 0, 0, 0);
        if (this.getSharedData().hasDisplayItem()) this.world.addParticle(P.blockStates(this.getBlockState()).ominous ? P.ParticleTypes.SOUL_FIRE_FLAME : P.ParticleTypes.SMALL_FLAME, ...pos, 0, 0, 0);
      }
    }
  }
  class BrushableBlockEntity extends BlockEntity {
    fromBedrock(tag) { return Object.assign({}, tag, { item: tag.item && { id: tag.item.Name, count: tag.item.Count, components: tag.item.tag || {} } }); }
    getHitDirection() { return ["DOWN", "UP", "NORTH", "SOUTH", "WEST", "EAST"][this.data.hit_direction] || null; }
    getItem() { return this.data.item || null; }
    bedrockData() {
      const item = this.getItem();
      return Object.assign(super.bedrockData(), { item: item ? { Name: item.id, Count: item.count, tag: item.components || {} } : {} });
    }
  }
  class SkullBlockEntity extends BlockEntity {
    constructor(world, pos, block) { super(world, pos, block); this.animationTickCount = 0; this.isAnimating = false; }
    tick() {
      super.tick();
      this.isAnimating = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(d => {
          const block = this.world.getBlock(...this.pos.map((v, i) => v + d[i]));
          if (!block) return false;
          const states = P.blockStates(block);
        return P.blockId(block) === "minecraft:redstone_block" || (states.redstone_signal || 0) > 0 || states.powered_bit === true;
      });
      if (this.isAnimating) this.animationTickCount++;
    }
    getAnimation(pt) { return this.animationTickCount + (this.isAnimating ? pt : 0); }
  }
  class PistonMovingBlockEntity extends BlockEntity {
    constructor(world, pos, block) {
      super(world, pos, block);
      this.progress = this.progressO = this.data.progress || 0; this.deathTicks = 0;
    }
    getMovedState() {
      const value = this.data.blockState && this.data.blockState.id ? this.data.blockState : this.native.movingBlock;
      if (!value) return "minecraft:air";
      return P.block(value.id || value.name, value.states || {}, { nbt: this.native.movingBlockEntity || {} });
    }
    getDirection() { return ["DOWN", "UP", "NORTH", "SOUTH", "WEST", "EAST"][this.data.facing || 0]; }
    isExtending() { return !!this.data.extending; }
    isSourcePiston() { return !!this.data.source; }
    getProgress(pt) { return P.lerp(Math.min(1, pt), this.progressO, this.progress); }
    getExtendedProgress(pt) { const p = this.getProgress(pt); return this.isExtending() ? p - 1 : 1 - p; }
    getXOff(pt) { return P.normalOf(this.getDirection())[0] * this.getExtendedProgress(pt); }
    getYOff(pt) { return P.normalOf(this.getDirection())[1] * this.getExtendedProgress(pt); }
    getZOff(pt) { return P.normalOf(this.getDirection())[2] * this.getExtendedProgress(pt); }
    loadWithComponents(tag) { super.loadWithComponents(tag); this.progress = this.progressO = this.data.progress || 0; this.deathTicks = 0; }
    saveWithFullMetadata() { return Object.assign(super.saveWithFullMetadata(), { progress: this.progressO == null ? this.data.progress || 0 : this.progressO }); }
    tick() {
      super.tick(); this.progressO = this.progress;
      if (this.progress >= 1) {
        if (this.deathTicks++ < 5) return;
        this.world.setBlock(...this.pos, this.getMovedState());
      } else this.progress = Math.min(1, this.progress + 0.5);
    }
  }
  class ConduitBlockEntity extends BlockEntity {
    constructor(world, pos, block) { super(world, pos, block); this.active = false; this.hunting = false; this.activeRotation = 0; this.effectBlocks = []; }
    isActive() { return this.active; }
    isHunting() { return this.hunting; }
    getActiveRotation(pt) { return (this.activeRotation + pt) * -0.0375; }
    updateShape() {
      this.effectBlocks = [];
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++)
        if (P.liquidKind(this.world.getBlock(this.pos.x + x, this.pos.y + y, this.pos.z + z)) !== "water") return false;
      for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) for (let z = -2; z <= 2; z++) {
        const a = Math.abs(x), b = Math.abs(y), c = Math.abs(z);
        if (!(a > 1 || b > 1 || c > 1) || !(x === 0 && (b === 2 || c === 2) || y === 0 && (a === 2 || c === 2) || z === 0 && (a === 2 || b === 2))) continue;
        const p = this.pos.offset(x, y, z), block = this.world.getBlock(...p);
        if (block && /^minecraft:(prismarine|prismarine_bricks|dark_prismarine|sea_lantern)$/.test(P.blockId(block))) this.effectBlocks.push(p);
      }
      return this.effectBlocks.length >= 16;
    }
    tick() {
      super.tick();
      if (this.world.gameTime % 40 === 0) { this.active = this.updateShape(); this.hunting = this.effectBlocks.length >= 42; }
      if (this.active) this.activeRotation++;
    }
  }
  P.registerBlockEntity = function (ids, Type, renderer) {
    (Array.isArray(ids) ? ids : [ids]).forEach(id => TYPES.set(id.indexOf(":") < 0 ? "minecraft:" + id : id, Type));
    if (renderer) RENDERERS.set(Type, renderer);
  };
  P.blockEntityRenderer = entity => RENDERERS.get(entity.constructor);
  const register = (Type, id, blocks) => { Type.id = "minecraft:" + id; P[Type.name] = Type; P.registerBlockEntity(blocks, Type); };
  register(BedBlockEntity, "bed", "bed");
  register(BannerBlockEntity, "banner", ["standing_banner", "wall_banner"]);
  register(ChestBlockEntity, "chest", ["chest", "trapped_chest", "ender_chest"]);
  register(SignBlockEntity, "sign", ["standing_sign", "wall_sign"].concat(["spruce", "birch", "jungle", "acacia", "darkoak", "mangrove", "cherry", "bamboo", "crimson", "warped", "pale_oak"].reduce((a, wood) => a.concat(wood + "_standing_sign", wood + "_wall_sign", wood + "_hanging_sign"), []), ["oak_hanging_sign"]));
  register(ShulkerBoxBlockEntity, "shulker_box", ["undyed_shulker_box"].concat(COLORS.map(color => color + "_shulker_box")));
  register(DecoratedPotBlockEntity, "decorated_pot", "decorated_pot");
  register(TheEndPortalBlockEntity, "end_portal", "end_portal");
  register(TheEndGatewayBlockEntity, "end_gateway", "end_gateway");
  P.DecoratedPotBlockEntity.WobbleStyle = { POSITIVE: "POSITIVE", NEGATIVE: "NEGATIVE" };
  register(BellBlockEntity, "bell", "bell");
  register(EnchantmentTableBlockEntity, "enchanting_table", "enchanting_table");
  register(CampfireBlockEntity, "campfire", ["campfire", "soul_campfire"]);
  register(LecternBlockEntity, "lectern", "lectern");
  register(BeaconBlockEntity, "beacon", "beacon");
  register(SpawnerBlockEntity, "mob_spawner", "mob_spawner");
  register(TrialSpawnerBlockEntity, "trial_spawner", "trial_spawner");
  register(VaultBlockEntity, "vault", "vault");
  register(BrushableBlockEntity, "brushable_block", ["suspicious_sand", "suspicious_gravel"]);
  register(PistonMovingBlockEntity, "piston", "moving_block");
  register(SkullBlockEntity, "skull", ["skeleton_skull", "wither_skeleton_skull", "player_head", "zombie_head", "creeper_head", "dragon_head", "piglin_head"]);
  register(ConduitBlockEntity, "conduit", "conduit");
  const TEXT_COLORS = [0xF9FFFE, 0xF9801D, 0xC74EBD, 0x3AB3DA, 0xFED83D, 0x80C71F, 0xF38BAA, 0x474F52,
    0x9D9D97, 0x169C9C, 0x8932B8, 0x3C44AA, 0x835432, 0x5E7C16, 0xB02E26, 0x1D1D21];
  const dyeName = color => { const i = TEXT_COLORS.indexOf(color & 0xffffff); return i < 0 ? "black" : COLORS[i]; };
  P.CompoundTag = CompoundTag; P.BlockEntity = BlockEntity; P.ContainerBlockEntity = ContainerBlockEntity;
  P.blockEntityType = block => block && TYPES.get(P.blockId(block));
})();
