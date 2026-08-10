/**
 * 后室 — 屏幕中心准星射线拾取（须对准才可交互）
 */
import * as THREE from "three";

const _ndc = new THREE.Vector2(0, 0);
const _worldDir = new THREE.Vector3();
let _raycaster = null;

function raycaster() {
  if (!_raycaster) _raycaster = new THREE.Raycaster();
  return _raycaster;
}

/** @param {THREE.Object3D | null | undefined} object */
export function findInteractUserData(object) {
  var o = object;
  while (o) {
    if (o.userData && o.userData.brInteract) return o.userData.brInteract;
    o = o.parent;
  }
  return null;
}

/**
 * @param {THREE.Camera} camera
 * @param {THREE.Object3D[]} interactRoots
 * @param {number} maxDist
 * @param {number} [wallBlockDist] 墙体 AABB 遮挡距离（避免对 InstancedMesh 做射线）
 * @returns {{ data: object, distance: number } | null}
 */
export function pickCrosshairInteract(camera, interactRoots, maxDist, wallBlockDist) {
  if (!camera || !interactRoots || !interactRoots.length) return null;

  var rc = raycaster();
  rc.setFromCamera(_ndc, camera);
  rc.far = maxDist;
  rc.near = 0.06;

  var blockDist =
    wallBlockDist != null && wallBlockDist < maxDist + 1
      ? wallBlockDist
      : maxDist + 1;

  var hits = rc.intersectObjects(interactRoots, true);
  var i;
  for (i = 0; i < hits.length; i++) {
    if (hits[i].distance > blockDist + 0.03) continue;
    var data = findInteractUserData(hits[i].object);
    if (data) {
      return { data: data, distance: hits[i].distance };
    }
  }
  return null;
}

/** @param {THREE.Camera} camera @param {number} maxDist */
export function getCameraAimRay(camera, maxDist) {
  camera.getWorldDirection(_worldDir);
  return {
    origin: camera.position,
    direction: _worldDir,
    maxDist: maxDist,
  };
}
