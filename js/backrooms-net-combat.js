/**
 * 联机武器：把火盐爆炸点交给服务端结算对人伤害。
 */
import { FIRESALT_BLAST_RADIUS } from "./backrooms-firesalt.js";

export function emitFireSaltExplosion(socket, position) {
  if (!socket || !socket.connected || !position) return;
  socket.emit("weapon_fire", {
    weapon: "fire_salt",
    explodeX: position.x,
    explodeY: position.y,
    explodeZ: position.z,
  });
}

export { FIRESALT_BLAST_RADIUS };
