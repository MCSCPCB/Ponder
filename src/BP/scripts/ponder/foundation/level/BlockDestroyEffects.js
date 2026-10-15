import { system } from "@minecraft/server";
import { add } from "../VecHelper.js";
import { markOwned } from "./StageOwnership.js";
import { safeRemove } from "./StageJobs.js";

const ENTITY = "ponder:burst";
const LIFETIME_TICKS = 10;
const MAX_PER_RENDER = 16;

/**
 * Java 的 PonderLevel.addBlockDestroyEffects：方块破坏时的贴图碎片。
 * 粒子贴图取自载体实体所在位置的方块（见 ponder_burst.animation.json），所以载体必须在方块被替换前生成。
 */
export class BlockDestroyEffects {
  constructor(session) { this.session = session; this.carriers = new Set(); }

  /** Emits the bursts whose tick lies in (from, to]. */
  emit(breaks, from, to) {
    let emitted = 0;
    for (const e of breaks) {
      if (e.at <= from || e.at > to) continue;
      if (emitted++ >= MAX_PER_RENDER) return;
      const position = add({ x: e.position.x + .5, y: e.position.y + .5, z: e.position.z + .5 }, this.session.lease.origin);
      const carrier = markOwned(this.session.dimension.spawnEntity(ENTITY, position), this.session.lease);
      this.carriers.add(carrier);
      system.runTimeout(() => { safeRemove(carrier); this.carriers.delete(carrier); }, LIFETIME_TICKS);
    }
  }

  dispose() { for (const carrier of this.carriers) safeRemove(carrier); this.carriers.clear(); }
}
