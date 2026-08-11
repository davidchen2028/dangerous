/**
 * Level 1.1 子区域调度 — L1.1-1 / 2 / 3 走廊 · M.E.G 前哨 1 / 2 / 3
 */
import * as THREE from "three";
import {
  buildLevel1_1World,
  pointInLevel1_1Aabb,
  LEVEL1_1_WALL_H,
  LEVEL1_1_SPAWN_YAW,
} from "./backrooms-level1-1-world.js";
import { buildLevel1_1_2World } from "./backrooms-level1-1-2-world.js";
import {
  buildLevel1_1_3World,
  LEVEL1_1_3_SANITY_DRAIN,
} from "./backrooms-level1-1-3-world.js";
import {
  buildLevel1_1_4World,
  LEVEL1_1_4_SANITY_DRAIN,
} from "./backrooms-level1-1-4-world.js";
import { syncLevel1_1ChestEntryOpened } from "./backrooms-level1-1-chests.js";
import {
  createLevel1_1_2DeathMoth,
  createLevel1_1_3DeathMoths,
  createLevel1_1_4DeathMoths,
} from "./backrooms-death-moth.js";
import { showEnterLevelBanner } from "./backrooms-level-enter.js";

/**
 * @param {object} deps
 * @param {THREE.Scene} deps.scene
 * @param {THREE.Group} deps.level1Root
 * @param {object[]} deps.wallColliders
 * @param {{ x: number, z: number, yaw: number, pitch?: number, roll?: number, feetY?: number }} deps.fps
 * @param {() => import('./backrooms-survival.js').BackroomsSurvival | null} deps.getSurvival
 * @param {ReturnType<import('./backrooms-horror.js').createBackroomsHorrorSystem> | null} deps.horror
 * @param {(title: string) => void} [deps.onHudTitleChange]
 * @param {(msg: string) => void} [deps.showToast]
 * @param {THREE.PerspectiveCamera} [deps.camera]
 * @param {() => void} [deps.onHomeEnding]
 */
export function createLevel1_1ZoneManager(deps) {
  /** @type {"corridor" | "corridor2" | "corridor3" | "corridor4" | "outpost" | "outpost2" | "outpost3" | null} */
  var subZone = null;
  /** @type {ReturnType<buildLevel1_1World> | null} */
  var world = null;
  /** @type {ReturnType<buildLevel1_1_2World> | null} */
  var world2 = null;
  /** @type {ReturnType<buildLevel1_1_3World> | null} */
  var world3 = null;
  /** @type {ReturnType<buildLevel1_1_4World> | null} */
  var world4 = null;
  /** @type {ReturnType<createLevel1_1_2DeathMoth> | null} */
  var corridor2DeathMoth = null;
  /** @type {ReturnType<createLevel1_1_3DeathMoths> | null} */
  var corridor3DeathMoths = null;
  /** @type {ReturnType<createLevel1_1_4DeathMoths> | null} */
  var corridor4DeathMoths = null;
  var homeEndingTriggered = false;
  var savedCameraFar = 90;
  /** @type {{ x: number, z: number, yaw: number, pitch: number, roll: number, feetY: number } | null} */
  var megReturnSnapshot = null;
  /** @type {object[] | null} */
  var l1ColliderBackup = null;
  var outpostReenterBlockedUntil = 0;
  var outpost2ReenterBlockedUntil = 0;
  var outpost3ReenterBlockedUntil = 0;

  var LEVEL1_1_FOG = 0xffffff;
  var savedFog = { color: 0, near: 0, far: 0, bg: null, camFar: 0 };

  function saveAtmosphere() {
    if (!deps.scene) return;
    savedFog.bg = deps.scene.background;
    if (deps.scene.fog) {
      savedFog.color = deps.scene.fog.color.getHex();
      savedFog.near = deps.scene.fog.near;
      savedFog.far = deps.scene.fog.far;
    }
  }

  function applyLevel1_1Atmosphere() {
    if (!deps.scene) return;
    deps.scene.background = new THREE.Color(LEVEL1_1_FOG);
    if (deps.scene.fog) {
      deps.scene.fog.color.setHex(LEVEL1_1_FOG);
      deps.scene.fog.near = 4;
      deps.scene.fog.far =
        subZone === "corridor4" ? 95 : subZone === "corridor3" ? 52 : subZone === "corridor2" ? 52 : 38;
    }
  }

  function applyCorridor4Atmosphere() {
    if (!deps.scene) return;
    deps.scene.background = new THREE.Color(0x0a0a0c);
    if (deps.scene.fog) {
      deps.scene.fog.color.setHex(0x121216);
      deps.scene.fog.near = 3;
      deps.scene.fog.far = 95;
    }
    if (deps.camera) {
      savedCameraFar = deps.camera.far;
      deps.camera.far = 220;
      deps.camera.updateProjectionMatrix();
    }
  }

  function restoreCorridor4Camera() {
    if (deps.camera && savedCameraFar > 0) {
      deps.camera.far = savedCameraFar;
      deps.camera.updateProjectionMatrix();
    }
  }

  function restoreAtmosphere() {
    if (!deps.scene) return;
    if (savedFog.bg) deps.scene.background = savedFog.bg;
    if (deps.scene.fog) {
      deps.scene.fog.color.setHex(savedFog.color);
      deps.scene.fog.near = savedFog.near;
      deps.scene.fog.far = savedFog.far;
    }
  }

  function syncHudTitle() {
    if (!deps.onHudTitleChange) return;
    if (subZone === "outpost") deps.onHudTitleChange("Backrooms · L1.1 · M.E.G 前哨 1");
    else if (subZone === "outpost2") deps.onHudTitleChange("Backrooms · L1.1 · M.E.G 前哨 2");
    else if (subZone === "outpost3") deps.onHudTitleChange("Backrooms · L1.1 · M.E.G 前哨 3");
    else if (subZone === "corridor3") deps.onHudTitleChange("Backrooms · L1.1-3");
    else if (subZone === "corridor4") deps.onHudTitleChange("Backrooms · L1.1-4 → 灯塔");
    else if (subZone === "corridor2") deps.onHudTitleChange("Backrooms · L1.1-2");
    else if (subZone === "corridor") deps.onHudTitleChange("Backrooms · L1.1-1");
    else deps.onHudTitleChange("Backrooms · Level 1");
  }

  function setZoneVisibility() {
    if (!world) return;
    world.corridor.visible = subZone === "corridor";
    world.outpost.visible = subZone === "outpost";
    if (world2) {
      world2.group.visible = subZone === "corridor2" || subZone === "outpost2";
      world2.corridor.visible = subZone === "corridor2";
      world2.outpost.visible = subZone === "outpost2";
    }
    if (world3) {
      world3.group.visible = subZone === "corridor3" || subZone === "outpost3";
      world3.corridor.visible = subZone === "corridor3";
      world3.outpost.visible = subZone === "outpost3";
    }
    if (world4) {
      world4.group.visible = subZone === "corridor4";
    }
  }

  function pointInAabb(px, pz, box) {
    return pointInLevel1_1Aabb(px, pz, box);
  }

  function crossedCorridorDoor(px, pz, doorZ, halfW) {
    if (doorZ == null) return false;
    var hw = halfW != null ? halfW : 3.5;
    return pz >= doorZ - 0.55 && Math.abs(px) <= hw - 0.08;
  }

  function ensureLinkDoorColliders() {
    if (subZone === "corridor" && world && world.corridor12Door) {
      var b12 = world.corridor12Door.doorGapCollider;
      if (b12) {
        b12.ghost = world.isCorridor12DoorPassable();
        if (world.colliders.indexOf(b12) < 0) world.colliders.push(b12);
      }
    }
    if (subZone === "corridor2" && world2 && world2.corridor23Door) {
      var pass23 = world2.isCorridor23DoorPassable();
      var b23 = world2.corridor23Door.doorGapCollider;
      if (b23) {
        b23.ghost = pass23;
        if (world2.colliders.indexOf(b23) < 0) world2.colliders.push(b23);
      }
      var cap23 = world2.corridor23Door.endCapCollider;
      if (cap23) {
        cap23.ghost = pass23;
        if (world2.colliders.indexOf(cap23) < 0) world2.colliders.push(cap23);
      }
    }
    if (subZone === "corridor3" && world3 && world3.corridor14Door) {
      var b14 = world3.corridor14Door.doorGapCollider;
      if (b14) {
        b14.ghost = world3.isCorridor14DoorPassable();
        if (world3.colliders.indexOf(b14) < 0) world3.colliders.push(b14);
      }
    }
  }

  function syncDoorCollidersToDeps() {
    ensureLinkDoorColliders();
    if (subZone === "corridor2" && world2 && world2.corridor23Door) {
      var pass23 = world2.isCorridor23DoorPassable();
      var b23 = world2.corridor23Door.doorGapCollider;
      var cap23 = world2.corridor23Door.endCapCollider;
      if (b23) {
        b23.ghost = pass23;
        if (deps.wallColliders.indexOf(b23) < 0) deps.wallColliders.push(b23);
      }
      if (cap23) {
        cap23.ghost = pass23;
        if (deps.wallColliders.indexOf(cap23) < 0) deps.wallColliders.push(cap23);
      }
    }
    if (subZone === "corridor" && world && world.corridor12Door) {
      var pass12 = world.isCorridor12DoorPassable();
      var b12 = world.corridor12Door.doorGapCollider;
      if (b12) {
        b12.ghost = pass12;
        if (deps.wallColliders.indexOf(b12) < 0) deps.wallColliders.push(b12);
      }
    }
    if (subZone === "corridor3" && world3 && world3.corridor14Door) {
      var pass14 = world3.isCorridor14DoorPassable();
      var b14 = world3.corridor14Door.doorGapCollider;
      if (b14) {
        b14.ghost = pass14;
        if (deps.wallColliders.indexOf(b14) < 0) deps.wallColliders.push(b14);
      }
    }
  }

  function isNearCorridor23Link(px, pz) {
    if (!world2) return false;
    var doorZ = world2.corridor23DoorZ || 50;
    var hw = world2.halfW || 3.5;
    return Math.abs(px) <= hw - 0.05 && pz >= doorZ - 4.5;
  }

  function restoreMegWorldVisibility() {
    if (world) world.group.visible = false;
    if (world2) world2.group.visible = false;
    if (world3) world3.group.visible = false;
    if (world4) world4.group.visible = false;
    restoreCorridor4Camera();
    deps.level1Root.children.forEach(function (child) {
      if (
        child.name !== "Level1_1World" &&
        child.name !== "Level1_1_2World" &&
        child.name !== "Level1_1_3World" &&
        child.name !== "Level1_1_4World"
      ) {
        child.visible = true;
      }
    });
  }

  function forceExitL1_1() {
    if (!subZone) return false;
    subZone = null;
    homeEndingTriggered = false;
    restoreL1Colliders();
    restoreAtmosphere();
    restoreMegWorldVisibility();
    megReturnSnapshot = null;
    syncHudTitle();
    if (deps.ensureMegBase) deps.ensureMegBase();
    return true;
  }

  function swapToLevel1_1Colliders() {
    ensureLinkDoorColliders();
    l1ColliderBackup = deps.wallColliders.slice();
    deps.wallColliders.length = 0;
    var list = [];
    if (subZone === "corridor" && world) {
      list = world.colliders.slice();
    } else if (subZone === "corridor2" && world2) {
      list = world2.colliders.slice();
    } else if (subZone === "corridor3" && world3) {
      list = world3.colliders.slice();
    } else if (subZone === "corridor4" && world4) {
      list = world4.colliders.slice();
    } else if (subZone === "outpost" && world) {
      list = world.colliders.concat(world.outpostColliders);
    } else if (subZone === "outpost2" && world2) {
      list = world2.colliders.concat(world2.outpostColliders);
    } else if (subZone === "outpost3" && world3) {
      list = world3.colliders.concat(world3.outpostColliders);
    }
    var i;
    for (i = 0; i < list.length; i++) deps.wallColliders.push(list[i]);
  }

  function restoreL1Colliders() {
    deps.wallColliders.length = 0;
    if (!l1ColliderBackup) return;
    var i;
    for (i = 0; i < l1ColliderBackup.length; i++) {
      deps.wallColliders.push(l1ColliderBackup[i]);
    }
    l1ColliderBackup = null;
  }

  function teleportTo(sp) {
    deps.fps.x = sp.x;
    deps.fps.z = sp.z;
    deps.fps.yaw = sp.yaw;
    if (sp.pitch != null) deps.fps.pitch = sp.pitch;
    if (sp.roll != null) deps.fps.roll = sp.roll;
    if (sp.feetY != null) deps.fps.feetY = sp.feetY;
  }

  function ensureWorld1() {
    if (world) return world;
    var chestCb = function (entry) {
      syncLevel1_1ChestEntryOpened(entry);
    };
    world = buildLevel1_1World(deps.level1Root, {
      horror: deps.horror,
      onChest: chestCb,
    });
    return world;
  }

  function ensureWorld() {
    var chestCb = function (entry) {
      syncLevel1_1ChestEntryOpened(entry);
    };
    ensureWorld1();
    if (!world2) {
      world2 = buildLevel1_1_2World(deps.level1Root, {
        horror: deps.horror,
        onChest: chestCb,
      });
      corridor2DeathMoth = createLevel1_1_2DeathMoth(world2.corridor, world2.colliders, {
        x: 0,
        z: 24,
        y: 1.65,
      });
    }
    if (!world3) {
      world3 = buildLevel1_1_3World(deps.level1Root, {
        horror: deps.horror,
        onChest: chestCb,
      });
      corridor3DeathMoths = createLevel1_1_3DeathMoths(world3.corridor, world3.colliders);
    }
    if (!world4) {
      world4 = buildLevel1_1_4World(deps.level1Root);
      corridor4DeathMoths = createLevel1_1_4DeathMoths(world4.corridor, world4.colliders);
    }
    return world;
  }

  function syncAllChestStates() {
    if (world) world.syncChestStates();
    if (world2) world2.syncChestStates();
    if (world3) world3.syncChestStates();
  }

  function enterFromMeg() {
    if (subZone) forceExitL1_1();
    ensureWorld1();
    if (!world) return false;

    megReturnSnapshot = {
      x: deps.fps.x,
      z: deps.fps.z,
      yaw: deps.fps.yaw,
      pitch: deps.fps.pitch || 0,
      roll: deps.fps.roll || 0,
      feetY: deps.fps.feetY || 0,
    };

    saveAtmosphere();
    applyLevel1_1Atmosphere();
    deps.level1Root.children.forEach(function (child) {
      if (child.name !== "Level1_1World" && child.name !== "Level1_1_2World" && child.name !== "Level1_1_3World" && child.name !== "Level1_1_4World") {
        child.visible = false;
      }
    });
    world.group.visible = true;
    if (world2) world2.group.visible = false;
    if (world3) world3.group.visible = false;
    if (world4) world4.group.visible = false;
    subZone = "corridor";
    setZoneVisibility();
    syncAllChestStates();

    swapToLevel1_1Colliders();
    teleportTo(world.corridorSpawn);
    syncHudTitle();
    showEnterLevelBanner("L1.1-1");
    return true;
  }

  function exitToMeg() {
    if (!subZone || !megReturnSnapshot) return false;
    subZone = null;
    restoreL1Colliders();
    restoreAtmosphere();
    if (world) world.group.visible = false;
    if (world2) world2.group.visible = false;
    if (world3) world3.group.visible = false;
    if (world4) world4.group.visible = false;
    restoreCorridor4Camera();
    deps.level1Root.children.forEach(function (child) {
      if (child.name !== "Level1_1World" && child.name !== "Level1_1_2World" && child.name !== "Level1_1_3World" && child.name !== "Level1_1_4World") {
        child.visible = true;
      }
    });
    teleportTo(megReturnSnapshot);
    megReturnSnapshot = null;
    syncHudTitle();
    if (deps.showToast) deps.showToast("返回 M.E.G 基地");
    if (deps.ensureMegBase) deps.ensureMegBase();
    return true;
  }

  function enterCorridor2() {
    ensureWorld();
    if (!world || !world2 || subZone !== "corridor") return false;
    if (!world.isCorridor12DoorPassable()) return false;
    subZone = "corridor2";
    setZoneVisibility();
    syncAllChestStates();
    swapToLevel1_1Colliders();
    applyLevel1_1Atmosphere();
    teleportTo(world2.corridorSpawn);
    syncHudTitle();
    showEnterLevelBanner("L1.1-2");
    return true;
  }

  function returnToCorridor1() {
    if (!world || !world2 || subZone !== "corridor2") return false;
    subZone = "corridor";
    setZoneVisibility();
    swapToLevel1_1Colliders();
    applyLevel1_1Atmosphere();
    teleportTo(world.corridorReturnFrom12);
    syncHudTitle();
    return true;
  }

  function enterCorridor3() {
    ensureWorld();
    if (!world2 || !world3 || subZone !== "corridor2") {
      if (deps.showToast) deps.showToast("无法进入 L1.1-3");
      return false;
    }
    if (!world2.isCorridor23DoorPassable()) return false;
    subZone = "corridor3";
    setZoneVisibility();
    syncAllChestStates();
    swapToLevel1_1Colliders();
    applyLevel1_1Atmosphere();
    deps.scene.background = new THREE.Color(0xe8e8ec);
    if (deps.scene.fog) deps.scene.fog.color.setHex(0xe8e8ec);
    teleportTo(world3.corridorSpawn);
    syncHudTitle();
    showEnterLevelBanner("L1.1-3");
    return true;
  }

  function returnToCorridor2From3() {
    if (!world2 || !world3 || subZone !== "corridor3") return false;
    subZone = "corridor2";
    setZoneVisibility();
    swapToLevel1_1Colliders();
    applyLevel1_1Atmosphere();
    teleportTo(world2.corridorReturnFrom23);
    syncHudTitle();
    return true;
  }

  function enterCorridor4() {
    if (!world3 || !world4 || subZone !== "corridor3") return false;
    if (!world3.isCorridor14DoorPassable()) return false;
    subZone = "corridor4";
    setZoneVisibility();
    swapToLevel1_1Colliders();
    applyCorridor4Atmosphere();
    teleportTo(world4.corridorSpawn);
    syncHudTitle();
    showEnterLevelBanner("L1.1-4");
    return true;
  }

  function returnToCorridor3From4() {
    if (!world3 || !world4 || subZone !== "corridor4") return false;
    subZone = "corridor3";
    setZoneVisibility();
    swapToLevel1_1Colliders();
    restoreCorridor4Camera();
    applyLevel1_1Atmosphere();
    deps.scene.background = new THREE.Color(0xe8e8ec);
    if (deps.scene.fog) deps.scene.fog.color.setHex(0xe8e8ec);
    teleportTo(world3.corridorReturnFrom14);
    syncHudTitle();
    return true;
  }

  function tryHomeEnding() {
    if (homeEndingTriggered || subZone !== "corridor4" || !world4) return false;
    if (!world4.isAtLighthouse(deps.fps.x, deps.fps.z)) return false;
    homeEndingTriggered = true;
    if (deps.onHomeEnding) deps.onHomeEnding();
    return true;
  }

  function enterOutpost() {
    if (!world || subZone !== "corridor") return false;
    if (performance.now() < outpostReenterBlockedUntil) return false;
    if (!world.isOutpostDoorOpen()) return false;
    subZone = "outpost";
    setZoneVisibility();
    syncAllChestStates();
    swapToLevel1_1Colliders();
    teleportTo(world.outpostSpawn);
    syncHudTitle();
    showEnterLevelBanner("M.E.G 前哨 1");
    return true;
  }

  function returnToCorridor() {
    if (!world || subZone !== "outpost") return false;
    subZone = "corridor";
    setZoneVisibility();
    swapToLevel1_1Colliders();
    teleportTo(world.corridorReturnFromOutpost);
    outpostReenterBlockedUntil = performance.now() + 900;
    syncHudTitle();
    return true;
  }

  function enterOutpost2() {
    if (!world2 || subZone !== "corridor2") return false;
    if (performance.now() < outpost2ReenterBlockedUntil) return false;
    if (!world2.isOutpostDoorOpen()) return false;
    subZone = "outpost2";
    setZoneVisibility();
    syncAllChestStates();
    swapToLevel1_1Colliders();
    teleportTo(world2.outpostSpawn);
    syncHudTitle();
    showEnterLevelBanner("M.E.G 前哨 2");
    return true;
  }

  function returnToCorridor2() {
    if (!world2 || subZone !== "outpost2") return false;
    subZone = "corridor2";
    setZoneVisibility();
    swapToLevel1_1Colliders();
    teleportTo(world2.corridorReturnFromOutpost);
    outpost2ReenterBlockedUntil = performance.now() + 900;
    syncHudTitle();
    return true;
  }

  function enterOutpost3() {
    if (!world3 || subZone !== "corridor3") return false;
    if (performance.now() < outpost3ReenterBlockedUntil) return false;
    if (!world3.isOutpostDoorOpen()) return false;
    subZone = "outpost3";
    setZoneVisibility();
    syncAllChestStates();
    swapToLevel1_1Colliders();
    teleportTo(world3.outpostSpawn);
    syncHudTitle();
    showEnterLevelBanner("M.E.G 前哨 3");
    return true;
  }

  function returnToCorridor3() {
    if (!world3 || subZone !== "outpost3") return false;
    subZone = "corridor3";
    setZoneVisibility();
    swapToLevel1_1Colliders();
    teleportTo(world3.corridorReturnFromOutpost);
    outpost3ReenterBlockedUntil = performance.now() + 900;
    syncHudTitle();
    return true;
  }

  function tryEnterCorridor3AtDoor() {
    if (!world2 || subZone !== "corridor2") return false;
    ensureWorld();
    if (!world3) {
      if (deps.showToast) deps.showToast("L1.1-3 加载失败");
      return false;
    }

    var px = deps.fps.x;
    var pz = deps.fps.z;
    if (!isNearCorridor23Link(px, pz)) return false;

    if (world2.isCorridor23DoorPassable()) {
      return enterCorridor3();
    }

    var doorZ = world2.corridor23DoorZ || 50;
    if (pz > doorZ - 0.35) {
      deps.fps.z = doorZ - 1.8;
    }
    return false;
  }

  function tryAutoEnterCorridor3AfterDoorOpen() {
    if (!world2 || subZone !== "corridor2") return false;
    ensureWorld();
    if (!world3 || !world2.isCorridor23DoorPassable()) return false;
    if (!isNearCorridor23Link(deps.fps.x, deps.fps.z)) return false;
    return enterCorridor3();
  }

  function tryEnterCorridor2AtDoor() {
    if (!world || subZone !== "corridor") return false;
    var doorZ = world.corridor12DoorZ || 0;
    var hw = world.halfW || 3.5;
    var px = deps.fps.x;
    var pz = deps.fps.z;
    if (Math.abs(px) > hw - 0.08) return false;
    if (pz > doorZ + 0.12) {
      if (world.isCorridor12DoorPassable()) return enterCorridor2();
      deps.fps.z = doorZ - 1.4;
      return false;
    }
    if (!world.isCorridor12DoorPassable()) return false;
    if (crossedCorridorDoor(px, pz, doorZ, hw)) return enterCorridor2();
    return false;
  }

  function tryEnterCorridor4AtDoor() {
    if (!world3 || subZone !== "corridor3") return false;
    var doorZ = world3.corridor14DoorZ || 0;
    var hw = world3.halfW || 3.5;
    var px = deps.fps.x;
    var pz = deps.fps.z;
    if (Math.abs(px) > hw - 0.08) return false;
    if (pz > doorZ + 0.12) {
      if (world3.isCorridor14DoorPassable()) return enterCorridor4();
      deps.fps.z = doorZ - 1.4;
      return false;
    }
    if (!world3.isCorridor14DoorPassable()) return false;
    if (crossedCorridorDoor(px, pz, doorZ, hw)) return enterCorridor4();
    return false;
  }

  function checkTriggers() {
    if (!world || !subZone) return;
    var px = deps.fps.x;
    var pz = deps.fps.z;

    if (subZone === "corridor") {
      if (pointInLevel1_1Aabb(px, pz, world.megReturnTrigger)) {
        exitToMeg();
        return;
      }
      if (tryEnterCorridor2AtDoor()) return;
      if (
        world.isOutpostDoorOpen() &&
        pointInLevel1_1Aabb(px, pz, world.outpostEnterTrigger)
      ) {
        enterOutpost();
      }
      return;
    }

    if (subZone === "corridor2" && world2) {
      if (pointInAabb(px, pz, world2.corridor11ReturnTrigger)) {
        returnToCorridor1();
        return;
      }
      if (tryEnterCorridor3AtDoor()) return;
      if (
        world2.isOutpostDoorOpen() &&
        pointInAabb(px, pz, world2.outpostEnterTrigger)
      ) {
        enterOutpost2();
      }
      return;
    }

    if (subZone === "corridor3" && world3) {
      if (pointInAabb(px, pz, world3.corridor22ReturnTrigger)) {
        returnToCorridor2From3();
        return;
      }
      if (tryEnterCorridor4AtDoor()) return;
      if (
        world3.isOutpostDoorOpen() &&
        pointInAabb(px, pz, world3.outpostEnterTrigger)
      ) {
        enterOutpost3();
      }
      return;
    }

    if (subZone === "corridor4" && world4) {
      if (pointInAabb(px, pz, world4.corridor33ReturnTrigger)) {
        returnToCorridor3From4();
        return;
      }
      tryHomeEnding();
      return;
    }

    if (subZone === "outpost") {
      if (pointInLevel1_1Aabb(px, pz, world.outpostReturnTrigger)) {
        returnToCorridor();
      }
      return;
    }

    if (subZone === "outpost2" && world2) {
      if (pointInAabb(px, pz, world2.outpostReturnTrigger)) {
        returnToCorridor2();
      }
      return;
    }

    if (subZone === "outpost3" && world3) {
      if (pointInAabb(px, pz, world3.outpostReturnTrigger)) {
        returnToCorridor3();
      }
    }
  }

  return {
    isActive: function () {
      return subZone != null;
    },
    getSubZone: function () {
      return subZone;
    },
    getWorld: function () {
      return world;
    },
    getWorld2: function () {
      return world2;
    },
    getWorld3: function () {
      return world3;
    },
    getWorld4: function () {
      return world4;
    },
    isHomeEndingTriggered: function () {
      return homeEndingTriggered;
    },
    getSanityDrainPerSec: function () {
      if (subZone === "corridor4") return LEVEL1_1_4_SANITY_DRAIN;
      if (subZone === "corridor3") return LEVEL1_1_3_SANITY_DRAIN;
      return 0;
    },
    isWallCutSubZone: function () {
      return (
        subZone === "corridor" ||
        subZone === "corridor2" ||
        subZone === "corridor3" ||
        subZone === "corridor4"
      );
    },
    tryWallCutExit: function () {
      if (!this.isWallCutSubZone()) return false;
      return exitToMeg();
    },
    getCeilingY: function () {
      return LEVEL1_1_WALL_H;
    },
    enterFromMeg: enterFromMeg,
    exitToMeg: exitToMeg,
    forceExitL1_1: forceExitL1_1,
    tryEnterCorridor2AtDoor: tryEnterCorridor2AtDoor,
    tryEnterCorridor3AtDoor: tryEnterCorridor3AtDoor,
    tryEnterCorridor4AtDoor: tryEnterCorridor4AtDoor,
    checkTriggers: checkTriggers,
    update: function (dt) {
      if (!subZone || !world) return;
      ensureWorld();
      syncDoorCollidersToDeps();
      var now = performance.now();
      if (subZone === "corridor" && world.updateOutpostDoor(dt)) {
        swapToLevel1_1Colliders();
      }
      if (subZone === "corridor" && world.updateCorridor12Door(dt)) {
        swapToLevel1_1Colliders();
        tryEnterCorridor2AtDoor();
      }
      if (subZone === "corridor2" && world2) {
        world2.updateGlitch(dt);
        if (world2.updateOutpostDoor(dt)) swapToLevel1_1Colliders();
        if (world2.updateCorridor23Door(dt)) {
          swapToLevel1_1Colliders();
          syncDoorCollidersToDeps();
          if (!tryAutoEnterCorridor3AfterDoorOpen()) {
            tryEnterCorridor3AtDoor();
          }
        } else if (world2.isCorridor23DoorPassable()) {
          tryEnterCorridor3AtDoor();
        }
      }
      if (subZone === "corridor3" && world3) {
        if (world3.updateOutpostDoor(dt)) swapToLevel1_1Colliders();
        if (world3.updateCorridor14Door(dt)) {
          swapToLevel1_1Colliders();
          tryEnterCorridor4AtDoor();
        }
        if (world3.xiaoye) {
          var surv = deps.getSurvival();
          if (surv && !surv.dead) {
            world3.xiaoye.update(dt, deps.fps.x, deps.fps.z, surv, deps.showToast);
          }
        }
      }
      if (subZone === "corridor4" && world4 && !homeEndingTriggered) {
        world4.update(dt);
        if (world4.xiaoyes) {
          var xi;
          var surv4 = deps.getSurvival();
          if (surv4 && !surv4.dead) {
            for (xi = 0; xi < world4.xiaoyes.length; xi++) {
              world4.xiaoyes[xi].update(dt, deps.fps.x, deps.fps.z, surv4, deps.showToast);
            }
          }
        }
      }
      if (subZone === "outpost3" && world3) {
        var surv3 = deps.getSurvival();
        if (surv3 && !surv3.dead) {
          world3.updateTrap(deps.fps.x, deps.fps.z, surv3, deps.showToast, now);
        }
      }
      if (subZone === "corridor2" && corridor2DeathMoth) {
        var survival = deps.getSurvival();
        if (survival && !survival.dead) {
          corridor2DeathMoth.update(
            dt,
            deps.fps.x,
            deps.fps.z,
            survival,
            deps.showToast,
            { wallColliders: deps.wallColliders, now: now }
          );
        }
      }
      if (subZone === "corridor3" && corridor3DeathMoths) {
        var survival3 = deps.getSurvival();
        if (survival3 && !survival3.dead) {
          corridor3DeathMoths.update(
            dt,
            deps.fps.x,
            deps.fps.z,
            survival3,
            deps.showToast,
            { wallColliders: deps.wallColliders, now: now }
          );
        }
      }
      if (subZone === "corridor4" && corridor4DeathMoths && !homeEndingTriggered) {
        var survival4 = deps.getSurvival();
        if (survival4 && !survival4.dead) {
          corridor4DeathMoths.update(
            dt,
            deps.fps.x,
            deps.fps.z,
            survival4,
            deps.showToast,
            { wallColliders: deps.wallColliders, now: now }
          );
        }
      }
      if (!homeEndingTriggered) checkTriggers();
    },
    refreshChestVisuals: function () {
      syncAllChestStates();
    },
    getAimInteractRoots: function () {
      if (!subZone) return [];
      if (subZone === "corridor4") return [];
      if (subZone === "corridor3" || subZone === "outpost3") {
        return world3 ? world3.getAimInteractRoots() : [];
      }
      if (subZone === "corridor2" || subZone === "outpost2") {
        return world2 ? world2.getAimInteractRoots() : [];
      }
      return world ? world.getAimInteractRoots() : [];
    },
    tryOpenOutpostDoor: function (px, pz, fromAim) {
      if (!world || subZone !== "corridor") return false;
      return world.tryOpenOutpostDoor(px, pz, fromAim);
    },
    tryOpenCorridor12Door: function (px, pz, fromAim) {
      if (!world || subZone !== "corridor") return false;
      return world.tryOpenCorridor12Door(px, pz, fromAim);
    },
    isNearCorridor12Door: function (px, pz) {
      if (!world || subZone !== "corridor") return false;
      var d = world.corridor12Door;
      if (!d) return false;
      if (Math.abs(px) > 1.15) return false;
      if (pz < (world.corridor12DoorZ || 0) - 1.2) return false;
      return Math.hypot(px - d.interactX, pz - d.interactZ) <= d.interactDist + 0.25;
    },
    isNearCorridor12Entrance: function (px, pz) {
      if (!world || subZone !== "corridor") return false;
      var d = world.corridor12Door;
      if (!d) return false;
      if (Math.abs(px) > 1.15) return false;
      if (pz < (world.corridor12DoorZ || 0) - 1.2) return false;
      if (!world.isCorridor12DoorOpen()) {
        return Math.hypot(px - d.interactX, pz - d.interactZ) <= d.interactDist + 0.25;
      }
      return pointInAabb(px, pz, world.corridor12EnterTrigger);
    },
    tryOpenCorridor23Door: function (px, pz, fromAim) {
      if (!world2 || subZone !== "corridor2") return false;
      return world2.tryOpenCorridor23Door(px, pz, fromAim);
    },
    isNearCorridor23Door: function (px, pz) {
      if (!world2 || subZone !== "corridor2") return false;
      var d = world2.corridor23Door;
      if (!d) return false;
      if (Math.abs(px) > 1.15) return false;
      if (pz < (world2.corridor23DoorZ || 0) - 1.2) return false;
      return Math.hypot(px - d.interactX, pz - d.interactZ) <= d.interactDist + 0.25;
    },
    isNearCorridor23Entrance: function (px, pz) {
      if (!world2 || subZone !== "corridor2") return false;
      var d = world2.corridor23Door;
      if (!d) return false;
      if (Math.abs(px) > 1.15) return false;
      if (pz < (world2.corridor23DoorZ || 0) - 1.2) return false;
      if (!world2.isCorridor23DoorOpen()) {
        return Math.hypot(px - d.interactX, pz - d.interactZ) <= d.interactDist + 0.25;
      }
      return pointInAabb(px, pz, world2.corridor23EnterTrigger);
    },
    tryOpenCorridor14Door: function (px, pz, fromAim) {
      if (!world3 || subZone !== "corridor3") return false;
      return world3.tryOpenCorridor14Door(px, pz, fromAim);
    },
    isNearCorridor14Door: function (px, pz) {
      if (!world3 || subZone !== "corridor3") return false;
      var d = world3.corridor14Door;
      if (!d) return false;
      if (Math.abs(px) > 1.15) return false;
      if (pz < (world3.corridor14DoorZ || 0) - 1.2) return false;
      return Math.hypot(px - d.interactX, pz - d.interactZ) <= d.interactDist + 0.25;
    },
    isNearCorridor14Entrance: function (px, pz) {
      if (!world3 || subZone !== "corridor3") return false;
      var d = world3.corridor14Door;
      if (!d) return false;
      if (Math.abs(px) > 1.15) return false;
      if (pz < (world3.corridor14DoorZ || 0) - 1.2) return false;
      if (!world3.isCorridor14DoorOpen()) {
        return Math.hypot(px - d.interactX, pz - d.interactZ) <= d.interactDist + 0.25;
      }
      return pointInAabb(px, pz, world3.corridor14EnterTrigger);
    },
    isNearCorridor33Return: function (px, pz) {
      if (!world4 || subZone !== "corridor4") return false;
      return pointInAabb(px, pz, world4.corridor33ReturnTrigger);
    },
    tryOpenOutpost3Door: function (px, pz, fromAim) {
      if (!world3 || subZone !== "corridor3") return false;
      return world3.tryOpenOutpostDoor(px, pz, fromAim);
    },
    tryEnterOutpost3: function (px, pz) {
      if (!world3 || subZone !== "corridor3") return false;
      if (!world3.isOutpostDoorOpen()) return false;
      if (!pointInAabb(px, pz, world3.outpostEnterTrigger)) return false;
      return enterOutpost3();
    },
    isNearOutpost3Door: function (px, pz) {
      if (!world3 || subZone !== "corridor3") return false;
      var d = world3.outpostDoor;
      if (!d || d.open || d.opening) return false;
      return Math.hypot(px - d.interactX, pz - d.interactZ) <= d.interactDist;
    },
    isNearOutpost3Entrance: function (px, pz) {
      if (!world3 || subZone !== "corridor3") return false;
      var d = world3.outpostDoor;
      if (!d) return false;
      if (Math.abs(pz - d.interactZ) > 1.15) return false;
      if (px < world3.halfW - 1.15) return false;
      return Math.hypot(px - d.interactX, pz - d.interactZ) <= d.interactDist + 0.25;
    },
    isNearOutpost3Exit: function (px, pz) {
      if (!world3 || subZone !== "outpost3") return false;
      if (pointInAabb(px, pz, world3.outpostReturnTrigger)) return true;
      var ex = world3.outpostExitInteract;
      if (!ex) return false;
      return Math.hypot(px - ex.x, pz - ex.z) <= 2.1;
    },
    tryReturnToCorridor3: function (px, pz) {
      if (!world3 || subZone !== "outpost3") return false;
      if (pointInAabb(px, pz, world3.outpostReturnTrigger)) return returnToCorridor3();
      var ex = world3.outpostExitInteract;
      if (ex && Math.hypot(px - ex.x, pz - ex.z) <= ex.dist) return returnToCorridor3();
      return false;
    },
    tryOpenOutpost2Door: function (px, pz, fromAim) {
      if (!world2 || subZone !== "corridor2") return false;
      return world2.tryOpenOutpostDoor(px, pz, fromAim);
    },
    tryEnterOutpost: function (px, pz) {
      if (!world || subZone !== "corridor") return false;
      if (!world.isOutpostDoorOpen()) return false;
      if (!pointInLevel1_1Aabb(px, pz, world.outpostEnterTrigger)) return false;
      return enterOutpost();
    },
    tryEnterOutpost2: function (px, pz) {
      if (!world2 || subZone !== "corridor2") return false;
      if (!world2.isOutpostDoorOpen()) return false;
      if (!pointInLevel1_1Aabb(px, pz, world2.outpostEnterTrigger)) return false;
      return enterOutpost2();
    },
    isNearOutpostDoor: function (px, pz) {
      if (!world || subZone !== "corridor") return false;
      var d = world.outpostDoor;
      if (!d || d.open || d.opening) return false;
      return Math.hypot(px - d.interactX, pz - d.interactZ) <= d.interactDist;
    },
    isNearOutpost2Door: function (px, pz) {
      if (!world2 || subZone !== "corridor2") return false;
      var d = world2.outpostDoor;
      if (!d || d.open || d.opening) return false;
      return Math.hypot(px - d.interactX, pz - d.interactZ) <= d.interactDist;
    },
    isNearOutpostEntrance: function (px, pz) {
      if (!world || subZone !== "corridor") return false;
      var d = world.outpostDoor;
      if (!d) return false;
      if (Math.abs(pz - d.interactZ) > 1.15) return false;
      if (px < world.halfW - 1.15) return false;
      return Math.hypot(px - d.interactX, pz - d.interactZ) <= d.interactDist + 0.25;
    },
    isNearOutpost2Entrance: function (px, pz) {
      if (!world2 || subZone !== "corridor2") return false;
      var d = world2.outpostDoor;
      if (!d) return false;
      if (Math.abs(pz - d.interactZ) > 1.15) return false;
      if (px < world2.halfW - 1.15) return false;
      return Math.hypot(px - d.interactX, pz - d.interactZ) <= d.interactDist + 0.25;
    },
    isNearOutpostExit: function (px, pz) {
      if (!world || subZone !== "outpost") return false;
      if (pointInLevel1_1Aabb(px, pz, world.outpostReturnTrigger)) return true;
      var ex = world.outpostExitInteract;
      if (!ex) return false;
      return Math.hypot(px - ex.x, pz - ex.z) <= 2.1;
    },
    isNearOutpost2Exit: function (px, pz) {
      if (!world2 || subZone !== "outpost2") return false;
      if (pointInLevel1_1Aabb(px, pz, world2.outpostReturnTrigger)) return true;
      var ex = world2.outpostExitInteract;
      if (!ex) return false;
      return Math.hypot(px - ex.x, pz - ex.z) <= 2.1;
    },
    tryReturnToCorridor: function (px, pz) {
      if (!world || subZone !== "outpost") return false;
      if (pointInLevel1_1Aabb(px, pz, world.outpostReturnTrigger)) {
        return returnToCorridor();
      }
      var ex = world.outpostExitInteract;
      if (ex && Math.hypot(px - ex.x, pz - ex.z) <= ex.dist) {
        return returnToCorridor();
      }
      return false;
    },
    tryReturnToCorridor2: function (px, pz) {
      if (!world2 || subZone !== "outpost2") return false;
      if (pointInLevel1_1Aabb(px, pz, world2.outpostReturnTrigger)) {
        return returnToCorridor2();
      }
      var ex = world2.outpostExitInteract;
      if (ex && Math.hypot(px - ex.x, pz - ex.z) <= ex.dist) {
        return returnToCorridor2();
      }
      return false;
    },
    dispose: function () {
      subZone = null;
      megReturnSnapshot = null;
      l1ColliderBackup = null;
      corridor2DeathMoth = null;
      corridor3DeathMoths = null;
      corridor4DeathMoths = null;
      if (world && world.group.parent) world.group.parent.remove(world.group);
      if (world2 && world2.group.parent) world2.group.parent.remove(world2.group);
      if (world3 && world3.group.parent) world3.group.parent.remove(world3.group);
      if (world4 && world4.group.parent) world4.group.parent.remove(world4.group);
      world = null;
      world2 = null;
      world3 = null;
      world4 = null;
    },
  };
}

export { LEVEL1_1_SPAWN_YAW };
