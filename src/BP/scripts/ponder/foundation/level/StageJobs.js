import { system } from "@minecraft/server";
export const waitTicks = ticks => new Promise(resolve => system.runTimeout(() => resolve(undefined), ticks));
export function job(generator) {
  return new Promise((resolve, reject) => {
    system.runJob((function* () {
      try { resolve(yield* generator); } catch (error) { reject(error); }
    })());
  });
}
export function assertLive(session) {
  if (session.closed || !session.player.isValid || session.player.dimension.id !== session.dimension.id)
    throw new Error("Session cancelled");
}
export function safeRemove(entity) {
  if (entity?.typeId !== "minecraft:player" && entity?.isValid) entity.remove();
}
