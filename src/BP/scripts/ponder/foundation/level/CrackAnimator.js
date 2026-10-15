import { add } from "../VecHelper.js";
import { markOwned } from "./StageOwnership.js";
import { safeRemove } from "./StageJobs.js";

const ENTITY = "ponder:crack";

/**
 * 方块破坏进度的裂纹。每个有裂纹的方块一个实体，实体只带一个 ponder:stage 属性
 * （-1 隐藏，0..9 对应原版 destroy_stage_N），客户端用乘法混合叠在方块上，做法照 BedrockSableBeta。
 */
export class CrackAnimator {
  constructor(session) { this.session = session; this.entities = new Map(); }

  /** @param {Map<string, number>} cracks 位置键 → 当前档位 */
  sync(cracks) {
    for (const [k, entity] of this.entities) {
      if (!cracks.has(k)) { safeRemove(entity); this.entities.delete(k); }
    }
    for (const [k, stage] of cracks) {
      let entity = this.entities.get(k);
      if (!entity?.isValid) {
        const [x, y, z] = k.split(",").map(Number);
        const position = add({ x: x + .5, y, z: z + .5 }, this.session.lease.origin);
        entity = markOwned(this.session.dimension.spawnEntity(ENTITY, position), this.session.lease);
        this.entities.set(k, entity);
      }
      if (entity.getProperty("ponder:stage") !== stage) entity.setProperty("ponder:stage", stage);
    }
  }

  dispose() { for (const entity of this.entities.values()) safeRemove(entity); this.entities.clear(); }
}
