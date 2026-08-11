/**
 * 后室点光池 — 固定灯数、跟随玩家复用
 *
 * Three.js 前向渲染器把场景里所有可见点光都塞进每个片元的光照循环，
 * 且灯数写进 shader 的 NUM_POINT_LIGHTS 宏。所以这里做两件事：
 * 1. 场景只保留 count 盏点光，每帧把离玩家最近的候选灯位赋给它们；
 * 2. 空闲槽位用 intensity = 0 而不是 visible = false —— 后者会改变灯数并触发着色器重编译。
 */

import * as THREE from "three";

/**
 * @typedef {{ x: number, y?: number, z: number, intensity?: number, distance?: number }} BackroomsLightCandidate
 */

/**
 * @param {THREE.Object3D} root 点光挂载节点
 * @param {{ count?: number, color?: number, distance?: number, decay?: number, y?: number, name?: string }} [opts]
 */
export function createPointLightPool(root, opts) {
  opts = opts || {};
  var count = Math.max(0, Math.floor(opts.count != null ? opts.count : 4));
  var color = opts.color != null ? opts.color : 0xfff6e8;
  var baseDistance = opts.distance != null ? opts.distance : 10;
  var decay = opts.decay != null ? opts.decay : 1.4;
  var defaultY = opts.y != null ? opts.y : 2.4;
  var label = opts.name || "PooledPointLight";

  /** @type {THREE.PointLight[]} */
  var lights = [];
  var i;
  for (i = 0; i < count; i++) {
    var light = new THREE.PointLight(color, 0, baseDistance, decay);
    light.name = label + "_" + i;
    light.position.set(0, defaultY, 0);
    light.castShadow = false;
    if (root) root.add(light);
    lights.push(light);
  }

  var slotCand = new Array(count);
  var slotDist = new Array(count);

  /**
   * @param {number} px 玩家 X
   * @param {number} pz 玩家 Z
   * @param {ArrayLike<BackroomsLightCandidate | null | undefined>} candidates
   */
  function update(px, pz, candidates) {
    if (count === 0) return;
    var k;
    for (k = 0; k < count; k++) {
      slotCand[k] = null;
      slotDist[k] = Infinity;
    }

    var n = candidates ? candidates.length : 0;
    var ci;
    for (ci = 0; ci < n; ci++) {
      var cand = candidates[ci];
      if (!cand) continue;
      var dx = cand.x - px;
      var dz = cand.z - pz;
      var d2 = dx * dx + dz * dz;
      for (k = 0; k < count; k++) {
        if (d2 >= slotDist[k]) continue;
        var j;
        for (j = count - 1; j > k; j--) {
          slotDist[j] = slotDist[j - 1];
          slotCand[j] = slotCand[j - 1];
        }
        slotDist[k] = d2;
        slotCand[k] = cand;
        break;
      }
    }

    for (k = 0; k < count; k++) {
      var picked = slotCand[k];
      var lamp = lights[k];
      if (!picked) {
        lamp.intensity = 0;
        continue;
      }
      lamp.position.set(picked.x, picked.y != null ? picked.y : defaultY, picked.z);
      lamp.intensity = picked.intensity != null ? picked.intensity : 1;
      lamp.distance = picked.distance != null ? picked.distance : baseDistance;
    }
  }

  function dispose() {
    var d;
    for (d = 0; d < lights.length; d++) {
      if (lights[d].parent) lights[d].parent.remove(lights[d]);
    }
    lights.length = 0;
    slotCand.length = 0;
    slotDist.length = 0;
    count = 0;
  }

  return {
    lights: lights,
    count: count,
    update: update,
    dispose: dispose,
  };
}
