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
} from "./backrooms-level0-03.js?v=2";
import { buildLevel01Station } from "./backrooms-level0-01.js";
import { setBackroomsTemperatureZone } from "./backrooms-temperature.js";
import {
  queueEnterPlaceBanner,
  showEnterLevelBannerIfQueued,
  showEnterLevelBanner,
} from "./backrooms-level-enter.js";
import { markLevelEntered, markLevel02Survived } from "./backrooms-tasks.js";

/** @typedef {"red" | "01" | "02" | "03"} Level0SubZoneId */

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
 * @param {(id: "red" | "02" | "03") => void} [deps.onEnterSubLevel]
 * @param {(id: "red" | "02" | "03") => void} [deps.onExitSubLevel]
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
    if (level03State) disposeObject3D(level03State.group);
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

  function leaveActiveSubZone(opts) {
    if (activeId === "02") exitLevel02(opts);
    else if (activeId === "01") exitLevel01(opts);
    else if (activeId === "red") exitRedRoom(opts);
    else if (activeId === "03") exitLevel03(opts);
  }

  function enterRedRoom() {
    if (activeId === "red" || !deps.level0WorldRoot) return false;
    var survival = deps.getSurvival();
    if (!survival || survival.dead) return false;

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
    if (!survival || survival.dead) return false;
    if (activeId === "red" || activeId === "02") return false;

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
    deps.fps.player.x = 0;
    deps.fps.player.z = 0;
    deps.fps.feetY = 0;
    deps.fps.velY = 0;
    setBackroomsTemperatureZone("0.3");
    applyLevel03Atmosphere(true);
    syncHudTitle();
    showEnterLevelBanner("level0.3");
    markLevelEntered("0.3", deps.showToast);
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
      stopLevel02Hazards();
      if (level02State && level02State.group && deps.scene) {
        if (level02State.disposeLights) level02State.disposeLights();
        deps.scene.remove(level02State.group);
      }
      if (level03State && level03State.group && deps.scene) {
        deps.scene.remove(level03State.group);
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
      level01State = null;
      redRoomState = null;
      level02Hazards = null;
      level02FxRoot = null;
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
      if (activeId === "red" && redRoomState && redRoomState.colliders) {
        return redRoomState.colliders;
      }
      if (activeId === "03" && level03State && level03State.colliders) {
        return level03State.colliders;
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
      if (activeId === "01" && level01State) {
        return level01State.interactMeshes || [];
      }
      if (activeId === "02" && level02State) {
        return level02State.interactMeshes || [];
      }
      return [];
    },

    getInteractionHint: function getZoneInteractionHint(data) {
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
      if (activeId === "03" && level03State) {
        if (pointInAabb(deps.fps.player.x, deps.fps.player.z, level03State.exitTrigger)) {
          exitLevel03({ restorePlayer: true });
        }
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
      _survivalEnv.skipPassiveSanity = activeId === "red";
      if (activeId === "red") {
        var redSeconds = redEnteredAt
          ? Math.max(0, (performance.now() - redEnteredAt) / 1000)
          : 0;
        _survivalEnv.sanityDrainPerSec = Math.min(
          6,
          Math.max(2.6, RED_ROOM_SANITY_DRAIN_PER_SEC * 0.52 + redSeconds * 0.055)
        );
      } else {
        _survivalEnv.sanityDrainPerSec = 0;
      }
      return _survivalEnv;
    },

    isColdDamageZone: function isColdDamageZone() {
      return activeId === "03" || activeTemperatureZone === "0.1_cold";
    },

    shouldUpdateRedDoorFlicker: function shouldUpdateRedDoorFlicker() {
      return activeId !== "red";
    },
  };
}
