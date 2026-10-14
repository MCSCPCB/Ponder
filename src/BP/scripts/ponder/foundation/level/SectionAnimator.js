import { EquipmentSlot, EntityComponentTypes, ItemStack } from "@minecraft/server";
import { add, unkey } from "../VecHelper.js";
import { markOwned } from "./StageOwnership.js";
import { safeRemove } from "./StageJobs.js";

const ENTITY = "ponder:section_block";
const TAG_PREFIX = "ponder_anim_";
let serial = 0;
const nextSerial = () => (serial = serial % 1000000 + 1);
const num = value => Number(value.toFixed(4));

/**
 * Animates blocks that fade in, fade out or move, the way LordPhysics does it:
 * the entity never moves. Its held block is drawn by the client, and one
 * `playanimation` per batch writes the molang variables that drive the pose.
 *
 * Variables written to the entity (see ponder_section_block.entity.json):
 *   v.s    sequence number, so the client notices a new packet and restarts its clock
 *   v.dur  fade duration (seconds), v.dir 1 appearing / -1 disappearing, v.dy start offset (blocks)
 *   v.ox/oy/oz  offset the batch rests at; v.mx/my/mz offset it is moving to over v.mdur seconds
 *   v.rx/ry/rz  rotation it rests at; v.sx/sy/sz rotation it turns to over v.mdur (degrees)
 *
 * Opacity is not available on a held item, so fading is a scale from 0.001 to
 * full size combined with the slide, which is how the client reads v.k.
 */
export class SectionAnimator {
  constructor(session) { this.session = session; this.batches = new Map(); }

  /** Reconciles the visible animated batches with `wanted`. */
  sync(wanted) {
    for (const [id, batch] of this.batches) if (!wanted.has(id)) this.retire(id, batch);
    for (const [id, want] of wanted) {
      let batch = this.batches.get(id);
      if (!batch) {
        batch = this.spawn(id, want);
      }
      if (batch.signature !== want.signature) this.send(batch, want);
    }
  }

  spawn(id, want) {
    const { session } = this, tag = `${TAG_PREFIX}${session.lease.id}_${id}`;
    const entities = want.cells.map(cell => {
      const position = add(add(cell.position, { x: .5, y: 0, z: .5 }), session.lease.origin);
      const entity = markOwned(session.dimension.spawnEntity(ENTITY, position), session.lease);
      entity.addTag(tag);
      this.equip(entity, cell.blockId);
      return entity;
    });
    const batch = { tag, entities, signature: undefined };
    this.batches.set(id, batch);
    return batch;
  }

  equip(entity, blockId) {
    try { entity.getComponent(EntityComponentTypes.Equippable)?.setEquipment(EquipmentSlot.Mainhand, new ItemStack(blockId, 1)); }
    catch { entity.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${blockId} 1`); }
  }

  send(batch, want) {
    const v = want.vars, fields = Object.entries(v).map(([name, value]) => `v.${name}=${num(value)}`).join(";");
    try {
      this.session.dimension.runCommand(
        `playanimation @e[type=${ENTITY},tag=${batch.tag}] animation.ponder.sync none 0 "v.s=${nextSerial()};${fields};" ponder_sync`);
      batch.signature = want.signature;
    } catch (error) { console.warn(`[Ponder] playanimation: ${error}`); }
  }

  retire(id, batch) { for (const entity of batch.entities) safeRemove(entity); this.batches.delete(id); }
  dispose() { for (const [id, batch] of [...this.batches]) this.retire(id, batch); }
}

/** Position of a cell key in scene space. */
export const cellPosition = key => unkey(key);
