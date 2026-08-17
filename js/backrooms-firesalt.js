/**
 * 火盐投掷：背包双击 / 快捷栏 R，准星锁定 40 米内实体，飞行命中后爆炸。
 */
import * as THREE from "three";
import {
  countItem,
  removeFirstItem,
  closeBackpack,
} from "./backrooms-inventory.js";
import {
  getBackroomsEntityTargetFromObject,
  getBackroomsEntityTargetRoots,
  isBackroomsObjectVisible,
} from "./backrooms-entity-health.js";

export const FIRESALT_ITEM_ID = "fire_salt";
export const FIRESALT_DAMAGE = 60;
export const FIRESALT_MAX_DISTANCE = 40;
export const FIRESALT_SPEED = 22;
export const FIRESALT_BLAST_RADIUS = 5;

const _ndc = new THREE.Vector2(0, 0);
const _roots = [];
const _checkedTargets = [];
const _cameraPos = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _entityPos = new THREE.Vector3();
const _delta = new THREE.Vector3();
var _geo = null;
var _mat = null;
var _blastGeo = null;

function projectileGeometry() {
  if (!_geo) _geo = new THREE.IcosahedronGeometry(0.13, 1);
  return _geo;
}

function projectileMaterial() {
  if (!_mat) {
    _mat = new THREE.MeshBasicMaterial({
      color: 0xff7a18,
      transparent: true,
      opacity: 0.96,
      toneMapped: false,
    });
  }
  return _mat;
}

function blastGeometry() {
  if (!_blastGeo) _blastGeo = new THREE.SphereGeometry(1, 14, 10);
  return _blastGeo;
}

/**
 * @param {{
 *   scene: THREE.Scene,
 *   camera: THREE.Camera,
 *   showToast?: (text: string) => void,
 *   crosshairEl?: HTMLElement | null,
 * }} opts
 */
export function createBackroomsFiresaltController(opts) {
  var scene = opts.scene;
  var camera = opts.camera;
  var showToast = opts.showToast || function () {};
  var crosshairEl =
    opts.crosshairEl ||
    (typeof document !== "undefined"
      ? document.getElementById("backroomsCrosshair")
      : null);
  var raycaster = new THREE.Raycaster();
  raycaster.far = FIRESALT_MAX_DISTANCE;
  var projectiles = [];
  var blasts = [];
  var entityLocked = false;

  function removeProjectile(index) {
    var p = projectiles[index];
    if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
    projectiles.splice(index, 1);
  }

  function removeBlast(index) {
    var blast = blasts[index];
    if (blast.mesh.parent) blast.mesh.parent.remove(blast.mesh);
    blast.mesh.material.dispose();
    blasts.splice(index, 1);
  }

  function explodeAt(position) {
    var blastMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6a00,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    var blastMesh = new THREE.Mesh(blastGeometry(), blastMaterial);
    blastMesh.position.copy(position);
    blastMesh.scale.setScalar(0.08);
    blastMesh.userData.brFireSaltProjectile = true;
    scene.add(blastMesh);
    blasts.push({ mesh: blastMesh, life: 0 });

    getBackroomsEntityTargetRoots(_roots);
    var hitCount = 0;
    var killCount = 0;
    var onlyTarget = null;
    var i;
    for (i = 0; i < _roots.length; i++) {
      var target = getBackroomsEntityTargetFromObject(_roots[i]);
      if (!target || !target.alive) continue;
      target.group.getWorldPosition(_entityPos);
      _entityPos.y += target.aimHeight;
      if (_entityPos.distanceToSquared(position) > FIRESALT_BLAST_RADIUS * FIRESALT_BLAST_RADIUS) {
        continue;
      }
      if (!target.takeDamage(FIRESALT_DAMAGE)) continue;
      hitCount++;
      onlyTarget = target;
      if (!target.alive) killCount++;
    }
    if (hitCount === 1 && onlyTarget) {
      if (onlyTarget.alive) {
        showToast(
          onlyTarget.name +
            " −" +
            FIRESALT_DAMAGE +
            " HP（" +
            onlyTarget.hp +
            "/" +
            onlyTarget.maxHp +
            "）"
        );
      } else {
        showToast(onlyTarget.name + "被火盐爆炸击杀");
      }
    } else if (hitCount > 1) {
      showToast(
        "火盐爆炸命中" +
          hitCount +
          "个实体" +
          (killCount ? "，击杀" + killCount + "个" : "")
      );
    } else {
      showToast("火盐爆炸，但未伤到实体");
    }
  }

  /** 该命中物是否算作遮挡（隐藏物体、透明物体、火盐自身弹体都不算） */
  function isBlockingOccluder(object, target) {
    if (!object.isMesh && !object.isInstancedMesh) return false;
    if (getBackroomsEntityTargetFromObject(object) === target) return false;
    // three.js 的 Raycaster 不检查 visible，隐藏的子区域几何必须手动排除，
    // 否则 L1.1 里未激活走廊与 L1 仓库的隐藏墙体会挡住锁定。
    if (!isBackroomsObjectVisible(object)) return false;
    var node = object;
    while (node) {
      if (node.userData && node.userData.brFireSaltProjectile) return false;
      node = node.parent;
    }
    var material = object.material;
    if (
      material &&
      !Array.isArray(material) &&
      (material.visible === false ||
        (material.transparent && material.opacity <= 0.05))
    ) {
      return false;
    }
    return true;
  }

  function hasLineOfSight(target, targetDistance) {
    raycaster.far = targetDistance;
    var worldHits = raycaster.intersectObjects(scene.children, true);
    var clear = true;
    var j;
    for (j = 0; j < worldHits.length; j++) {
      if (worldHits[j].distance >= targetDistance - 0.03) break;
      if (isBlockingOccluder(worldHits[j].object, target)) {
        clear = false;
        break;
      }
    }
    raycaster.far = FIRESALT_MAX_DISTANCE;
    return clear;
  }

  function findAimedTarget() {
    getBackroomsEntityTargetRoots(_roots);
    if (!_roots.length) return null;
    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(_ndc, camera);
    raycaster.near = 0;
    raycaster.far = FIRESALT_MAX_DISTANCE;
    var hits = raycaster.intersectObjects(_roots, true);
    _checkedTargets.length = 0;
    var i;
    for (i = 0; i < hits.length; i++) {
      var hit = hits[i];
      if (hit.distance > FIRESALT_MAX_DISTANCE) continue;
      if (!isBackroomsObjectVisible(hit.object)) continue;
      var target = getBackroomsEntityTargetFromObject(hit.object);
      if (!target || !target.alive) continue;
      // 同一实体有多个网格，视线只判一次，避免重复整场景求交。
      if (_checkedTargets.indexOf(target) >= 0) continue;
      _checkedTargets.push(target);
      // 被挡住的实体只跳过它自己，继续判定更远的实体，
      // 而不是直接放弃整次锁定。
      if (!hasLineOfSight(target, hit.distance)) continue;
      return target;
    }
    return null;
  }

  function setEntityLockUi(locked) {
    entityLocked = !!locked;
    if (crosshairEl) {
      crosshairEl.classList.toggle("backrooms-crosshair--hostile", entityLocked);
    }
  }

  function refreshEntityLockUi() {
    var locked = countItem(FIRESALT_ITEM_ID) > 0 && !!findAimedTarget();
    setEntityLockUi(locked);
    return locked;
  }

  function useFireSalt() {
    if (countItem(FIRESALT_ITEM_ID) < 1) return false;
    var target = findAimedTarget();
    if (!target) {
      showToast("准星未对准 40 米内的实体");
      return false;
    }
    if (!removeFirstItem(FIRESALT_ITEM_ID)) return false;
    closeBackpack();

    var mesh = new THREE.Mesh(projectileGeometry(), projectileMaterial());
    mesh.userData.brFireSaltProjectile = true;
    camera.getWorldPosition(_cameraPos);
    mesh.position.copy(_cameraPos);
    mesh.scale.setScalar(1);
    scene.add(mesh);
    projectiles.push({
      mesh: mesh,
      target: target,
      life: 0,
      spin: Math.random() * Math.PI * 2,
    });
    showToast("火盐飞向" + target.name + "！");
    refreshEntityLockUi();
    return true;
  }

  function update(dt) {
    refreshEntityLockUi();
    var i;
    for (i = projectiles.length - 1; i >= 0; i--) {
      var p = projectiles[i];
      p.life += dt;
      if (!p.target.alive || !p.target.group || !p.target.group.parent || p.life > 2) {
        removeProjectile(i);
        continue;
      }
      p.target.group.getWorldPosition(_targetPos);
      _targetPos.y += p.target.aimHeight;
      _delta.subVectors(_targetPos, p.mesh.position);
      var dist = _delta.length();
      var step = FIRESALT_SPEED * dt;
      if (dist <= Math.max(0.32, step)) {
        explodeAt(_targetPos);
        removeProjectile(i);
        continue;
      }
      p.mesh.position.addScaledVector(_delta, step / dist);
      p.spin += dt * 16;
      p.mesh.rotation.set(p.spin, p.spin * 0.7, p.spin * 1.3);
      p.mesh.scale.setScalar(0.9 + Math.sin(p.life * 28) * 0.14);
    }
    for (i = blasts.length - 1; i >= 0; i--) {
      var blast = blasts[i];
      blast.life += dt;
      var progress = Math.min(1, blast.life / 0.38);
      var radius = FIRESALT_BLAST_RADIUS * (1 - Math.pow(1 - progress, 3));
      blast.mesh.scale.setScalar(Math.max(0.08, radius));
      blast.mesh.material.opacity = 0.72 * (1 - progress);
      if (progress >= 1) removeBlast(i);
    }
  }

  function dispose() {
    var i;
    for (i = projectiles.length - 1; i >= 0; i--) removeProjectile(i);
    for (i = blasts.length - 1; i >= 0; i--) removeBlast(i);
    setEntityLockUi(false);
    if (window.__backroomsUseFireSalt === useFireSalt) {
      delete window.__backroomsUseFireSalt;
    }
  }

  window.__backroomsUseFireSalt = useFireSalt;
  return {
    update: update,
    use: useFireSalt,
    dispose: dispose,
    isEntityLocked: function () {
      return entityLocked;
    },
  };
}
