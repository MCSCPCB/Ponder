// PonderWorldParticles and the two vanilla particles Ponder spawns: DustParticle (redstone
// indicators) and TerrainParticle (block destroy effects). Particles move in scene space,
// collide with the world's blocks as full cubes, and face the screen.
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
      this.onGround = false;
      this.removed = false;
      // SingleQuadParticle
      this.quadSize = 0.1 * (Math.random() * 0.5 + 0.5) * 2;
      let xd = xSpeed + (Math.random() * 2 - 1) * 0.4, yd = ySpeed + (Math.random() * 2 - 1) * 0.4, zd = zSpeed + (Math.random() * 2 - 1) * 0.4;
      const f = (Math.random() + Math.random() + 1) * 0.15, d = Math.sqrt(xd * xd + yd * yd + zd * zd);
      this.xd = xd / d * f * 0.4; this.yd = yd / d * f * 0.4 + 0.1; this.zd = zd / d * f * 0.4;
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
      if ((x !== 0 || y !== 0 || z !== 0) && x * x + y * y + z * z < 10000) {
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
    position(pt) { return [P.lerp(pt, this.xo, this.x), P.lerp(pt, this.yo, this.y), P.lerp(pt, this.zo, this.z)]; }
  }

  // How far a box can move by `d` along `axis` before entering a block.
  function clip(world, box, axis, d) {
    if (d === 0) return d;
    const lo = box[0].slice(), hi = box[1].slice();
    if (d > 0) hi[axis] += d; else lo[axis] += d;
    const eps = 1.0e-7;
    for (let x = Math.floor(lo[0]); x < hi[0]; x++) for (let y = Math.floor(lo[1]); y < hi[1]; y++) for (let z = Math.floor(lo[2]); z < hi[2]; z++) {
      if (!world.getBlock(x, y, z)) continue;
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
      const model = P.blockModel(block), tex = P.textureAt(model.faces.north);
      const tint = model.tint || (tex && !tex.under && tex.tint) || [1, 1, 1];
      this.texture = tex && tex.under ? tex.under.url : model.faces.north;
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
  P.dust = (color, scale) => ({ make: (w, x, y, z, mx, my, mz) => new DustParticle(w, x, y, z, mx, my, mz, P.rgb(color), scale) });
  P.blockParticle = block => ({ make: (w, x, y, z, mx, my, mz) => new TerrainParticle(w, x, y, z, mx, my, mz, block) });

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
    clearEffects() { this.particles = []; }
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
        const filter = `coh-color-matrix(${p.rCol.toFixed(3)}, 0, 0, 0, 0, 0, ${p.gCol.toFixed(3)}, 0, 0, 0, 0, 0, ${p.bCol.toFixed(3)}, 0, 0, 0, 0, 0, ${p.alpha.toFixed(3)}, 0)`;
        d.sprite(sp.src, sp.u, sp.v, sp.size, sp.size, sp.texSize, sp.texSize, s[0] - half, s[1] - half, half * 2, half * 2, 1, filter);
      } };
    });
  };
})();
