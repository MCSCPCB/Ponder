// ParrotElementImpl and MinecartElementImpl with ParrotPose: Ponder's own entities, a parrot
// (createBirb) and a minecart (createCart), drawn from Bedrock's parrot and minecart.
(function () {
  const P = window.Ponder, M = P.Mat;
  P.ponderTicks = 0; // PonderUI.ponderTicks

  // ParrotPose. Blue parrots are left out: they are hard to see.
  const VARIANTS = [0, 2, 3, 4]; // red_blue, green, yellow_blue, grey (query.variant)
  class ParrotPose {
    tick() {}
    create(world) {
      const e = new P.ClientEntity(world, "minecraft:parrot", 0, 0, 0);
      e.variant = VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
      e.noGravity = true;
      // The element turns the parrot itself (yRot); its head keeps to the body.
      e.setQuery("target_y_rotation", 0);
      return e;
    }
  }
  // setRecordPlayingNearby, and a turn of 2 degrees a tick.
  class DancePose extends ParrotPose {
    create(world) { return super.create(world).setQuery("is_dancing", 1); }
    tick(scene, e) { e.yRotO = e.yRot; e.yRot -= 2; }
  }
  // Flaps while it moves.
  class FlappyPose extends ParrotPose {
    tick(scene, e) {
      const length = Math.hypot(e.x - e.xOld, e.y - e.yOld, e.z - e.zOld);
      e.onGround = false;
      const phase = Math.min(length * 15, 8), f = (P.ponderTicks % 100) * phase;
      e.flapSpeed = length === 0 ? 0 : Math.sin(f) + 1;
    }
  }
  // Turns its head (pitch) and body (yaw) towards a point, 0.4 of the way a tick.
  const EYE_HEIGHT = 0.54;
  class FaceVecPose extends ParrotPose {
    tick(scene, e, location) {
      const t = this.getFacedVec(scene), d0 = t[0] - (location[0] + e.x), d1 = t[1] - (location[1] + e.y + EYE_HEIGHT), d2 = t[2] - (location[2] + e.z);
      const d3 = Math.sqrt(d0 * d0 + d2 * d2), deg = 180 / Math.PI;
      const pitch = P.wrapDegrees(-(Math.atan2(d1, d3) * deg)), yaw = P.wrapDegrees(-(Math.atan2(d2, d0) * deg) + 90);
      e.xRot = P.angleLerp(0.4, e.xRot, pitch);
      e.yRot = P.angleLerp(0.4, e.yRot, yaw);
    }
  }
  class FacePointOfInterestPose extends FaceVecPose { getFacedVec(scene) { return scene.pointOfInterest; } }
  class FaceCursorPose extends FaceVecPose {
    getFacedVec(scene) { const c = P.cursor || [0, 0]; return scene.transform.screenToScene(c[0], c[1], 300, 0); }
  }
  Object.assign(ParrotPose, { DancePose, FlappyPose, FaceVecPose, FacePointOfInterestPose, FaceCursorPose });
  P.ParrotPose = ParrotPose;
  // A pose as a scene gives it: its class (Java's Supplier, FacePointOfInterestPose::new), a
  // function making one, or one.
  P.makeParrotPose = p => (typeof p === "function" ? (p === ParrotPose || p.prototype instanceof ParrotPose ? new p() : p()) : p);

  // AnimatedSceneElementBase.applyFade and lightCoordsFromFade, for elements drawing an entity.
  function fadeMatrix(e, base, pt) {
    const fade = e.fade.getValue(pt), v = e.fadeVec;
    return { m: v ? M.translate(base, v[0] * (fade - 1), v[1] * (fade - 1), v[2] * (fade - 1)) : base, light: P.lightFromFade(fade) };
  }

  class ParrotElement extends P.AnimatedSceneElement {
    constructor(location, pose) {
      super();
      this.location = location;
      this.initialPose = pose;
      this.pose = P.makeParrotPose(pose);
      this.entity = null;
    }
    reset(scene) {
      super.reset(scene);
      this.setPose(P.makeParrotPose(this.initialPose));
      const e = this.entity;
      if (!e) return;
      e.setPos(0, 0, 0);
      e.xo = e.yo = e.zo = e.xOld = e.yOld = e.zOld = 0;
      e.xRot = e.xRotO = 0;
      e.yRot = e.yRotO = 180;
    }
    create(world) {
      this.entity = this.pose.create(world);
      this.entity.yRot = this.entity.yRotO = 180;
      this.entity.xOld = this.entity.yOld = this.entity.zOld = 0;
    }
    tick(scene) {
      super.tick(scene);
      if (!this.entity) this.create(scene.world);
      const e = this.entity;
      e.tickCount++;
      e.yHeadRotO = e.yHeadRot;
      e.oFlapSpeed = e.flapSpeed;
      e.oFlap = e.flap;
      e.onGround = true;
      e.xo = e.x; e.yo = e.y; e.zo = e.z;
      e.yRotO = e.yRot; e.xRotO = e.xRot;
      this.pose.tick(scene, e, this.location);
      e.xOld = e.x; e.yOld = e.y; e.zOld = e.z;
    }
    setPositionOffset(p, immediate) {
      const e = this.entity;
      if (!e) return;
      e.setPos(p[0], p[1], p[2]);
      if (immediate) { e.xo = p[0]; e.yo = p[1]; e.zo = p[2]; }
    }
    setRotation(r, immediate) {
      const e = this.entity;
      if (!e) return;
      e.xRot = r[0]; e.yRot = r[1];
      if (immediate) { e.xRotO = e.xRot; e.yRotO = e.yRot; }
    }
    getPositionOffset() { const e = this.entity; return e ? [e.x, e.y, e.z] : [0, 0, 0]; }
    getRotation() { const e = this.entity; return e ? [e.xRot, e.yRot, 0] : [0, 0, 0]; }
    setPose(pose) { this.pose = pose; }
    // renderLast: at the location plus its offset, turned by its yaw, then as the parrot's
    // renderer draws it (body at 0).
    renderItems(scene, base, pt, blockPx) {
      if (!this.entity) this.create(scene.world);
      const e = this.entity, f = fadeMatrix(this, base, pt), l = this.location;
      let w = M.translate(M.id(), l[0] + P.lerp(pt, e.xo, e.x), l[1] + P.lerp(pt, e.yo, e.y), l[2] + P.lerp(pt, e.zo, e.z));
      w = M.rotY(w, P.angleLerp(pt, e.yRotO, e.yRot));
      w = M.rotY(w, 180);
      const s = e.scaleOf(pt);
      w = M.scale(w, s[0] / 16, s[1] / 16, s[2] / 16);
      return P.clientEntityItems(e, M.mul(f.m, w), w, pt, blockPx, f.light);
    }
  }

  // The block a minecart carries (AbstractMinecart.getDefaultDisplayBlockState) and how far up
  // (getDefaultDisplayOffset, pixels).
  const CONTENTS = {
    "minecraft:chest_minecart": ["minecraft:chest", 8], "minecraft:hopper_minecart": ["minecraft:hopper", 1],
    "minecraft:tnt_minecart": ["minecraft:tnt", 8], "minecraft:command_block_minecart": ["minecraft:command_block", 8],
  };
  // `type` is the minecart's entity id ("minecraft:minecart", "minecraft:chest_minecart"), as
  // Java's constructor (Minecart::new, MinecartChest::new).
  class MinecartElement extends P.AnimatedSceneElement {
    constructor(location, rotation, type) {
      super();
      this.initialRotation = rotation;
      this.location = [location[0], location[1] + 1 / 16, location[2]];
      this.type = type;
      this.rotation = P.angular().startWithValue(rotation);
      this.entity = null;
    }
    reset(scene) {
      super.reset(scene);
      const e = this.entity;
      if (e) { e.setPos(0, 0, 0); e.xo = e.yo = e.zo = 0; }
      this.rotation.startWithValue(this.initialRotation);
    }
    create(world) { this.entity = new P.ClientEntity(world, this.type, 0, 0, 0); this.entity.noGravity = true; }
    tick(scene) {
      super.tick(scene);
      if (!this.entity) this.create(scene.world);
      const e = this.entity;
      e.tickCount++;
      e.onGround = true;
      e.xo = e.x; e.yo = e.y; e.zo = e.z;
    }
    setPositionOffset(p, immediate) {
      const e = this.entity;
      if (!e) return;
      e.setPos(p[0], p[1], p[2]);
      if (immediate) { e.xo = p[0]; e.yo = p[1]; e.zo = p[2]; }
    }
    setRotation(angle, immediate) {
      if (!this.entity) return;
      this.rotation.setValue(angle);
      if (immediate) this.rotation.startWithValue(angle);
    }
    getPositionOffset() { const e = this.entity; return e ? [e.x, e.y, e.z] : [0, 0, 0]; }
    getRotation() { return [0, this.rotation.getValue(), 0]; }
    // renderLast, then MinecartRenderer: turned 180 degrees, and the block it carries 3/4 size.
    renderItems(scene, base, pt, blockPx) {
      if (!this.entity) this.create(scene.world);
      const e = this.entity, f = fadeMatrix(this, base, pt), l = this.location;
      let w = M.translate(M.id(), l[0] + P.lerp(pt, e.xo, e.x), l[1] + P.lerp(pt, e.yo, e.y), l[2] + P.lerp(pt, e.zo, e.z));
      w = M.rotY(M.rotY(w, this.rotation.getValue(pt)), 180);
      const s = e.scaleOf(pt), model = M.scale(w, s[0] / 16, s[1] / 16, s[2] / 16);
      const out = P.clientEntityItems(e, M.mul(f.m, model), model, pt, blockPx, f.light);
      const contents = CONTENTS[this.type];
      if (contents) {
        let b = M.translate(w, 0, 0.375, 0);
        b = M.rotY(M.translate(M.scale(b, 0.75, 0.75, 0.75), -0.5, (contents[1] - 8) / 16, 0.5), 90);
        const c = M.translate(M.mul(f.m, b), 0.5, 0.5, 0.5), centre = M.apply(c, 0, 0, 0);
        out.push({ depth: centre[2], draw: d => P.drawBlockCube(d, c, contents[0], blockPx * 0.75) });
      }
      return out;
    }
  }
  P.ParrotElement = ParrotElement;
  P.MinecartElement = MinecartElement;
})();
