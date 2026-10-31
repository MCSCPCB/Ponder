// A client entity's scripts, animations and animation controllers, run each frame into a pose
// (rotation, position and scale per bone) as the game runs them. Values stay in the files'
// convention; entity_models.js turns them into space. Interpolation follows Blockbench's
// reading of Bedrock animations.
(function () {
  const P = window.Ponder;
  // One Molang for every entity: each brings its variables, and its queries through `current`.
  const molang = new P.Molang();
  let current = null;
  molang.variableHandler = (name, context, args) => {
    if (!current) return undefined;
    if (name.startsWith("query.")) return current.query(name.slice(6), args);
    // Vanilla supplies this cat controller variable in native code. An unset variable is
    // otherwise zero, which incorrectly makes every resting cat sneak. Explicit Molang
    // variables (including a scene's setVariable) are resolved before this fallback.
    if (name === "variable.state" && current.entity.type === "minecraft:cat") {
      if (current.query("is_lying_down") || current.variables["variable.liedown_amount"] > 0) return 4;
      if (current.query("is_sitting")) return 2;
      if (current.query("is_sprinting")) return 1;
      if (current.query("is_sneaking")) return 0;
      return 3;
    }
    return undefined;
  };

  // Queries Ponder answers itself; any other is the entity's own (ClientEntity.setQuery), else 0.
  const DEFAULTS = { is_alive: 1, health: 20, model_scale: 1 };
  const lerpAngle = (pt, a, b) => a + P.wrapDegrees(b - a) * pt;

  class EntityAnimator {
    constructor(entity) { this.entity = entity; this.reset(); }
    reset() {
      this.variables = {};
      this.instances = new Map(); // animation key -> { time, frame, finished }
      this.controllers = new Map(); // controller key -> { state, prev, blendStart, blendTime }
      this.time = -1;
      this.dt = this.pt = this.animTime = 0;
      this.finished = { any: 0, all: 0 };
      this.initialized = false;
    }
    // An expression (or a number or boolean) with `extra` names in context.
    eval(expr, extra) {
      if (typeof expr === "number") return expr;
      if (typeof expr === "boolean") return expr ? 1 : 0;
      if (typeof expr !== "string") return 0;
      current = this;
      molang.variables = this.variables;
      return molang.parse(expr, extra);
    }
    run(scripts) { (Array.isArray(scripts) ? scripts : scripts ? [scripts] : []).forEach(s => this.eval(s)); }
    query(name, args) {
      const e = this.entity, own = e.queries[name];
      if (own !== undefined) return typeof own === "function" ? own(e, args) : own;
      const pt = this.pt, body = P.lerp(pt, e.yRotO, e.yRot);
      switch (name) {
        case "life_time": return this.time;
        case "life_span": return e.lifeSpan;
        case "delta_time": return this.dt;
        case "frame_alpha": return pt;
        case "anim_time": return this.animTime;
        case "key_frame_lerp_time": return this.lerpTime;
        case "any_animation_finished": return this.finished.any;
        case "all_animations_finished": return this.finished.all;
        case "is_baby": return e.baby ? 1 : 0;
        case "variant": return e.variant;
        case "mark_variant": return e.markVariant;
        case "skin_id": return e.skinId;
        case "is_on_ground": return e.onGround ? 1 : 0;
        case "is_in_water": return e.inLiquid("water") ? 1 : 0;
        case "is_in_lava": return e.inLiquid("lava") ? 1 : 0;
        case "is_moving": return e.x !== e.xo || e.y !== e.yo || e.z !== e.zo ? 1 : 0;
        case "ground_speed": return Math.hypot(e.x - e.xo, e.z - e.zo) * 20;
        case "vertical_speed": return (e.y - e.yo) * 20;
        case "position_delta": return [e.x - e.xo, e.y - e.yo, e.z - e.zo][args ? args[0] : 0] || 0;
        case "time_stamp": return e.tickCount;
        case "modified_move_speed": return P.lerp(pt, e.walkSpeedO, e.walkSpeed);
        case "modified_distance_moved": case "walk_distance": return e.walkPosition - e.walkSpeed * (1 - pt);
        case "target_x_rotation": case "head_x_rotation": return P.lerp(pt, e.xRotO, e.xRot);
        case "target_y_rotation": case "head_y_rotation":
          return e.yHeadRot == null ? 0 : P.wrapDegrees(lerpAngle(pt, e.yHeadRotO, e.yHeadRot) - body);
        case "body_y_rotation": return body;
        case "wing_flap_position": return P.lerp(pt, e.oFlap, e.flap);
        case "wing_flap_speed": return P.lerp(pt, e.oFlapSpeed, e.flapSpeed);
        case "health": case "max_health": {
          const h = e.definition().health;
          return h ? (name === "health" ? h.value : h.max) : DEFAULTS.health;
        }
        case "property": {
          const v = e.properties[args && args[0]];
          return typeof v === "string" ? "'" + v + "'" : typeof v === "boolean" ? (v ? 1 : 0) : typeof v === "number" ? v : this.eval(v);
        }
      }
      return DEFAULTS[name] || 0;
    }

    // The frame at partial tick `pt`: its time, then the definition's initialize (once) and
    // pre_animation scripts.
    // Once a frame: a second call at the same time does nothing.
    begin(pt) {
      const e = this.entity, scripts = e.definition().scripts, t = (e.tickCount + pt) / 20;
      if (this.initialized && t === this.time && pt === this.pt) return;
      this.dt = this.time < 0 ? 0 : Math.max(0, t - this.time);
      this.time = t;
      this.pt = pt;
      if (!this.initialized) { this.initialized = true; this.run(scripts.initialize); }
      this.run(scripts.pre_animation);
    }
    // Every animation the entity plays, into `pose` (bone name in lower case -> { bind, rot, pos,
    // scale, relative }): scripts.animate, the older animation_controllers list, then the ones
    // a scene added (ClientEntity.playAnimation).
    animate(pose) {
      const e = this.entity, def = e.definition();
      (def.scripts.animate || []).forEach(entry => this.entry(entry, 1, "", pose));
      def.animation_controllers.forEach(entry => {
        if (typeof entry === "string") this.play(entry, 1, "/" + entry, pose);
        else Object.keys(entry).forEach(k => this.play(entry[k], 1, "/" + k, pose));
      });
      e.extraAnimations.forEach(name => this.play(name, 1, "+" + name, pose));
    }
    // A list entry: a name, or { name: blend weight }.
    entry(entry, weight, path, pose) {
      if (typeof entry === "string") { this.play(entry, weight, path + "/" + entry, pose); return; }
      Object.keys(entry).forEach(name => this.play(name, weight * this.eval(entry[name]), path + "/" + name, pose));
    }
    // A short name (the definition's animations) or an id: an animation or a controller.
    play(name, weight, key, pose) {
      const d = P.entityData, id = this.entity.definition().animations[name] || name;
      if (d.controllers[id]) this.controller(d.controllers[id], weight, key, pose);
      else if (d.animations[id]) this.animation(d.animations[id], weight, key, pose);
    }

    // An animation controller: its state's animations, the first transition that holds taking it
    // to the next, crossfading over the state's blend_transition seconds.
    controller(c, weight, key, pose) {
      const states = c.states || {};
      let s = this.controllers.get(key);
      if (!s) {
        const first = states[c.initial_state] ? c.initial_state : states.default ? "default" : Object.keys(states)[0];
        if (!first) return;
        s = { state: first, prev: null, blendStart: 0, blendTime: 0 };
        this.controllers.set(key, s);
        this.run(states[first].on_entry);
      }
      const state = states[s.state];
      this.finished = this.stateFinished(state, key + "/" + s.state);
      for (const t of state.transitions || []) {
        const target = Object.keys(t)[0];
        if (!states[target] || !this.eval(t[target])) continue;
        this.run(state.on_exit);
        s.prev = s.state;
        s.blendTime = typeof state.blend_transition === "number" ? state.blend_transition : 0;
        s.blendStart = this.time;
        s.state = target;
        const prefix = key + "/" + target + "/";
        [...this.instances.keys()].forEach(k => { if (k.startsWith(prefix)) this.instances.delete(k); });
        [...this.controllers.keys()].forEach(k => { if (k.startsWith(prefix)) this.controllers.delete(k); });
        this.run(states[target].on_entry);
        break;
      }
      const k = s.blendTime > 0 ? P.clamp((this.time - s.blendStart) / s.blendTime, 0, 1) : 1;
      if (k < 1 && s.prev && states[s.prev]) (states[s.prev].animations || []).forEach(a => this.entry(a, weight * (1 - k), key + "/" + s.prev, pose));
      (states[s.state].animations || []).forEach(a => this.entry(a, weight * k, key + "/" + s.state, pose));
    }
    // query.any_animation_finished and all_animations_finished for a state's animations.
    stateFinished(state, path) {
      const list = [];
      (state.animations || []).forEach(a => (typeof a === "string" ? [a] : Object.keys(a)).forEach(n => {
        const inst = this.instances.get(path + "/" + n);
        if (inst) list.push(inst.finished);
      }));
      return { any: list.some(f => f) ? 1 : 0, all: list.length && list.every(f => f) ? 1 : 0 };
    }

    // An animation at its own time: anim_time_update, or the frame's delta time added; looping
    // (finished once it has played through), held on the last frame, or (loop false) held there
    // and marked finished.
    animation(a, weight, key, pose) {
      let inst = this.instances.get(key);
      if (!inst) this.instances.set(key, (inst = { time: 0, frame: null, finished: false }));
      if (inst.frame !== this.time) {
        this.animTime = inst.time;
        if (a.anim_time_update != null) inst.time = this.eval(a.anim_time_update);
        else if (inst.frame !== null) inst.time += this.dt;
        inst.frame = this.time;
      }
      const length = animationLength(a);
      let t = inst.time;
      if (a.loop === true || a.loop === "true") {
        if (t >= length) inst.finished = true;
        t = length > 0 ? t % length : 0;
      } else if (t >= length) { t = length; inst.finished = true; }
      this.animTime = t;
      if (a.blend_weight != null) weight *= this.eval(a.blend_weight);
      if (!weight || !a.bones) return;
      Object.keys(a.bones).forEach(name => {
        const b = pose.get(name.toLowerCase()), ch = a.bones[name];
        if (!b) return;
        if (ch.rotation != null) {
          if (a.override_previous_animation) b.rot = b.bind.slice();
          const v = this.sample(ch.rotation, t, b.rot);
          for (let i = 0; i < 3; i++) b.rot[i] += v[i] * weight;
        }
        if (ch.position != null) {
          if (a.override_previous_animation) b.pos = [0, 0, 0];
          const v = this.sample(ch.position, t, b.pos.map((p, i) => p + b.rest[i]));
          for (let i = 0; i < 3; i++) b.pos[i] += v[i] * weight;
        }
        if (ch.scale != null) {
          if (a.override_previous_animation) b.scale = [1, 1, 1];
          const v = this.sample(ch.scale, t, b.scale);
          for (let i = 0; i < 3; i++) b.scale[i] *= 1 + (v[i] - 1) * weight;
        }
        if (ch.relative_to && ch.relative_to.rotation === "entity") b.relative = true;
      });
    }
    // A vector value: [x, y, z], or one value for all three; `this` is the channel's value so far
  // (a position's counts from the bone's rest offset, so "-this" puts it on its parent's pivot).
    vector(value, cur) {
      if (Array.isArray(value)) return [0, 1, 2].map(i => this.eval(value[i], { this: cur[i] }));
      return [0, 1, 2].map(i => this.eval(value, { this: cur[i] }));
    }
    // A channel at time t: a constant, or keyframes interpolated linearly or by Catmull-Rom;
    // query.key_frame_lerp_time is how far t is from the keyframe before to the one after.
    sample(channel, t, cur) {
      this.lerpTime = 0;
      const frames = keyframesOf(channel);
      if (!frames) return this.vector(channel, cur);
      let i = 0;
      while (i < frames.length && frames[i].time <= t + EPSILON) i++;
      const before = frames[i - 1], after = frames[i];
      if (!after) return this.vector(before.post, cur);
      if (!before) return this.vector(after.pre, cur);
      if (Math.abs(before.time - t) < EPSILON || before.lerp === "step") return this.vector(before.post, cur);
      const alpha = this.lerpTime = (t - before.time) / (after.time - before.time);
      const p1 = this.vector(before.post, cur), p2 = this.vector(after.pre, cur);
      if (before.lerp === "catmullrom" || after.lerp === "catmullrom") {
        const bp = !before.split && frames[i - 2], ap = !after.split && frames[i + 1];
        const p0 = bp ? this.vector(bp.post, cur) : p1, p3 = ap ? this.vector(ap.pre, cur) : p2;
        return [0, 1, 2].map(k => catmullRom(alpha, p0[k], p1[k], p2[k], p3[k]));
      }
      return [0, 1, 2].map(k => P.lerp(alpha, p1[k], p2[k]));
    }
  }
  const EPSILON = 1 / 1200;
  // Uniform Catmull-Rom between p1 and p2.
  function catmullRom(t, p0, p1, p2, p3) {
    const v0 = (p2 - p0) / 2, v1 = (p3 - p1) / 2, t2 = t * t, t3 = t2 * t;
    return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1;
  }
  // A channel's keyframes in time order ({ time, pre, post, lerp, split }), or null for a
  // constant. A keyframe is a value or { pre, post, lerp_mode }; `split` when it has both.
  const keyframeCache = new WeakMap();
  function keyframesOf(channel) {
    if (!channel || typeof channel !== "object" || Array.isArray(channel)) return null;
    let frames = keyframeCache.get(channel);
    if (frames) return frames;
    const frame = (time, v) => {
      const full = v && typeof v === "object" && !Array.isArray(v);
      const pre = full ? (v.pre != null ? v.pre : v.post) : v, post = full ? (v.post != null ? v.post : v.pre) : v;
      return { time, pre, post, lerp: full ? v.lerp_mode : undefined, split: full && v.pre != null && v.post != null };
    };
    frames = "pre" in channel || "post" in channel ? [frame(0, channel)]
      : Object.keys(channel).map(k => frame(parseFloat(k), channel[k])).sort((a, b) => a.time - b.time);
    keyframeCache.set(channel, frames);
    return frames;
  }
  // animation_length, else the last keyframe's time.
  const lengthCache = new WeakMap();
  function animationLength(a) {
    if (typeof a.animation_length === "number") return a.animation_length;
    let n = lengthCache.get(a);
    if (n != null) return n;
    n = 0;
    Object.values(a.bones || {}).forEach(b => ["rotation", "position", "scale"].forEach(c => {
      const frames = keyframesOf(b[c]);
      if (frames) n = Math.max(n, frames[frames.length - 1].time);
    }));
    lengthCache.set(a, n);
    return n;
  }

  P.EntityAnimator = EntityAnimator;
  P.wrapDegrees = d => { d %= 360; if (d >= 180) d -= 360; if (d < -180) d += 360; return d; };
  P.angleLerp = lerpAngle;
})();
