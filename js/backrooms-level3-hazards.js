/**
 * Level 3 — 管道蒸汽 / 强酸喷溅（−20 HP）
 */
import * as THREE from "three";

export const PIPE_HAZARD_DAMAGE = 20;
export const BURST_DURATION_MS = 1600;
export const BURST_RADIUS = 1.35;

var _vfxGeo = null;
var _steamMat = null;
var _acidMat = null;

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function vfxAssets() {
  if (!_vfxGeo) _vfxGeo = new THREE.SphereGeometry(0.45, 6, 6);
  if (!_steamMat) {
    _steamMat = new THREE.MeshBasicMaterial({
      color: 0xccccdd,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
  }
  if (!_acidMat) {
    _acidMat = new THREE.MeshBasicMaterial({
      color: 0x44ff66,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
  }
  return { geo: _vfxGeo, steamMat: _steamMat, acidMat: _acidMat };
}

/**
 * @param {{ x: number, z: number, y?: number }[]} slots
 * @param {THREE.Group} hazardGroup
 * @param {number} [seed]
 */
export function createLevel3PipeHazards(slots, hazardGroup, seed, startNow) {
  var assets = vfxAssets();
  var hazards = [];
  var i;
  var now = startNow == null ? performance.now() : startNow;
  for (i = 0; i < slots.length; i++) {
    var s = slots[i];
    var rng = mulberry32(((seed || 0) + i * 2654435761) | 0);
    var kind = rng() < 0.5 ? "steam" : "acid";
    var vfx = new THREE.Mesh(
      assets.geo,
      kind === "acid" ? assets.acidMat : assets.steamMat
    );
    vfx.position.set(s.x, s.y != null ? s.y : 1.4, s.z);
    vfx.visible = false;
    vfx.frustumCulled = false;
    if (hazardGroup) hazardGroup.add(vfx);
    hazards.push({
      x: s.x,
      z: s.z,
      y: s.y != null ? s.y : 1.4,
      kind: kind,
      nextAt: now + 3000 + rng() * 12000,
      activeUntil: 0,
      hitThisBurst: false,
      rng: rng,
      vfx: vfx,
    });
  }
  return hazards;
}

export function updateLevel3PipeHazards(survival, hazards, px, pz, now, callbacks) {
  if (!hazards || !hazards.length) return null;
  var msg = null;
  var i;
  for (i = 0; i < hazards.length; i++) {
    var h = hazards[i];
    if (now >= h.nextAt && now >= h.activeUntil) {
      h.activeUntil = now + BURST_DURATION_MS;
      h.hitThisBurst = false;
      h.nextAt = now + 8000 + (h.rng ? h.rng() : Math.random()) * 16000;
      if (callbacks && typeof callbacks.onBurst === "function") {
        callbacks.onBurst(h);
      }
    }
    var active = now < h.activeUntil;
    if (h.vfx) h.vfx.visible = active;
    if (!active) continue;
    var dx = px - h.x;
    var dz = pz - h.z;
    if (dx * dx + dz * dz > BURST_RADIUS * BURST_RADIUS) continue;
    if (h.hitThisBurst || !survival || survival.dead) continue;
    survival.takeDamage(PIPE_HAZARD_DAMAGE);
    h.hitThisBurst = true;
    msg =
      h.kind === "acid"
        ? "强酸喷溅！−" + PIPE_HAZARD_DAMAGE + " 血量"
        : "高温蒸汽！−" + PIPE_HAZARD_DAMAGE + " 血量";
  }
  return msg;
}
