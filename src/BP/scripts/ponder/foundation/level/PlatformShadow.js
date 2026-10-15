import { add } from "../VecHelper.js";
import { markOwned } from "./StageOwnership.js";
import { safeRemove } from "./StageJobs.js";

const ENTITY = "ponder:shadow";
const FLASH_WARMUP_TICKS = 30;
const FLASH_CHASE = .1;

const round = value => Math.round(value * 1000) / 1000;

/**
 * Java PonderUI 的 "kool shadow fx"：底板四周向下的黑色渐变，以及场景播完后向上的绿色闪光。
 * 一个实体承载八个面（渲染见 ponder_shadow.animation.json），属性只有尺寸和闪光两个值。
 */
export class PlatformShadow {
  constructor(session, scene) {
    this.session = session; this.scene = scene; this.entity = undefined;
    this.warmup = 0; this.flash = 0; this.values = {};
  }

  /** Called once per server tick with the scene clock; mirrors PonderUI.tick's finishingFlash. */
  tick(clockTick) {
    if (this.scene.hidePlatformShadow) return;
    this.ensure();
    if (clockTick === this.scene.timeline.counted - 1) this.warmup = FLASH_WARMUP_TICKS;
    if (this.warmup > 0 && --this.warmup === 0) this.flash = 1;
    else this.flash += (0 - this.flash) * FLASH_CHASE;
    if (this.flash < .002) this.flash = 0;
    this.apply();
  }

  /** Seeking or replaying drops any flash in flight. */
  reset() { this.warmup = 0; this.flash = 0; if (this.entity?.isValid) this.apply(); }

  ensure() {
    if (this.entity?.isValid) return;
    const { xOffset, zOffset, size } = this.scene.basePlate;
    const position = add({ x: xOffset + size / 2, y: 0, z: zOffset + size / 2 }, this.session.lease.origin);
    this.entity = markOwned(this.session.dimension.spawnEntity(ENTITY, position), this.session.lease);
    this.values = {};
    this.set("size", size);
  }

  apply() {
    // Java: alpha = flash * .9; the glow height swells with a bell curve of that alpha.
    const alpha = this.flash * .9, bell = 1 - (alpha * alpha * 2 - 1) ** 2;
    this.set("flash_alpha", bell > 0 ? alpha : 0);
    this.set("flash", Math.max(0, bell));
  }

  set(name, value) {
    const next = round(value);
    if (this.values[name] === next) return;
    this.entity.setProperty(`ponder:${name}`, next);
    this.values[name] = next;
  }

  dispose() { safeRemove(this.entity); this.entity = undefined; }
}
