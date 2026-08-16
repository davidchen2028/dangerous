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
} from "./backrooms-level0-02.js";
import {
  buildLevel03Room,
  getBlueHoleTriggerAabb,
  LEVEL03_FOG,
} from "./backrooms-level0-03.js";
import { setBackroomsTemperatureZone } from "./backrooms-temperature.js";
import {
  queueEnterPlaceBanner,
  showEnterLevelBannerIfQueued,
  showEnterLevelBanner,
} from "./backrooms-level-enter.js";

/** @typedef {"red" | "02" | "03"} Level0SubZoneId */

const _survivalEnv = { skipPassiveSanity: false, sanityDrainPerSec: 0 };

/**
 * @param {object} deps
 * @param {THREE.Scene} deps.scene
 * @param {THREE.PerspectiveCamera | null} deps.camera
 * @param {THREE.Group | null} deps.level0WorldRoot
 * @param {object[]} deps.wallColliders
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
  /** @type {{ x: number, z: number, yaw: number } | null} */
  var returnSnapshot = null;

  /** @type {ReturnType<buildRedRoom> | null} */
  var redRoomState = null;
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
    if (activeId === "03") deps.onHudTitleChange("Backrooms · Level 0.3");
    else if (activeId === "02") deps.onHudTitleChange("Backrooms · Level 0.2");
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
      deps.scene.remove(level02State.group);
    }
    level02State = buildLevel02World(deps.scene, {
      gridSize: deps.gridSize,
      wallHeight: deps.wallHeight,
      matrix: deps.matrix,
      mapRows: deps.mapRows,
      mapCols: deps.mapCols,
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
    if (level02State) level02State.group.visible = false;
    if (level02FxRoot) level02FxRoot.visible = false;
    applyLevel02Atmosphere(false);
    setMainWorldVisible(true);
    syncHudTitle();
    if (opts.rebuild) rebuildLevel02World();
    if (opts.teleportSpawn) {
      deps.fps.player.x = deps.spawnPoint.x;
      deps.fps.player.z = deps.spawnPoint.z;
      deps.fps.feetY = 0;
      deps.fps.velY = 0;
    }
  }

  function exitRedRoom(opts) {
    opts = opts || {};
    if (activeId !== "red") return;
    activeId = null;
    if (opts.resumeMusic !== false && deps.onExitSubLevel) {
      deps.onExitSubLevel("red");
    }
    if (redRoomState) redRoomState.group.visible = false;
    setMainWorldVisible(true);
    applyRedRoomAtmosphere(false);
    syncHudTitle();
    if (opts.restorePlayer !== false && returnSnapshot) {
      deps.fps.player.x = returnSnapshot.x;
      deps.fps.player.z = returnSnapshot.z;
      deps.fps.yaw = returnSnapshot.yaw;
    }
    returnSnapshot = null;
  }

  function exitLevel03(opts) {
    opts = opts || {};
    if (activeId !== "03") return;
    activeId = null;
    if (opts.resumeMusic !== false && deps.onExitSubLevel) {
      deps.onExitSubLevel("03");
    }
    if (level03State) level03State.group.visible = false;
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
  }

  function leaveActiveSubZone(opts) {
    if (activeId === "02") exitLevel02(opts);
    else if (activeId === "red") exitRedRoom(opts);
    else if (activeId === "03") exitLevel03(opts);
  }

  function enterRedRoom() {
    if (activeId === "red" || !redRoomState || !deps.level0WorldRoot) return false;
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
    activeId = "red";
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

  function enterLevel02() {
    if (activeId === "02" || !level02State || !deps.level0WorldRoot) return false;
    var survival = deps.getSurvival();
    if (!survival || survival.dead) return false;
    if (activeId === "red" || activeId === "03") return false;

    activeId = "02";
    if (deps.onEnterSubLevel) deps.onEnterSubLevel("02");
    setMainWorldVisible(false);
    if (redRoomState) redRoomState.group.visible = false;
    level02State.group.visible = true;
    applyLevel02Atmosphere(true);
    syncHudTitle();
    showEnterLevelBanner("level0.2");
    if (level02FxRoot) level02FxRoot.visible = true;
    if (!level02Hazards) {
      level02Hazards = createLevel02EnterHazards(deps.scene, {
        wallHeight: deps.wallHeight,
      });
    }
    startLevel02Hazards();
    return true;
  }

  function enterLevel03() {
    if (activeId === "03" || !level03State || !deps.level0WorldRoot) return false;
    var survival = deps.getSurvival();
    if (!survival || survival.dead) return false;
    if (activeId === "red" || activeId === "02") return false;

    returnSnapshot = {
      x: deps.fps.player.x,
      z: deps.fps.player.z,
      yaw: deps.fps.yaw,
    };
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
    return true;
  }

  function exitLevel02ToSpawn() {
    if (activeId !== "02") return;
    exitLevel02({ rebuild: true, teleportSpawn: true });
  }

  return {
    init: function initZones() {
      redRoomState = buildRedRoom(deps.scene, deps.gridSize, deps.wallHeight);
      level03State = buildLevel03Room(deps.scene, deps.gridSize, deps.wallHeight);
      level02State = buildLevel02World(deps.scene, {
        gridSize: deps.gridSize,
        wallHeight: deps.wallHeight,
        matrix: deps.matrix,
        mapRows: deps.mapRows,
        mapCols: deps.mapCols,
        cellCenterX: deps.cellCenterX,
        cellCenterZ: deps.cellCenterZ,
        mapWidth: deps.mapWidth,
        mapDepth: deps.mapDepth,
      });
      level02Hazards = createLevel02EnterHazards(deps.scene, {
        wallHeight: deps.wallHeight,
      });
      level02FxRoot = new THREE.Group();
      level02FxRoot.name = "Level02FxRoot";
      level02FxRoot.visible = false;
      deps.scene.add(level02FxRoot);
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
      if (redRoomState && redRoomState.group && deps.scene) {
        deps.scene.remove(redRoomState.group);
      }
      if (level02FxRoot && deps.scene) deps.scene.remove(level02FxRoot);
      invalidateLevel02ColliderCache();
      level02State = null;
      level03State = null;
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
    enterLevel02: enterLevel02,
    enterLevel03: enterLevel03,
    exitLevel02ToSpawn: exitLevel02ToSpawn,
    exitRedRoom: function () {
      exitRedRoom({ restorePlayer: true });
    },
    exitLevel03: function () {
      exitLevel03({ restorePlayer: true });
    },

    getColliders: function getZoneColliders() {
      if (activeId === "red" && redRoomState && redRoomState.colliders) {
        return redRoomState.colliders;
      }
      if (activeId === "03" && level03State && level03State.colliders) {
        return level03State.colliders;
      }
      if (activeId === "02" && level02State && level02State.colliders) {
        return getLevel02FilteredColliders();
      }
      return deps.wallColliders;
    },

    getLevel02InteractMeshes: function getLevel02InteractMeshes() {
      var exitM = getLevel02ExitPickMesh();
      return exitM ? [exitM] : [];
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
      } catch (err) {
        console.error("[Level0.2] hazard update failed:", err);
      }
    },

    checkMainTriggers: function checkMainZoneTriggers() {
      if (activeId !== null) return;
      var survival = deps.getSurvival();
      if (!survival || survival.dead) return;
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
      }
    },

    getSurvivalEnv: function getSurvivalEnv() {
      _survivalEnv.skipPassiveSanity = activeId === "red";
      _survivalEnv.sanityDrainPerSec =
        activeId === "red" ? RED_ROOM_SANITY_DRAIN_PER_SEC : 0;
      return _survivalEnv;
    },

    isColdDamageZone: function isColdDamageZone() {
      return activeId === "03";
    },

    shouldUpdateRedDoorFlicker: function shouldUpdateRedDoorFlicker() {
      return activeId !== "red";
    },
  };
}
