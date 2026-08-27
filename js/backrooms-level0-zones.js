/**
 * Level 0 子区域（红室 / 0.2 / 0.3）状态对象与统一 dispose 契约。
 * L0 主文件只负责调度 createLevel0ZoneManager。
 */
import * as THREE from "three";
import {
  buildRedRoom,
  RED_ROOM_SANITY_DRAIN_PER_SEC,
  getRedChannelTriggerAabb,
  pointInAabb,
} from "./backrooms-level0-red-room.js";
import {
  buildLevel02World,
  createLevel02EnterHazards,
  getLevel02ExitPickMesh,
  LEVEL02_FOG,
} from "./backrooms-level0-02.js?v=16";
import {
  buildLevel03Room,
  getBlueHoleTriggerAabb,
  LEVEL03_FOG,
} from "./backrooms-level0-03.js?v=3";
import { buildLevel05World } from "./backrooms-level0-05.js?v=2";
import { buildLevel07World } from "./backrooms-level0-07.js?v=2";
import { buildLevel01Station } from "./backrooms-level0-01.js";
import { setBackroomsTemperatureZone } from "./backrooms-temperature.js";
import {
  queueEnterPlaceBanner,
  showEnterLevelBannerIfQueued,
  showEnterLevelBanner,
} from "./backrooms-level-enter.js";
import {
  markLevelEntered,
  markLevel02Survived,
  markLevel03ReportRecovered,
  markLevel07ArchiveRecovered,
} from "./backrooms-tasks.js";
import {
  buildTormentBreach,
  buildTormentGraveyard,
  pointInTormentTrigger,
  readTormentState,
  writeTormentState,
} from "./backrooms-level0-torment.js?v=1";

/** @typedef {"red" | "01" | "02" | "03" | "05" | "07" | "torment"} Level0SubZoneId */

const _survivalEnv = { skipPassiveSanity: false, sanityDrainPerSec: 0 };

/**
 * @param {object} deps
 * @param {THREE.Scene} deps.scene
 * @param {THREE.PerspectiveCamera | null} deps.camera
 * @param {THREE.Group | null} deps.level0WorldRoot
 * @param {object[]} [deps.wallColliders]
 * @param {() => object[]} [deps.getMainColliders]
 * @param {() => Array<{ type: string, trigger: object }>} [deps.getPoiTriggers]
 * @param {() => number[][]} [deps.getLevel02Snapshot]
 * @param {object} deps.fps
 * @param {() => import('./backrooms-survival.js').BackroomsSurvival | null} deps.getSurvival
 * @param {() => boolean} [deps.isPlayerMoving]
 * @param {() => boolean} [deps.canRunMainPhenomena]
 * @param {{ x: number, z: number }} deps.spawnPoint
 * @param {number} deps.gridSize
 * @param {number} deps.wallHeight
 * @param {number} deps.bodyHeight
 * @param {number} deps.fogNear
 * @param {number} deps.fogFar
 * @param {number} deps.l0FogColor
 * @param {number[][]} deps.matrix
 * @param {number} deps.mapRows
 * @param {number} deps.mapCols
 * @param {number} deps.mapWidth
 * @param {number} deps.mapDepth
 * @param {(col: number) => number} deps.cellCenterX
 * @param {(row: number) => number} deps.cellCenterZ
 * @param {(msg: string) => void} deps.showToast
 * @param {(title: string) => void} [deps.onHudTitleChange]
 * @param {(id: Level0SubZoneId) => void} [deps.onEnterSubLevel]
 * @param {(id: Level0SubZoneId) => void} [deps.onExitSubLevel]
 * @param {(destination: "level1" | "level37") => void} [deps.onLevel05Exit]
 */
export function createLevel0ZoneManager(deps) {
  /** @type {Level0SubZoneId | null} */
  var activeId = null;
  var mainTriggerCooldownUntil = 0;
  /** @type {{ x: number, z: number, yaw: number } | null} */
  var returnSnapshot = null;
  /** @type {ReturnType<buildLevel01Station> | null} */
  var level01State = null;
  var activeTemperatureZone = 0;

  /** @type {ReturnType<buildRedRoom> | null} */
  var redRoomState = null;
  var redEnteredAt = 0;
  /** @type {{ minX: number, maxX: number, minZ: number, maxZ: number } | null} */
  var redChannelTrigger = null;

  /** @type {ReturnType<buildLevel02World> | null} */
  var level02State = null;
  /** @type {THREE.Group | null} */
  var level02FxRoot = null;
  /** @type {ReturnType<createLevel02EnterHazards> | null} */
  var level02Hazards = null;

  /** @type {ReturnType<buildLevel03Room> | null} */
  var level03State = null;
  /** @type {{ minX: number, maxX: number, minZ: number, maxZ: number } | null} */
  var blueHoleTrigger = null;
  /** @type {ReturnType<buildLevel05World> | null} */
  var level05State = null;
  /** @type {ReturnType<buildLevel07World> | null} */
  var level07State = null;
  var level05Infection = 0;
  var filteredZoneColliders = [];

  /** @type {ReturnType<buildTormentBreach> | null} */
  var tormentBreach = null;
  /** @type {ReturnType<buildTormentGraveyard> | null} */
  var tormentState = null;
  var tormentEligibleSince = 0;
  var tormentSpawnAt = 0;
  var tormentWarningShown = false;

  /** L0.2 过滤后的碰撞缓存：仅在墙倒塌 / 重建世界时刷新 */
  /** @type {object[] | null} */
  var level02ColliderCache = null;
  /** @type {object[] | null} */
  var level02ColliderCacheSrc = null;
  var level02ColliderCacheGen = -1;

  function disposeObject3D(root) {
    if (!root) return;
    root.traverse(function (obj) {
      if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
      var mats = obj.material
        ? Array.isArray(obj.material)
          ? obj.material
          : [obj.material]
        : [];
      for (var mi = 0; mi < mats.length; mi++) {
        var mat = mats[mi];
        if (!mat) continue;
        if (mat.map && mat.map.dispose) mat.map.dispose();
        if (mat.emissiveMap && mat.emissiveMap.dispose) mat.emissiveMap.dispose();
        if (mat.dispose) mat.dispose();
      }
    });
    if (root.parent) root.parent.remove(root);
  }

  function getMainColliders() {
    return deps.getMainColliders ? deps.getMainColliders() : deps.wallColliders || [];
  }

  function getSnapshotMatrix() {
    if (deps.getLevel02Snapshot) return deps.getLevel02Snapshot();
    return deps.matrix;
  }

  function invalidateLevel02ColliderCache() {
    level02ColliderCache = null;
    level02ColliderCacheSrc = null;
    level02ColliderCacheGen = -1;
  }

  function getSolidZoneColliders(source) {
    filteredZoneColliders.length = 0;
    for (var i = 0; i < source.length; i++) {
      if (!source[i].ghost) filteredZoneColliders.push(source[i]);
    }
    return filteredZoneColliders;
  }

  function getLevel02FilteredColliders() {
    var raw = level02State.colliders;
    var gen = raw._l02Gen | 0;
    if (
      level02ColliderCache &&
      level02ColliderCacheSrc === raw &&
      level02ColliderCacheGen === gen
    ) {
      return level02ColliderCache;
    }
    var out = level02ColliderCache || [];
    out.length = 0;
    var i;
    for (i = 0; i < raw.length; i++) {
      if (raw[i].ghost || raw[i].fallen) continue;
      out.push(raw[i]);
    }
    level02ColliderCache = out;
    level02ColliderCacheSrc = raw;
    level02ColliderCacheGen = gen;
    return out;
  }

  function syncHudTitle() {
    if (!deps.onHudTitleChange) return;
    if (activeId === "red") {
      deps.onHudTitleChange("Backrooms · Level 0 · 红室");
    } else if (activeId === "torment") {
      deps.onHudTitleChange("Backrooms · Level 0 · 痛楚");
    } else if (activeId === "05") {
      deps.onHudTitleChange("Backrooms · Level 0.5 · 渊闭疗舍 · 生存难度 3");
    } else if (activeId === "07") {
      deps.onHudTitleChange("Backrooms · Level 0.7 · 忆域");
    } else if (activeId === "03") deps.onHudTitleChange("Backrooms · Level 0.3");
    else if (activeId === "02") {
      deps.onHudTitleChange("Backrooms · Level 0.2 · 生存难度 3");
    } else if (activeId === "01") {
      deps.onHudTitleChange("Backrooms · Level 0.1 · 天顶站 · 生存难度 0");
    }
    else deps.onHudTitleChange("Backrooms · Level 0 · 生存难度 1");
  }

  function applyL0Atmosphere() {
    if (!deps.scene || !deps.scene.fog) return;
    deps.scene.background = new THREE.Color(deps.l0FogColor);
    deps.scene.fog.color.setHex(deps.l0FogColor);
    deps.scene.fog.near = deps.fogNear;
    deps.scene.fog.far = deps.fogFar;
    if (deps.camera) {
      deps.camera.far = 80;
      deps.camera.updateProjectionMatrix();
    }
  }

  function applyLevel02Atmosphere(on) {
    if (!deps.scene || !deps.scene.fog) return;
    if (on) {
      deps.scene.background = new THREE.Color(LEVEL02_FOG);
      deps.scene.fog.color.setHex(LEVEL02_FOG);
      deps.scene.fog.near = 5;
      deps.scene.fog.far = 26;
      if (deps.camera) deps.camera.far = 80;
    } else {
      applyL0Atmosphere();
    }
    if (deps.camera) deps.camera.updateProjectionMatrix();
  }

  function applyLevel03Atmosphere(on) {
    if (!deps.scene || !deps.scene.fog) return;
    if (on) {
      deps.scene.background = new THREE.Color(LEVEL03_FOG);
      deps.scene.fog.color.setHex(LEVEL03_FOG);
      deps.scene.fog.near = 4;
      deps.scene.fog.far = 38;
      if (deps.camera) deps.camera.far = 90;
    } else {
      applyL0Atmosphere();
    }
    if (deps.camera) deps.camera.updateProjectionMatrix();
  }

  function applyLevel05Atmosphere(on) {
    if (!deps.scene || !deps.scene.fog) return;
    if (on) {
      deps.scene.background = new THREE.Color(0x111819);
      deps.scene.fog.color.setHex(0x182223);
      deps.scene.fog.near = 3;
      deps.scene.fog.far = 42;
      if (deps.camera) deps.camera.far = 96;
    } else {
      applyL0Atmosphere();
    }
    if (deps.camera) deps.camera.updateProjectionMatrix();
  }

  function applyLevel07Atmosphere(on) {
    if (!deps.scene || !deps.scene.fog) return;
    if (on) {
      deps.scene.background = new THREE.Color(0x27251d);
      deps.scene.fog.color.setHex(0x3a3729);
      deps.scene.fog.near = 7;
      deps.scene.fog.far = 58;
      if (deps.camera) deps.camera.far = 128;
    } else {
      applyL0Atmosphere();
    }
    if (deps.camera) deps.camera.updateProjectionMatrix();
  }

  function applyLevel01Atmosphere(on) {
    if (!deps.scene || !deps.scene.fog) return;
    if (on) {
      deps.scene.background = new THREE.Color(0x15191c);
      deps.scene.fog.color.setHex(0x20262a);
      deps.scene.fog.near = 16;
      deps.scene.fog.far = 68;
      if (deps.camera) deps.camera.far = 100;
    } else {
      applyL0Atmosphere();
    }
    if (deps.camera) deps.camera.updateProjectionMatrix();
  }

  function applyRedRoomAtmosphere(on) {
    if (!deps.scene || !deps.scene.fog) return;
    if (on) {
      deps.scene.background = new THREE.Color(0x060608);
      deps.scene.fog.color.setHex(0x100808);
      deps.scene.fog.near = 6;
      deps.scene.fog.far = 52;
      if (deps.camera) deps.camera.far = 120;
    } else {
      applyL0Atmosphere();
    }
    if (deps.camera) deps.camera.updateProjectionMatrix();
  }

  function applyTormentAtmosphere(on) {
    if (!deps.scene || !deps.scene.fog) return;
    if (on && tormentState) {
      var preset = tormentState.fogPreset;
      deps.scene.background = new THREE.Color(preset.background);
      deps.scene.fog.color.setHex(preset.color);
      deps.scene.fog.near = preset.near;
      deps.scene.fog.far = preset.far;
      if (deps.camera) deps.camera.far = 46;
    } else {
      applyL0Atmosphere();
    }
    if (deps.camera) deps.camera.updateProjectionMatrix();
  }

  function setMainWorldVisible(visible) {
    if (deps.level0WorldRoot) deps.level0WorldRoot.visible = visible;
  }

  function stopLevel02Hazards() {
    if (level02Hazards) level02Hazards.dispose();
  }

  function rebuildLevel02World() {
    stopLevel02Hazards();
    invalidateLevel02ColliderCache();
    if (level02State && level02State.group && deps.scene) {
      if (level02State.disposeLights) level02State.disposeLights();
      disposeObject3D(level02State.group);
    }
    var matrix = getSnapshotMatrix();
    level02State = buildLevel02World(deps.scene, {
      gridSize: deps.gridSize,
      wallHeight: deps.wallHeight,
      matrix: matrix,
      mapRows: matrix.length,
      mapCols: matrix[0].length,
      cellCenterX: deps.cellCenterX,
      cellCenterZ: deps.cellCenterZ,
      mapWidth: deps.mapWidth,
      mapDepth: deps.mapDepth,
    });
    if (!level02Hazards) {
      level02Hazards = createLevel02EnterHazards(deps.scene, {
        wallHeight: deps.wallHeight,
      });
    }
  }

  function startLevel02Hazards() {
    if (!level02Hazards || !level02State || !level02FxRoot) return;
    stopLevel02Hazards();
    level02Hazards.start(
      deps.fps.player.x,
      deps.fps.player.z,
      level02State.wallAnimTargets,
      level02State.colliders,
      level02FxRoot,
      level02FxRoot
    );
  }

  function disposeTormentBreach() {
    if (tormentBreach) tormentBreach.dispose();
    tormentBreach = null;
    tormentWarningShown = false;
  }

  function canPlaceTormentBreach(x, z) {
    var colliders = getMainColliders();
    var margin = 0.85;
    for (var i = 0; i < colliders.length; i++) {
      var box = colliders[i];
      if (!box || box.ghost || box.fallen) continue;
      if (
        x + margin >= box.minX &&
        x - margin <= box.maxX &&
        z + margin >= box.minZ &&
        z - margin <= box.maxZ
      ) {
        return false;
      }
    }
    return true;
  }

  function trySpawnTormentBreach(now) {
    if (tormentBreach || activeId !== null || readTormentState().encountered) return;
    var distanceFromSpawn = Math.hypot(
      deps.fps.player.x - deps.spawnPoint.x,
      deps.fps.player.z - deps.spawnPoint.z
    );
    if (distanceFromSpawn < 120) {
      tormentEligibleSince = 0;
      tormentSpawnAt = 0;
      return;
    }
    if (!tormentEligibleSince) {
      tormentEligibleSince = now;
      tormentSpawnAt = now + 45000 + Math.random() * 45000;
      return;
    }
    if (now < tormentSpawnAt) return;

    var offsets = [0, -0.42, 0.42, -0.78, 0.78];
    var x = 0;
    var z = 0;
    var yaw = deps.fps.yaw;
    var found = false;
    for (var i = 0; i < offsets.length; i++) {
      var angle = yaw + offsets[i];
      x = deps.fps.player.x + Math.sin(angle) * 5.2;
      z = deps.fps.player.z - Math.cos(angle) * 5.2;
      if (canPlaceTormentBreach(x, z)) {
        yaw = angle;
        found = true;
        break;
      }
    }
    if (!found) {
      tormentSpawnAt = now + 5000;
      return;
    }
    tormentBreach = buildTormentBreach(deps.level0WorldRoot, {
      x: x,
      z: z,
      yaw: Math.PI - yaw,
      lifetimeMs: 16000,
      seed: Date.now() ^ Math.floor(x * 1000) ^ Math.floor(z * 1000),
    });
    writeTormentState({ encountered: true, statueSeen: false });
    deps.showToast("走廊前方的颜色正在消失。");
  }

  function enterTorment() {
    if (!tormentBreach || activeId !== null) return false;
    var survival = deps.getSurvival();
    if (!survival || survival.dead) return false;
    returnSnapshot = {
      x: deps.fps.player.x,
      z: deps.fps.player.z,
      yaw: deps.fps.yaw,
    };
    var savedState = readTormentState();
    tormentState = buildTormentGraveyard(deps.scene, {
      seed: Date.now() ^ Math.floor(Math.random() * 0x7fffffff),
    });
    writeTormentState({
      encountered: true,
      statueSeen: savedState.statueSeen,
    });
    disposeTormentBreach();
    activeId = "torment";
    if (deps.onEnterSubLevel) deps.onEnterSubLevel("torment");
    setMainWorldVisible(false);
    var tormentSpawn = tormentState.spawn || { x: 0, z: 17, yaw: Math.PI };
    deps.fps.player.x = tormentSpawn.x;
    deps.fps.player.z = tormentSpawn.z;
    deps.fps.yaw = tormentSpawn.yaw == null ? Math.PI : tormentSpawn.yaw;
    deps.fps.feetY = 0;
    deps.fps.velY = 0;
    applyTormentAtmosphere(true);
    syncHudTitle();
    queueEnterPlaceBanner("痛楚");
    showEnterLevelBannerIfQueued();
    deps.showToast("这里没有出口。它只会在时间耗尽后归还你。");
    return true;
  }

  function updateTormentOpportunity() {
    if (activeId !== null) return;
    if (deps.canRunMainPhenomena && !deps.canRunMainPhenomena()) return;
    var now = performance.now();
    trySpawnTormentBreach(now);
    if (!tormentBreach) return;
    if (tormentBreach.disposed) {
      tormentBreach = null;
      return;
    }
    var dx = deps.fps.player.x - tormentBreach.group.position.x;
    var dz = deps.fps.player.z - tormentBreach.group.position.z;
    var distance = Math.sqrt(dx * dx + dz * dz);
    var amount = Math.max(0, Math.min(1, 1 - distance / 9));
    tormentBreach.update(amount, now);
    if (!tormentBreach || tormentBreach.disposed) {
      tormentBreach = null;
      return;
    }
    if (!tormentWarningShown && amount > 0.42) {
      tormentWarningShown = true;
      deps.showToast("灰白雾气从裂口后方渗出。");
    }
    if (
      pointInTormentTrigger(
        deps.fps.player.x,
        deps.fps.player.z,
        tormentBreach.trigger
      )
    ) {
      enterTorment();
    }
  }

  function exitTorment(opts) {
    opts = opts || {};
    if (activeId !== "torment") return;
    activeId = null;
    if (opts.resumeMusic !== false && deps.onExitSubLevel) {
      deps.onExitSubLevel("torment");
    }
    if (tormentState) tormentState.dispose();
    tormentState = null;
    setMainWorldVisible(true);
    applyTormentAtmosphere(false);
    syncHudTitle();
    if (opts.restorePlayer !== false && returnSnapshot) {
      deps.fps.player.x = returnSnapshot.x;
      deps.fps.player.z = returnSnapshot.z;
      deps.fps.yaw = returnSnapshot.yaw;
      deps.fps.feetY = 0;
      deps.fps.velY = 0;
    }
    returnSnapshot = null;
    mainTriggerCooldownUntil = performance.now() + 2200;
    if (opts.showReturn !== false) {
      deps.showToast("灰雾闭合了。荧光灯的嗡鸣重新出现。");
    }
  }

  /** 离开 0.2 — 必定 dispose hazard，避免野 mesh */
  function exitLevel02(opts) {
    opts = opts || {};
    if (activeId !== "02") return;
    activeId = null;
    if (opts.resumeMusic !== false && deps.onExitSubLevel) {
      deps.onExitSubLevel("02");
    }
    stopLevel02Hazards();
    if (level02State && level02State.disposeLights) level02State.disposeLights();
    if (level02State) disposeObject3D(level02State.group);
    if (level02FxRoot) disposeObject3D(level02FxRoot);
    level02State = null;
    level02FxRoot = null;
    level02Hazards = null;
    invalidateLevel02ColliderCache();
    applyLevel02Atmosphere(false);
    setMainWorldVisible(true);
    syncHudTitle();
    if (opts.restorePlayer && returnSnapshot) {
      deps.fps.player.x = returnSnapshot.x;
      deps.fps.player.z = returnSnapshot.z;
      deps.fps.yaw = returnSnapshot.yaw;
      deps.fps.feetY = 0;
      deps.fps.velY = 0;
    }
    returnSnapshot = null;
    mainTriggerCooldownUntil = performance.now() + 1800;
  }

  function exitRedRoom(opts) {
    opts = opts || {};
    if (activeId !== "red") return;
    var redSurvival = deps.getSurvival();
    var survivedRed = !!(redSurvival && !redSurvival.dead);
    activeId = null;
    if (opts.resumeMusic !== false && deps.onExitSubLevel) {
      deps.onExitSubLevel("red");
    }
    if (redRoomState) {
      if (redRoomState.dispose) redRoomState.dispose();
      else disposeObject3D(redRoomState.group);
    }
    redRoomState = null;
    redEnteredAt = 0;
    setMainWorldVisible(true);
    applyRedRoomAtmosphere(false);
    syncHudTitle();
    if (opts.restorePlayer !== false && returnSnapshot) {
      deps.fps.player.x = returnSnapshot.x;
      deps.fps.player.z = returnSnapshot.z;
      deps.fps.yaw = returnSnapshot.yaw;
    }
    returnSnapshot = null;
    mainTriggerCooldownUntil = performance.now() + 1800;
    if (survivedRed && opts.countEscape !== false && deps.onRedRoomEscaped) {
      deps.onRedRoomEscaped();
    }
  }

  function exitLevel01(opts) {
    opts = opts || {};
    if (activeId !== "01") return;
    activeId = null;
    if (opts.resumeMusic !== false && deps.onExitSubLevel) {
      deps.onExitSubLevel("01");
    }
    if (level01State) {
      if (level01State.dispose) level01State.dispose();
      else disposeObject3D(level01State.group);
    }
    level01State = null;
    setMainWorldVisible(true);
    applyLevel01Atmosphere(false);
    activeTemperatureZone = 0;
    setBackroomsTemperatureZone(0);
    syncHudTitle();
    if (opts.restorePlayer !== false && returnSnapshot) {
      deps.fps.player.x = returnSnapshot.x;
      deps.fps.player.z = returnSnapshot.z;
      deps.fps.yaw = returnSnapshot.yaw;
    }
    deps.fps.feetY = 0;
    deps.fps.velY = 0;
    returnSnapshot = null;
    mainTriggerCooldownUntil = performance.now() + 1800;
  }

  function exitLevel03(opts) {
    opts = opts || {};
    if (activeId !== "03") return;
    activeId = null;
    if (opts.resumeMusic !== false && deps.onExitSubLevel) {
      deps.onExitSubLevel("03");
    }
    if (level03State) {
      if (level03State.dispose) level03State.dispose();
      else disposeObject3D(level03State.group);
    }
    level03State = null;
    setMainWorldVisible(true);
    applyLevel03Atmosphere(false);
    setBackroomsTemperatureZone(0);
    syncHudTitle();
    if (opts.restorePlayer !== false && returnSnapshot) {
      deps.fps.player.x = returnSnapshot.x;
      deps.fps.player.z = returnSnapshot.z;
      deps.fps.yaw = returnSnapshot.yaw;
    }
    returnSnapshot = null;
    mainTriggerCooldownUntil = performance.now() + 1800;
  }

  function exitLevel05(opts) {
    opts = opts || {};
    if (activeId !== "05") return;
    activeId = null;
    if (opts.resumeMusic !== false && deps.onExitSubLevel) {
      deps.onExitSubLevel("05");
    }
    if (level05State) level05State.dispose();
    level05State = null;
    level05Infection = 0;
    setMainWorldVisible(true);
    applyLevel05Atmosphere(false);
    setBackroomsTemperatureZone(0);
    syncHudTitle();
    if (opts.restorePlayer && returnSnapshot) {
      deps.fps.player.x = returnSnapshot.x;
      deps.fps.player.z = returnSnapshot.z;
      deps.fps.yaw = returnSnapshot.yaw;
      deps.fps.feetY = 0;
      deps.fps.velY = 0;
    }
    returnSnapshot = null;
    mainTriggerCooldownUntil = performance.now() + 1800;
  }

  function exitLevel07(opts) {
    opts = opts || {};
    if (activeId !== "07") return;
    activeId = null;
    if (opts.resumeMusic !== false && deps.onExitSubLevel) {
      deps.onExitSubLevel("07");
    }
    if (level07State) level07State.dispose();
    level07State = null;
    setMainWorldVisible(true);
    applyLevel07Atmosphere(false);
    setBackroomsTemperatureZone(0);
    syncHudTitle();
    if (opts.restorePlayer !== false && returnSnapshot) {
      deps.fps.player.x = returnSnapshot.x;
      deps.fps.player.z = returnSnapshot.z;
      deps.fps.yaw = returnSnapshot.yaw;
      deps.fps.feetY = 0;
      deps.fps.velY = 0;
    }
    returnSnapshot = null;
    mainTriggerCooldownUntil = performance.now() + 1800;
  }

  function leaveActiveSubZone(opts) {
    if (activeId === "02") exitLevel02(opts);
    else if (activeId === "01") exitLevel01(opts);
    else if (activeId === "red") exitRedRoom(opts);
    else if (activeId === "03") exitLevel03(opts);
    else if (activeId === "05") exitLevel05(opts);
    else if (activeId === "07") exitLevel07(opts);
    else if (activeId === "torment") exitTorment(opts);
  }

  function enterRedRoom() {
    if (activeId === "red" || !deps.level0WorldRoot) return false;
    var survival = deps.getSurvival();
    if (!survival || survival.dead) return false;
    disposeTormentBreach();

    if (activeId === "03") {
      exitLevel03({ restorePlayer: false, resumeMusic: false });
    } else if (activeId === "02") {
      exitLevel02({ rebuild: false, resumeMusic: false });
    }

    returnSnapshot = {
      x: deps.fps.player.x,
      z: deps.fps.player.z,
      yaw: deps.fps.yaw,
    };
    redRoomState = buildRedRoom(deps.scene, deps.gridSize, deps.wallHeight, {
      exitQuarterTurns: Math.floor(Math.random() * 4),
      seed: Date.now() ^ Math.floor(Math.random() * 0x7fffffff),
    });
    activeId = "red";
    redEnteredAt = performance.now();
    if (deps.onEnterSubLevel) deps.onEnterSubLevel("red");
    setMainWorldVisible(false);
    if (level02State) level02State.group.visible = false;
    redRoomState.group.visible = true;
    deps.fps.player.x = 0;
    deps.fps.player.z = 0;
    deps.fps.feetY = 0;
    deps.fps.velY = 0;
    applyRedRoomAtmosphere(true);
    syncHudTitle();
    queueEnterPlaceBanner("红室");
    showEnterLevelBannerIfQueued();
    return true;
  }

  function enterLevel01() {
    if (activeId === "01" || !deps.level0WorldRoot) return false;
    var survival = deps.getSurvival();
    if (!survival || survival.dead || activeId !== null) return false;
    disposeTormentBreach();
    returnSnapshot = {
      x: deps.fps.player.x,
      z: deps.fps.player.z,
      yaw: deps.fps.yaw,
    };
    level01State = buildLevel01Station(deps.scene, {
      wallHeight: Math.max(3.2, deps.wallHeight + 0.8),
      showToast: deps.showToast,
    });
    activeId = "01";
    if (deps.onEnterSubLevel) deps.onEnterSubLevel("01");
    setMainWorldVisible(false);
    level01State.group.visible = true;
    var stationSpawn = level01State.spawn || { x: 0, z: 8, yaw: Math.PI };
    deps.fps.player.x = stationSpawn.x;
    deps.fps.player.z = stationSpawn.z;
    deps.fps.yaw = stationSpawn.yaw == null ? Math.PI : stationSpawn.yaw;
    deps.fps.feetY = 0;
    deps.fps.velY = 0;
    activeTemperatureZone = "0.1";
    setBackroomsTemperatureZone(activeTemperatureZone);
    applyLevel01Atmosphere(true);
    syncHudTitle();
    showEnterLevelBanner("level0.1");
    markLevelEntered("0.1", deps.showToast);
    return true;
  }

  function enterLevel02() {
    if (activeId === "02" || !deps.level0WorldRoot) return false;
    var survival = deps.getSurvival();
    if (!survival || survival.dead) return false;
    if (activeId === "red" || activeId === "03") return false;
    disposeTormentBreach();

    rebuildLevel02World();
    level02FxRoot = new THREE.Group();
    level02FxRoot.name = "Level02FxRoot";
    deps.scene.add(level02FxRoot);
    activeId = "02";
    returnSnapshot = {
      x: deps.fps.player.x,
      z: deps.fps.player.z,
      yaw: deps.fps.yaw,
    };
    if (deps.onEnterSubLevel) deps.onEnterSubLevel("02");
    setMainWorldVisible(false);
    if (redRoomState) redRoomState.group.visible = false;
    level02State.group.visible = true;
    applyLevel02Atmosphere(true);
    syncHudTitle();
    showEnterLevelBanner("level0.2");
    markLevelEntered("0.2", deps.showToast);
    if (level02FxRoot) level02FxRoot.visible = true;
    if (!level02Hazards) {
      level02Hazards = createLevel02EnterHazards(deps.scene, {
        wallHeight: deps.wallHeight,
      });
    }
    var l02Spawn = level02State.spawn || { x: 0, z: 0, yaw: 0 };
    deps.fps.player.x = l02Spawn.x;
    deps.fps.player.z = l02Spawn.z;
    deps.fps.yaw = l02Spawn.yaw || 0;
    deps.fps.feetY = 0;
    deps.fps.velY = 0;
    startLevel02Hazards();
    return true;
  }

  function enterLevel03() {
    if (activeId === "03" || !deps.level0WorldRoot) return false;
    var survival = deps.getSurvival();
    if (!survival || survival.dead || activeId !== null) return false;
    disposeTormentBreach();

    returnSnapshot = {
      x: deps.fps.player.x,
      z: deps.fps.player.z,
      yaw: deps.fps.yaw,
    };
    level03State = buildLevel03Room(deps.scene, deps.gridSize, deps.wallHeight);
    activeId = "03";
    if (deps.onEnterSubLevel) deps.onEnterSubLevel("03");
    setMainWorldVisible(false);
    if (redRoomState) redRoomState.group.visible = false;
    level03State.group.visible = true;
    var l03Spawn = level03State.spawn || { x: 0, z: 0, yaw: 0 };
    deps.fps.player.x = l03Spawn.x;
    deps.fps.player.z = l03Spawn.z;
    deps.fps.yaw = l03Spawn.yaw || 0;
    deps.fps.feetY = 0;
    deps.fps.velY = 0;
    setBackroomsTemperatureZone("0.3");
    applyLevel03Atmosphere(true);
    syncHudTitle();
    showEnterLevelBanner("level0.3");
    markLevelEntered("0.3", deps.showToast);
    return true;
  }

  function enterLevel05() {
    if (activeId !== null || !deps.level0WorldRoot) return false;
    var survival = deps.getSurvival();
    if (!survival || survival.dead) return false;
    disposeTormentBreach();
    returnSnapshot = {
      x: deps.fps.player.x,
      z: deps.fps.player.z,
      yaw: deps.fps.yaw,
    };
    level05State = buildLevel05World(deps.scene, {
      wallHeight: Math.max(2.8, deps.wallHeight + 0.4),
      enableAudio: true,
    });
    activeId = "05";
    if (deps.onEnterSubLevel) deps.onEnterSubLevel("05");
    setMainWorldVisible(false);
    var spawn = level05State.spawn || { x: 0, z: 20, yaw: Math.PI };
    deps.fps.player.x = spawn.x;
    deps.fps.player.z = spawn.z;
    deps.fps.yaw = spawn.yaw == null ? Math.PI : spawn.yaw;
    deps.fps.feetY = 0;
    deps.fps.velY = 0;
    setBackroomsTemperatureZone("0.5");
    applyLevel05Atmosphere(true);
    syncHudTitle();
    showEnterLevelBanner("level0.5 · 渊闭疗舍");
    markLevelEntered("0.5", deps.showToast);
    deps.showToast("污水没过膝盖。远处蓝灯下传来滴水声。");
    return true;
  }

  function enterLevel07() {
    if (activeId !== null || !deps.level0WorldRoot) return false;
    var survival = deps.getSurvival();
    if (!survival || survival.dead) return false;
    disposeTormentBreach();
    returnSnapshot = {
      x: deps.fps.player.x,
      z: deps.fps.player.z,
      yaw: deps.fps.yaw,
    };
    level07State = buildLevel07World(deps.scene, {
      onAllRecords: function () {
        markLevel07ArchiveRecovered(deps.showToast);
      },
    });
    activeId = "07";
    if (deps.onEnterSubLevel) deps.onEnterSubLevel("07");
    setMainWorldVisible(false);
    var spawn = level07State.spawn || { x: 0, z: 3.8, yaw: Math.PI };
    deps.fps.player.x = spawn.x;
    deps.fps.player.z = spawn.z;
    deps.fps.yaw = spawn.yaw == null ? Math.PI : spawn.yaw;
    deps.fps.feetY = 0;
    deps.fps.velY = 0;
    setBackroomsTemperatureZone("0.7");
    applyLevel07Atmosphere(true);
    syncHudTitle();
    showEnterLevelBanner("level0.7 · 忆域");
    markLevelEntered("0.7", deps.showToast);
    deps.showToast("这里保存着 Level 0 曾经存在过的版本。原路仍在身后。");
    return true;
  }

  function exitLevel02ToSpawn() {
    if (activeId !== "02") return;
    var survival = deps.getSurvival();
    var survived = !!(survival && !survival.dead);
    exitLevel02({ restorePlayer: true });
    if (survived) markLevel02Survived(deps.showToast);
  }

  return {
    init: function initZones() {
      // 子区几何在真正进入时才创建。静态触发器仅作为旧世界兼容回退。
      if (!deps.getPoiTriggers) {
        redChannelTrigger = getRedChannelTriggerAabb(
          deps.cellCenterX,
          deps.cellCenterZ,
          deps.gridSize
        );
        blueHoleTrigger = getBlueHoleTriggerAabb(
          deps.cellCenterX,
          deps.cellCenterZ,
          deps.gridSize
        );
      }
      syncHudTitle();
    },

    dispose: function disposeAllZones() {
      leaveActiveSubZone({
        restorePlayer: false,
        rebuild: false,
        resumeMusic: false,
      });
      disposeTormentBreach();
      stopLevel02Hazards();
      if (level02State && level02State.group && deps.scene) {
        if (level02State.disposeLights) level02State.disposeLights();
        deps.scene.remove(level02State.group);
      }
      if (level03State && level03State.group && deps.scene) {
        if (level03State.dispose) level03State.dispose();
        else deps.scene.remove(level03State.group);
      }
      if (level05State) {
        level05State.dispose();
      }
      if (level07State) {
        level07State.dispose();
      }
      if (level01State) {
        if (level01State.dispose) level01State.dispose();
        else if (level01State.group) disposeObject3D(level01State.group);
      }
      if (redRoomState && redRoomState.group && deps.scene) {
        deps.scene.remove(redRoomState.group);
      }
      if (level02FxRoot && deps.scene) deps.scene.remove(level02FxRoot);
      invalidateLevel02ColliderCache();
      level02State = null;
      level03State = null;
      level05State = null;
      level07State = null;
      level01State = null;
      redRoomState = null;
      tormentState = null;
      level02Hazards = null;
      level02FxRoot = null;
      filteredZoneColliders.length = 0;
      activeId = null;
      returnSnapshot = null;
    },

    isActive: function isZoneActive(id) {
      return activeId === id;
    },
    isInSubZone: function isInSubZone() {
      return activeId !== null;
    },
    getActiveId: function getActiveZoneId() {
      return activeId;
    },

    enterRedRoom: enterRedRoom,
    enterLevel01: enterLevel01,
    enterLevel02: enterLevel02,
    enterLevel03: enterLevel03,
    enterLevel05: enterLevel05,
    enterLevel07: enterLevel07,
    exitLevel02ToSpawn: exitLevel02ToSpawn,
    exitRedRoom: function () {
      exitRedRoom({ restorePlayer: true });
    },
    exitLevel03: function () {
      exitLevel03({ restorePlayer: true });
    },
    exitLevel01: function () {
      exitLevel01({ restorePlayer: true });
    },

    getColliders: function getZoneColliders() {
      if (activeId === "torment" && tormentState && tormentState.colliders) {
        return tormentState.colliders;
      }
      if (activeId === "red" && redRoomState && redRoomState.colliders) {
        return redRoomState.colliders;
      }
      if (activeId === "03" && level03State && level03State.colliders) {
        return level03State.colliders;
      }
      if (activeId === "05" && level05State && level05State.colliders) {
        return getSolidZoneColliders(level05State.colliders);
      }
      if (activeId === "07" && level07State && level07State.colliders) {
        return getSolidZoneColliders(level07State.colliders);
      }
      if (activeId === "01" && level01State && level01State.colliders) {
        return level01State.colliders;
      }
      if (activeId === "02" && level02State && level02State.colliders) {
        return getLevel02FilteredColliders();
      }
      return getMainColliders();
    },

    getLevel02InteractMeshes: function getLevel02InteractMeshes() {
      if (level02State && level02State.interactMeshes) {
        return level02State.interactMeshes;
      }
      var exitM = getLevel02ExitPickMesh();
      return exitM ? [exitM] : [];
    },

    getInteractMeshes: function getZoneInteractMeshes() {
      if (activeId === "03" && level03State) {
        return level03State.interactMeshes || [];
      }
      if (activeId === "05" && level05State) {
        return level05State.interactMeshes || [];
      }
      if (activeId === "07" && level07State) {
        return level07State.interactMeshes || [];
      }
      if (activeId === "torment" && tormentState) {
        return tormentState.interactMeshes || [];
      }
      if (activeId === "01" && level01State) {
        return level01State.interactMeshes || [];
      }
      if (activeId === "02" && level02State) {
        return level02State.interactMeshes || [];
      }
      return [];
    },

    getInteractionHint: function getZoneInteractionHint(data) {
      if (activeId === "03" && level03State && level03State.getInteractionHint) {
        return level03State.getInteractionHint(data);
      }
      if (activeId === "05" && level05State && level05State.getInteractionHint) {
        return level05State.getInteractionHint(data);
      }
      if (activeId === "07" && level07State && level07State.getInteractionHint) {
        return level07State.getInteractionHint(data);
      }
      if (
        activeId === "torment" &&
        tormentState &&
        tormentState.getInteractionHint
      ) {
        return tormentState.getInteractionHint(data);
      }
      if (activeId === "01" && level01State && level01State.getInteractionHint) {
        return level01State.getInteractionHint(data);
      }
      if (data && data.kind === "level02_document") {
        return '按 <kbd>Q</kbd> 阅读';
      }
      return "";
    },

    interact: function interactWithActiveZone(data) {
      if (!data) return false;
      if (activeId === "03" && level03State && level03State.interact) {
        return level03State.interact(data, {
          showToast: deps.showToast,
          onReportRecovered: function () {
            markLevel03ReportRecovered(deps.showToast);
          },
        });
      }
      if (activeId === "05" && level05State && level05State.interact) {
        return level05State.interact(data, {
          showToast: deps.showToast,
          grantItem: function (itemId, amount) {
            var survival = deps.getSurvival();
            if (!survival) return false;
            var names = {
              almond_water: "杏仁水",
              royal_rations: "最小有效分量皇家口粮",
            };
            var count = Math.max(1, amount | 0);
            for (var itemIndex = 0; itemIndex < count; itemIndex++) {
              if (
                !survival.addItem({
                  id: itemId,
                  name: names[itemId] || itemId,
                })
              ) {
                return false;
              }
            }
            return true;
          },
          onExitRequest: function (request) {
            if (!request || !deps.onLevel05Exit) return;
            exitLevel05({ restorePlayer: false, resumeMusic: false });
            deps.onLevel05Exit(request.destination);
          },
        });
      }
      if (activeId === "07" && level07State && level07State.interact) {
        return level07State.interact(data, {
          showToast: deps.showToast,
          onAllRecords: function () {
            markLevel07ArchiveRecovered(deps.showToast);
          },
        });
      }
      if (activeId === "torment" && tormentState && tormentState.interact) {
        return tormentState.interact(data, { showToast: deps.showToast });
      }
      if (activeId === "01" && level01State && level01State.interact) {
        return level01State.interact(data, {
          showToast: deps.showToast,
          grantItem: function (itemId, amount) {
            var survival = deps.getSurvival();
            if (!survival) return false;
            var itemNames = {
              circuit: "废弃电路板",
              alloy_plate: "空间站合金板",
              almond_water: "杏仁水",
              royal_rations: "最小有效分量皇家口粮",
            };
            var count = Math.max(1, amount | 0);
            for (var gi = 0; gi < count; gi++) {
              if (
                !survival.addItem({
                  id: itemId,
                  name: itemNames[itemId] || itemId,
                })
              ) {
                return false;
              }
            }
            return true;
          },
          onClip: function () {
            if (Math.random() < 0.75 && deps.onLevel01Clip) {
              deps.onLevel01Clip();
            } else {
              deps.showToast("异常墙把你抛回了天顶站入口外。");
              exitLevel01({ restorePlayer: true });
            }
          },
        });
      }
      if (activeId === "02" && data.kind === "level02_document") {
        deps.showToast(data.text || "装修记录已经被灰尘和水渍破坏。");
        return true;
      }
      return false;
    },

    updateLevel02Hazards: function updateLevel02Hazards(dt) {
      if (activeId !== "02") return;
      if (level02State && level02State.updateLights) {
        level02State.updateLights(deps.fps.player.x, deps.fps.player.z);
      }
      if (!level02Hazards) return;
      var survival = deps.getSurvival();
      try {
        level02Hazards.update(
          dt,
          {
            x: deps.fps.player.x,
            z: deps.fps.player.z,
            feetY: deps.fps.feetY,
            bodyHeight: deps.bodyHeight,
            radius: deps.fps.player.radius,
            nudge: deps.fps.player,
          },
          survival,
          deps.showToast
        );
        if (deps.scene && deps.scene.fog && level02Hazards.getDustLevel) {
          deps.scene.fog.far = 26 - level02Hazards.getDustLevel() * 14;
        }
      } catch (err) {
        console.error("[Level0.2] hazard update failed:", err);
      }
    },

    update: function updateActiveZone(dt) {
      if (activeId === null) {
        updateTormentOpportunity();
        return;
      }
      if (activeId === "torment") {
        var tormentSurvival = deps.getSurvival();
        if (tormentSurvival && tormentSurvival.dead) {
          exitTorment({
            restorePlayer: false,
            resumeMusic: false,
            showReturn: false,
          });
          return;
        }
        if (!tormentState) return;
        tormentState.update(dt, deps.fps.player, tormentSurvival, {
          moving: !!deps.isPlayerMoving && deps.isPlayerMoving(),
          grounded: deps.fps.grounded,
          onSanityPulse: function (amount) {
            if (!tormentSurvival || tormentSurvival.dead) return;
            tormentSurvival.sanity = Math.max(
              0,
              tormentSurvival.sanity - amount
            );
          },
        });
        if (tormentState.isExpired(performance.now())) {
          exitTorment({ restorePlayer: true });
        }
        return;
      }
      if (activeId === "red") {
        var redSurvival = deps.getSurvival();
        if (redSurvival && redSurvival.dead) {
          exitRedRoom({
            restorePlayer: false,
            resumeMusic: false,
            countEscape: false,
          });
          return;
        }
        if (redRoomState && redRoomState.update) {
          redRoomState.update(dt, deps.fps.player);
        }
        return;
      }
      if (activeId === "03") {
        var level03Survival = deps.getSurvival();
        if (level03Survival && level03Survival.dead) {
          exitLevel03({ restorePlayer: false, resumeMusic: false });
          return;
        }
        if (level03State && level03State.update) {
          level03State.update(dt, deps.fps.player, {
            showToast: deps.showToast,
            onDamage: function (amount) {
              if (level03Survival && !level03Survival.dead) {
                level03Survival.takeDamage(amount);
              }
            },
          });
        }
        return;
      }
      if (activeId === "05") {
        var level05Survival = deps.getSurvival();
        if (level05Survival && level05Survival.dead) {
          exitLevel05({ restorePlayer: false, resumeMusic: false });
          return;
        }
        if (level05State && level05State.update) {
          level05State.update(dt, deps.fps.player, {
            onDamage: function (amount) {
              if (level05Survival && !level05Survival.dead) {
                level05Survival.takeDamage(amount);
              }
            },
            onInfectionPressure: function (amount) {
              level05Infection = Math.min(1.25, level05Infection + amount);
              if (level05Infection > 0.5 && level05Survival && !level05Survival.dead) {
                level05Survival.takeDamage(amount * 18);
              }
            },
            onEnvironmentChange: function (state) {
              if (state && state.zone === "hospital") {
                deps.showToast("污水退到身后。医院里有什么东西正在移动。");
              }
            },
          });
        }
        return;
      }
      if (activeId === "07") {
        var level07Survival = deps.getSurvival();
        if (level07Survival && level07Survival.dead) {
          exitLevel07({ restorePlayer: false, resumeMusic: false });
          return;
        }
        if (level07State && level07State.update) {
          level07State.update(dt, deps.fps.player, {
            onDamage: function (amount, detail) {
              if (level07Survival && !level07Survival.dead) {
                level07Survival.takeDamage(amount);
              }
              if (detail && detail.message) deps.showToast(detail.message);
            },
            onGrowlerRoar: function () {
              deps.showToast("石墙深处传来一声不属于任何时代的吼叫。");
            },
          });
          var level07Exit = level07State.getExitRequest
            ? level07State.getExitRequest()
            : null;
          if (level07Exit && level07Exit.destination === "level0") {
            exitLevel07({ restorePlayer: true });
          }
        }
        return;
      }
      if (activeId === "02") {
        var activeSurvival = deps.getSurvival();
        if (activeSurvival && activeSurvival.dead) {
          exitLevel02({ restorePlayer: false, resumeMusic: false });
          return;
        }
      }
      if (activeId === "01" && level01State) {
        if (level01State.update) level01State.update(dt, deps.fps.player);
        var nextTemp = level01State.getTemperatureZone
          ? level01State.getTemperatureZone(deps.fps.player.x, deps.fps.player.z)
          : "0.1";
        nextTemp =
          nextTemp === "hot"
            ? "0.1_hot"
            : nextTemp === "cold"
              ? "0.1_cold"
              : "0.1";
        if (nextTemp !== activeTemperatureZone) {
          activeTemperatureZone = nextTemp;
          setBackroomsTemperatureZone(nextTemp);
        }
        return;
      }
      if (activeId === "02") {
        this.updateLevel02Hazards(dt);
      }
    },

    drawFx: function drawActiveZoneFx(canvas, now) {
      if (
        activeId === "05" &&
        level05State &&
        level05State.drawFx
      ) {
        level05State.drawFx(canvas, now);
        return;
      }
      if (
        activeId === "07" &&
        level07State &&
        level07State.drawFx
      ) {
        level07State.drawFx(canvas, now);
        return;
      }
      if (
        activeId === "03" &&
        level03State &&
        level03State.drawFx
      ) {
        level03State.drawFx(canvas, now);
        return;
      }
      if (
        activeId === "torment" &&
        tormentState &&
        tormentState.drawFx
      ) {
        tormentState.drawFx(canvas, now);
        return;
      }
      if (
        activeId === "02" &&
        level02Hazards &&
        level02Hazards.drawFx
      ) {
        level02Hazards.drawFx(canvas, now);
      }
    },

    getDustLevel: function getLevel02DustLevel() {
      return activeId === "02" && level02Hazards && level02Hazards.getDustLevel
        ? level02Hazards.getDustLevel()
        : 0;
    },

    getRedEffects: function getActiveRedEffects() {
      return activeId === "red" && redRoomState && redRoomState.getEffects
        ? redRoomState.getEffects()
        : null;
    },

    checkMainTriggers: function checkMainZoneTriggers() {
      if (activeId !== null) return;
      if (performance.now() < mainTriggerCooldownUntil) return;
      var survival = deps.getSurvival();
      if (!survival || survival.dead) return;
      var dynamic = deps.getPoiTriggers ? deps.getPoiTriggers() : [];
      var ri;
      for (ri = 0; ri < dynamic.length; ri++) {
        var poi = dynamic[ri];
        if (!poi) continue;
        var trigger = poi.trigger || poi;
        if (!pointInAabb(deps.fps.player.x, deps.fps.player.z, trigger)) continue;
        var type = poi.type || poi.kind || poi.poiKind;
        if (type === "red") {
          enterRedRoom();
          return;
        }
        if (type === "03") {
          enterLevel03();
          return;
        }
        if (type === "05") {
          enterLevel05();
          return;
        }
        if (type === "07") {
          enterLevel07();
          return;
        }
      }
      if (redChannelTrigger && pointInAabb(deps.fps.player.x, deps.fps.player.z, redChannelTrigger)) {
        enterRedRoom();
        return;
      }
      if (blueHoleTrigger && pointInAabb(deps.fps.player.x, deps.fps.player.z, blueHoleTrigger)) {
        enterLevel03();
      }
    },

    checkSubZoneExits: function checkSubZoneExits() {
      if (activeId === "red" && redRoomState) {
        if (pointInAabb(deps.fps.player.x, deps.fps.player.z, redRoomState.exitTrigger)) {
          exitRedRoom({ restorePlayer: true });
        }
        return;
      }
      if (activeId === "03") {
        return;
      }
      if (activeId === "01" && level01State && level01State.exitTrigger) {
        if (
          pointInAabb(
            deps.fps.player.x,
            deps.fps.player.z,
            level01State.exitTrigger
          )
        ) {
          exitLevel01({ restorePlayer: true });
        }
      }
    },

    getSurvivalEnv: function getSurvivalEnv() {
      _survivalEnv.skipPassiveSanity =
        activeId === "red" || activeId === "torment";
      if (activeId === "red") {
        var redSeconds = redEnteredAt
          ? Math.max(0, (performance.now() - redEnteredAt) / 1000)
          : 0;
        _survivalEnv.sanityDrainPerSec = Math.min(
          6,
          Math.max(2.6, RED_ROOM_SANITY_DRAIN_PER_SEC * 0.52 + redSeconds * 0.055)
        );
      } else if (activeId === "torment" && tormentState) {
        var tormentEnv = tormentState.getSurvivalEnv();
        _survivalEnv.sanityDrainPerSec = tormentEnv.sanityDrainPerSec;
      } else if (activeId === "05" && level05State) {
        var level05Env = level05State.getSurvivalEnv();
        _survivalEnv.sanityDrainPerSec = level05Env.sanityDrainPerSec || 0;
      } else if (activeId === "07" && level07State) {
        var level07Env = level07State.getSurvivalEnv();
        _survivalEnv.sanityDrainPerSec = level07Env.sanityDrainPerSec || 0;
      } else {
        _survivalEnv.sanityDrainPerSec = 0;
      }
      return _survivalEnv;
    },

    isColdDamageZone: function isColdDamageZone() {
      return activeTemperatureZone === "0.1_cold";
    },

    getMovementSpeedMul: function getMovementSpeedMul() {
      if (activeId === "05" && level05State) {
        return level05State.getSurvivalEnv().movementMultiplier || 1;
      }
      return 1;
    },

    shouldUpdateRedDoorFlicker: function shouldUpdateRedDoorFlicker() {
      return activeId !== "red";
    },
  };
}
