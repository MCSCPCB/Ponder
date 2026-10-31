// PonderWorldParticles and scene particle factories. Particles move in scene space and face
// the screen; vanilla motion and sprite selection follow the Java Ponder client.
(function () {
  const P = window.Ponder, M = P.Mat;
  const SHEET = "pack://textures/particle/particles.png?filtering=point";

  // Particle: a 0.2 block box standing on (x, y, z).
  class Particle {
    constructor(world, x, y, z, xSpeed, ySpeed, zSpeed) {
      this.world = world;
      this.halfWidth = 0.1; this.height = 0.2;
      this.x = this.xo = x; this.y = this.yo = y; this.z = this.zo = z;
      this.rCol = this.gCol = this.bCol = this.alpha = 1;
      this.age = 0;
      this.lifetime = P.int(4 / (Math.random() * 0.9 + 0.1));
      this.gravity = 0;
      this.friction = 0.98;
      this.speedUpWhenYMotionIsBlocked = false;
      this.stoppedByCollision = false;
      this.hasPhysics = true;
      this.onGround = false;
      this.removed = false;
      // SingleQuadParticle
      this.quadSize = 0.1 * (Math.random() * 0.5 + 0.5) * 2;
      let xd = xSpeed + (Math.random() * 2 - 1) * 0.4, yd = ySpeed + (Math.random() * 2 - 1) * 0.4, zd = zSpeed + (Math.random() * 2 - 1) * 0.4;
      const f = (Math.random() + Math.random() + 1) * 0.15, d = Math.sqrt(xd * xd + yd * yd + zd * zd);
      this.xd = d ? xd / d * f * 0.4 : 0; this.yd = (d ? yd / d * f * 0.4 : 0) + 0.1; this.zd = d ? zd / d * f * 0.4 : 0;
    }
    tick() {
      this.xo = this.x; this.yo = this.y; this.zo = this.z;
      if (this.age++ >= this.lifetime) { this.removed = true; return; }
      this.yd -= 0.04 * this.gravity;
      this.move(this.xd, this.yd, this.zd);
      if (this.speedUpWhenYMotionIsBlocked && this.y === this.yo) { this.xd *= 1.1; this.zd *= 1.1; }
      this.xd *= this.friction; this.yd *= this.friction; this.zd *= this.friction;
      if (this.onGround) { this.xd *= 0.7; this.zd *= 0.7; }
    }
    move(x, y, z) {
      if (this.stoppedByCollision) return;
      const x0 = x, y0 = y, z0 = z;
      if (this.hasPhysics && (x !== 0 || y !== 0 || z !== 0) && x * x + y * y + z * z < 10000) {
        // Entity.collideBoundingBox: Y first, then the smaller of X and Z last.
        const box = this.box();
        y = clip(this.world, box, 1, y); box[0][1] += y; box[1][1] += y;
        const xFirst = Math.abs(x) >= Math.abs(z);
        if (xFirst) { x = clip(this.world, box, 0, x); box[0][0] += x; box[1][0] += x; }
        z = clip(this.world, box, 2, z); box[0][2] += z; box[1][2] += z;
        if (!xFirst) x = clip(this.world, box, 0, x);
      }
      this.x += x; this.y += y; this.z += z;
      if (Math.abs(y0) >= 1.0e-5 && Math.abs(y) < 1.0e-5) this.stoppedByCollision = true;
      this.onGround = y0 !== y && y0 < 0;
      if (x0 !== x) this.xd = 0;
      if (z0 !== z) this.zd = 0;
    }
    box() {
      return [[this.x - this.halfWidth, this.y, this.z - this.halfWidth], [this.x + this.halfWidth, this.y + this.height, this.z + this.halfWidth]];
    }
    getQuadSize() { return this.quadSize; }
    getColor() { return [this.rCol, this.gCol, this.bCol]; }
    getAlpha() { return this.alpha; }
    position(pt) { return [P.lerp(pt, this.xo, this.x), P.lerp(pt, this.yo, this.y), P.lerp(pt, this.zo, this.z)]; }
  }

  // How far a box can move by `d` along `axis` before entering a block.
  function clip(world, box, axis, d) {
    if (d === 0) return d;
    const lo = box[0].slice(), hi = box[1].slice();
    if (d > 0) hi[axis] += d; else lo[axis] += d;
    const eps = 1.0e-7;
    for (let x = Math.floor(lo[0]); x < hi[0]; x++) for (let y = Math.floor(lo[1]); y < hi[1]; y++) for (let z = Math.floor(lo[2]); z < hi[2]; z++) {
      const block = world.getBlock(x, y, z);
      if (!block || /^minecraft:(?:flowing_)?(?:water|lava)$/.test(P.blockId(block))) continue;
      const b = [x, y, z], other = [0, 1, 2].filter(a => a !== axis);
      if (other.some(a => box[1][a] <= b[a] + eps || box[0][a] >= b[a] + 1 - eps)) continue;
      if (d > 0 && box[1][axis] <= b[axis] + eps) d = Math.min(d, b[axis] - box[1][axis]);
      else if (d < 0 && box[0][axis] >= b[axis] + 1 - eps) d = Math.max(d, b[axis] + 1 - box[0][axis]);
    }
    return d;
  }
  P.collide = clip;
  // DustParticleBase: sprites generic_7..generic_0 (row 0 of particles.png, 8 px each) by age.
  class DustParticle extends Particle {
    constructor(world, x, y, z, xSpeed, ySpeed, zSpeed, color, scale) {
      super(world, x, y, z, xSpeed, ySpeed, zSpeed);
      this.friction = 0.96;
      this.speedUpWhenYMotionIsBlocked = true;
      this.xd *= 0.1; this.yd *= 0.1; this.zd *= 0.1;
      const f = Math.random() * 0.4 + 0.6, randomize = c => (Math.random() * 0.2 + 0.8) * c * f;
      this.rCol = randomize(color[0]); this.gCol = randomize(color[1]); this.bCol = randomize(color[2]);
      this.quadSize *= 0.75 * scale;
      const i = P.int(8 / (Math.random() * 0.8 + 0.2));
      this.lifetime = P.int(Math.max(i * scale, 1));
    }
    getQuadSize(pt) { return this.quadSize * P.clamp((this.age + pt) / this.lifetime * 32, 0, 1); }
    sprite() { const frame = 7 - P.int(this.age * 7 / this.lifetime); return { src: SHEET, u: frame * 8, v: 0, size: 8, texSize: 128 }; }
  }

  // TerrainParticle: a random 4x4 pixel piece of the block's texture, falling.
  class TerrainParticle extends Particle {
    constructor(world, x, y, z, xSpeed, ySpeed, zSpeed, block) {
      super(world, x, y, z, xSpeed, ySpeed, zSpeed);
      // The face's texture with the tint the block gives it (leaves: plains' foliage); an
      // overlay's (grass_side) is the image under it, untinted.
      const model = P.blockModel(block), face = model.faces && model.faces.north || model.quads && model.quads.length && model.quads[0].look.tex.url;
      const tex = P.textureAt(face);
      const tint = model.tint || (tex && !tex.under && tex.tint) || [1, 1, 1];
      this.texture = tex && tex.under ? tex.under.url : face;
      this.gravity = 1;
      this.rCol = 0.6 * tint[0]; this.gCol = 0.6 * tint[1]; this.bCol = 0.6 * tint[2];
      this.quadSize /= 2;
      this.uo = Math.random() * 3; this.vo = Math.random() * 3;
    }
    getQuadSize() { return this.quadSize; }
    sprite() { return { src: this.texture, u: this.uo * 4, v: this.vo * 4, size: 4, texSize: 16 }; }
  }

  // ParticleOptions: what world.addParticle makes. A plugin's own particle subclasses P.Particle
  // with sprite() (and getQuadSize(pt) if its size changes) and is wrapped the same way:
  //   { make: (world, x, y, z, xSpeed, ySpeed, zSpeed) => new MyParticle(world, x, y, z, ...) }
  P.dust = (color, scale) => ({ make: (w, x, y, z, mx, my, mz) => new DustParticle(w, x, y, z, mx, my, mz, P.rgb(color), scale == null ? 1 : P.clamp(scale, 0.01, 4)) });
  P.blockParticle = block => ({ make: (w, x, y, z, mx, my, mz) => new TerrainParticle(w, x, y, z, mx, my, mz, block) });

  // SmokeParticle uses the generic fading sprite set.
  class SmokeParticle extends Particle {
    constructor(world, x, y, z, mx, my, mz, scale) {
      super(world, x, y, z, mx, my, mz);
      this.friction = 0.96; this.gravity = -0.1;
      this.xd = this.xd * 0.1 + mx; this.yd = this.yd * 0.1 + my; this.zd = this.zd * 0.1 + mz;
      this.rCol = this.gCol = this.bCol = Math.random() * 0.3;
      this.quadSize *= 0.75 * scale;
      this.lifetime = Math.max(1, P.int(8 / (Math.random() * 0.8 + 0.2) * scale));
      this.speedUpWhenYMotionIsBlocked = true;
    }
    getQuadSize(pt) { return this.quadSize * P.clamp((this.age + pt) / this.lifetime * 32, 0, 1); }
    sprite() { return { src: SHEET, u: (7 - P.int(this.age * 7 / this.lifetime)) * 8, v: 0, size: 8, texSize: 128 }; }
  }
  class ExplodeParticle extends Particle {
    constructor(world, x, y, z, mx, my, mz, spit) {
      super(world, x, y, z, 0, 0, 0);
      this.gravity = spit ? 0.5 : -0.1; this.friction = 0.9;
      this.xd = mx + (Math.random() * 2 - 1) * 0.05; this.yd = my + (Math.random() * 2 - 1) * 0.05; this.zd = mz + (Math.random() * 2 - 1) * 0.05;
      this.rCol = this.gCol = this.bCol = Math.random() * 0.3 + 0.7;
      this.quadSize = 0.1 * (Math.random() * Math.random() * 6 + 1);
      this.lifetime = P.int(16 / (Math.random() * 0.8 + 0.2)) + 2;
    }
    sprite() { return sprite("poof", this.age, this.lifetime); }
  }
  class ItemParticle extends Particle {
    constructor(world, x, y, z, mx, my, mz, item) {
      super(world, x, y, z, mx, my, mz);
      this.gravity = 1; this.quadSize /= 2;
      this.xd = this.xd * 0.1 + mx; this.yd = this.yd * 0.1 + my; this.zd = this.zd * 0.1 + mz;
      this.texture = P.itemIcon(typeof item === "string" ? item : item.id, 16);
      this.uo = Math.random() * 3; this.vo = Math.random() * 3;
    }
    sprite() { return { src: this.texture, u: this.uo * 4, v: this.vo * 4, size: 4, texSize: 16 }; }
  }
  class CampfireSmokeParticle extends Particle {
    constructor(world, x, y, z, mx, my, mz, signal) {
      super(world, x, y, z, 0, 0, 0);
      this.quadSize *= 3; this.halfWidth = 0.125; this.height = 0.25;
      this.lifetime = Math.floor(Math.random() * 50) + (signal ? 280 : 80);
      this.xd = mx; this.yd = my + Math.random() / 500; this.zd = mz;
      this.alpha = 0.9; this.frame = Math.floor(Math.random() * 12);
    }
    tick() {
      this.xo = this.x; this.yo = this.y; this.zo = this.z;
      if (this.age++ >= this.lifetime || this.alpha <= 0) { this.removed = true; return; }
      this.xd += Math.random() / 5000 * (Math.random() < 0.5 ? -1 : 1);
      this.zd += Math.random() / 5000 * (Math.random() < 0.5 ? -1 : 1);
      this.yd -= 0.000003;
      this.move(this.xd, this.yd, this.zd);
      if (this.age >= this.lifetime - 60 && this.alpha > 0.01) this.alpha = Math.max(0, this.alpha - 0.015);
    }
    sprite() { return { src: "pack://textures/particle/campfire_smoke.png?filtering=point", u: 0, v: this.frame * 16, size: 16, texSize: 16, texHeight: 192 }; }
  }
  class FlameParticle extends Particle {
    constructor(world, x, y, z, mx, my, mz, kind) {
      super(world, x, y, z, mx, my, mz);
      this.friction = 0.96; this.kind = kind;
      this.xd = this.xd * 0.01 + mx; this.yd = this.yd * 0.01 + my; this.zd = this.zd * 0.01 + mz;
      this.x += (Math.random() - Math.random()) * 0.05; this.y += (Math.random() - Math.random()) * 0.05; this.z += (Math.random() - Math.random()) * 0.05;
      this.lifetime = Math.floor(8 / (Math.random() * 0.8 + 0.2)) + 4;
      if (kind === "small_flame") this.quadSize *= 0.5;
    }
    move(x, y, z) { this.x += x; this.y += y; this.z += z; }
    getQuadSize(pt) { const t = (this.age + pt) / this.lifetime; return this.quadSize * (1 - t * t * 0.5); }
    sprite() { return { src: SHEET, u: this.kind === "soul_fire_flame" ? 16 : 0, v: 24, size: 8, texSize: 128 }; }
  }
  P.ParticleTypes = { SMOKE: { make: (...args) => new SmokeParticle(...args, 1) }, LARGE_SMOKE: { make: (...args) => new SmokeParticle(...args, 2.5) }, SPIT: { make: (...args) => new ExplodeParticle(...args, true) }, POOF: { make: (...args) => new ExplodeParticle(...args, false) } };
  ["flame", "small_flame", "soul_fire_flame"].forEach(kind => { P.ParticleTypes[kind.toUpperCase()] = { make: (...args) => new FlameParticle(...args, kind) }; });
  P.ParticleTypes.CAMPFIRE_COSY_SMOKE = { make: (...args) => new CampfireSmokeParticle(...args, false) };
  P.ParticleTypes.CAMPFIRE_SIGNAL_SMOKE = { make: (...args) => new CampfireSmokeParticle(...args, true) };
  P.itemParticle = item => ({ make: (...args) => new ItemParticle(...args, item) });

  // SpriteSet.get(age, lifetime) includes the final frame at the end of the lifetime.
  function sprite(name, age, lifetime) {
    const frames = P.vanilla.client.particles[name];
    return frames[P.clamp(Math.floor(age * (frames.length - 1) / Math.max(1, lifetime)), 0, frames.length - 1)];
  }
  class SpriteParticle extends Particle {
    constructor(world, x, y, z, mx, my, mz, kind) {
      super(world, x, y, z, mx, my, mz); this.kind = kind;
      this.frame = Math.random(); this.animated = false;
    }
    sprite() {
      const frames = P.vanilla.client.particles[this.kind];
      return this.animated ? sprite(this.kind, this.age, this.lifetime) : frames[Math.floor(this.frame * frames.length)];
    }
  }
  class HeartParticle extends SpriteParticle {
    constructor(world, x, y, z, mx, my, mz, kind) {
      super(world, x, y + (kind === "angry_villager" ? 0.5 : 0), z, 0, 0, 0, kind);
      this.friction = 0.86; this.speedUpWhenYMotionIsBlocked = true; this.hasPhysics = false;
      this.xd *= 0.01; this.yd = this.yd * 0.01 + 0.1; this.zd *= 0.01;
      this.quadSize *= 1.5; this.lifetime = 16;
      if (kind === "note") {
        this.friction = 0.66; this.hasPhysics = true; this.yd += 0.1; this.lifetime = 6;
        [this.rCol, this.gCol, this.bCol] = [0, 1 / 3, 2 / 3].map(offset => Math.max(0, Math.sin((mx + offset) * Math.PI * 2) * 0.65 + 0.35));
      }
    }
    getQuadSize(pt) { return this.quadSize * P.clamp((this.age + pt) / this.lifetime * 32, 0, 1); }
  }
  class CritParticle extends SpriteParticle {
    constructor(world, x, y, z, mx, my, mz, kind) {
      super(world, x, y, z, 0, 0, 0, kind);
      this.friction = 0.7; this.gravity = 0.5; this.hasPhysics = false;
      this.xd = this.xd * 0.1 + mx * 0.4; this.yd = this.yd * 0.1 + (my + (kind === "damage_indicator" ? 1 : 0)) * 0.4; this.zd = this.zd * 0.1 + mz * 0.4;
      this.rCol = this.gCol = this.bCol = Math.random() * 0.3 + 0.6;
      this.quadSize *= 0.75; this.lifetime = Math.max(Math.floor(6 / (Math.random() * 0.8 + 0.6)), 1);
      this.tick();
      if (kind === "enchanted_hit") { this.rCol *= 0.3; this.gCol *= 0.8; }
      if (kind === "damage_indicator") this.lifetime = 20;
    }
    tick() { super.tick(); this.gCol *= 0.96; this.bCol *= 0.9; }
    getQuadSize(pt) { return this.quadSize * P.clamp((this.age + pt) / this.lifetime * 32, 0, 1); }
  }
  class PortalParticle extends SpriteParticle {
    constructor(world, x, y, z, mx, my, mz, kind) {
      super(world, x, y, z, 0, 0, 0, kind);
      this.origin = [x, y, z]; this.xd = mx; this.yd = my; this.zd = mz; this.hasPhysics = false;
      this.quadSize = 0.1 * (Math.random() * 0.2 + 0.5);
      const color = Math.random() * 0.6 + 0.4;
      this.rCol = color * 0.9; this.gCol = color * 0.3; this.bCol = color;
      this.lifetime = Math.floor(Math.random() * 10) + 40;
      if (kind === "reverse_portal") { this.quadSize *= 1.5; this.lifetime = Math.floor(Math.random() * 2) + 60; }
    }
    tick() {
      this.xo = this.x; this.yo = this.y; this.zo = this.z;
      if (this.age++ >= this.lifetime) { this.removed = true; return; }
      const t = this.age / this.lifetime, curve = 1 + t - 2 * t * t;
      if (this.kind === "reverse_portal") { this.x += this.xd * t; this.y += this.yd * t; this.z += this.zd * t; }
      else { this.x = this.origin[0] + this.xd * curve; this.y = this.origin[1] + this.yd * curve + 1 - t; this.z = this.origin[2] + this.zd * curve; }
    }
    getQuadSize(pt) {
      const t = (this.age + pt) / this.lifetime;
      return this.quadSize * (this.kind === "reverse_portal" ? 1 - t / 1.5 : 1 - (1 - t) * (1 - t));
    }
  }
  class FlyParticle extends SpriteParticle {
    constructor(world, x, y, z, mx, my, mz, kind) {
      super(world, x + mx, y + my, z + mz, 0, 0, 0, kind);
      this.origin = [x, y, z]; this.xd = mx; this.yd = my; this.zd = mz; this.hasPhysics = false;
      this.quadSize = 0.1 * (Math.random() * 0.5 + 0.2);
      const color = Math.random() * 0.6 + 0.4;
      this.rCol = this.gCol = color * 0.9; this.bCol = color; this.lifetime = Math.floor(Math.random() * 10) + 30;
      if (kind === "vault_connection") { this.quadSize *= 1.5; this.alpha = 0; }
    }
    tick() {
      this.xo = this.x; this.yo = this.y; this.zo = this.z;
      if (this.age++ >= this.lifetime) { this.removed = true; return; }
      const t = this.age / this.lifetime;
      this.x = this.origin[0] + this.xd * (1 - t); this.y = this.origin[1] + this.yd * (1 - t) - Math.pow(t, 4) * 1.2; this.z = this.origin[2] + this.zd * (1 - t);
      if (this.kind === "vault_connection") this.alpha = this.getAlpha(0);
    }
    getAlpha(pt) { return this.kind === "vault_connection" ? P.clamp(((this.age + pt) / this.lifetime - 0.25) / 0.75, 0, 1) * 0.6 : this.alpha; }
  }
  class SuspendedParticle extends SpriteParticle {
    constructor(world, x, y, z, mx, my, mz, kind) {
      super(world, x, y, z, mx, my, mz, kind);
      this.rCol = this.gCol = this.bCol = Math.random() * 0.1 + 0.2;
      this.halfWidth = 0.01; this.height = 0.02; this.quadSize *= Math.random() * 0.6 + 0.5;
      this.xd *= 0.02; this.yd *= 0.02; this.zd *= 0.02; this.friction = 0.99; this.hasPhysics = false;
      this.lifetime = Math.floor(20 / (Math.random() * 0.8 + 0.2));
      if (kind !== "mycelium") this.rCol = this.gCol = this.bCol = 1;
      if (kind === "composter") this.lifetime = 3 + Math.floor(Math.random() * 5);
      if (kind === "dolphin") { this.rCol = 0.3; this.gCol = 0.5; this.bCol = 1; this.alpha = 1 - Math.random() * 0.7; this.lifetime = Math.floor(this.lifetime / 2); }
    }
  }
  function inWater(p) {
    const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z), block = p.world.getBlock(x, y, z);
    return P.liquidKind(block) === "water" && p.y < y + P.liquidHeight(block, p.world.getBlock(x, y + 1, z));
  }
  class BubbleParticle extends SpriteParticle {
    constructor(world, x, y, z, mx, my, mz, kind) {
      super(world, x, y, z, 0, 0, 0, kind);
      this.halfWidth = 0.01; this.height = 0.02; this.quadSize *= Math.random() * 0.6 + 0.2;
      this.xd = mx * 0.2 + (Math.random() * 2 - 1) * 0.02; this.yd = my * 0.2 + (Math.random() * 2 - 1) * 0.02; this.zd = mz * 0.2 + (Math.random() * 2 - 1) * 0.02;
      this.gravity = kind === "bubble_column_up" ? -0.125 : -0.05; this.friction = 0.85;
      this.lifetime = Math.floor((kind === "bubble_column_up" ? 40 : 8) / (Math.random() * 0.8 + 0.2));
      if (kind === "bubble_pop") {
        this.quadSize = 0.1 * (Math.random() * 0.5 + 0.5) * 2; this.halfWidth = 0.1; this.height = 0.2;
        this.xd = mx; this.yd = my; this.zd = mz; this.gravity = 0.2; this.friction = 1; this.lifetime = 4; this.animated = true;
      }
    }
    tick() { super.tick(); if (this.kind !== "bubble_pop" && !inWater(this)) this.removed = true; }
  }
  class SpellParticle extends SpriteParticle {
    constructor(world, x, y, z, mx, my, mz, kind) {
      super(world, x, y, z, 0.5 - Math.random(), my, 0.5 - Math.random(), kind);
      this.friction = 0.96; this.gravity = -0.1; this.speedUpWhenYMotionIsBlocked = true; this.hasPhysics = false; this.animated = true;
      this.yd *= 0.2; if (!mx && !mz) { this.xd *= 0.1; this.zd *= 0.1; }
      this.quadSize *= 0.75; this.lifetime = Math.floor(8 / (Math.random() * 0.8 + 0.2));
      if (kind === "witch") { this.rCol = this.bCol = Math.random() * 0.5 + 0.35; this.gCol = 0; }
    }
  }
  class FadingParticle extends SpriteParticle {
    constructor(world, x, y, z, mx, my, mz, kind) {
      super(world, x, y, z, 0, 0, 0, kind);
      this.xd = mx; this.yd = my; this.zd = mz; this.quadSize *= 0.75; this.lifetime = 60 + Math.floor(Math.random() * 12); this.animated = true;
      this.friction = kind === "end_rod" ? 0.91 : 0.6; this.gravity = kind === "end_rod" ? 0.0125 : 1.25; this.hasPhysics = kind !== "end_rod";
      if (kind === "totem_of_undying") {
        const gold = Math.random() < 0.25;
        this.rCol = (gold ? 0.6 : 0.1) + Math.random() * 0.2; this.gCol = (gold ? 0.6 : 0.4) + Math.random() * 0.3; this.bCol = Math.random() * 0.2;
      }
    }
    tick() {
      super.tick();
      if (this.age > this.lifetime / 2) {
        this.alpha = 1 - (this.age - Math.floor(this.lifetime / 2)) / this.lifetime;
        if (this.kind === "end_rod") {
          const to = P.rgb(15916745); this.rCol += (to[0] - this.rCol) * 0.2; this.gCol += (to[1] - this.gCol) * 0.2; this.bCol += (to[2] - this.bCol) * 0.2;
        }
      }
    }
  }
  class DropParticle extends SpriteParticle {
    constructor(world, x, y, z, mx, my, mz, kind) {
      super(world, x, y, z, 0, 0, 0, kind);
      this.xd *= 0.3; this.zd *= 0.3; this.yd = Math.random() * 0.2 + 0.1;
      this.halfWidth = 0.005; this.height = 0.01; this.gravity = kind === "splash" ? 1 : 1.5;
      this.lifetime = Math.floor(8 / (Math.random() * 0.8 + 0.2));
      if (kind === "splash" && my === 0 && (mx !== 0 || mz !== 0)) { this.xd = mx; this.yd = 0.1; this.zd = mz; }
      if (kind === "fishing") { this.xd = mx; this.yd = my; this.zd = mz; this.gravity = 0; }
    }
    tick() {
      super.tick();
      if (this.kind === "fishing") { const size = (60 - this.lifetime + this.age - 1) * 0.001; this.halfWidth = size / 2; this.height = size; return; }
      if (this.onGround && Math.random() < 0.5 || inWater(this)) this.removed = true;
    }
    sprite() { return this.kind === "fishing" ? sprite(this.kind, (60 - this.lifetime + this.age - 1) % 4, 4) : super.sprite(); }
  }
  class LavaParticle extends SpriteParticle {
    constructor(world, x, y, z) {
      super(world, x, y, z, 0, 0, 0, "lava"); this.gravity = 0.75; this.friction = 0.999;
      this.xd *= 0.8; this.zd *= 0.8; this.yd = Math.random() * 0.4 + 0.05; this.quadSize *= Math.random() * 2 + 0.2;
      this.lifetime = Math.floor(16 / (Math.random() * 0.8 + 0.2));
    }
    tick() {
      super.tick();
      if (!this.removed && Math.random() > this.age / this.lifetime) this.world.addParticle(P.ParticleTypes.SMOKE, this.x, this.y, this.z, this.xd, this.yd, this.zd);
    }
    getQuadSize(pt) { const t = (this.age + pt) / this.lifetime; return this.quadSize * (1 - t * t); }
  }
  class TransitionParticle extends DustParticle {
    constructor(world, x, y, z, mx, my, mz, from, to, scale) {
      super(world, x, y, z, mx, my, mz, from, scale);
      const shade = Math.random() * 0.4 + 0.6, randomize = color => color.map(c => c * (Math.random() * 0.2 + 0.8) * shade);
      this.from = randomize(from); this.to = randomize(to);
    }
    getColor(pt) { return this.from.map((v, i) => P.lerp((this.age + pt) / (this.lifetime + 1), v, this.to[i])); }
  }
  const register = (names, Type) => names.split(" ").forEach(kind => { P.ParticleTypes[kind.toUpperCase()] = { make: (...args) => new Type(...args, kind) }; });
  register("heart angry_villager note", HeartParticle);
  register("crit enchanted_hit damage_indicator", CritParticle);
  register("portal reverse_portal", PortalParticle);
  register("enchant nautilus vault_connection", FlyParticle);
  register("happy_villager composter egg_crack mycelium dolphin", SuspendedParticle);
  register("bubble bubble_column_up bubble_pop", BubbleParticle);
  register("effect instant_effect entity_effect witch", SpellParticle);
  register("end_rod totem_of_undying", FadingParticle);
  register("rain splash fishing", DropParticle);
  P.ParticleTypes.LAVA = { make: (...args) => new LavaParticle(...args) };
  P.ParticleTypes.WHITE_SMOKE = { make: (...args) => { const p = new SmokeParticle(...args, 1); p.rCol = 0.7294118; p.gCol = 0.69411767; p.bCol = 0.7607843; return p; } };
  P.dustTransition = (from, to, scale) => ({ make: (...args) => new TransitionParticle(...args, P.rgb(from), P.rgb(to), scale == null ? 1 : P.clamp(scale, 0.01, 4)) });
  P.entityEffect = (color, alpha) => ({ make: (...args) => {
    const p = new SpellParticle(...args, "entity_effect"); [p.rCol, p.gCol, p.bCol] = P.rgb(color); p.alpha = alpha == null ? 1 : alpha; return p;
  } });

  class PonderWorldParticles {
    constructor(world) { this.world = world; this.particles = []; this.queue = []; }
    addParticle(p) { this.queue.push(p); }
    tick() {
      this.particles.forEach(p => p.tick());
      this.particles = this.particles.filter(p => !p.removed);
      if (!this.queue.length) return;
      // EvictingQueue.create(16384)
      this.particles = this.particles.concat(this.queue).slice(-16384);
      this.queue = [];
    }
    clearEffects() { this.particles = []; this.queue = []; }
  }
  P.PonderWorldParticles = PonderWorldParticles;
  P.Particle = Particle;
  P.DustParticle = DustParticle;
  P.TerrainParticle = TerrainParticle;

  // Screen-facing squares in the depth order of the scene's blocks.
  P.particleItems = function (scene, pt) {
    const m = scene.transform.matrix(pt), blockPx = 30 * scene.scaleFactor;
    return scene.world.particles.particles.map(p => {
      const c = p.position(pt), s = M.apply(m, c[0], c[1], c[2]);
      return { depth: s[2], draw: d => {
        const half = p.getQuadSize(pt) * blockPx, sp = p.sprite();
        const color = p.getColor(pt);
        const filter = `coh-color-matrix(${color[0].toFixed(3)}, 0, 0, 0, 0, 0, ${color[1].toFixed(3)}, 0, 0, 0, 0, 0, ${color[2].toFixed(3)}, 0, 0, 0, 0, 0, ${p.getAlpha(pt).toFixed(3)}, 0)`;
        const h = sp.texHeight || sp.texSize, uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
        d.texturedQuadMap(sp.src, [s[0] - half, s[1] - half, s[2]], [s[0] + half, s[1] - half, s[2]], [s[0] - half, s[1] + half, s[2]],
          uv[0], uv[1], uv[3], uv, filter, Math.max(8, Math.round(half * 2 * P.view.cssPerGui)), [sp.u / sp.texSize, sp.v / h, (sp.u + sp.size) / sp.texSize, (sp.v + sp.size) / h]);
      } };
    });
  };
})();
