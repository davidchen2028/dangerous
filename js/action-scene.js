/**
 * 新手教程 — 0 号模拟围区（第一人称）
 */
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { createBackroomsHorrorSystem } from "./backrooms-horror.js";
import {
  buildBackroomsLevel1World,
  WAREHOUSE_HEIGHT as BACKROOMS_L1_HEIGHT,
} from "./backrooms-level1-world.js";

if (typeof window !== "undefined") {
  window.THREE = THREE;
}

(function () {
  "use strict";

  var btnAction = document.getElementById("btnAction");
  var actionRoot = document.getElementById("actionScene");
  var canvas = document.getElementById("actionCanvas");
  var btnBack = document.getElementById("btnActionBack");
  var hintEl = document.getElementById("actionHint");
  var loadErrorEl = null;

  var scene;
  var player;
  var bodyCapsule;
  var camera;
  var renderer;
  var leftHand;
  var rightHand;
  var fpsArmsRoot = null;
  var fpsArmsAlignX = 0;
  var yaw = 0;
  var pitch = -0.08;
  var pos = { x: 0, y: 0, z: 2 };
  var velY = 0;
  var grounded = true;
  var keys = Object.create(null);
  var running = false;
  var animId = 0;
  var clock = new THREE.Clock();
  var animTime = 0;
  var pointerLocked = false;
  var lookDragId = null;
  var lookLastX = 0;
  var lookLastY = 0;
  var lookDidDrag = false;
  var ready = false;

  var WALK_SPEED = 2.5;
  var SPRINT_SPEED = 5.5;
  var CROUCH_SPEED = 1.2;
  var STAMINA_DRAIN_SEC = 2;
  var staminaDrainAcc = 0;
  var LOOK_SENS = 0.0022;
  var MOBILE_LOOK_SENS_MULT = 3;
  var GRAVITY = 32;
  var JUMP_SPEED = 9;
  var BOUNDS_X = 5.5;
  var BOUNDS_Z_MIN = 1.2;
  /** 24×24 m 后室迷宫 — 边界包抄（±12 对穿） */
  var WORLD_WRAP_HALF = 12;
  var worldWrapEnabled = false;
  /** 后室 Level 1 — 全场暴盲掷骰概率（每 40~60 秒窗口） */
  var BLACKOUT_CHANCE = 0;
  /** @type {ReturnType<createBackroomsHorrorSystem> | null} */
  var backroomsHorror = null;
  /** @type {Array<{ light: THREE.PointLight, panelMat: THREE.Material, baseIntensity: number, baseEmissive: number }>} */
  var backroomsL1Lights = [];
  var backroomsL1FlickerAt = 0;
  var backroomsL1FlickerUntil = 0;
  var backroomsSpawn = { x: 0, z: 0 };
  /** @type {ReturnType<buildBackroomsLevel1World> | null} */
  var backroomsL1Stream = null;
  var clouds = [];
  /** @type {{ minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number }[]} */
  var colliders = [];

  var CAPSULE_RADIUS = 0.5;
  var STAND_HEIGHT = 1.8;
  var CROUCH_HEIGHT = 1.2;
  var CAPSULE_HEIGHT = STAND_HEIGHT;
  var CAPSULE_CYL_LEN = CAPSULE_HEIGHT - CAPSULE_RADIUS * 2;
  var EYE_HEIGHT_STAND = 1.65;
  var EYE_RATIO = EYE_HEIGHT_STAND / STAND_HEIGHT;
  var bodyHeightCurrent = STAND_HEIGHT;
  var CROUCH_LERP = 12;

  var HAND_BASE = {
    left: { x: -0.34, y: -0.26, z: -0.4, rx: 0.2, ry: 0.18, rz: -0.1 },
    right: { x: 0.34, y: -0.26, z: -0.4, rx: 0.2, ry: -0.18, rz: 0.1 },
  };

  function showLoadError(msg) {
    if (!actionRoot) return;
    if (!loadErrorEl) {
      loadErrorEl = document.createElement("div");
      loadErrorEl.className = "action-scene__error";
      loadErrorEl.id = "actionLoadError";
      actionRoot.appendChild(loadErrorEl);
    }
    loadErrorEl.hidden = false;
    loadErrorEl.innerHTML =
      "<p><strong>3D 场景无法启动</strong></p><p>" +
      msg +
      "</p><p>请用终端运行 <code>./run.sh</code>，在浏览器打开 <code>http://127.0.0.1:8080</code>（不要双击 index.html）。</p>";
  }

  function hideLoadError() {
    if (loadErrorEl) loadErrorEl.hidden = true;
  }

  function getGltfLoader() {
    if (!sharedGltfLoader) {
      sharedGltfLoader = new GLTFLoader();
    }
    return sharedGltfLoader;
  }

  function getActionPreloadUrls() {
    var urls = [
      TRUCK_GLB_URL,
      BARRIER_GLB_URL,
      CRATE_GLB_URL,
      DOOR_GLB_URL,
      MISSILE_GLB_URL,
      ARMS_GLB_URL,
    ];
    if (window.ActionWeapon && window.ActionWeapon.UZI_GLB_URL) {
      urls.push(window.ActionWeapon.UZI_GLB_URL);
    }
    if (window.WorldLootBox && window.WorldLootBox.CHEST_GLB_URL) {
      urls.push(window.WorldLootBox.CHEST_GLB_URL);
    }
    if (window.ActionWasteBin && window.ActionWasteBin.BIN_GLB_URL) {
      urls.push(window.ActionWasteBin.BIN_GLB_URL);
    }
    urls.push(TEST_IRON_GATE_GLB_URL);
    urls.push(CAT_SCULPTURE_GLB_URL);
    urls.push(WAITING_HALL_BENCH_GLB_URL);
    urls.push(WAITING_HALL_END_TABLE_GLB_URL);
    if (window.WaitingHallLockbox && window.WaitingHallLockbox.LOCKBOX_GLB_URL) {
      urls.push(window.WaitingHallLockbox.LOCKBOX_GLB_URL);
    }
    if (window.CollectionRoomChest && window.CollectionRoomChest.CHEST_GLB_URL) {
      urls.push(window.CollectionRoomChest.CHEST_GLB_URL);
    }
    if (window.CollectionRoomFloorLoot && window.CollectionRoomFloorLoot.getPreloadUrls) {
      urls = urls.concat(window.CollectionRoomFloorLoot.getPreloadUrls());
    }
    if (window.ActionDropLoot && window.ActionDropLoot.getPreloadUrls) {
      urls = urls.concat(window.ActionDropLoot.getPreloadUrls());
    }
    return urls;
  }

  function preloadGltfUrl(url) {
    return new Promise(function (resolve) {
      if (gltfCache[url]) {
        resolve(true);
        return;
      }
      getGltfLoader().load(
        url,
        function (gltf) {
          gltfCache[url] = gltf;
          resolve(true);
        },
        undefined,
        function (err) {
          console.warn("[ActionScene] 预加载失败:", url, err);
          resolve(false);
        }
      );
    });
  }

  function preloadAllActionAssets(onProgress) {
    var urls = getActionPreloadUrls();
    var done = 0;
    var total = urls.length;

    function tickOne() {
      done += 1;
      if (onProgress) {
        onProgress(done, total);
      }
    }

    return Promise.all(
      urls.map(function (url) {
        return preloadGltfUrl(url).then(function () {
          tickOne();
        });
      })
    );
  }

  function showEnterLoading() {
    if (!loadScreenEl) return;
    loadScreenEl.hidden = false;
    document.body.classList.add("action-loading");
    updateEnterLoadingProgress(0, 1);
  }

  function hideEnterLoading() {
    if (loadScreenEl) loadScreenEl.hidden = true;
    document.body.classList.remove("action-loading");
  }

  function updateEnterLoadingProgress(done, total) {
    var pct = total > 0 ? Math.round((done / total) * 100) : 0;
    if (loadProgressEl) {
      loadProgressEl.style.width = pct + "%";
    }
    if (loadStatusEl) {
      loadStatusEl.textContent =
        done >= total
          ? "正在进入场景…"
          : "正在加载场景资源 " + done + " / " + total + "…";
    }
  }

  function loadGltfCached(url, onSuccess, onError) {
    var cached = gltfCache[url];
    if (cached) {
      onSuccess({ scene: cached.scene.clone(true) });
      return;
    }
    getGltfLoader().load(
      url,
      function (gltf) {
        gltfCache[url] = gltf;
        onSuccess(gltf);
      },
      undefined,
      onError
    );
  }

  function registerCollider(sx, sy, sz, px, py, pz) {
    colliders.push({
      minX: px - sx * 0.5,
      maxX: px + sx * 0.5,
      minY: py - sy * 0.5,
      maxY: py + sy * 0.5,
      minZ: pz - sz * 0.5,
      maxZ: pz + sz * 0.5,
    });
    return colliders[colliders.length - 1];
  }

  var _colliderBoundsBox = new THREE.Box3();
  var securityDoorOpenCollider = null;
  var testNorthCatColliders = [];

  function applyBox3ToCollider(c, box, pad) {
    pad = pad == null ? 0.05 : pad;
    c.minX = box.min.x - pad;
    c.maxX = box.max.x + pad;
    c.minY = box.min.y - pad;
    c.maxY = box.max.y + pad;
    c.minZ = box.min.z - pad;
    c.maxZ = box.max.z + pad;
  }

  function addColliderFromBox3(box, pad) {
    var c = {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      minZ: 0,
      maxZ: 0,
    };
    applyBox3ToCollider(c, box, pad);
    colliders.push(c);
    return c;
  }

  function addColliderFromObject(object3D, pad) {
    object3D.updateMatrixWorld(true);
    _colliderBoundsBox.setFromObject(object3D);
    return addColliderFromBox3(_colliderBoundsBox, pad);
  }

  /** 仅保留物体 XZ 中心区域碰撞，避免雕花外扩挡路 */
  function addColliderFromObjectTightXZ(object3D, pad, shrinkX, shrinkZ) {
    object3D.updateMatrixWorld(true);
    _colliderBoundsBox.setFromObject(object3D);
    var center = new THREE.Vector3();
    _colliderBoundsBox.getCenter(center);
    var spanX = _colliderBoundsBox.max.x - _colliderBoundsBox.min.x;
    var spanZ = _colliderBoundsBox.max.z - _colliderBoundsBox.min.z;
    shrinkX = shrinkX == null ? 0.3 : shrinkX;
    shrinkZ = shrinkZ == null ? 0.3 : shrinkZ;
    var halfX = spanX * 0.5 * (1 - shrinkX);
    var halfZ = spanZ * 0.5 * (1 - shrinkZ);
    var tight = new THREE.Box3(
      new THREE.Vector3(center.x - halfX, _colliderBoundsBox.min.y, center.z - halfZ),
      new THREE.Vector3(center.x + halfX, _colliderBoundsBox.max.y, center.z + halfZ)
    );
    return addColliderFromBox3(tight, pad);
  }

  function syncColliderFromObject(c, object3D, pad) {
    if (!c || !object3D) return;
    object3D.updateMatrixWorld(true);
    _colliderBoundsBox.setFromObject(object3D);
    applyBox3ToCollider(c, _colliderBoundsBox, pad);
  }

  function removeCollidersFromList(list) {
    if (!list || !list.length) return;
    var i;
    for (i = list.length - 1; i >= 0; i--) {
      var idx = colliders.indexOf(list[i]);
      if (idx >= 0) colliders.splice(idx, 1);
    }
    list.length = 0;
  }

  function addBox(parent, sx, sy, sz, px, py, pz, color, solid) {
    var mesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx, sy, sz),
      new THREE.MeshLambertMaterial({ color: color })
    );
    mesh.position.set(px, py, pz);
    parent.add(mesh);
    if (solid !== false) {
      registerCollider(sx, sy, sz, px, py, pz);
    }
    return mesh;
  }

  var TRUCK_CENTER = { x: 0, y: 1.25, z: 30 };
  var TRUCK_SIZE = { x: 2.5, y: 2.5, z: 6 };
  var TRUCK_GLB_URL = "models/tactical-truck.glb";

  var BARRIER_SIZE = { x: 1.5, y: 1.3, z: 0.8 };
  var BARRIER_CENTER_X = -5.25;
  var BARRIER_CENTER_Y = 0.65;
  var BARRIER_Z = [10, 20, 30, 40];
  var BARRIER_GLB_URL = "models/concrete-barrier.glb";

  var CRATE_SIZE = { x: 2, y: 2, z: 2 };
  var CRATE_CENTER_Y = 1;
  var CRATE_Z = [22, 28, 34, 38];
  /** 右路木箱 · 与中路卡车留 ≥1.3m 通道（胶囊半径 0.5） */
  var CRATE_X = [4.35, 5.0, 4.35, 5.0];
  var CRATE_GLB_URL = "models/wooden-crate.glb";

  var DOOR_Z = 60;
  var CORRIDOR_LEN = 15;
  var CORRIDOR_W = 1.5;
  /** 走廊尽头 5×5 m 搜刮间（中央海盗宝箱） */
  var BIN_ROOM_SIZE = 5;
  var BIN_ROOM_CENTER_Z = DOOR_Z + CORRIDOR_LEN + BIN_ROOM_SIZE * 0.5;
  /** 宝箱后方 10 m 撤离走廊 + 3×3 m 撤离点 */
  var EVAC_CORRIDOR_LEN = 10;
  var EVAC_ROOM_SIZE = 3;
  var EVAC_CORRIDOR_START_Z = DOOR_Z + CORRIDOR_LEN + BIN_ROOM_SIZE;
  var EVAC_ROOM_START_Z = EVAC_CORRIDOR_START_Z + EVAC_CORRIDOR_LEN;
  var EVAC_ROOM_CENTER_Z = EVAC_ROOM_START_Z + EVAC_ROOM_SIZE * 0.5;
  var BOUNDS_Z_MAX = EVAC_ROOM_START_Z + EVAC_ROOM_SIZE + 0.35;
  var BIN_SPACING_X = 0.55;
  var SECTOR_WALL_H = 3.5;
  var DOOR_SIZE = { x: 1.5, y: 2.2, z: 0.28 };
  var DOOR_GLB_URL = "models/security-door.glb";
  var TEST_IRON_GATE_GLB_URL = "models/iron-gate.glb";
  var CAT_SCULPTURE_GLB_URL = "models/cat-sculpture.glb";
  var CAT_SCULPTURE_SIZE = { x: 1.0, y: 1.5, z: 0.85 };
  /** 雕塑与挡墙北面（墙北侧）间隙 */
  var CAT_SCULPTURE_CLEAR_FROM_WALL_Z = 0.45;
  /** 相对左右挡墙中心向路中平移 */
  var CAT_SCULPTURE_X_INWARD = 2;
  var TEST_NORTH_GATE_OPEN_Y = Math.PI * 0.52;
  var TEST_NORTH_GATE_LEAF = { w: 0, h: 2.4, d: 0.24 };
  var TEST_WAITING_HALL_WIDTH = 5;
  var TEST_WAITING_HALL_DEPTH = 10;
  var TEST_WAITING_HALL_WALL_THICK = 0.5;
  var TEST_WAITING_HALL_FLOOR_THICK = 0.08;
  /** 与北端横墙/竖墙同高（TEST_NORTH_GATE_LEAF.h） */
  var TEST_WAITING_HALL_WALL_H = TEST_NORTH_GATE_LEAF.h;
  var TEST_WAITING_HALL_CEILING_THICK = 0.12;
  /** 低于此高度的碰撞体不按天花板处理（避免地板薄盒顶头） */
  var CEILING_COLLIDE_MIN_Y = 2;
  /** 相对猫雕塑向远离方向（+Z）平移 */
  var TEST_WAITING_HALL_OFFSET_FROM_CAT = 2;
  /** 南门洞宽（略大于玩家碰撞直径，留余量） */
  var TEST_WAITING_HALL_DOOR_W = CAPSULE_RADIUS * 2 + 0.55;
  /** 南门洞高（其上方补过梁墙） */
  var TEST_WAITING_HALL_DOOR_H = 2.15;
  var WAITING_HALL_BENCH_GLB_URL = "models/baroque-throne-bench.glb";
  /** 等候厅北墙内侧单椅占位（宽 × 高 × 深，等比缩放上限） */
  var WAITING_HALL_BENCH_SIZE = { x: 6.7, y: 2.84, z: 2.2 };
  /** 北墙椅朝向（相对朝南门 Math.PI 再向左 90°，正面朝 +X） */
  var WAITING_HALL_BENCH_YAW_TO_DOOR = Math.PI - Math.PI / 2;
  var WAITING_HALL_END_TABLE_GLB_URL = "models/baroque-end-table.glb";
  /** 等候厅 / 收藏室 — 内墙与天花板 */
  var SIDE_ROOM_INTERIOR_COLOR = 0xffffff;
  /** 等候厅中央边桌占位（宽 × 高 × 深，等比缩放上限） */
  var WAITING_HALL_END_TABLE_SIZE = { x: 2.16, y: 1.56, z: 2.16 };
  /** 边桌立起后绕 Y 轴朝向（相对原朝南再转 180°） */
  var WAITING_HALL_END_TABLE_YAW = 0;
  /** 边桌摆放：upright | upside_down | on_side（侧放且腿朝 +Y） */
  var WAITING_HALL_END_TABLE_LAYOUT = "on_side";
  /** 边桌略向西移，留出东侧靠墙通道 */
  var WAITING_HALL_END_TABLE_SHIFT_WEST = 0.22;
  var WAITING_HALL_END_TABLE_COLLIDER_SHRINK_X = 0.4;
  var WAITING_HALL_END_TABLE_COLLIDER_SHRINK_Z = 0.3;
  /** 等候厅/收藏室北墙后空档，再接总统主楼（倒 T：上栋 30×8 + 中柱 8×7，角各挖 11×7） */
  var TEST_NORTH_REAR_HOUSE_GAP = 10;
  var TEST_NORTH_REAR_HOUSE_WIDTH = 30;
  var TEST_NORTH_REAR_HOUSE_DEPTH = 15;
  var TEST_NORTH_REAR_HOUSE_TOP_DEPTH = 8;
  var TEST_NORTH_REAR_HOUSE_STEM_WIDTH = 8;
  var TEST_NORTH_REAR_HOUSE_STEM_DEPTH = 7;
  var TEST_NORTH_REAR_HOUSE_WING_W = 11;
  var TEST_NORTH_REAR_HOUSE_WALL_H = 2;
  var TEST_NORTH_REAR_HOUSE_DOOR_H = 1.85;
  var testWaitingHall = null;
  var testCollectionRoom = null;
  var testNorthRearHouse = null;
  var MISSILE_GLB_URL = "models/missile.glb";
  var ARMS_GLB_URL = "models/soldier-arms.glb";
  /** 第一人称视野内双臂占位（宽 × 高 × 纵深） */
  var ARMS_VIEW_SIZE = { x: 0.95, y: 0.36, z: 0.48 };
  /** 整体缩放（1 = 100%，0.7 = 70%） */
  var ARMS_SCALE = 0.65;
  /**
   * 士兵手臂 GLB 旋转（单位：度）— 在 action-scene.js 顶部改这里即可
   * Y：水平转向（正值=从上往下看逆时针）；在面向玩家约 180° 基础上再左转 45° → 225
   */
  var ARMS_ROT_DEG = {
    x: -5,
    y: 275,
    z: 0,
  };
  var fpsArmsRestY = -0.26;
  var fpsArmsRestZ = -0.4;
  var securityDoorRoot = null;
  var doorHomePosition = null;
  var doorUnlocked = false;
  var doorSwipeColliders = [];
  var DOOR_OPEN_OFFSET_X = 1.35;
  var durabilityBannerEl = document.getElementById("actionDurabilityBanner");
  var interactHintEl = document.getElementById("actionInteractHint");
  var lookLayerEl = null;
  var evacOverlayEl = document.getElementById("actionEvac");
  var evacCountdownEl = document.getElementById("actionEvacTimer");
  var explosionOverlayEl = document.getElementById("actionExplosion");
  var explosionTimerEl = document.getElementById("actionExplosionTimer");
  var explosionCounting = false;
  var explosionTimeLeft = 10;
  var explosionDone = false;
  var binRoomBackWallMeshes = [];
  var binRoomBackWallColliders = [];
  var tacticalTruckRoot = null;
  /** @type {{ mesh: THREE.Mesh, vx: number, vy: number, vz: number, rvx: number, rvy: number, rvz: number, halfH: number, settled: boolean }[]} */
  var explosionDebris = [];
  var TRUCK_FRAGMENT_COUNT = 5;
  var explosionAudioCtx = null;
  var EXPLOSION_VOLUME = 0.62;
  var missileStrike = null;
  var wallExploded = false;
  var wallStrikeFallbackLeft = 0;
  var _missileVecA = new THREE.Vector3();
  var _missileVecB = new THREE.Vector3();
  var _truckVisMatrix = new THREE.Matrix4();
  var _truckVisFrustum = new THREE.Frustum();
  var _truckVisBox = new THREE.Box3();
  var SECTOR_OUTER_X = 6.25;
  var WALL_STRIKE_Z = EVAC_CORRIDOR_START_Z + 0.25;
  var evacCounting = false;
  var evacTimeLeft = 0;
  var playerDead = false;
  var playerDeathTimer = null;
  var crosshairEl = document.getElementById("actionCrosshair");
  var loadScreenEl = document.getElementById("actionLoadScreen");
  var loadProgressEl = document.getElementById("actionLoadProgress");
  var loadStatusEl = document.getElementById("actionLoadStatus");

  var gltfCache = Object.create(null);
  var sharedGltfLoader = null;
  var assetsPreloaded = false;
  var enterInProgress = false;
  var currentMapId = "tutorial";
  var loadedMapId = null;
  var worldRoot = null;
  var mapNameEl = document.getElementById("actionMapName");
  var posHudEl = document.getElementById("actionPosHud");
  var TUTORIAL_BOUNDS_X = 5.5;
  var TUTORIAL_BOUNDS_Z_MIN = 1.2;
  /** 新手教程出生点（马路南端 Alpha） */
  var TUTORIAL_SPAWN = { x: 0, y: 0, z: 2 };
  var TEST_ROAD_START = { x: 0, z: -46 };
  var TEST_ROAD_WIDTH = 6.5;
  var TEST_ROAD_MOUNTAIN_MARGIN = 1.8;
  /** 测试图草地 — 覆盖南端山路至北端平房并留边 */
  var TEST_GRASS_W = 130;
  var TEST_GRASS_Z = 300;
  var TEST_GRASS_Z_CENTER = 80;
  var TEST_EDGE_W = 155;
  var TEST_EDGE_Z = 325;
  var TEST_EDGE_Z_CENTER = 82;
  var TEST_GRASS_Y = 0.002;
  var TEST_EDGE_Y = -0.04;
  var TEST_ROAD_SURFACE_Y = 0.08;
  var TEST_ROAD_LINE_Y = 0.095;
  var TEST_MOUNTAIN_LIFT = 0.05;
  var TEST_MOUNTAIN_ROCK_COLORS = [
    0x6d5238, 0x7a5d42, 0x5a4530, 0x85654a, 0x705340,
  ];
  var TEST_MOUNTAIN_GRASS_H = 0.2;
  var TEST_MOUNTAIN_GRASS_COLORS = [0x4a7c3f, 0x527a44, 0x3d6b35, 0x5f8f4e];
  var TEST_BRANCH_ROAD_LEN = 30;
  var TEST_BRANCH_ROAD = { from: { x: 0, z: 48 }, to: { x: -30, z: 48 } };
  var TEST_NORTH_BRANCH_ROAD_LEN = 120;
  var TEST_NORTH_BRANCH_ROAD = {
    from: { x: 0, z: 48 },
    to: { x: 0, z: 48 + TEST_NORTH_BRANCH_ROAD_LEN },
  };
  /** 测试地图复活点（临时，北向支路尽头） */
  var TEST_SPAWN = { x: 0, z: TEST_NORTH_BRANCH_ROAD.to.z };
  /** 北向支路尽头 (0,168) 前方左右侧墙宽（沿 X 向） */
  var TEST_NORTH_END_WALL_WIDTH = 11;
  var TEST_NORTH_END_WALL_THICK = 0.5;
  /** 北端横墙后左右竖墙（沿 Z 向长度） */
  var TEST_NORTH_END_VERTICAL_WALL_LEN = 22;
  var TEST_NORTH_END_VERTICAL_WALL_THICK = 0.5;
  var testNorthIronGates = null;
  var testRoadSampleSets = [];
  var TEST_ROAD_CURVE_POINTS = [
    { x: 0, z: -48 },
    { x: 9, z: -36 },
    { x: 14, z: -22 },
    { x: 8, z: -8 },
    { x: -5, z: 4 },
    { x: -16, z: 18 },
    { x: -7, z: 32 },
    { x: 5, z: 42 },
    { x: 0, z: 48 },
  ];

  function makeGroundLambertMaterial(color) {
    var mat = new THREE.MeshLambertMaterial({ color: color });
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = 1;
    mat.polygonOffsetUnits = 1;
    return mat;
  }

  function createTestRoadCurve() {
    return new THREE.CatmullRomCurve3(
      TEST_ROAD_CURVE_POINTS.map(function (p) {
        return new THREE.Vector3(p.x, 0, p.z);
      })
    );
  }

  function resetTestRoadSampleSets() {
    testRoadSampleSets = [];
  }

  function registerTestRoadSamples(samples) {
    testRoadSampleSets.push(samples);
  }

  function sampleStraightRoad(x1, z1, x2, z2, segments) {
    var out = [];
    var i;
    for (i = 0; i <= segments; i++) {
      var t = i / segments;
      out.push({
        x: x1 + (x2 - x1) * t,
        z: z1 + (z2 - z1) * t,
      });
    }
    return out;
  }

  function createStraightRoadCurve(from, to) {
    return new THREE.LineCurve3(
      new THREE.Vector3(from.x, 0, from.z),
      new THREE.Vector3(to.x, 0, to.z)
    );
  }

  function sampleTestRoadCurve(segments) {
    var curve = createTestRoadCurve();
    var out = [];
    var i;
    for (i = 0; i <= segments; i++) {
      var pt = curve.getPoint(i / segments);
      out.push({ x: pt.x, z: pt.z });
    }
    return out;
  }

  function distPointToSegment2D(px, pz, ax, az, bx, bz) {
    var abx = bx - ax;
    var abz = bz - az;
    var apx = px - ax;
    var apz = pz - az;
    var abLenSq = abx * abx + abz * abz;
    var t =
      abLenSq < 1e-8
        ? 0
        : Math.max(0, Math.min(1, (apx * abx + apz * abz) / abLenSq));
    var cx = ax + abx * t;
    var cz = az + abz * t;
    var dx = px - cx;
    var dz = pz - cz;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function minDistToTestRoad(px, pz, samples) {
    var minD = Infinity;
    var sets = samples != null ? [samples] : testRoadSampleSets;
    var s;
    var i;
    var pts;
    var d;
    for (s = 0; s < sets.length; s++) {
      pts = sets[s];
      for (i = 0; i < pts.length - 1; i++) {
        d = distPointToSegment2D(
          px,
          pz,
          pts[i].x,
          pts[i].z,
          pts[i + 1].x,
          pts[i + 1].z
        );
        if (d < minD) minD = d;
      }
    }
    return minD;
  }

  function isMountainBoxClearOfRoad(px, pz, halfW, halfD) {
    var roadHalf = TEST_ROAD_WIDTH * 0.5;
    var minClear = roadHalf + TEST_ROAD_MOUNTAIN_MARGIN;
    var points = [
      [px, pz],
      [px - halfW, pz - halfD],
      [px - halfW, pz + halfD],
      [px + halfW, pz + halfD],
      [px + halfW, pz - halfD],
      [px - halfW, pz],
      [px + halfW, pz],
      [px, pz - halfD],
      [px, pz + halfD],
    ];
    var i;
    for (i = 0; i < points.length; i++) {
      if (minDistToTestRoad(points[i][0], points[i][1]) < minClear) {
        return false;
      }
    }
    return true;
  }

  function pushMountainOffRoad(px, pz, nx, nz, halfW, halfD) {
    var outX = px;
    var outZ = pz;
    var step;
    for (step = 0; step < 20; step++) {
      if (isMountainBoxClearOfRoad(outX, outZ, halfW, halfD)) {
        return { x: outX, z: outZ };
      }
      outX += nx * 1.2;
      outZ += nz * 1.2;
    }
    return null;
  }

  function testRoadFrameAt(samples, idx) {
    idx = Math.min(Math.max(0, idx), samples.length - 2);
    var a = samples[idx];
    var b = samples[idx + 1];
    var mx = (a.x + b.x) * 0.5;
    var mz = (a.z + b.z) * 0.5;
    var dx = b.x - a.x;
    var dz = b.z - a.z;
    var segLen = Math.sqrt(dx * dx + dz * dz) || 1;
    var nx = -dz / segLen;
    var nz = dx / segLen;
    return {
      mx: mx,
      mz: mz,
      nx: nx,
      nz: nz,
      dx: dx,
      dz: dz,
      segLen: segLen,
      rotY: Math.atan2(dx, dz),
      tx: dx / segLen,
      tz: dz / segLen,
    };
  }

  function testRoadFlankPoint(samples, idx, side, offset) {
    var frame = testRoadFrameAt(samples, idx);
    return {
      x: frame.mx + frame.nx * side * offset,
      z: frame.mz + frame.nz * side * offset,
      rotY: frame.rotY,
    };
  }

  function placeMountainBlockWithRoadRules(
    parent,
    px,
    pz,
    bw,
    bh,
    bd,
    color,
    solid,
    samples,
    opts
  ) {
    opts = opts || {};
    var hw = bw * 0.5;
    var hd = bd * 0.5;
    var pushNx = opts.pushNx;
    var pushNz = opts.pushNz;

    if (!opts.ignoreRoadLimit) {
      if (!isMountainBoxClearOfRoad(px, pz, hw, hd)) {
        if (pushNx != null && pushNz != null) {
          var pushed = pushMountainOffRoad(px, pz, pushNx, pushNz, hw, hd);
          if (pushed) {
            px = pushed.x;
            pz = pushed.z;
          }
        }
        if (!isMountainBoxClearOfRoad(px, pz, hw, hd)) {
          if (opts.connectMode) {
            bw = 3.6;
            bd = 4.2;
            hw = bw * 0.5;
            hd = bd * 0.5;
            bh = Math.max(3.2, bh - 1.2);
            if (pushNx != null && pushNz != null) {
              pushed = pushMountainOffRoad(px, pz, pushNx, pushNz, hw, hd);
              if (pushed) {
                px = pushed.x;
                pz = pushed.z;
              }
            }
          }
          if (!opts.connectMode || !isMountainBoxClearOfRoad(px, pz, hw, hd)) {
            return false;
          }
        }
      }
    }

    addMountainBlock(parent, px, pz, bw, bh, bd, color, solid);
    return true;
  }

  function addMountainBridgeStrip(parent, x1, z1, x2, z2, samples, opts) {
    opts = opts || {};
    var dx = x2 - x1;
    var dz = z2 - z1;
    var len = Math.sqrt(dx * dx + dz * dz) || 1;
    var steps = Math.max(4, Math.ceil(len / 2.6));
    var i;
    var t;
    var px;
    var pz;
    var awayNx = opts.pushNx;
    var awayNz = opts.pushNz;

    if (awayNx == null) {
      awayNx = dx / len;
      awayNz = dz / len;
    }

    for (i = 0; i <= steps; i++) {
      t = i / steps;
      px = x1 + dx * t;
      pz = z1 + dz * t;
      placeMountainBlockWithRoadRules(
        parent,
        px,
        pz,
        7.2 + (i % 2) * 1.4,
        (opts.h || 5) + (i % 2) * 0.6,
        7.5 + (i % 2) * 1.1,
        TEST_MOUNTAIN_ROCK_COLORS[i % TEST_MOUNTAIN_ROCK_COLORS.length],
        true,
        samples,
        {
          pushNx: awayNx,
          pushNz: awayNz,
          connectMode: true,
        }
      );
    }
  }

  function buildRoadRibbonGeometry(curve, segmentCount, halfWidth, y) {
    var pts = curve.getSpacedPoints(segmentCount);
    var n = pts.length;
    var positions = [];
    var uvs = [];
    var indices = [];
    var cumLen = 0;
    var i;
    var p;
    var t;
    var nx;
    var nz;
    var len;
    var lx;
    var lz;
    var rx;
    var rz;
    var hy = y != null ? y : 0.06;
    var a;
    var b;
    var c;
    var d;

    for (i = 0; i < n; i++) {
      p = pts[i];
      if (i === 0) {
        t = pts[1].clone().sub(pts[0]).normalize();
      } else if (i === n - 1) {
        t = pts[n - 1].clone().sub(pts[n - 2]).normalize();
      } else {
        t = pts[i + 1].clone().sub(pts[i - 1]).normalize();
      }
      nx = -t.z;
      nz = t.x;
      len = Math.sqrt(nx * nx + nz * nz) || 1;
      nx /= len;
      nz /= len;

      if (i > 0) {
        cumLen += pts[i].distanceTo(pts[i - 1]);
      }

      lx = p.x + nx * halfWidth;
      lz = p.z + nz * halfWidth;
      rx = p.x - nx * halfWidth;
      rz = p.z - nz * halfWidth;

      positions.push(lx, hy, lz, rx, hy, rz);
      uvs.push(cumLen * 0.08, 0, cumLen * 0.08, 1);
    }

    for (i = 0; i < n - 1; i++) {
      a = i * 2;
      b = i * 2 + 1;
      c = (i + 1) * 2;
      d = (i + 1) * 2 + 1;
      indices.push(a, c, b, b, c, d);
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return { geometry: geo, length: cumLen };
  }

  function createRoadDashTexture() {
    var canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 8;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#6a6e62";
    ctx.fillRect(0, 0, 64, canvas.height);
    var tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  function buildRoadFromCurve(parent, curve) {
    var segCount = 160;
    var halfW = TEST_ROAD_WIDTH * 0.5;
    var road = buildRoadRibbonGeometry(curve, segCount, halfW, TEST_ROAD_SURFACE_Y);
    var roadMesh = new THREE.Mesh(
      road.geometry,
      new THREE.MeshLambertMaterial({ color: 0x3a3f44 })
    );
    roadMesh.receiveShadow = true;
    parent.add(roadMesh);

    var line = buildRoadRibbonGeometry(curve, segCount, 0.09, TEST_ROAD_LINE_Y);
    var dashTex = createRoadDashTexture();
    dashTex.repeat.set(Math.max(1, road.length / 3.2), 1);
    var lineMesh = new THREE.Mesh(
      line.geometry,
      new THREE.MeshLambertMaterial({
        map: dashTex,
        transparent: true,
        alphaTest: 0.35,
        depthWrite: false,
      })
    );
    lineMesh.receiveShadow = false;
    parent.add(lineMesh);
  }

  function buildTestMapRoad(parent) {
    buildRoadFromCurve(parent, createTestRoadCurve());
  }

  function buildStraightRoadEndCaps(parent, samples) {
    var lastIdx = samples.length - 2;
    var frame = testRoadFrameAt(samples, lastIdx);
    var pt = samples[samples.length - 1];
    var roadHalf = TEST_ROAD_WIDTH * 0.5;
    var nearOffset = roadHalf + 8;
    var farOffset = roadHalf + 16;
    var gapHalf = roadHalf + 1.5;
    var wingLen = 18;
    var wingCenter = gapHalf + wingLen * 0.5 + 2.5;
    var cx = pt.x + frame.tx * 2.5;
    var cz = pt.z + frame.tz * 2.5;
    var rotY = frame.rotY + Math.PI / 2;
    var stripOpts = {
      h: 5.5,
      thick: 7.5,
      d: 8.5,
      solid: true,
      roadSamples: samples,
      connectMode: true,
    };
    var side;
    var wingIdx = Math.max(0, lastIdx - 2);

    addMountainStrip(
      parent,
      wingLen,
      cx + frame.nx * -wingCenter,
      cz + frame.nz * -wingCenter,
      rotY,
      stripOpts
    );
    addMountainStrip(
      parent,
      wingLen,
      cx + frame.nx * wingCenter,
      cz + frame.nz * wingCenter,
      rotY,
      stripOpts
    );

    for (side = -1; side <= 1; side += 2) {
      var wingX = cx + frame.nx * side * wingCenter;
      var wingZ = cz + frame.nz * side * wingCenter;
      var nearFlank = testRoadFlankPoint(samples, wingIdx, side, nearOffset);
      var farFlank = testRoadFlankPoint(samples, wingIdx, side, farOffset);
      addMountainBridgeStrip(
        parent,
        wingX,
        wingZ,
        nearFlank.x,
        nearFlank.z,
        samples,
        { h: 4.5, pushNx: frame.nx * side, pushNz: frame.nz * side }
      );
      addMountainBridgeStrip(
        parent,
        nearFlank.x,
        nearFlank.z,
        farFlank.x,
        farFlank.z,
        samples,
        { h: 5, pushNx: frame.nx * side, pushNz: frame.nz * side }
      );
    }
  }

  /**
   * @param {{ withMountains?: boolean }} [opts] withMountains 默认 true（路旁山 + 尽头封口）
   */
  function buildTestMapStraightRoadBranch(parent, samples, opts) {
    opts = opts || {};
    var withMountains = opts.withMountains !== false;
    buildRoadFromCurve(
      parent,
      createStraightRoadCurve(samples[0], samples[samples.length - 1])
    );
    if (withMountains) {
      buildTestMapRoadFlankMountains(parent, samples);
      buildStraightRoadEndCaps(parent, samples);
    }
  }

  function addMountainGrassCap(parent, cx, cz, w, h, d) {
    var topY = h + TEST_MOUNTAIN_LIFT;
    var grassW = w * 0.96;
    var grassD = d * 0.94;
    var pick =
      Math.abs(Math.floor(cx * 2.7 + cz * 4.1)) %
      TEST_MOUNTAIN_GRASS_COLORS.length;
    addBox(
      parent,
      grassW,
      TEST_MOUNTAIN_GRASS_H,
      grassD,
      cx,
      topY + TEST_MOUNTAIN_GRASS_H * 0.5,
      cz,
      TEST_MOUNTAIN_GRASS_COLORS[pick],
      false
    );
  }

  function addMountainBlock(parent, cx, cz, w, h, d, color, solid, allowOnRoad) {
    if (
      !allowOnRoad &&
      !isMountainBoxClearOfRoad(cx, cz, w * 0.5, d * 0.5)
    ) {
      return;
    }
    addBox(
      parent,
      w,
      h,
      d,
      cx,
      h * 0.5 + TEST_MOUNTAIN_LIFT,
      cz,
      color,
      solid === true
    );
    if (h > 2.8) {
      addBox(
        parent,
        w * 0.78,
        h * 0.28,
        d * 0.8,
        cx + w * 0.04,
        h + h * 0.12 + TEST_MOUNTAIN_LIFT,
        cz - d * 0.04,
        TEST_MOUNTAIN_ROCK_COLORS[
          Math.abs(Math.floor(cx + cz * 3)) % TEST_MOUNTAIN_ROCK_COLORS.length
        ],
        false
      );
    }
    addMountainGrassCap(parent, cx, cz, w, h, d);
  }

  function addMountainStrip(parent, stripLen, cx, cz, rotY, opts) {
    opts = opts || {};
    var h = opts.h || 4.5;
    var d = opts.d || 7.5;
    var thick = opts.thick || 6.5;
    var solid = opts.solid !== false;
    var roadSamples = opts.roadSamples;
    var pushNx = opts.pushNx;
    var pushNz = opts.pushNz;
    var connectMode = opts.connectMode === true;
    var ignoreRoadLimit = opts.ignoreRoadLimit === true;
    var steps = Math.max(2, Math.ceil(stripLen / 3.2));
    var si = Math.sin(rotY);
    var co = Math.cos(rotY);
    var i;
    for (i = 0; i < steps; i++) {
      var t = ((i + 0.5) / steps - 0.5) * stripLen;
      var px = cx + si * t;
      var pz = cz + co * t;
      var bw = thick + (i % 2) * 1.6;
      var bd = d + (i % 2) * 1.2;
      placeMountainBlockWithRoadRules(
        parent,
        px,
        pz,
        bw,
        h + (i % 3) * 0.75,
        bd,
        TEST_MOUNTAIN_ROCK_COLORS[i % TEST_MOUNTAIN_ROCK_COLORS.length],
        solid,
        ignoreRoadLimit ? null : roadSamples,
        {
          pushNx: pushNx,
          pushNz: pushNz,
          connectMode: connectMode,
          ignoreRoadLimit: ignoreRoadLimit,
        }
      );
    }
  }

  function buildTestMapRoadSouthCap(parent, samples) {
    var a = samples[0];
    var b = samples[1];
    var dx = b.x - a.x;
    var dz = b.z - a.z;
    var segLen = Math.sqrt(dx * dx + dz * dz) || 1;
    var nx = -dz / segLen;
    var nz = dx / segLen;
    var rotY = Math.atan2(dx, dz) + Math.PI / 2;
    var roadHalf = TEST_ROAD_WIDTH * 0.5;
    var nearOffset = roadHalf + 8;
    var farOffset = roadHalf + 16;
    var capLen = farOffset * 2 + 16;
    var cx = a.x - (dx / segLen) * 3.5;
    var cz = a.z - (dz / segLen) * 3.5;
    var stripOpts = {
      h: 5.5,
      thick: 8,
      d: 9,
      solid: true,
      connectMode: true,
      ignoreRoadLimit: true,
    };
    var side;

    addMountainStrip(parent, capLen, cx, cz, rotY, stripOpts);
    addMountainBlock(
      parent,
      cx,
      cz,
      capLen * 0.92,
      6,
      9,
      TEST_MOUNTAIN_ROCK_COLORS[0],
      true,
      true
    );

    for (side = -1; side <= 1; side += 2) {
      var capEdgeX = cx + nx * side * (capLen * 0.32);
      var capEdgeZ = cz + nz * side * (capLen * 0.32);
      var nearFlank = testRoadFlankPoint(samples, 1, side, nearOffset);
      var farFlank = testRoadFlankPoint(samples, 2, side, farOffset);
      addMountainBridgeStrip(
        parent,
        capEdgeX,
        capEdgeZ,
        nearFlank.x,
        nearFlank.z,
        samples,
        { h: 4.5, pushNx: nx * side, pushNz: nz * side }
      );
      addMountainBridgeStrip(
        parent,
        capEdgeX + nx * side * 2,
        capEdgeZ + nz * side * 2,
        farFlank.x,
        farFlank.z,
        samples,
        { h: 5, pushNx: nx * side, pushNz: nz * side }
      );
    }
  }

  function buildTestMapRoadFlankMountains(parent, samples) {
    var roadHalf = TEST_ROAD_WIDTH * 0.5;
    var nearOffset = roadHalf + 8;
    var farOffset = roadHalf + 16;
    var i;
    var a;
    var b;
    var mx;
    var mz;
    var dx;
    var dz;
    var segLen;
    var nx;
    var nz;
    var rotY;
    var stripLen;
    var side;

    for (i = 0; i < samples.length - 1; i++) {
      a = samples[i];
      b = samples[i + 1];
      mx = (a.x + b.x) * 0.5;
      mz = (a.z + b.z) * 0.5;
      dx = b.x - a.x;
      dz = b.z - a.z;
      segLen = Math.sqrt(dx * dx + dz * dz) || 1;
      nx = -dz / segLen;
      nz = dx / segLen;
      rotY = Math.atan2(dx, dz);
      stripLen = segLen + 1.5;

      for (side = -1; side <= 1; side += 2) {
        var pushNx = nx * side;
        var pushNz = nz * side;
        var stripOpts = {
          roadSamples: samples,
          pushNx: pushNx,
          pushNz: pushNz,
          solid: true,
          connectMode: true,
        };
        addMountainStrip(
          parent,
          stripLen,
          mx + pushNx * nearOffset,
          mz + pushNz * nearOffset,
          rotY,
          Object.assign({ h: 4 + (i % 2), thick: 7, d: 8 }, stripOpts)
        );
        addMountainStrip(
          parent,
          stripLen,
          mx + pushNx * farOffset,
          mz + pushNz * farOffset,
          rotY,
          Object.assign({ h: 5 + (i % 3) * 0.5, thick: 8, d: 9 }, stripOpts)
        );
      }
    }
  }

  function buildTestMapMountains(parent, samples) {
    buildTestMapRoadFlankMountains(parent, samples);
    buildTestMapRoadSouthCap(parent, samples);
  }

  var TEST_HIDDEN_ROOM_SIZE_X = 6;
  /** 沿 Z 向加宽至 ≥ 支路宽度，东侧敞开接路 */
  var TEST_HIDDEN_ROOM_SIZE_Z = TEST_ROAD_WIDTH + 1.5;
  var TEST_HIDDEN_ROOM_CENTER_X = -30;
  var TEST_HIDDEN_ROOM_CENTER_Z = 48;

  /** 支路西端 (-30,48) · 隐秘间（东侧敞开接支路，西/南/北墙 + 屋顶） */
  /**
   * 北向支路尽头 (0,168) 前方：左侧、右侧各一面宽 11m 的挡墙（封堵继续向北）
   */
  function getTestNorthGateLayout() {
    var endZ = TEST_NORTH_BRANCH_ROAD.to.z;
    var roadHalf = TEST_ROAD_WIDTH * 0.5;
    var wallW = TEST_NORTH_END_WALL_WIDTH;
    var wallThick = TEST_NORTH_END_WALL_THICK;
    var gap = 0.35;
    var wallZ = endZ + wallThick * 0.5 + 0.15;
    var gateZ = endZ + 0.22;
    return {
      endZ: endZ,
      roadHalf: roadHalf,
      gateZ: gateZ,
      wallZ: wallZ,
      wallSouthZ: wallZ - wallThick * 0.5,
      wallNorthZ: wallZ + wallThick * 0.5,
      leftWallCenterX: -(roadHalf + gap + wallW * 0.5),
      rightWallCenterX: roadHalf + gap + wallW * 0.5,
      wallHalfW: wallW * 0.5,
    };
  }

  function buildTestMapNorthEndGateWalls(parent) {
    var L = getTestNorthGateLayout();
    var wallH = TEST_NORTH_GATE_LEAF.h;
    var wallY = wallH * 0.5;
    var wallColor = 0x2e3338;

    addBox(
      parent,
      TEST_NORTH_END_WALL_WIDTH,
      wallH,
      TEST_NORTH_END_WALL_THICK,
      L.leftWallCenterX,
      wallY,
      L.wallZ,
      wallColor
    );
    addBox(
      parent,
      TEST_NORTH_END_WALL_WIDTH,
      wallH,
      TEST_NORTH_END_WALL_THICK,
      L.rightWallCenterX,
      wallY,
      L.wallZ,
      wallColor
    );
  }

  /** 横墙北侧：左右各一道竖墙，长 22m（沿 +Z） */
  function buildTestMapNorthEndVerticalWalls(parent) {
    var L = getTestNorthGateLayout();
    var wallH = TEST_NORTH_GATE_LEAF.h;
    var wallY = wallH * 0.5;
    var wallColor = 0x2e3338;
    var len = TEST_NORTH_END_VERTICAL_WALL_LEN;
    var thick = TEST_NORTH_END_VERTICAL_WALL_THICK;
    var centerZ = L.wallNorthZ + len * 0.5;

    addBox(
      parent,
      thick,
      wallH,
      len,
      L.leftWallCenterX,
      wallY,
      centerZ,
      wallColor
    );
    addBox(
      parent,
      thick,
      wallH,
      len,
      L.rightWallCenterX,
      wallY,
      centerZ,
      wallColor
    );
  }

  /** 仅移除关闭态下的静态门扇占位碰撞（开门后改跟 pivot 同步） */
  function removeTestNorthGateClosedColliders() {
    if (!testNorthIronGates) return;
    removeCollidersFromList(testNorthIronGates.colliders);
  }

  function syncTestNorthIronGateLeafColliders() {
    if (!testNorthIronGates || !testNorthIronGates.leafColliders) return;
    var pad = 0.05;
    if (
      testNorthIronGates.leafColliders[0] &&
      testNorthIronGates.leftPivot
    ) {
      syncColliderFromObject(
        testNorthIronGates.leafColliders[0],
        testNorthIronGates.leftPivot,
        pad
      );
    }
    if (
      testNorthIronGates.leafColliders[1] &&
      testNorthIronGates.rightPivot
    ) {
      syncColliderFromObject(
        testNorthIronGates.leafColliders[1],
        testNorthIronGates.rightPivot,
        pad
      );
    }
  }

  function initTestNorthIronGateOpenColliders() {
    if (!testNorthIronGates) return;
    if (!testNorthIronGates.leafColliders) {
      testNorthIronGates.leafColliders = [];
    }
    if (testNorthIronGates.leafColliders.length === 0) {
      if (testNorthIronGates.leftPivot) {
        testNorthIronGates.leafColliders.push(
          addColliderFromObject(testNorthIronGates.leftPivot, 0.05)
        );
      }
      if (testNorthIronGates.rightPivot) {
        testNorthIronGates.leafColliders.push(
          addColliderFromObject(testNorthIronGates.rightPivot, 0.05)
        );
      }
    }
    syncTestNorthIronGateLeafColliders();
  }

  function registerTestNorthGateCollider(sx, sy, sz, px, py, pz) {
    registerCollider(sx, sy, sz, px, py, pz);
    if (testNorthIronGates) {
      testNorthIronGates.colliders.push(colliders[colliders.length - 1]);
    }
  }

  function applyIronGateMaterial(root) {
    applyDoorMaterial(root, 0x4a5058, 0x1a2028, 0.12);
  }

  function clearObjectGroup(group) {
    if (!group) return;
    if (typeof group.clear === "function") {
      group.clear();
      return;
    }
    while (group.children.length) {
      group.remove(group.children[0]);
    }
  }

  function addIronGateLeafBox(pivot, localX, leafW, leafH, leafD) {
    var mesh = addBox(
      pivot,
      leafW,
      leafH,
      leafD,
      localX,
      leafH * 0.5,
      0,
      0x4a5058,
      false
    );
    mesh.name = "TestNorthIronGate_Leaf";
    return mesh;
  }

  function orientIronGateModel(model) {
    orientDoorUpright(model);
    model.rotation.y += Math.PI / 2;
    model.updateMatrixWorld(true);
  }

  function prepareIronGateMaterials(root) {
    root.traverse(function (child) {
      if (!child.isMesh || !child.material) return;
      var mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
      var m;
      for (m = 0; m < mats.length; m++) {
        var mat = mats[m];
        mat.side = THREE.DoubleSide;
        if (mat.metalness != null) {
          mat.metalness = Math.min(mat.metalness, 0.4);
        }
        if (mat.roughness != null) {
          mat.roughness = Math.max(mat.roughness, 0.5);
        }
      }
    });
  }

  function placeIronGateLeafModel(model, pivot, localX, leafW, leafH, leafD, side) {
    var leaf = model.clone(true);
    var root = new THREE.Group();
    root.name = "TestNorthIronGate_Leaf_" + (side || "L");
    root.add(leaf);
    orientIronGateModel(leaf);
    if (side === "right") {
      leaf.rotation.y += Math.PI;
      leaf.updateMatrixWorld(true);
    }
    fitModelToBox(root, { x: leafW, y: leafH, z: leafD });
    root.position.set(localX, 0, 0);
    var box = new THREE.Box3().setFromObject(root);
    root.position.y -= box.min.y;
    pivot.add(root);
    enableShadows(root);
    prepareIronGateMaterials(root);
    return root;
  }

  function mountTestNorthIronGateGltf(gltf, leftPivot, rightPivot, leafW, leafH, leafD) {
    if (!gltf || !gltf.scene || !testNorthIronGates) return;
    clearObjectGroup(leftPivot);
    clearObjectGroup(rightPivot);
    placeIronGateLeafModel(gltf.scene, leftPivot, leafW * 0.5, leafW, leafH, leafD, "left");
    placeIronGateLeafModel(gltf.scene, rightPivot, -leafW * 0.5, leafW, leafH, leafD, "right");
  }

  function loadTestNorthIronGateGltf(leftPivot, rightPivot, leafW, leafH, leafD) {
    var cached = gltfCache[TEST_IRON_GATE_GLB_URL];
    if (cached && cached.scene) {
      mountTestNorthIronGateGltf(cached, leftPivot, rightPivot, leafW, leafH, leafD);
      return;
    }
    getGltfLoader().load(
      TEST_IRON_GATE_GLB_URL,
      function (gltf) {
        gltfCache[TEST_IRON_GATE_GLB_URL] = gltf;
        mountTestNorthIronGateGltf(gltf, leftPivot, rightPivot, leafW, leafH, leafD);
      },
      undefined,
      function (err) {
        console.warn("[ActionScene] 铁门 GLB 加载失败，使用方块门", err);
      }
    );
  }

  /** (0,168) 双扇铁门：关闭时挡路，按 E 向内（朝南）打开 */
  function buildTestMapNorthEndIronGates(parent) {
    var L = getTestNorthGateLayout();
    var roadHalf = L.roadHalf;
    var leafW = roadHalf;
    var leafH = TEST_NORTH_GATE_LEAF.h;
    var leafD = TEST_NORTH_GATE_LEAF.d;
    var gateZ = L.gateZ;
    TEST_NORTH_GATE_LEAF.w = leafW;

    testNorthIronGates = {
      open: false,
      animating: false,
      t: 0,
      leftPivot: null,
      rightPivot: null,
      colliders: [],
      leafColliders: [],
      gateZ: gateZ,
      leafW: leafW,
      leafH: leafH,
      leafD: leafD,
    };

    var leftPivot = new THREE.Group();
    leftPivot.name = "TestNorthIronGate_LeftPivot";
    leftPivot.position.set(-roadHalf, 0, gateZ);

    var rightPivot = new THREE.Group();
    rightPivot.name = "TestNorthIronGate_RightPivot";
    rightPivot.position.set(roadHalf, 0, gateZ);

    addIronGateLeafBox(leftPivot, leafW * 0.5, leafW, leafH, leafD);
    addIronGateLeafBox(rightPivot, -leafW * 0.5, leafW, leafH, leafD);

    parent.add(leftPivot);
    parent.add(rightPivot);

    testNorthIronGates.leftPivot = leftPivot;
    testNorthIronGates.rightPivot = rightPivot;

    registerTestNorthGateCollider(leafW, leafH, leafD, -leafW * 0.5, leafH * 0.5, gateZ);
    registerTestNorthGateCollider(leafW, leafH, leafD, leafW * 0.5, leafH * 0.5, gateZ);

    loadTestNorthIronGateGltf(leftPivot, rightPivot, leafW, leafH, leafD);
  }

  /** 与铁门同轴，再转 180° */
  function orientCatSculptureModel(model) {
    orientIronGateModel(model);
    model.rotation.y += Math.PI;
    model.updateMatrixWorld(true);
  }

  function placeTestNorthCatSculpture(gltf, parent, side, worldX, worldZ) {
    var model = gltf.scene.clone(true);
    var root = new THREE.Group();
    root.name = "TestNorthCatSculpture_" + side;
    root.add(model);
    orientCatSculptureModel(model);
    fitModelToBox(root, CAT_SCULPTURE_SIZE);
    root.position.set(worldX, 0, worldZ);
    var box = new THREE.Box3().setFromObject(root);
    root.position.y -= box.min.y;
    parent.add(root);
    enableShadows(root);
    root.updateMatrixWorld(true);
    testNorthCatColliders.push(addColliderFromObject(root, 0.08));
    return root;
  }

  function getNorthEndWallAabb(L) {
    var halfT = TEST_NORTH_END_WALL_THICK * 0.5;
    return {
      z0: L.wallZ - halfT,
      z1: L.wallZ + halfT,
      left: {
        x0: L.leftWallCenterX - L.wallHalfW,
        x1: L.leftWallCenterX + L.wallHalfW,
      },
      right: {
        x0: L.rightWallCenterX - L.wallHalfW,
        x1: L.rightWallCenterX + L.wallHalfW,
      },
    };
  }

  function sculptureAabbHitsNorthEndWall(x, z, L) {
    var halfX = CAT_SCULPTURE_SIZE.x * 0.5;
    var halfZ = CAT_SCULPTURE_SIZE.z * 0.5;
    var w = getNorthEndWallAabb(L);
    var sx0 = x - halfX;
    var sx1 = x + halfX;
    var sz0 = z - halfZ;
    var sz1 = z + halfZ;
    var box = x < 0 ? w.left : w.right;
    return sx0 < box.x1 && sx1 > box.x0 && sz0 < w.z1 && sz1 > w.z0;
  }

  /**
   * 挡墙北侧（S 弯 / 支路一侧的对面），左右挡墙中线对称
   */
  function getTestNorthCatSculpturePlacement(L) {
    var halfZ = CAT_SCULPTURE_SIZE.z * 0.5;
    var inward = CAT_SCULPTURE_X_INWARD;
    var leftX = L.leftWallCenterX + inward;
    var rightX = L.rightWallCenterX - inward;
    var z = L.wallNorthZ + halfZ + CAT_SCULPTURE_CLEAR_FROM_WALL_Z;
    while (
      sculptureAabbHitsNorthEndWall(leftX, z, L) ||
      sculptureAabbHitsNorthEndWall(rightX, z, L)
    ) {
      z += 0.12;
      if (z > L.endZ + 8) break;
    }
    return { leftX: leftX, rightX: rightX, z: z };
  }

  function mountTestNorthCatSculptures(gltf, parent) {
    if (!gltf || !gltf.scene) return;
    var L = getTestNorthGateLayout();
    var p = getTestNorthCatSculpturePlacement(L);
    placeTestNorthCatSculpture(gltf, parent, "left", p.leftX, p.z);
    placeTestNorthCatSculpture(gltf, parent, "right", p.rightX, p.z);
  }

  function getTestNorthSideRoomCenterZ(L, cat) {
    var halfD = TEST_WAITING_HALL_DEPTH * 0.5;
    var gap = 0.55;
    var catHalfZ = CAT_SCULPTURE_SIZE.z * 0.5;
    return cat.z + catHalfZ + gap + halfD + TEST_WAITING_HALL_OFFSET_FROM_CAT;
  }

  function makeTestNorthSideRoomLayout(centerX, centerZ) {
    var width = TEST_WAITING_HALL_WIDTH;
    var depth = TEST_WAITING_HALL_DEPTH;
    var halfW = width * 0.5;
    var halfD = depth * 0.5;
    var inset = 0.55;
    return {
      centerX: centerX,
      centerZ: centerZ,
      halfW: halfW,
      halfD: halfD,
      width: width,
      depth: depth,
      wallH: TEST_WAITING_HALL_WALL_H,
      innerX0: centerX - halfW + inset,
      innerX1: centerX + halfW - inset,
      innerZ0: centerZ - halfD + inset,
      innerZ1: centerZ + halfD - inset,
    };
  }

  function getTestNorthWaitingHallLayout() {
    var L = getTestNorthGateLayout();
    var cat = getTestNorthCatSculpturePlacement(L);
    var thick = TEST_WAITING_HALL_WALL_THICK;
    var halfW = TEST_WAITING_HALL_WIDTH * 0.5;
    var vertWallWestX = L.rightWallCenterX - thick * 0.5;
    var centerX = vertWallWestX - halfW;
    var centerZ = getTestNorthSideRoomCenterZ(L, cat);
    return makeTestNorthSideRoomLayout(centerX, centerZ);
  }

  /** 与等候厅对称：贴在左侧竖墙东侧（路左） */
  function getTestNorthCollectionRoomLayout() {
    var L = getTestNorthGateLayout();
    var cat = getTestNorthCatSculpturePlacement(L);
    var thick = TEST_WAITING_HALL_WALL_THICK;
    var halfW = TEST_WAITING_HALL_WIDTH * 0.5;
    var vertWallEastX = L.leftWallCenterX + thick * 0.5;
    var centerX = vertWallEastX + halfW;
    var centerZ = getTestNorthSideRoomCenterZ(L, cat);
    return makeTestNorthSideRoomLayout(centerX, centerZ);
  }

  function buildTestNorthSideRoomShell(parent, hall, roomName) {
    var halfW = hall.halfW;
    var halfD = hall.halfD;
    var cx = hall.centerX;
    var cz = hall.centerZ;
    var wallH = hall.wallH;
    var wallY = wallH * 0.5;
    var thick = TEST_WAITING_HALL_WALL_THICK;
    var wallColor = SIDE_ROOM_INTERIOR_COLOR;
    var floorColor = 0x5a5e64;
    var roofColor = SIDE_ROOM_INTERIOR_COLOR;
    var doorW = TEST_WAITING_HALL_DOOR_W;
    var sideSeg = (hall.width - doorW) * 0.5;
    var floorThick = TEST_WAITING_HALL_FLOOR_THICK;
    var floorY = TEST_ROAD_SURFACE_Y - floorThick * 0.5;
    var floorMat = new THREE.MeshLambertMaterial({
      color: floorColor,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    var floorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(hall.width, floorThick, hall.depth),
      floorMat
    );
    floorMesh.name = roomName + "_Floor";
    floorMesh.position.set(cx, floorY, cz);
    floorMesh.renderOrder = 1;
    parent.add(floorMesh);
    addBox(
      parent,
      hall.width,
      wallH,
      thick,
      cx,
      wallY,
      cz + halfD - thick * 0.5,
      wallColor
    );
    addBox(
      parent,
      thick,
      wallH,
      hall.depth,
      cx - halfW + thick * 0.5,
      wallY,
      cz,
      wallColor
    );
    if (sideSeg > 0.2) {
      addBox(
        parent,
        sideSeg,
        wallH,
        thick,
        cx - halfW + sideSeg * 0.5,
        wallY,
        cz - halfD + thick * 0.5,
        wallColor
      );
      addBox(
        parent,
        sideSeg,
        wallH,
        thick,
        cx + halfW - sideSeg * 0.5,
        wallY,
        cz - halfD + thick * 0.5,
        wallColor
      );
    }
    var lintelH = wallH - TEST_WAITING_HALL_DOOR_H;
    if (lintelH > 0.12) {
      addBox(
        parent,
        doorW,
        lintelH,
        thick,
        cx,
        TEST_WAITING_HALL_DOOR_H + lintelH * 0.5,
        cz - halfD + thick * 0.5,
        wallColor,
        false
      );
    }
    if (roomName === "CollectionRoom") {
      addBox(
        parent,
        thick,
        wallH,
        hall.depth,
        cx + halfW - thick * 0.5,
        wallY,
        cz,
        wallColor
      );
    }
    addBox(
      parent,
      hall.width,
      TEST_WAITING_HALL_CEILING_THICK,
      hall.depth,
      cx,
      wallH + TEST_WAITING_HALL_CEILING_THICK * 0.5,
      cz,
      roofColor
    );
  }

  function buildTestMapNorthWaitingHall(parent) {
    var hall = getTestNorthWaitingHallLayout();
    testWaitingHall = { layout: hall, playerInside: false };
    buildTestNorthSideRoomShell(parent, hall, "WaitingHall");
    loadTestMapWaitingHallBench(parent, hall);
    loadTestMapWaitingHallEndTable(parent, hall);
  }

  function getTestNorthRearHouseLayout() {
    var coll = getTestNorthCollectionRoomLayout();
    var wait = getTestNorthWaitingHallLayout();
    var roomNorthZ = Math.max(
      coll.centerZ + coll.halfD,
      wait.centerZ + wait.halfD
    );
    var w = TEST_NORTH_REAR_HOUSE_WIDTH;
    var d = TEST_NORTH_REAR_HOUSE_DEPTH;
    var topD = TEST_NORTH_REAR_HOUSE_TOP_DEPTH;
    var stemW = TEST_NORTH_REAR_HOUSE_STEM_WIDTH;
    var stemD = TEST_NORTH_REAR_HOUSE_STEM_DEPTH;
    var wingW = TEST_NORTH_REAR_HOUSE_WING_W;
    var halfW = w * 0.5;
    var halfD = d * 0.5;
    var stemHalfW = stemW * 0.5;
    var southZ = roomNorthZ + TEST_NORTH_REAR_HOUSE_GAP;
    var northZ = southZ + d;
    var splitZ = southZ + stemD;
    var centerZ = southZ + halfD;
    return {
      centerX: 0,
      centerZ: centerZ,
      southZ: southZ,
      northZ: northZ,
      splitZ: splitZ,
      halfW: halfW,
      halfD: halfD,
      topHalfW: halfW,
      stemHalfW: stemHalfW,
      wingW: wingW,
      topDepth: topD,
      stemDepth: stemD,
      width: w,
      depth: d,
      wallH: TEST_NORTH_REAR_HOUSE_WALL_H,
    };
  }

  function addRearHouseFloor(parent, sx, sz, cx, cz, floorY, floorThick, mat) {
    var floorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx, floorThick, sz),
      mat
    );
    floorMesh.position.set(cx, floorY, cz);
    floorMesh.renderOrder = 1;
    parent.add(floorMesh);
  }

  function buildTestNorthRearHouseShell(parent, house) {
    var cx = house.centerX;
    var southZ = house.southZ;
    var northZ = house.northZ;
    var splitZ = house.splitZ;
    var topHalfW = house.topHalfW;
    var stemHalfW = house.stemHalfW;
    var wingW = house.wingW;
    var topDepth = house.topDepth;
    var stemDepth = house.stemDepth;
    var wallH = house.wallH;
    var wallY = wallH * 0.5;
    var thick = TEST_WAITING_HALL_WALL_THICK;
    var wallColor = 0x2e3338;
    var floorColor = 0x5a5e64;
    var roofColor = 0x343840;
    var doorW = TEST_WAITING_HALL_DOOR_W;
    var stemSideSeg = (house.stemHalfW * 2 - doorW) * 0.5;
    var floorThick = TEST_WAITING_HALL_FLOOR_THICK;
    var floorY = TEST_ROAD_SURFACE_Y - floorThick * 0.5;
    var topCenterZ = (splitZ + northZ) * 0.5;
    var stemCenterZ = (southZ + splitZ) * 0.5;
    var floorMat = new THREE.MeshLambertMaterial({
      color: floorColor,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    addRearHouseFloor(
      parent,
      house.width,
      topDepth,
      cx,
      topCenterZ,
      floorY,
      floorThick,
      floorMat
    );
    addRearHouseFloor(
      parent,
      stemHalfW * 2,
      stemDepth,
      cx,
      stemCenterZ,
      floorY,
      floorThick,
      floorMat
    );

    addBox(
      parent,
      house.width,
      wallH,
      thick,
      cx,
      wallY,
      northZ - thick * 0.5,
      wallColor
    );
    addBox(
      parent,
      thick,
      wallH,
      topDepth,
      cx - topHalfW + thick * 0.5,
      wallY,
      topCenterZ,
      wallColor
    );
    addBox(
      parent,
      thick,
      wallH,
      topDepth,
      cx + topHalfW - thick * 0.5,
      wallY,
      topCenterZ,
      wallColor
    );
    addBox(
      parent,
      wingW,
      wallH,
      thick,
      cx - topHalfW + wingW * 0.5,
      wallY,
      splitZ + thick * 0.5,
      wallColor
    );
    addBox(
      parent,
      wingW,
      wallH,
      thick,
      cx + topHalfW - wingW * 0.5,
      wallY,
      splitZ + thick * 0.5,
      wallColor
    );
    addBox(
      parent,
      thick,
      wallH,
      stemDepth,
      cx - stemHalfW + thick * 0.5,
      wallY,
      stemCenterZ,
      wallColor
    );
    addBox(
      parent,
      thick,
      wallH,
      stemDepth,
      cx + stemHalfW - thick * 0.5,
      wallY,
      stemCenterZ,
      wallColor
    );
    if (stemSideSeg > 0.2) {
      addBox(
        parent,
        stemSideSeg,
        wallH,
        thick,
        cx - stemHalfW + stemSideSeg * 0.5,
        wallY,
        southZ + thick * 0.5,
        wallColor
      );
      addBox(
        parent,
        stemSideSeg,
        wallH,
        thick,
        cx + stemHalfW - stemSideSeg * 0.5,
        wallY,
        southZ + thick * 0.5,
        wallColor
      );
    }
    var lintelH = wallH - TEST_NORTH_REAR_HOUSE_DOOR_H;
    if (lintelH > 0.08) {
      addBox(
        parent,
        doorW,
        lintelH,
        thick,
        cx,
        TEST_NORTH_REAR_HOUSE_DOOR_H + lintelH * 0.5,
        southZ + thick * 0.5,
        wallColor,
        false
      );
    }
    addBox(
      parent,
      house.width,
      TEST_WAITING_HALL_CEILING_THICK,
      topDepth,
      cx,
      wallH + TEST_WAITING_HALL_CEILING_THICK * 0.5,
      topCenterZ,
      roofColor,
      false
    );
    addBox(
      parent,
      stemHalfW * 2,
      TEST_WAITING_HALL_CEILING_THICK,
      stemDepth,
      cx,
      wallH + TEST_WAITING_HALL_CEILING_THICK * 0.5,
      stemCenterZ,
      roofColor,
      false
    );
  }

  function buildTestMapNorthRearHouse(parent) {
    var house = getTestNorthRearHouseLayout();
    testNorthRearHouse = { layout: house, playerInside: false };
    buildTestNorthRearHouseShell(parent, house);
  }

  function buildTestMapNorthCollectionRoom(parent) {
    var hall = getTestNorthCollectionRoomLayout();
    testCollectionRoom = { layout: hall, playerInside: false };
    buildTestNorthSideRoomShell(parent, hall, "CollectionRoom");
    if (window.CollectionRoomChest && window.CollectionRoomChest.build) {
      window.CollectionRoomChest.build(parent, getWaitingHallGltfHelpers(), {
        hall: hall,
      });
    }
    if (window.CollectionRoomFloorLoot && window.CollectionRoomFloorLoot.build) {
      window.CollectionRoomFloorLoot.build(parent, getWaitingHallGltfHelpers(), {
        hall: hall,
      });
    }
  }

  function ensureWaitingHallBenchBaseOnFloor(model) {
    model.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(model);
    var size = new THREE.Vector3();
    box.getSize(size);
    var tol = Math.max(0.04, size.y * 0.08);
    var areaBottom = xzFootprintAreaAtWorldY(model, box.min.y + tol, tol);
    var areaTop = xzFootprintAreaAtWorldY(model, box.max.y - tol, tol);
    if (areaTop > areaBottom * 1.02) {
      model.rotation.x += Math.PI;
      model.updateMatrixWorld(true);
    }
  }

  /** 边桌/茶几：桌面水平（Y 为桌高，XZ 为台面 footprint） */
  function orientWaitingHallEndTableUpright(model) {
    var presets = [
      { x: 0, z: 0 },
      { x: Math.PI / 2, z: 0 },
      { x: Math.PI, z: 0 },
      { x: -Math.PI / 2, z: 0 },
      { x: 0, z: Math.PI / 2 },
      { x: Math.PI / 2, z: Math.PI / 2 },
      { x: -Math.PI / 2, z: 0 },
      { x: -Math.PI / 2, z: Math.PI / 2 },
    ];
    var best = presets[0];
    var bestScore = -1e9;
    var i;

    for (i = 0; i < presets.length; i++) {
      var r = presets[i];
      model.rotation.set(r.x, WAITING_HALL_END_TABLE_YAW, r.z);
      model.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(model);
      var size = new THREE.Vector3();
      box.getSize(size);
      var foot = Math.max(size.x, size.z, 0.001);
      var heightRatio = size.y / foot;
      if (heightRatio > 0.62) continue;

      var tol = Math.max(0.04, size.y * 0.08);
      var areaBottom = xzFootprintAreaAtWorldY(model, box.min.y + tol, tol);
      var areaTop = xzFootprintAreaAtWorldY(model, box.max.y - tol, tol);
      var score = areaBottom * 6;
      if (areaBottom >= areaTop * 1.02) score += 130;
      else score -= 180;
      if (size.y <= size.x && size.y <= size.z) score += 80;
      score += (size.x * size.z) / (size.y + 0.02);

      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }

    model.rotation.set(best.x, WAITING_HALL_END_TABLE_YAW, best.z);
    model.updateMatrixWorld(true);
    ensureWaitingHallBenchBaseOnFloor(model);
    if (WAITING_HALL_END_TABLE_LAYOUT === "upside_down") {
      model.rotation.x += Math.PI;
      model.updateMatrixWorld(true);
    } else if (WAITING_HALL_END_TABLE_LAYOUT === "on_side") {
      model.rotation.x += Math.PI;
      model.updateMatrixWorld(true);
      model.rotation.y += Math.PI / 2;
      model.updateMatrixWorld(true);
    }
    model.rotation.z = 0;
    model.updateMatrixWorld(true);
  }

  function orientWaitingHallBenchUpright(model) {
    var presets = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: Math.PI / 2, z: 0 },
      { x: 0, y: Math.PI, z: 0 },
      { x: 0, y: -Math.PI / 2, z: 0 },
      { x: Math.PI / 2, y: 0, z: 0 },
      { x: -Math.PI / 2, y: 0, z: 0 },
      { x: Math.PI / 2, y: Math.PI / 2, z: 0 },
      { x: -Math.PI / 2, y: Math.PI / 2, z: 0 },
      { x: 0, y: 0, z: Math.PI / 2 },
      { x: 0, y: Math.PI / 2, z: Math.PI / 2 },
      { x: -Math.PI / 2, y: 0, z: Math.PI / 2 },
    ];
    var best = presets[0];
    var bestScore = -1e9;
    var i;

    for (i = 0; i < presets.length; i++) {
      var r = presets[i];
      model.rotation.set(r.x, r.y, r.z);
      model.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(model);
      var size = new THREE.Vector3();
      box.getSize(size);
      var dims = [size.x, size.y, size.z].sort(function (a, b) {
        return a - b;
      });
      var tol = Math.max(0.05, size.y * 0.08);
      var areaBottom = xzFootprintAreaAtWorldY(model, box.min.y + tol, tol);
      var areaTop = xzFootprintAreaAtWorldY(model, box.max.y - tol, tol);
      var score = areaBottom * 4;
      if (areaBottom >= areaTop * 1.01) score += 120;
      else score -= 150;
      if (Math.abs(size.y - dims[1]) < dims[1] * 0.25) score += 35;
      if (size.y >= size.x * 0.25 && size.y >= size.z * 0.25) score += 20;

      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }

    model.rotation.set(best.x, best.y, best.z);
    model.updateMatrixWorld(true);
    ensureWaitingHallBenchBaseOnFloor(model);
    model.rotation.z = 0;
    model.updateMatrixWorld(true);
  }

  function snapWaitingHallBenchToFloor(root) {
    var box = new THREE.Box3().setFromObject(root);
    root.position.y += TEST_ROAD_SURFACE_Y - box.min.y;
    root.updateMatrixWorld(true);
  }

  function faceWaitingHallBenchToward(model, root, faceX, faceZ, yawExtra) {
    root.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(root);
    var cx = (box.min.x + box.max.x) * 0.5;
    var cz = (box.min.z + box.max.z) * 0.5;
    var dx = faceX - cx;
    var dz = faceZ - cz;
    model.rotation.y = Math.atan2(dx, dz) + (yawExtra || 0);
    model.updateMatrixWorld(true);
  }

  function placeWaitingHallBenchInstance(gltf, parent, hall, opts) {
    if (!gltf || !gltf.scene) return;
    opts = opts || {};
    var benchSize = opts.size || WAITING_HALL_BENCH_SIZE;
    var benchZ = opts.z != null ? opts.z : hall.centerZ;
    var faceX = opts.faceX != null ? opts.faceX : hall.centerX;
    var faceZ = opts.faceZ != null ? opts.faceZ : hall.centerZ;
    var wallPad = 0.1;

    var model = gltf.scene.clone(true);
    var root = new THREE.Group();
    root.name = "WaitingHallBench_" + (opts.label || "Bench");
    root.add(model);
    orientWaitingHallBenchUpright(model);
    root.updateMatrixWorld(true);
    fitModelUniformToBox(root, benchSize);
    ensureWaitingHallBenchBaseOnFloor(model);

    root.position.set(0, 0, 0);
    root.updateMatrixWorld(true);

    var box = new THREE.Box3().setFromObject(root);
    var center = new THREE.Vector3();
    box.getCenter(center);

    if (opts.wall === "north") {
      var northInnerZ =
        hall.centerZ + hall.halfD - TEST_WAITING_HALL_WALL_THICK * 0.5;
      root.position.set(hall.centerX - center.x, 0, 0);
      root.updateMatrixWorld(true);
      box.setFromObject(root);
      root.position.z += northInnerZ - wallPad - box.max.z;
      root.updateMatrixWorld(true);
      model.rotation.y =
        opts.yawToDoor != null ? opts.yawToDoor : WAITING_HALL_BENCH_YAW_TO_DOOR;
      model.updateMatrixWorld(true);
    } else {
      faceWaitingHallBenchToward(model, root, faceX, faceZ, opts.yawExtra);
      root.position.set(0, 0, benchZ - center.z);
      box.setFromObject(root);
      if (opts.wall === "west") {
        root.position.x += hall.innerX0 + wallPad - box.min.x;
      } else if (opts.wall === "east") {
        root.position.x += hall.innerX1 - wallPad - box.max.x;
      }
    }

    root.updateMatrixWorld(true);
    snapWaitingHallBenchToFloor(root);
    ensureWaitingHallBenchBaseOnFloor(model);
    snapWaitingHallBenchToFloor(root);

    parent.add(root);
    enableShadows(root);
    addColliderFromObject(root, 0.06);
  }

  function mountWaitingHallBenches(gltf, parent, hall) {
    placeWaitingHallBenchInstance(gltf, parent, hall, {
      label: "North",
      size: WAITING_HALL_BENCH_SIZE,
      wall: "north",
      yawToDoor: WAITING_HALL_BENCH_YAW_TO_DOOR,
    });
  }

  function loadTestMapWaitingHallBench(parent, hall) {
    var cached = gltfCache[WAITING_HALL_BENCH_GLB_URL];
    if (cached && cached.scene) {
      mountWaitingHallBenches(cached, parent, hall);
      return;
    }
    loadGltfCached(
      WAITING_HALL_BENCH_GLB_URL,
      function (gltf) {
        mountWaitingHallBenches(gltf, parent, hall);
      },
      function (err) {
        console.warn("[ActionScene] 等候厅凳子 GLB 加载失败", err);
      }
    );
  }

  function getWaitingHallGltfHelpers() {
    return {
      registerCollider: registerCollider,
      loadGltfCached: loadGltfCached,
      fitModelToBox: fitModelToBox,
      fitModelUniformToBox: fitModelUniformToBox,
      hasLineOfSight: function (px, pz, tx, ty, tz, margin) {
        return hasLineOfSight(px, pos.y, pz, tx, ty, tz, margin);
      },
    };
  }

  function getWaitingHallTableTopPlacement(tableRoot) {
    if (!tableRoot) return null;
    tableRoot.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(tableRoot);
    var center = new THREE.Vector3();
    box.getCenter(center);
    return {
      x: center.x,
      z: center.z,
      topY: box.max.y + 0.02,
    };
  }

  function mountWaitingHallLockbox(parent, hall, tableTop) {
    if (!window.WaitingHallLockbox || !window.WaitingHallLockbox.build) return;
    var placement = { hall: hall };
    if (tableTop) placement.tableTop = tableTop;
    window.WaitingHallLockbox.build(parent, getWaitingHallGltfHelpers(), placement);
  }

  function placeWaitingHallEndTableFromGltf(gltf, parent, hall, onReady) {
    if (!gltf || !gltf.scene) {
      if (onReady) onReady(null);
      return null;
    }
    var model = gltf.scene.clone(true);
    var root = new THREE.Group();
    root.name = "WaitingHallEndTable_GLB";
    root.add(model);
    orientWaitingHallEndTableUpright(model);
    root.updateMatrixWorld(true);
    fitModelUniformToBox(root, WAITING_HALL_END_TABLE_SIZE);

    root.position.set(0, 0, 0);
    root.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(root);
    var center = new THREE.Vector3();
    box.getCenter(center);
    root.position.set(
      hall.centerX - center.x - WAITING_HALL_END_TABLE_SHIFT_WEST,
      0,
      hall.centerZ - center.z
    );
    root.updateMatrixWorld(true);
    snapWaitingHallBenchToFloor(root);
    snapWaitingHallBenchToFloor(root);

    parent.add(root);
    enableShadows(root);
    addColliderFromObjectTightXZ(
      root,
      0.03,
      WAITING_HALL_END_TABLE_COLLIDER_SHRINK_X,
      WAITING_HALL_END_TABLE_COLLIDER_SHRINK_Z
    );
    if (onReady) onReady(root);
    return root;
  }

  function loadTestMapWaitingHallEndTable(parent, hall) {
    function afterTable(tableRoot) {
      mountWaitingHallLockbox(
        parent,
        hall,
        getWaitingHallTableTopPlacement(tableRoot)
      );
    }
    var cached = gltfCache[WAITING_HALL_END_TABLE_GLB_URL];
    if (cached && cached.scene) {
      placeWaitingHallEndTableFromGltf(cached, parent, hall, afterTable);
      return;
    }
    loadGltfCached(
      WAITING_HALL_END_TABLE_GLB_URL,
      function (gltf) {
        placeWaitingHallEndTableFromGltf(gltf, parent, hall, afterTable);
      },
      function (err) {
        console.warn("[ActionScene] 等候厅桌子 GLB 加载失败", err);
        mountWaitingHallLockbox(parent, hall, null);
      }
    );
  }

  function isInsideTestSideRoom(room) {
    if (!room || currentMapId !== "test") return false;
    var h = room.layout;
    return (
      pos.x >= h.innerX0 &&
      pos.x <= h.innerX1 &&
      pos.z >= h.innerZ0 &&
      pos.z <= h.innerZ1
    );
  }

  function isInsideTestNorthRearHouse(room) {
    if (!room || currentMapId !== "test") return false;
    var h = room.layout;
    var inset = 0.55;
    if (
      pos.z >= h.splitZ - inset &&
      pos.z <= h.northZ - inset &&
      pos.x >= -h.topHalfW + inset &&
      pos.x <= h.topHalfW - inset
    ) {
      return true;
    }
    if (
      pos.z >= h.southZ + inset &&
      pos.z <= h.splitZ + inset &&
      pos.x >= -h.stemHalfW + inset &&
      pos.x <= h.stemHalfW - inset
    ) {
      return true;
    }
    return false;
  }

  function updateTestSideRoomBanner(room, label) {
    if (!room || currentMapId !== "test") return;
    var inside = isInsideTestSideRoom(room);
    if (inside && !room.playerInside) {
      showActionTopBanner(label, 2000);
    }
    room.playerInside = inside;
  }

  function updateTestNorthRearHouseBanner() {
    if (!testNorthRearHouse || currentMapId !== "test") return;
    var inside = isInsideTestNorthRearHouse(testNorthRearHouse);
    if (inside && !testNorthRearHouse.playerInside) {
      showActionTopBanner("总统主楼", 2000);
    }
    testNorthRearHouse.playerInside = inside;
  }

  function updateTestNorthSideRooms() {
    updateTestSideRoomBanner(testWaitingHall, "等候厅");
    updateTestSideRoomBanner(testCollectionRoom, "收藏室");
    updateTestNorthRearHouseBanner();
  }

  function buildTestMapNorthEndCatSculptures(parent) {
    var cached = gltfCache[CAT_SCULPTURE_GLB_URL];
    if (cached && cached.scene) {
      mountTestNorthCatSculptures(cached, parent);
      return;
    }
    getGltfLoader().load(
      CAT_SCULPTURE_GLB_URL,
      function (gltf) {
        gltfCache[CAT_SCULPTURE_GLB_URL] = gltf;
        mountTestNorthCatSculptures(gltf, parent);
      },
      undefined,
      function (err) {
        console.warn("[ActionScene] 猫雕塑 GLB 加载失败", err);
      }
    );
  }

  function isNearTestNorthIronGates() {
    if (!testNorthIronGates || testNorthIronGates.open) return false;
    var endZ = TEST_NORTH_BRANCH_ROAD.to.z;
    return (
      Math.abs(pos.z - endZ) < 5 &&
      Math.abs(pos.x) < TEST_ROAD_WIDTH * 0.55 + 0.5
    );
  }

  function tryOpenTestNorthIronGates() {
    if (!testNorthIronGates || testNorthIronGates.open) return false;
    if (!isNearTestNorthIronGates()) return false;
    testNorthIronGates.open = true;
    testNorthIronGates.animating = true;
    testNorthIronGates.t = 0;
    removeTestNorthGateClosedColliders();
    initTestNorthIronGateOpenColliders();
    showDurabilityBanner("铁门已向内侧打开");
    setInteractHintVisible(false);
    return true;
  }

  function updateTestNorthIronGates(dt) {
    if (!testNorthIronGates) return;
    if (testNorthIronGates.animating) {
      testNorthIronGates.t += dt;
      var u = Math.min(1, testNorthIronGates.t / 0.7);
      var ease = u * u * (3 - 2 * u);
      var ang = TEST_NORTH_GATE_OPEN_Y * ease;
      if (testNorthIronGates.leftPivot) {
        testNorthIronGates.leftPivot.rotation.y = ang;
      }
      if (testNorthIronGates.rightPivot) {
        testNorthIronGates.rightPivot.rotation.y = -ang;
      }
      syncTestNorthIronGateLeafColliders();
      if (u >= 1) {
        testNorthIronGates.animating = false;
      }
    } else if (testNorthIronGates.open) {
      syncTestNorthIronGateLeafColliders();
    }
  }

  function updateSecurityDoorOpenCollider() {
    if (!doorUnlocked || !securityDoorRoot || currentMapId !== "tutorial") {
      return;
    }
    if (!securityDoorOpenCollider) {
      securityDoorOpenCollider = addColliderFromObject(securityDoorRoot, 0.06);
      return;
    }
    syncColliderFromObject(securityDoorOpenCollider, securityDoorRoot, 0.06);
  }

  function buildTestMapHiddenRoom(parent) {
    var cx = TEST_HIDDEN_ROOM_CENTER_X;
    var cz = TEST_HIDDEN_ROOM_CENTER_Z + 0.25;
    var halfX = TEST_HIDDEN_ROOM_SIZE_X * 0.5;
    var halfZ = TEST_HIDDEN_ROOM_SIZE_Z * 0.5;
    var thick = 0.5;
    var wallY = SECTOR_WALL_H * 0.5;
    var floorColor = 0x5a5e64;
    var wallColor = 0x2e3338;
    var roofColor = 0x343840;

    addBox(
      parent,
      TEST_HIDDEN_ROOM_SIZE_X,
      0.1,
      TEST_HIDDEN_ROOM_SIZE_Z,
      cx,
      0.05,
      cz,
      floorColor,
      false
    );
    addBox(
      parent,
      thick,
      SECTOR_WALL_H,
      TEST_HIDDEN_ROOM_SIZE_Z,
      cx - halfX + thick * 0.5,
      wallY,
      cz,
      wallColor
    );
    addBox(
      parent,
      TEST_HIDDEN_ROOM_SIZE_X,
      SECTOR_WALL_H,
      thick,
      cx,
      wallY,
      cz - halfZ + thick * 0.5,
      wallColor
    );
    addBox(
      parent,
      TEST_HIDDEN_ROOM_SIZE_X,
      SECTOR_WALL_H,
      thick,
      cx,
      wallY,
      cz + halfZ - thick * 0.5,
      wallColor
    );
    addBox(
      parent,
      thick,
      SECTOR_WALL_H,
      TEST_HIDDEN_ROOM_SIZE_Z,
      cx + halfX - thick * 0.5,
      wallY,
      cz,
      wallColor
    );
    addBox(
      parent,
      TEST_HIDDEN_ROOM_SIZE_X,
      0.15,
      TEST_HIDDEN_ROOM_SIZE_Z,
      cx,
      SECTOR_WALL_H + 0.075,
      cz,
      roofColor
    );
  }

  /** S 形主路第一个拐弯 (0,-48)→(9,-36) 外侧路边 */
  function getTestMapFirstBendBinFlank() {
    var a = TEST_ROAD_CURVE_POINTS[0];
    var b = TEST_ROAD_CURVE_POINTS[1];
    var dx = b.x - a.x;
    var dz = b.z - a.z;
    var len = Math.sqrt(dx * dx + dz * dz) || 1;
    var nx = -dz / len;
    var nz = dx / len;
    var offset = TEST_ROAD_WIDTH * 0.5 + 1.6;
    return {
      x: b.x + nx * offset,
      z: b.z + nz * offset,
    };
  }

  function placeWasteBinModel(model, parent, centerX, centerZ, binIndex) {
    var root = new THREE.Group();
    root.name = "IndustrialWasteBin_GLB";
    root.add(model);

    model.scale.set(1, 1, 1);
    model.updateMatrixWorld(true);

    var binSize =
      window.ActionWasteBin && window.ActionWasteBin.BIN_SIZE
        ? window.ActionWasteBin.BIN_SIZE
        : { x: 0.95, y: 1.15, z: 0.95 };
    fitModelToBox(root, binSize);
    fitModelToBox(root, binSize);

    var box = new THREE.Box3().setFromObject(root);
    var center = new THREE.Vector3();
    box.getCenter(center);
    root.position.set(centerX - center.x, -box.min.y, centerZ - center.z);
    parent.add(root);
    root.updateMatrixWorld(true);

    if (window.ActionWasteBin && binIndex != null) {
      var pickMesh = new THREE.Mesh(
        new THREE.BoxGeometry(binSize.x, binSize.y, binSize.z),
        new THREE.MeshBasicMaterial({
          visible: false,
          depthWrite: false,
        })
      );
      pickMesh.name = "BinPickVolume";
      pickMesh.position.set(0, binSize.y * 0.5, 0);
      root.add(pickMesh);
      if (window.ActionWasteBin.registerBinPickMesh) {
        window.ActionWasteBin.registerBinPickMesh(binIndex, pickMesh);
      }
      var worldPos = new THREE.Vector3();
      root.getWorldPosition(worldPos);
      window.ActionWasteBin.syncBinWorldCenter(
        binIndex,
        worldPos.x,
        worldPos.y + binSize.y * 0.55,
        worldPos.z
      );
    }

    registerCollider(
      binSize.x,
      binSize.y,
      binSize.z,
      centerX,
      binSize.y * 0.5,
      centerZ
    );
  }

  function buildIndustrialWasteBins(parent) {
    if (!window.ActionWasteBin) return;
    var positions = window.ActionWasteBin.getBinPositions();
    if (!positions.length) return;
    var url = window.ActionWasteBin.BIN_GLB_URL;
    var i;

    loadGltfCached(
      url,
      function (gltf) {
        for (i = 0; i < positions.length; i++) {
          placeWasteBinModel(
            gltf.scene.clone(true),
            parent,
            positions[i].x,
            positions[i].z,
            i
          );
        }
      },
      function (err) {
        console.error("[ActionScene] 废料桶模型加载失败", err);
        for (i = 0; i < positions.length; i++) {
          addBox(
            parent,
            0.95,
            1.15,
            0.95,
            positions[i].x,
            0.575,
            positions[i].z,
            0x2a4a6a,
            false
          );
          if (window.ActionWasteBin.syncBinWorldCenter) {
            window.ActionWasteBin.syncBinWorldCenter(
              i,
              positions[i].x,
              0.95,
              positions[i].z
            );
          }
        }
      }
    );
  }

  function buildTruck(parent) {
    registerCollider(
      TRUCK_SIZE.x,
      TRUCK_SIZE.y,
      TRUCK_SIZE.z,
      TRUCK_CENTER.x,
      TRUCK_CENTER.y,
      TRUCK_CENTER.z
    );

    loadGltfCached(
      TRUCK_GLB_URL,
      function (gltf) {
        placeTruckModel(gltf.scene, parent);
      },
      function (err) {
        console.error("[ActionScene] 卡车模型加载失败", err);
        addTruckFallback(parent);
      }
    );
  }

  function addTruckFallback(parent) {
    var mesh = addBox(
      parent,
      TRUCK_SIZE.x,
      TRUCK_SIZE.y,
      TRUCK_SIZE.z,
      TRUCK_CENTER.x,
      TRUCK_CENTER.y,
      TRUCK_CENTER.z,
      0x2a7ab8,
      false
    );
    mesh.name = "TacticalTruck_Fallback";
    tacticalTruckRoot = mesh;
  }

  function fitModelToBox(object3D, targetSize) {
    var box = new THREE.Box3().setFromObject(object3D);
    var size = new THREE.Vector3();
    box.getSize(size);
    var cur = object3D.scale;
    object3D.scale.set(
      cur.x * (targetSize.x / (size.x || 1)),
      cur.y * (targetSize.y / (size.y || 1)),
      cur.z * (targetSize.z / (size.z || 1))
    );
    object3D.updateMatrixWorld(true);
  }

  /** 等比缩放塞进占位框，避免 GLB 被拉长 */
  function fitModelUniformToBox(object3D, targetSize) {
    var box = new THREE.Box3().setFromObject(object3D);
    var size = new THREE.Vector3();
    box.getSize(size);
    var sx = targetSize.x / (size.x || 1);
    var sy = targetSize.y / (size.y || 1);
    var sz = targetSize.z / (size.z || 1);
    var s = Math.min(sx, sy, sz);
    var cur = object3D.scale;
    object3D.scale.set(cur.x * s, cur.y * s, cur.z * s);
    object3D.updateMatrixWorld(true);
  }

  function fitTruckToCollider(truckRoot) {
    fitModelToBox(truckRoot, TRUCK_SIZE);
  }

  function enableShadows(root) {
    root.traverse(function (child) {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material.side = THREE.FrontSide;
        }
      }
    });
  }

  function prepareFpsViewModel(root, castShadow) {
    root.traverse(function (child) {
      if (!child.isMesh) return;
      child.castShadow = !!castShadow;
      child.receiveShadow = false;
      child.frustumCulled = false;
      if (child.material) {
        var mats = Array.isArray(child.material)
          ? child.material
          : [child.material];
        var i;
        for (i = 0; i < mats.length; i++) {
          mats[i].fog = false;
          mats[i].side = THREE.FrontSide;
        }
      }
    });
  }

  function removeFallbackHands(camera) {
    if (leftHand && leftHand.parent === camera) {
      camera.remove(leftHand);
    }
    if (rightHand && rightHand.parent === camera) {
      camera.remove(rightHand);
    }
    leftHand = null;
    rightHand = null;
  }

  function armsModelRotationRad() {
    var r = Math.PI / 180;
    return {
      x: ARMS_ROT_DEG.x * r,
      y: ARMS_ROT_DEG.y * r,
      z: ARMS_ROT_DEG.z * r,
    };
  }

  function armsViewSizeScaled() {
    return {
      x: ARMS_VIEW_SIZE.x * ARMS_SCALE,
      y: ARMS_VIEW_SIZE.y * ARMS_SCALE,
      z: ARMS_VIEW_SIZE.z * ARMS_SCALE,
    };
  }

  function alignFpsArmsPivot(pivot) {
    pivot.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(pivot);
    var cx = (box.min.x + box.max.x) * 0.5;
    var anchorY = (HAND_BASE.left.y + HAND_BASE.right.y) * 0.5;
    var anchorZ = (HAND_BASE.left.z + HAND_BASE.right.z) * 0.5;

    fpsArmsAlignX = -cx;
    fpsArmsRestY = anchorY - box.min.y;
    fpsArmsRestZ = anchorZ - box.min.z;

    pivot.position.set(fpsArmsAlignX, fpsArmsRestY, fpsArmsRestZ);
  }

  function loadFpsArms(camera) {
    if (!camera) return;
    loadGltfCached(
      ARMS_GLB_URL,
      function (gltf) {
        var model = gltf.scene;
        model.rotation.order = "YXZ";
        var armsRot = armsModelRotationRad();
        model.rotation.set(armsRot.x, armsRot.y, armsRot.z);

        var pivot = new THREE.Group();
        pivot.name = "SoldierArms_Pivot";
        pivot.add(model);

        prepareFpsViewModel(pivot, false);
        fitModelToBox(pivot, armsViewSizeScaled());
        alignFpsArmsPivot(pivot);

        pivot.renderOrder = 10;
        fpsArmsRoot = pivot;
        removeFallbackHands(camera);
        camera.add(fpsArmsRoot);
        if (window.ActionWeapon) {
          if (window.ActionWeapon.hasUziEquipped()) {
            fpsArmsRoot.visible = false;
          }
          window.ActionWeapon.sync();
        }
      },
      undefined,
      function (err) {
        console.warn("[ActionScene] 手部模型加载失败，使用方块手", err);
      }
    );
  }

  var _footprintVec = new THREE.Vector3();

  /** 采样某高度附近在 XZ 平面上的占地宽度（用于判断哪一面是墩底） */
  function xzFootprintAreaAtWorldY(object, worldY, tolerance) {
    var minX = Infinity;
    var maxX = -Infinity;
    var minZ = Infinity;
    var maxZ = -Infinity;
    var found = false;

    object.updateMatrixWorld(true);
    object.traverse(function (child) {
      if (!child.isMesh || !child.geometry) return;
      var posAttr = child.geometry.attributes.position;
      if (!posAttr) return;
      var i;
      for (i = 0; i < posAttr.count; i++) {
        _footprintVec.fromBufferAttribute(posAttr, i);
        _footprintVec.applyMatrix4(child.matrixWorld);
        if (Math.abs(_footprintVec.y - worldY) > tolerance) continue;
        found = true;
        minX = Math.min(minX, _footprintVec.x);
        maxX = Math.max(maxX, _footprintVec.x);
        minZ = Math.min(minZ, _footprintVec.z);
        maxZ = Math.max(maxZ, _footprintVec.z);
      }
    });

    if (!found) return 0;
    return Math.max(0, maxX - minX) * Math.max(0, maxZ - minZ);
  }

  /** 若顶面比底面更宽，绕 X 翻转 180° 让墩底贴地 */
  function ensureBarrierBaseOnFloor(root, model) {
    root.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(root);
    var size = new THREE.Vector3();
    box.getSize(size);
    var tol = Math.max(0.06, size.y * 0.08);
    var areaBottom = xzFootprintAreaAtWorldY(root, box.min.y + tol, tol);
    var areaTop = xzFootprintAreaAtWorldY(root, box.max.y - tol, tol);

    if (areaTop > areaBottom * 1.02) {
      model.rotation.x += Math.PI;
      model.updateMatrixWorld(true);
      fitModelToBox(root, BARRIER_SIZE);
      fitModelToBox(root, BARRIER_SIZE);
    }
  }

  /**
   * 水泥墩正放：X≈1.5 宽、Y≈1.3 高、Z≈0.8 厚，且宽底朝下
   */
  function orientBarrierUpright(model) {
    var presets = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: Math.PI / 2, z: 0 },
      { x: 0, y: Math.PI, z: 0 },
      { x: Math.PI / 2, y: 0, z: 0 },
      { x: -Math.PI / 2, y: 0, z: 0 },
      { x: 0, y: 0, z: Math.PI / 2 },
      { x: -Math.PI / 2, y: Math.PI / 2, z: 0 },
      { x: -Math.PI / 2, y: 0, z: 0 },
      { x: Math.PI / 2, y: Math.PI, z: 0 },
    ];
    var best = presets[0];
    var bestScore = -1e9;
    var i;

    for (i = 0; i < presets.length; i++) {
      var r = presets[i];
      model.rotation.set(r.x, r.y, r.z);
      model.updateMatrixWorld(true);

      var box = new THREE.Box3().setFromObject(model);
      var size = new THREE.Vector3();
      box.getSize(size);
      var dims = [size.x, size.y, size.z].sort(function (a, b) {
        return a - b;
      });

      var score = 0;
      if (Math.abs(size.y - dims[1]) < dims[1] * 0.2) score += 50;
      if (Math.abs(size.z - dims[0]) < dims[0] * 0.2) score += 35;
      if (Math.abs(size.x - dims[2]) < dims[2] * 0.2) score += 25;

      var tol = Math.max(0.06, size.y * 0.08);
      var areaBottom = xzFootprintAreaAtWorldY(model, box.min.y + tol, tol);
      var areaTop = xzFootprintAreaAtWorldY(model, box.max.y - tol, tol);
      if (areaBottom >= areaTop) score += 80;

      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }

    model.rotation.set(best.x, best.y, best.z);
    model.updateMatrixWorld(true);
  }

  function placeBarrierInstance(model, parent, centerZ) {
    var root = new THREE.Group();
    root.name = "ConcreteBarrier_GLB";
    root.add(model);

    model.scale.set(1, 1, 1);
    orientBarrierUpright(model);
    root.updateMatrixWorld(true);
    fitModelToBox(root, BARRIER_SIZE);
    fitModelToBox(root, BARRIER_SIZE);
    ensureBarrierBaseOnFloor(root, model);

    var box = new THREE.Box3().setFromObject(root);
    var center = new THREE.Vector3();
    box.getCenter(center);
    root.position.set(
      BARRIER_CENTER_X - center.x,
      -box.min.y,
      centerZ - center.z
    );

    enableShadows(root);
    parent.add(root);
  }

  /** 木箱正放贴地，等比例填满 2×2×2 碰撞箱 */
  function orientCrateUpright(model) {
    var presets = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: Math.PI / 2, z: 0 },
      { x: 0, y: Math.PI, z: 0 },
      { x: Math.PI / 2, y: 0, z: 0 },
      { x: -Math.PI / 2, y: 0, z: 0 },
    ];
    var best = presets[0];
    var bestScore = -1e9;
    var i;

    for (i = 0; i < presets.length; i++) {
      var r = presets[i];
      model.rotation.set(r.x, r.y, r.z);
      model.updateMatrixWorld(true);

      var box = new THREE.Box3().setFromObject(model);
      var size = new THREE.Vector3();
      box.getSize(size);

      var score =
        100 -
        (Math.abs(size.x - CRATE_SIZE.x) +
          Math.abs(size.y - CRATE_SIZE.y) +
          Math.abs(size.z - CRATE_SIZE.z));
      if (size.y <= size.x && size.y <= size.z) score += 20;

      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }

    model.rotation.set(best.x, best.y, best.z);
    model.updateMatrixWorld(true);
  }

  function placeCrateInstance(model, parent, centerX, centerZ) {
    var root = new THREE.Group();
    root.name = "WoodenCrate_GLB";
    root.add(model);

    model.scale.set(1, 1, 1);
    orientCrateUpright(model);
    root.updateMatrixWorld(true);
    fitModelToBox(root, CRATE_SIZE);
    fitModelToBox(root, CRATE_SIZE);

    var box = new THREE.Box3().setFromObject(root);
    var center = new THREE.Vector3();
    box.getCenter(center);
    root.position.set(
      centerX - center.x,
      -box.min.y,
      centerZ - center.z
    );

    enableShadows(root);
    parent.add(root);
  }

  function buildWoodenCrates(parent) {
    var j;
    for (j = 0; j < CRATE_Z.length; j++) {
      registerCollider(
        CRATE_SIZE.x,
        CRATE_SIZE.y,
        CRATE_SIZE.z,
        CRATE_X[j],
        CRATE_CENTER_Y,
        CRATE_Z[j]
      );
    }

    loadGltfCached(
      CRATE_GLB_URL,
      function (gltf) {
        for (j = 0; j < CRATE_Z.length; j++) {
          placeCrateInstance(
            gltf.scene.clone(true),
            parent,
            CRATE_X[j],
            CRATE_Z[j]
          );
        }
      },
      function (err) {
        console.error("[ActionScene] 木箱模型加载失败", err);
        for (j = 0; j < CRATE_Z.length; j++) {
          addBox(
            parent,
            CRATE_SIZE.x,
            CRATE_SIZE.y,
            CRATE_SIZE.z,
            CRATE_X[j],
            CRATE_CENTER_Y,
            CRATE_Z[j],
            0x6b4a28,
            false
          );
        }
      }
    );
  }

  function buildConcreteBarriers(parent) {
    var i;
    for (i = 0; i < BARRIER_Z.length; i++) {
      registerCollider(
        BARRIER_SIZE.x,
        BARRIER_SIZE.y,
        BARRIER_SIZE.z,
        BARRIER_CENTER_X,
        BARRIER_CENTER_Y,
        BARRIER_Z[i]
      );
    }

    loadGltfCached(
      BARRIER_GLB_URL,
      function (gltf) {
        for (i = 0; i < BARRIER_Z.length; i++) {
          placeBarrierInstance(gltf.scene.clone(true), parent, BARRIER_Z[i]);
        }
      },
      function (err) {
        console.error("[ActionScene] 水泥墙模型加载失败", err);
        for (i = 0; i < BARRIER_Z.length; i++) {
          addBox(
            parent,
            BARRIER_SIZE.x,
            BARRIER_SIZE.y,
            BARRIER_SIZE.z,
            BARRIER_CENTER_X,
            BARRIER_CENTER_Y,
            BARRIER_Z[i],
            0x7a7c80,
            false
          );
        }
      }
    );
  }

  /** 自动选朝向：车长沿 Z、车高沿 Y，车轮朝下贴地 */
  function orientTruckUpright(model) {
    var presets = [
      { x: 0, y: Math.PI, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: Math.PI / 2, z: 0 },
      { x: 0, y: -Math.PI / 2, z: 0 },
      { x: Math.PI / 2, y: Math.PI, z: 0 },
      { x: -Math.PI / 2, y: Math.PI, z: 0 },
    ];
    var best = presets[0];
    var bestScore = -1e9;
    var i;

    for (i = 0; i < presets.length; i++) {
      var r = presets[i];
      model.rotation.set(r.x, r.y, r.z);
      model.updateMatrixWorld(true);

      var box = new THREE.Box3().setFromObject(model);
      var size = new THREE.Vector3();
      box.getSize(size);

      var score = 0;
      if (size.z >= size.x && size.z >= size.y) score += 100;
      if (size.y <= size.x && size.y <= size.z) score += 40;
      if (size.z / (size.y || 1) >= 1.4) score += 25;
      if (size.z / (size.x || 1) >= 1.4) score += 15;

      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }

    model.rotation.set(best.x, best.y, best.z);
    model.updateMatrixWorld(true);
  }

  function placeTruckModel(model, parent) {
    var truckRoot = new THREE.Group();
    truckRoot.name = "TacticalTruck_GLB";
    truckRoot.add(model);

    model.scale.set(1, 1, 1);
    orientTruckUpright(model);
    truckRoot.updateMatrixWorld(true);
    fitTruckToCollider(truckRoot);
    fitTruckToCollider(truckRoot);

    var box = new THREE.Box3().setFromObject(truckRoot);
    var center = new THREE.Vector3();
    box.getCenter(center);
    truckRoot.position.set(
      TRUCK_CENTER.x - center.x,
      -box.min.y,
      TRUCK_CENTER.z - center.z
    );

    enableShadows(model);

    parent.add(truckRoot);
    tacticalTruckRoot = truckRoot;
  }

  function removeDoorColliders() {
    var i;
    for (i = doorSwipeColliders.length - 1; i >= 0; i--) {
      var c = doorSwipeColliders[i];
      var idx = colliders.indexOf(c);
      if (idx >= 0) colliders.splice(idx, 1);
    }
    doorSwipeColliders.length = 0;
  }

  function registerDoorSwipeCollider(sx, sy, sz, px, py, pz) {
    registerCollider(sx, sy, sz, px, py, pz);
    doorSwipeColliders.push(colliders[colliders.length - 1]);
  }

  function ensureDoorColliders() {
    if (doorSwipeColliders.length > 0) return;
    registerDoorSwipeCollider(
      DOOR_SIZE.x,
      DOOR_SIZE.y,
      DOOR_SIZE.z + 0.15,
      0,
      DOOR_SIZE.y * 0.5,
      DOOR_Z - 0.08
    );
  }

  function applyDoorMaterial(root, hex, emissiveHex, emissiveIntensity) {
    if (!root) return;
    root.traverse(function (child) {
      if (!child.isMesh || !child.material) return;
      var mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
      var m;
      for (m = 0; m < mats.length; m++) {
        if (mats[m].color) mats[m].color.setHex(hex);
        if (mats[m].emissive) {
          mats[m].emissive.setHex(emissiveHex);
          if (mats[m].emissiveIntensity !== undefined) {
            mats[m].emissiveIntensity = emissiveIntensity;
          }
        }
      }
    });
  }

  function setDoorOrange(root) {
    applyDoorMaterial(root, 0xe87820, 0x000000, 0);
  }

  function setDoorGreen(root) {
    applyDoorMaterial(root, 0x2ecc55, 0x1a6630, 0.35);
  }

  function resetEvacState() {
    evacCounting = false;
    evacTimeLeft = 0;
    document.body.classList.remove("evac-counting");
    if (evacOverlayEl) evacOverlayEl.hidden = true;
    if (evacCountdownEl) evacCountdownEl.textContent = "10";
  }

  function resetExplosionState() {
    explosionCounting = false;
    explosionTimeLeft = 10;
    explosionDone = false;
    wallExploded = false;
    wallStrikeFallbackLeft = 0;
    document.body.classList.remove("explosion-counting");
    if (explosionOverlayEl) explosionOverlayEl.hidden = true;
    if (explosionTimerEl) explosionTimerEl.textContent = "10";
    clearExplosionEffects();
  }

  function findNamedRoot(parent, name) {
    if (!parent) return null;
    var found = null;
    parent.traverse(function (obj) {
      if (!found && obj.name === name) found = obj;
    });
    return found;
  }

  function removeTruckCollider() {
    colliders = colliders.filter(function (box) {
      var cx = (box.minX + box.maxX) * 0.5;
      var cz = (box.minZ + box.maxZ) * 0.5;
      return !(
        Math.abs(cx - TRUCK_CENTER.x) < 0.2 &&
        Math.abs(cz - TRUCK_CENTER.z) < 0.2
      );
    });
  }

  function clearExplosionEffects() {
    var i;
    for (i = 0; i < explosionDebris.length; i++) {
      if (worldRoot && explosionDebris[i].mesh) {
        worldRoot.remove(explosionDebris[i].mesh);
      }
      disposeObject3D(explosionDebris[i].mesh);
    }
    explosionDebris = [];
    if (missileStrike && missileStrike.root) {
      if (worldRoot) worldRoot.remove(missileStrike.root);
      disposeObject3D(missileStrike.root);
    }
    missileStrike = null;
  }

  function shouldRemoveTruckFragment(mesh) {
    if (!mesh) return true;
    if (isTruckOutsideSectorWalls(mesh)) {
      return isTruckOffScreen(mesh);
    }
    return mesh.position.y < -10;
  }

  function disposeMissileRoot(root) {
    if (!root) return;
    if (worldRoot) worldRoot.remove(root);
    disposeObject3D(root);
  }

  function buildMissileVisual(done) {
    function attachModel(root) {
      if (done) done(root);
    }

    function buildFallback() {
      var root = new THREE.Group();
      root.name = "StrikeMissile_Fallback";
      var body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.16, 1.6, 10),
        new THREE.MeshLambertMaterial({ color: 0x6a7078 })
      );
      body.rotation.x = Math.PI / 2;
      body.position.z = 0.8;
      var nose = new THREE.Mesh(
        new THREE.ConeGeometry(0.14, 0.35, 10),
        new THREE.MeshLambertMaterial({ color: 0xc04030 })
      );
      nose.rotation.x = Math.PI / 2;
      nose.position.z = 1.75;
      root.add(body);
      root.add(nose);
      attachModel(root);
    }

    function buildFromGltf(gltf) {
      var pivot = new THREE.Group();
      pivot.name = "StrikeMissile_GLB";
      var model = gltf.scene.clone(true);
      model.rotation.order = "YXZ";
      model.rotation.set(0, Math.PI, 0);
      pivot.add(model);
      fitModelToBox(pivot, { x: 0.45, y: 0.45, z: 2.2 });
      pivot.rotateX(-Math.PI / 2);
      enableShadows(pivot);
      attachModel(pivot);
    }

    if (gltfCache[MISSILE_GLB_URL]) {
      buildFromGltf(gltfCache[MISSILE_GLB_URL]);
      return;
    }

    buildFallback();
    preloadGltfUrl(MISSILE_GLB_URL);
  }

  function getWallStrikeTarget(out) {
    out.set(0, SECTOR_WALL_H * 0.55, WALL_STRIKE_Z);
    return out;
  }

  function getTruckStrikeTarget(out) {
    out.set(TRUCK_CENTER.x, TRUCK_CENTER.y + 0.35, TRUCK_CENTER.z);
    return out;
  }

  function orientMissileToward(root, target) {
    root.lookAt(target);
    root.rotateY(Math.PI);
  }

  function launchMissileStrike(kind) {
    if (kind === "wall" && wallExploded) return;

    buildMissileVisual(function (root) {
      if (!worldRoot || !running) {
        disposeObject3D(root);
        return;
      }
      if (kind === "wall" && wallExploded) {
        disposeObject3D(root);
        return;
      }

      var target = getWallStrikeTarget(_missileVecA.clone());
      var start = _missileVecB;
      if (kind === "wall") {
        start.set(
          (Math.random() - 0.5) * 4,
          11 + Math.random() * 3,
          WALL_STRIKE_Z + 38
        );
      } else {
        target = getTruckStrikeTarget(_missileVecA.clone());
        start.set(
          (Math.random() - 0.5) * 3,
          14 + Math.random() * 3,
          WALL_STRIKE_Z + 26
        );
      }

      root.position.copy(start);
      orientMissileToward(root, target);
      worldRoot.add(root);

      missileStrike = {
        kind: kind,
        root: root,
        target: target,
        speed: kind === "wall" ? 44 : 40,
        hitRadius: kind === "wall" ? 2.8 : 1.8,
      };
    });
  }

  function forceDestroyBinRoomBackWall() {
    if (wallExploded) return;
    wallExploded = true;
    wallStrikeFallbackLeft = 0;

    removeBinRoomBackWallColliders();

    var i;
    for (i = 0; i < binRoomBackWallMeshes.length; i++) {
      detachObject3D(binRoomBackWallMeshes[i]);
      disposeObject3D(binRoomBackWallMeshes[i]);
    }
    binRoomBackWallMeshes = [];

    if (worldRoot) {
      var extras = [];
      worldRoot.traverse(function (obj) {
        if (obj.name === "BinRoomBackWall" || (obj.userData && obj.userData.isBinRoomBackWall)) {
          extras.push(obj);
        }
      });
      for (i = 0; i < extras.length; i++) {
        detachObject3D(extras[i]);
        disposeObject3D(extras[i]);
      }
    }
  }

  function ensureExplosionAudio() {
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    if (!explosionAudioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      explosionAudioCtx = new Ctx();
    }
    if (explosionAudioCtx.state === "suspended") {
      explosionAudioCtx.resume().catch(function () {});
    }
    return explosionAudioCtx;
  }

  /** 程序化爆炸声：短促爆破 + 衰减尾音（避免低频正弦「打鼓感」） */
  function playMissileExplosionSound(kind) {
    var ctx = ensureExplosionAudio();
    if (!ctx) return;

    var isTruck = kind === "truck";
    var t = ctx.currentTime;
    var vol = EXPLOSION_VOLUME * (isTruck ? 1.08 : 0.9);

    function burstNoise(durSec, hpHz, lpStartHz, gainMul, delaySec) {
      var len = Math.floor(ctx.sampleRate * durSec);
      var buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = buffer.getChannelData(0);
      var i;
      for (i = 0; i < len; i++) {
        var env = Math.pow(1 - i / (len || 1), isTruck ? 2.4 : 3);
        data[i] = (Math.random() * 2 - 1) * env;
      }

      var src = ctx.createBufferSource();
      src.buffer = buffer;

      var hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = hpHz;

      var lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(lpStartHz, t + delaySec);
      lp.frequency.exponentialRampToValueAtTime(
        Math.max(hpHz + 60, lpStartHz * 0.28),
        t + delaySec + durSec * 0.82
      );

      var g = ctx.createGain();
      g.gain.setValueAtTime(Math.max(0.001, vol * gainMul), t + delaySec);
      g.gain.exponentialRampToValueAtTime(0.001, t + delaySec + durSec);

      src.connect(hp);
      hp.connect(lp);
      lp.connect(g);
      g.connect(ctx.destination);
      src.start(t + delaySec);
      src.stop(t + delaySec + durSec + 0.03);
    }

    burstNoise(isTruck ? 0.1 : 0.075, 1100, 5200, isTruck ? 0.58 : 0.52, 0);
    burstNoise(isTruck ? 0.34 : 0.24, 180, isTruck ? 980 : 1200, isTruck ? 0.64 : 0.54, 0.008);
    burstNoise(isTruck ? 0.48 : 0.34, 55, isTruck ? 240 : 280, isTruck ? 0.34 : 0.26, 0.018);
  }

  function onWallMissileImpact() {
    if (!wallExploded) {
      explodeWallIntoFragments();
    }
    playMissileExplosionSound("wall");
    if (missileStrike && missileStrike.root) {
      disposeMissileRoot(missileStrike.root);
    }
    missileStrike = { phase: "pause", pauseLeft: 0.85 };
  }

  function onTruckMissileImpact() {
    startTruckExplosion();
    playMissileExplosionSound("truck");
    if (missileStrike && missileStrike.root) {
      disposeMissileRoot(missileStrike.root);
    }
    missileStrike = null;
    showDurabilityBanner("第二枚导弹命中 · 卡车四分五裂");
  }

  function updateMissileStrike(dt) {
    if (!missileStrike) return;

    if (missileStrike.phase === "pause") {
      missileStrike.pauseLeft -= dt;
      if (missileStrike.pauseLeft <= 0) {
        launchMissileStrike("truck");
      }
      return;
    }

    var m = missileStrike.root;
    if (!m) return;

    var tx = missileStrike.target.x;
    var ty = missileStrike.target.y;
    var tz = missileStrike.target.z;
    var dx = tx - m.position.x;
    var dy = ty - m.position.y;
    var dz = tz - m.position.z;
    var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist <= missileStrike.hitRadius) {
      if (missileStrike.kind === "wall") onWallMissileImpact();
      else onTruckMissileImpact();
      return;
    }

    if (
      missileStrike.kind === "wall" &&
      !wallExploded &&
      m.position.z <= WALL_STRIKE_Z + 1.5
    ) {
      onWallMissileImpact();
      return;
    }

    var step = missileStrike.speed * dt;
    var inv = step / dist;
    m.position.x += dx * inv;
    m.position.y += dy * inv;
    m.position.z += dz * inv;
    orientMissileToward(m, missileStrike.target);
  }

  function startMissileStrikeSequence() {
    if (!worldRoot) return;
    launchMissileStrike("wall");
  }

  function removeBinRoomBackWallColliders() {
    if (binRoomBackWallColliders.length) {
      colliders = colliders.filter(function (box) {
        return binRoomBackWallColliders.indexOf(box) < 0;
      });
    }
    binRoomBackWallColliders = [];
  }

  function spawnWallFragments() {
    if (!worldRoot) return;

    var backZ = EVAC_CORRIDOR_START_Z + 0.25;
    var cols = 5;
    var rows = 4;
    var pieceW = BIN_ROOM_SIZE / cols;
    var pieceH = SECTOR_WALL_H / rows;
    var pieceD = 0.42;
    var colors = [0x2e3338, 0x383e45, 0x252a30, 0x434950];
    var cx;
    var cy;
    var px;
    var py;
    var pz;
    var mesh;
    var mat;
    var towardTruckZ = TRUCK_CENTER.z - backZ;

    for (cx = 0; cx < cols; cx++) {
      for (cy = 0; cy < rows; cy++) {
        px = -BIN_ROOM_SIZE * 0.5 + pieceW * (cx + 0.5);
        py = pieceH * (cy + 0.5);
        pz = backZ + (Math.random() - 0.5) * 0.08;
        mat = new THREE.MeshLambertMaterial({
          color: colors[(cx + cy) % colors.length],
        });
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(pieceW * 0.92, pieceH * 0.9, pieceD),
          mat
        );
        mesh.position.set(px, py, pz);
        mesh.rotation.set(
          (Math.random() - 0.5) * 0.35,
          (Math.random() - 0.5) * 0.35,
          (Math.random() - 0.5) * 0.35
        );
        worldRoot.add(mesh);

        explosionDebris.push({
          mesh: mesh,
          vx: (Math.random() - 0.5) * 5.5,
          vy: 5.5 + Math.random() * 7,
          vz: towardTruckZ * (0.55 + Math.random() * 0.35) + (Math.random() - 0.5) * 2,
          rvx: (Math.random() - 0.5) * 9,
          rvy: (Math.random() - 0.5) * 9,
          rvz: (Math.random() - 0.5) * 9,
          halfH: pieceH * 0.45,
          settled: false,
        });
      }
    }
  }

  function updateWallStrikeFallback(dt) {
    if (wallExploded || wallStrikeFallbackLeft <= 0) return;
    wallStrikeFallbackLeft -= dt;
    if (wallStrikeFallbackLeft <= 0) {
      onWallMissileImpact();
    }
  }

  function explodeWallIntoFragments() {
    forceDestroyBinRoomBackWall();
    spawnWallFragments();
  }

  function collectTruckRoots() {
    var list = [];
    if (!worldRoot) return list;
    worldRoot.traverse(function (obj) {
      if (
        obj.name === "TacticalTruck_GLB" ||
        obj.name === "TacticalTruck_Fallback"
      ) {
        list.push(obj);
      }
    });
    return list;
  }

  function destroyTruckVisual() {
    if (!worldRoot) return null;
    removeTruckCollider();

    var roots = collectTruckRoots();
    var center = new THREE.Vector3(
      TRUCK_CENTER.x,
      TRUCK_CENTER.y,
      TRUCK_CENTER.z
    );
    var size = new THREE.Vector3(TRUCK_SIZE.x, TRUCK_SIZE.y, TRUCK_SIZE.z);
    var box = new THREE.Box3();
    var i;

    for (i = 0; i < roots.length; i++) {
      roots[i].updateMatrixWorld(true);
      box.expandByObject(roots[i]);
    }
    if (roots.length) {
      box.getCenter(center);
      box.getSize(size);
    }

    for (i = 0; i < roots.length; i++) {
      detachObject3D(roots[i]);
      disposeObject3D(roots[i]);
    }
    tacticalTruckRoot = null;
    return { center: center, size: size };
  }

  function startTruckExplosion() {
    spawnTruckFragments();
  }

  function spawnTruckFragments() {
    if (!worldRoot) return;
    var info = destroyTruckVisual();
    if (!info) return;

    var center = info.center;
    var size = info.size;

    var colors = [0x3d5240, 0x4a5e48, 0x556b4a, 0x354535, 0x2e3338];
    var bursts = [
      { vx: -6.5, vy: 13, vz: -19 },
      { vx: 6.5, vy: 15, vz: -18 },
      { vx: -8, vy: 10, vz: -15 },
      { vx: 8, vy: 11, vz: -16 },
      { vx: 0.5, vy: 18, vz: -22 },
    ];
    var i;
    var mesh;
    var mat;
    var pieceW;
    var pieceH;
    var pieceD;
    var ox;
    var oy;
    var oz;
    var burst;

    for (i = 0; i < TRUCK_FRAGMENT_COUNT; i++) {
      burst = bursts[i];
      pieceW = Math.max(0.55, size.x * (0.28 + Math.random() * 0.12));
      pieceH = Math.max(0.45, size.y * (0.22 + Math.random() * 0.12));
      pieceD = Math.max(0.7, size.z * (0.18 + Math.random() * 0.1));
      ox = (Math.random() - 0.5) * size.x * 0.35;
      oy = (Math.random() - 0.5) * size.y * 0.25;
      oz = (Math.random() - 0.5) * size.z * 0.25;
      mat = new THREE.MeshLambertMaterial({ color: colors[i % colors.length] });
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(pieceW, pieceH, pieceD),
        mat
      );
      mesh.position.set(center.x + ox, center.y + oy, center.z + oz);
      mesh.rotation.set(
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.6
      );
      worldRoot.add(mesh);

      explosionDebris.push({
        mesh: mesh,
        vx: burst.vx + (Math.random() - 0.5) * 2,
        vy: burst.vy + Math.random() * 2,
        vz: burst.vz + (Math.random() - 0.5) * 2,
        rvx: (Math.random() - 0.5) * 8,
        rvy: (Math.random() - 0.5) * 8,
        rvz: (Math.random() - 0.5) * 8,
        halfH: pieceH * 0.5,
        settled: false,
        flyOut: true,
      });
    }
  }

  function updateExplosionDebris(dt) {
    var g = 22;
    var i;
    var fx;
    for (i = explosionDebris.length - 1; i >= 0; i--) {
      fx = explosionDebris[i];
      if (fx.flyOut) {
        fx.vy -= g * dt * 0.75;
        fx.mesh.position.x += fx.vx * dt;
        fx.mesh.position.y += fx.vy * dt;
        fx.mesh.position.z += fx.vz * dt;
        fx.mesh.rotation.x += fx.rvx * dt;
        fx.mesh.rotation.y += fx.rvy * dt;
        fx.mesh.rotation.z += fx.rvz * dt;
        if (shouldRemoveTruckFragment(fx.mesh)) {
          if (worldRoot) worldRoot.remove(fx.mesh);
          disposeObject3D(fx.mesh);
          explosionDebris.splice(i, 1);
        }
        continue;
      }

      if (fx.settled) continue;
      fx.vy -= g * dt;
      fx.mesh.position.x += fx.vx * dt;
      fx.mesh.position.y += fx.vy * dt;
      fx.mesh.position.z += fx.vz * dt;
      fx.mesh.rotation.x += fx.rvx * dt;
      fx.mesh.rotation.y += fx.rvy * dt;
      fx.mesh.rotation.z += fx.rvz * dt;

      if (fx.mesh.position.y <= fx.halfH) {
        fx.mesh.position.y = fx.halfH;
        if (fx.vy < 0) fx.vy = 0;
        fx.vx *= 0.42;
        fx.vz *= 0.42;
        fx.rvx *= 0.55;
        fx.rvy *= 0.55;
        fx.rvz *= 0.55;
        if (
          Math.abs(fx.vx) < 0.08 &&
          Math.abs(fx.vz) < 0.08 &&
          fx.mesh.position.y <= fx.halfH + 0.02
        ) {
          fx.settled = true;
        }
      }
    }
  }

  function isTruckOutsideSectorWalls(root) {
    var p = root.position;
    return (
      p.z < 0.35 ||
      p.x < -SECTOR_OUTER_X - 0.35 ||
      p.x > SECTOR_OUTER_X + 0.35 ||
      p.y > SECTOR_WALL_H + 6
    );
  }

  function isTruckOffScreen(root) {
    if (!camera || !root) return true;
    root.updateMatrixWorld(true);
    _truckVisBox.setFromObject(root);
    _truckVisMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    _truckVisFrustum.setFromProjectionMatrix(_truckVisMatrix);
    return !_truckVisFrustum.intersectsBox(_truckVisBox);
  }

  function updateExplosionEffects(dt) {
    updateWallStrikeFallback(dt);
    if (missileStrike) updateMissileStrike(dt);
    if (explosionDebris.length) updateExplosionDebris(dt);
  }

  function hasExplosionEffects() {
    return (
      wallStrikeFallbackLeft > 0 ||
      !!missileStrike ||
      explosionDebris.length > 0
    );
  }

  function isInBinRoom() {
    var half = BIN_ROOM_SIZE * 0.5;
    var midZ = BIN_ROOM_CENTER_Z + 0.25;
    return (
      pos.x >= -half &&
      pos.x <= half &&
      pos.z >= midZ - half &&
      pos.z <= midZ + half
    );
  }

  function updateExplosionTimerDisplay() {
    if (!explosionTimerEl) return;
    explosionTimerEl.textContent = String(Math.max(0, Math.ceil(explosionTimeLeft)));
  }

  function startExplosionCountdown() {
    if (currentMapId !== "tutorial" || explosionDone || explosionCounting) return;
    explosionCounting = true;
    explosionTimeLeft = 10;
    document.body.classList.add("explosion-counting");
    if (explosionOverlayEl) explosionOverlayEl.hidden = false;
    updateExplosionTimerDisplay();
  }

  function updateExplosionCountdown(dt) {
    if (!explosionCounting) return;
    explosionTimeLeft -= dt;
    updateExplosionTimerDisplay();
    if (explosionTimeLeft <= 0) {
      explosionCounting = false;
      explosionDone = true;
      triggerExplosion();
    }
  }

  function resetPlayerDeathState() {
    playerDead = false;
    if (playerDeathTimer) {
      clearTimeout(playerDeathTimer);
      playerDeathTimer = null;
    }
  }

  function onPlayerDeath() {
    if (playerDead || !running) return;
    playerDead = true;

    if (window.ActionInventory && window.ActionInventory.close) {
      window.ActionInventory.close();
    }
    if (window.WorldLootBox && window.WorldLootBox.closeChestPanel) {
      window.WorldLootBox.closeChestPanel();
    }
    if (window.HiddenLootBox && window.HiddenLootBox.closeChestPanel) {
      window.HiddenLootBox.closeChestPanel();
    }
    if (window.WaitingHallLockbox && window.WaitingHallLockbox.closeChestPanel) {
      window.WaitingHallLockbox.closeChestPanel();
    }
    if (window.CollectionRoomChest && window.CollectionRoomChest.closeChestPanel) {
      window.CollectionRoomChest.closeChestPanel();
    }
    if (window.LockpickingQTE && window.LockpickingQTE.close) {
      window.LockpickingQTE.close();
    }
    if (document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock();
    }

    if (window.PlayerLoadout && window.PlayerLoadout.applyDeathDrop) {
      window.PlayerLoadout.applyDeathDrop();
    }
    if (window.PlayerStatePersist && window.PlayerStatePersist.save) {
      window.PlayerStatePersist.save();
    }
    if (window.ActionWeapon) window.ActionWeapon.dispose();

    showDurabilityBanner("你已死亡 · 除安全箱外物品已掉落");

    playerDeathTimer = setTimeout(function () {
      playerDeathTimer = null;
      exit({ clearLoadout: false });
      if (window.LobbyUI && window.LobbyUI.goHome) {
        window.LobbyUI.goHome();
      }
    }, 2200);
  }

  function removeBinRoomBackWall() {
    explodeWallIntoFragments();
  }

  function triggerExplosion() {
    document.body.classList.remove("explosion-counting");
    if (explosionOverlayEl) explosionOverlayEl.hidden = true;
    wallExploded = false;
    wallStrikeFallbackLeft = 3.5;
    if (isInBinRoom() && window.ActionHealth && window.ActionHealth.damage) {
      window.ActionHealth.damage(30);
      showDurabilityBanner("爆炸！未能及时离开搜刮间 · -30 血量");
    } else {
      showDurabilityBanner("导弹来袭 · 第一枚摧毁隔墙");
    }
    startMissileStrikeSequence();
  }

  function onChestOpened() {
    startExplosionCountdown();
  }

  function isInEvacZone() {
    var half = EVAC_ROOM_SIZE * 0.5;
    var minX = -half;
    var maxX = half;
    /* 与 buildEvacRoom 地板一致：中心 EVAC_ROOM_CENTER_Z + 0.25 */
    var minZ = EVAC_ROOM_START_Z + 0.25;
    var maxZ = EVAC_ROOM_START_Z + EVAC_ROOM_SIZE + 0.25;
    var closestX = pos.x < minX ? minX : pos.x > maxX ? maxX : pos.x;
    var closestZ = pos.z < minZ ? minZ : pos.z > maxZ ? maxZ : pos.z;
    var dx = pos.x - closestX;
    var dz = pos.z - closestZ;
    return dx * dx + dz * dz <= CAPSULE_RADIUS * CAPSULE_RADIUS;
  }

  function updateEvacTimerDisplay() {
    if (!evacCountdownEl) return;
    var n = Math.max(0, Math.ceil(evacTimeLeft));
    evacCountdownEl.textContent = String(n);
  }

  function cancelEvacCountdown() {
    if (!evacCounting) return;
    evacCounting = false;
    evacTimeLeft = 10;
    document.body.classList.remove("evac-counting");
    if (evacOverlayEl) evacOverlayEl.hidden = true;
    updateEvacTimerDisplay();
  }

  function tryStartEvacCountdown() {
    if (evacCounting) return;
    evacCounting = true;
    evacTimeLeft = 10;
    if (window.WorldLootBox && window.WorldLootBox.closeChestPanel) {
      window.WorldLootBox.closeChestPanel();
    }
    if (window.ActionInventory && window.ActionInventory.close) {
      window.ActionInventory.close();
    }
    if (window.LockpickingQTE && window.LockpickingQTE.isOpen()) {
      window.LockpickingQTE.close();
    }
    document.body.classList.add("evac-counting");
    if (evacOverlayEl) evacOverlayEl.hidden = false;
    updateEvacTimerDisplay();
  }

  /** 撤离区内倒计时；离开区域则取消，再次进入重新计 10 秒。 */
  function updateEvacZone(dt) {
    if (evacCounting) {
      if (isInEvacZone()) {
        updateEvacCountdown(dt);
      } else {
        cancelEvacCountdown();
      }
      return;
    }
    if (isInEvacZone()) {
      tryStartEvacCountdown();
    }
  }

  function updateEvacCountdown(dt) {
    if (!evacCounting) return;
    evacTimeLeft -= dt;
    updateEvacTimerDisplay();
    if (evacTimeLeft <= 0) {
      evacCounting = false;
      completeEvacToLobby();
    }
  }

  function completeEvacToLobby() {
    if (currentMapId === "tutorial") {
      if (window.TutorialProgress && window.TutorialProgress.markComplete) {
        window.TutorialProgress.markComplete();
      }
      if (window.LobbyUI && window.LobbyUI.selectMap) {
        window.LobbyUI.selectMap("test");
      }
    }
    if (window.LobbyUI && window.LobbyUI.syncActionHubButton) {
      window.LobbyUI.syncActionHubButton();
    }
    if (evacOverlayEl) evacOverlayEl.hidden = true;
    if (window.WorldLootBox && window.WorldLootBox.closeChestPanel) {
      window.WorldLootBox.closeChestPanel();
    }
    if (window.PlayerStatePersist && window.PlayerStatePersist.saveNow) {
      window.PlayerStatePersist.saveNow();
    }
    exit({ clearLoadout: false });
    if (window.LobbyUI && window.LobbyUI.goHome) {
      window.LobbyUI.goHome();
    }
  }

  function resetSecurityDoorState() {
    resetEvacState();
    doorUnlocked = false;
    if (currentMapId !== "tutorial") {
      setInteractHintVisible(false);
      return;
    }
    removeDoorColliders();
    securityDoorOpenCollider = null;
    ensureDoorColliders();
    if (securityDoorRoot && doorHomePosition) {
      securityDoorRoot.position.copy(doorHomePosition);
      setDoorOrange(securityDoorRoot);
    }
    setInteractHintVisible(false);
  }

  function clearInputKeys() {
    keys = Object.create(null);
    lookDragId = null;
    lookDidDrag = false;
    if (window.ActionWeapon && window.ActionWeapon.clearInput) {
      window.ActionWeapon.clearInput();
    }
    if (window.ActionJoystick && window.ActionJoystick.clear) {
      window.ActionJoystick.clear();
    }
  }

  function isTouchPrimaryDevice() {
    if (window.LobbyNet && window.LobbyNet.isMobileDevice) {
      return window.LobbyNet.isMobileDevice();
    }
    var ua = navigator.userAgent || "";
    if (
      /iPad/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    ) {
      return true;
    }
    if (/iPhone|iPod|Android|HarmonyOS|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
      return true;
    }
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: none) and (pointer: coarse)").matches
    ) {
      return true;
    }
    return (
      (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
      "ontouchstart" in window
    );
  }

  function shouldUseDragLook() {
    if (pointerLocked) return false;
    return isTouchPrimaryDevice();
  }

  function getLookSens() {
    return shouldUseDragLook() ? LOOK_SENS * MOBILE_LOOK_SENS_MULT : LOOK_SENS;
  }

  function applyLookDelta(dx, dy) {
    if (!dx && !dy) return;
    var sens = getLookSens();
    yaw -= dx * sens;
    pitch -= dy * sens;
    var maxPitch = Math.PI / 2 - 0.05;
    pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
  }

  function syncLookLayer() {
    if (!lookLayerEl) return;
    var show = running && shouldUseDragLook() && !isUiBlocking();
    lookLayerEl.hidden = !show;
    lookLayerEl.setAttribute("aria-hidden", show ? "false" : "true");
  }

  function mountLookLayer() {
    if (lookLayerEl || !actionRoot) return;
    lookLayerEl = document.createElement("div");
    lookLayerEl.className = "action-look-layer";
    lookLayerEl.id = "actionLookLayer";
    lookLayerEl.hidden = true;
    lookLayerEl.setAttribute("aria-hidden", "true");
    actionRoot.appendChild(lookLayerEl);

    lookLayerEl.addEventListener("pointerdown", onLookPointerDown);
    window.addEventListener("pointermove", onLookPointerMove);
    window.addEventListener("pointerup", onLookPointerUp);
    window.addEventListener("pointercancel", onLookPointerUp);
  }

  function onLookPointerDown(e) {
    if (!running || isUiBlocking() || !shouldUseDragLook()) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    ensureExplosionAudio();
    lookDragId = e.pointerId;
    lookLastX = e.clientX;
    lookLastY = e.clientY;
    lookDidDrag = false;
    if (lookLayerEl && lookLayerEl.setPointerCapture) {
      lookLayerEl.setPointerCapture(e.pointerId);
    }
    e.preventDefault();
  }

  function onLookPointerMove(e) {
    if (lookDragId !== e.pointerId) return;
    var dx = e.clientX - lookLastX;
    var dy = e.clientY - lookLastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) {
      lookDidDrag = true;
    }
    lookLastX = e.clientX;
    lookLastY = e.clientY;
    applyLookDelta(dx, dy);
    e.preventDefault();
  }

  function onLookPointerUp(e) {
    if (lookDragId === null || (e && e.pointerId !== lookDragId)) return;
    if (lookLayerEl && lookLayerEl.releasePointerCapture) {
      try {
        lookLayerEl.releasePointerCapture(lookDragId);
      } catch (err) { /* ignore */ }
    }
    lookDragId = null;
  }

  function getMoveAxes() {
    var forward = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    var strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    if (window.ActionJoystick) {
      var stick = window.ActionJoystick.getVector();
      if (stick.x || stick.y) {
        forward = stick.y;
        strafe = stick.x;
      }
    }
    return { forward: forward, strafe: strafe };
  }

  function hasMovementInput() {
    if (keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD) return true;
    if (window.ActionJoystick && window.ActionJoystick.isActive()) return true;
    return false;
  }

  /** 松开移动键后立刻停止走/跑（含 Shift） */
  function hardStopLocomotion() {
    keys.KeyW = false;
    keys.KeyS = false;
    keys.KeyA = false;
    keys.KeyD = false;
    keys.ShiftLeft = false;
    keys.ShiftRight = false;
  }

  function releaseKeyFromEvent(e) {
    keys[e.code] = false;
    if (e.key) keys[e.key] = false;
    if (!hasMovementInput()) {
      hardStopLocomotion();
    }
  }

  function orientDoorUpright(model) {
    var presets = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: Math.PI, z: 0 },
      { x: 0, y: Math.PI / 2, z: 0 },
      { x: 0, y: -Math.PI / 2, z: 0 },
      { x: Math.PI / 2, y: 0, z: 0 },
      { x: -Math.PI / 2, y: 0, z: 0 },
    ];
    var best = presets[0];
    var bestScore = -1e9;
    var i;
    for (i = 0; i < presets.length; i++) {
      var r = presets[i];
      model.rotation.set(r.x, r.y, r.z);
      model.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(model);
      var size = new THREE.Vector3();
      box.getSize(size);
      var score = 0;
      if (size.y >= size.x && size.y >= size.z) score += 60;
      if (size.z <= size.x * 0.35) score += 40;
      if (size.x >= 1.0 && size.x <= 2.5) score += 20;
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    model.rotation.set(best.x, best.y, best.z);
    model.updateMatrixWorld(true);
  }

  function placeSecurityDoor(model, parent) {
    var root = new THREE.Group();
    root.name = "SecurityDoor_GLB";
    root.add(model);

    model.scale.set(1, 1, 1);
    orientDoorUpright(model);
    root.updateMatrixWorld(true);
    fitModelToBox(root, DOOR_SIZE);
    fitModelToBox(root, DOOR_SIZE);

    var box = new THREE.Box3().setFromObject(root);
    var center = new THREE.Vector3();
    box.getCenter(center);
    root.position.set(
      -center.x,
      -box.min.y,
      DOOR_Z - 0.12 - center.z
    );

    enableShadows(root);
    parent.add(root);
    securityDoorRoot = root;
    doorHomePosition = root.position.clone();
    if (doorUnlocked) {
      setDoorGreen(securityDoorRoot);
      securityDoorRoot.position.x += DOOR_OPEN_OFFSET_X;
    } else {
      setDoorOrange(securityDoorRoot);
    }
  }

  function addDoorFallback(parent) {
    var mesh = addBox(
      parent,
      DOOR_SIZE.x,
      DOOR_SIZE.y,
      DOOR_SIZE.z,
      0,
      DOOR_SIZE.y * 0.5,
      DOOR_Z - 0.1,
      doorUnlocked ? 0x2ecc55 : 0xe87820,
      false
    );
    securityDoorRoot = mesh;
    doorHomePosition = mesh.position.clone();
  }

  function buildCorridorBeyondDoor(parent) {
    var midZ = DOOR_Z + CORRIDOR_LEN * 0.5 + 0.25;
    var wallX = CORRIDOR_W * 0.5 + 0.25;
    addBox(parent, CORRIDOR_W, 0.1, CORRIDOR_LEN, 0, 0.05, midZ, 0x5a5e64, false);
    addBox(
      parent,
      0.5,
      SECTOR_WALL_H,
      CORRIDOR_LEN,
      -wallX,
      SECTOR_WALL_H * 0.5,
      midZ,
      0x2e3338
    );
    addBox(
      parent,
      0.5,
      SECTOR_WALL_H,
      CORRIDOR_LEN,
      wallX,
      SECTOR_WALL_H * 0.5,
      midZ,
      0x2e3338
    );
  }

  /** 走廊与主围区之间的侧向空隙（封死，避免走出地图） */
  function buildCorridorSideSeals(parent) {
    var midZ = DOOR_Z + CORRIDOR_LEN * 0.5 + 0.25;
    var innerX = CORRIDOR_W * 0.5 + 0.25;
    var outerX = 6.25;
    var fillW = outerX - innerX;
    var fillCx = innerX + fillW * 0.5;
    addBox(
      parent,
      fillW,
      SECTOR_WALL_H,
      CORRIDOR_LEN,
      -fillCx,
      SECTOR_WALL_H * 0.5,
      midZ,
      0x2e3338
    );
    addBox(
      parent,
      fillW,
      SECTOR_WALL_H,
      CORRIDOR_LEN,
      fillCx,
      SECTOR_WALL_H * 0.5,
      midZ,
      0x2e3338
    );
  }

  /** 搜刮间与主围区之间的侧向空隙 */
  function buildBinRoomSideSeals(parent) {
    var midZ = BIN_ROOM_CENTER_Z + 0.25;
    var innerX = BIN_ROOM_SIZE * 0.5 + 0.25;
    var outerX = 6.25;
    var fillW = outerX - innerX;
    var fillCx = innerX + fillW * 0.5;
    addBox(
      parent,
      fillW,
      SECTOR_WALL_H,
      BIN_ROOM_SIZE,
      -fillCx,
      SECTOR_WALL_H * 0.5,
      midZ,
      0x2e3338
    );
    addBox(
      parent,
      fillW,
      SECTOR_WALL_H,
      BIN_ROOM_SIZE,
      fillCx,
      SECTOR_WALL_H * 0.5,
      midZ,
      0x2e3338
    );
  }

  /** 走廊出口两侧挡墙（搜刮间入口） */
  function buildBinRoomEntryWings(parent) {
    var wingZ = DOOR_Z + CORRIDOR_LEN + 0.25;
    var wingW = BIN_ROOM_SIZE * 0.5 - CORRIDOR_W * 0.5;
    var wingCx = CORRIDOR_W * 0.5 + wingW * 0.5;
    addBox(
      parent,
      wingW,
      SECTOR_WALL_H,
      0.5,
      -wingCx,
      SECTOR_WALL_H * 0.5,
      wingZ,
      0x2e3338
    );
    addBox(
      parent,
      wingW,
      SECTOR_WALL_H,
      0.5,
      wingCx,
      SECTOR_WALL_H * 0.5,
      wingZ,
      0x2e3338
    );
  }

  function buildBinRoomAtEnd(parent) {
    var midZ = BIN_ROOM_CENTER_Z + 0.25;
    var wallX = BIN_ROOM_SIZE * 0.5 + 0.25;

    addBox(parent, BIN_ROOM_SIZE, 0.1, BIN_ROOM_SIZE, 0, 0.05, midZ, 0x5a5e64, false);
    addBox(
      parent,
      0.5,
      SECTOR_WALL_H,
      BIN_ROOM_SIZE,
      -wallX,
      SECTOR_WALL_H * 0.5,
      midZ,
      0x2e3338
    );
    addBox(
      parent,
      0.5,
      SECTOR_WALL_H,
      BIN_ROOM_SIZE,
      wallX,
      SECTOR_WALL_H * 0.5,
      midZ,
      0x2e3338
    );
    buildBinRoomBackWall(parent);
    buildBinRoomSideSeals(parent);
    buildBinRoomEntryWings(parent);
  }

  /** 搜刮间与撤离走廊之间的完整隔墙（爆炸后拆除） */
  function buildBinRoomBackWall(parent) {
    var backZ = EVAC_CORRIDOR_START_Z + 0.25;
    var mesh = addBox(
      parent,
      BIN_ROOM_SIZE,
      SECTOR_WALL_H,
      0.5,
      0,
      SECTOR_WALL_H * 0.5,
      backZ,
      0x2e3338
    );
    mesh.name = "BinRoomBackWall";
    mesh.userData.isBinRoomBackWall = true;
    binRoomBackWallMeshes.push(mesh);
    if (colliders.length) {
      binRoomBackWallColliders.push(colliders[colliders.length - 1]);
    }
  }

  /** 宝箱后 10 m 撤离走廊 */
  function buildEvacCorridor(parent) {
    var midZ = EVAC_CORRIDOR_START_Z + EVAC_CORRIDOR_LEN * 0.5 + 0.25;
    var wallX = CORRIDOR_W * 0.5 + 0.25;
    addBox(
      parent,
      CORRIDOR_W,
      0.1,
      EVAC_CORRIDOR_LEN,
      0,
      0.05,
      midZ,
      0x5a5e64,
      false
    );
    addBox(
      parent,
      0.5,
      SECTOR_WALL_H,
      EVAC_CORRIDOR_LEN,
      -wallX,
      SECTOR_WALL_H * 0.5,
      midZ,
      0x2e3338
    );
    addBox(
      parent,
      0.5,
      SECTOR_WALL_H,
      EVAC_CORRIDOR_LEN,
      wallX,
      SECTOR_WALL_H * 0.5,
      midZ,
      0x2e3338
    );
  }

  function buildEvacCorridorSideSeals(parent) {
    var midZ = EVAC_CORRIDOR_START_Z + EVAC_CORRIDOR_LEN * 0.5 + 0.25;
    var innerX = CORRIDOR_W * 0.5 + 0.25;
    var outerX = 6.25;
    var fillW = outerX - innerX;
    var fillCx = innerX + fillW * 0.5;
    addBox(
      parent,
      fillW,
      SECTOR_WALL_H,
      EVAC_CORRIDOR_LEN,
      -fillCx,
      SECTOR_WALL_H * 0.5,
      midZ,
      0x2e3338
    );
    addBox(
      parent,
      fillW,
      SECTOR_WALL_H,
      EVAC_CORRIDOR_LEN,
      fillCx,
      SECTOR_WALL_H * 0.5,
      midZ,
      0x2e3338
    );
  }

  /** 撤离点 3×3 m */
  function buildEvacRoom(parent) {
    var midZ = EVAC_ROOM_CENTER_Z + 0.25;
    var wallX = EVAC_ROOM_SIZE * 0.5 + 0.25;
    var backZ = EVAC_ROOM_START_Z + EVAC_ROOM_SIZE + 0.25;
    addBox(
      parent,
      EVAC_ROOM_SIZE,
      0.1,
      EVAC_ROOM_SIZE,
      0,
      0.05,
      midZ,
      0x4a5e68,
      false
    );
    addBox(
      parent,
      0.5,
      SECTOR_WALL_H,
      EVAC_ROOM_SIZE,
      -wallX,
      SECTOR_WALL_H * 0.5,
      midZ,
      0x2e3338
    );
    addBox(
      parent,
      0.5,
      SECTOR_WALL_H,
      EVAC_ROOM_SIZE,
      wallX,
      SECTOR_WALL_H * 0.5,
      midZ,
      0x2e3338
    );
    addBox(
      parent,
      EVAC_ROOM_SIZE,
      SECTOR_WALL_H,
      0.5,
      0,
      SECTOR_WALL_H * 0.5,
      backZ,
      0x2e3338
    );
    buildEvacRoomSideSeals(parent);
  }

  function buildEvacRoomSideSeals(parent) {
    var midZ = EVAC_ROOM_CENTER_Z + 0.25;
    var innerX = EVAC_ROOM_SIZE * 0.5 + 0.25;
    var outerX = 6.25;
    var fillW = outerX - innerX;
    var fillCx = innerX + fillW * 0.5;
    addBox(
      parent,
      fillW,
      SECTOR_WALL_H,
      EVAC_ROOM_SIZE,
      -fillCx,
      SECTOR_WALL_H * 0.5,
      midZ,
      0x2e3338
    );
    addBox(
      parent,
      fillW,
      SECTOR_WALL_H,
      EVAC_ROOM_SIZE,
      fillCx,
      SECTOR_WALL_H * 0.5,
      midZ,
      0x2e3338
    );
  }

  /** 主围区侧墙延长到走廊+搜刮间+撤离区 */
  function buildSectorWallExtension(parent) {
    var extLen =
      CORRIDOR_LEN + BIN_ROOM_SIZE + EVAC_CORRIDOR_LEN + EVAC_ROOM_SIZE;
    var extMidZ = DOOR_Z + extLen * 0.5 + 0.25;
    addBox(
      parent,
      0.5,
      SECTOR_WALL_H,
      extLen,
      -6.25,
      SECTOR_WALL_H * 0.5,
      extMidZ,
      0x2e3338
    );
    addBox(
      parent,
      0.5,
      SECTOR_WALL_H,
      extLen,
      6.25,
      SECTOR_WALL_H * 0.5,
      extMidZ,
      0x2e3338
    );
  }

  function buildEndWallWithDoorGap(parent) {
    var segW = (12 - CORRIDOR_W) * 0.5;
    var segX = CORRIDOR_W * 0.5 + segW * 0.5;
    var wallY = SECTOR_WALL_H * 0.5;
    addBox(parent, segW, SECTOR_WALL_H, 0.5, -segX, wallY, DOOR_Z, 0x2e3338);
    addBox(parent, segW, SECTOR_WALL_H, 0.5, segX, wallY, DOOR_Z, 0x2e3338);
  }

  function buildSecurityDoor(parent) {
    registerDoorSwipeCollider(
      DOOR_SIZE.x,
      DOOR_SIZE.y,
      DOOR_SIZE.z + 0.15,
      0,
      DOOR_SIZE.y * 0.5,
      DOOR_Z - 0.08
    );

    loadGltfCached(
      DOOR_GLB_URL,
      function (gltf) {
        placeSecurityDoor(gltf.scene, parent);
      },
      function (err) {
        console.error("[ActionScene] 安全门模型加载失败", err);
        addDoorFallback(parent);
      }
    );
  }

  function showActionTopBanner(text, durationMs) {
    if (!durabilityBannerEl) return;
    durabilityBannerEl.textContent = text;
    durabilityBannerEl.hidden = false;
    if (durabilityBannerEl._hideTimer) {
      clearTimeout(durabilityBannerEl._hideTimer);
    }
    durabilityBannerEl._hideTimer = setTimeout(function () {
      durabilityBannerEl.hidden = true;
    }, durationMs == null ? 2000 : durationMs);
  }

  function showDurabilityBanner(remaining, max) {
    if (!durabilityBannerEl) return;
    if (max == null && typeof remaining === "string") {
      showActionTopBanner(remaining, 2800);
      return;
    }
    showActionTopBanner("房卡耐久 " + remaining + " / " + max, 2800);
  }

  function isNearSecurityDoor() {
    return (
      Math.abs(pos.x) < 2.2 &&
      pos.z >= DOOR_Z - 5.5 &&
      pos.z <= DOOR_Z + 0.8
    );
  }

  function setInteractHintVisible(show) {
    if (!interactHintEl) return;
    interactHintEl.hidden = !show;
    if (show && !doorUnlocked) {
      interactHintEl.textContent = formatInteractHint("靠近安全门 · 按 E 开门");
    }
  }

  function formatInteractHint(text) {
    if (!shouldUseDragLook()) return text;
    return text
      .replace(/准星对准[^·]*·\s*/g, "")
      .replace(/按\s*E\s*/g, "点词条");
  }

  function refreshInteractAim() {
    if (!camera) return;
    if (window.ActionWasteBin && window.ActionWasteBin.updateAim) {
      window.ActionWasteBin.updateAim(pos.x, pos.z, camera);
    }
    if (window.HiddenLootBox && window.HiddenLootBox.updateAim) {
      window.HiddenLootBox.updateAim(pos.x, pos.z, camera);
    }
    if (window.WaitingHallLockbox && window.WaitingHallLockbox.updateAim) {
      window.WaitingHallLockbox.updateAim(pos.x, pos.z, camera);
    }
    if (window.CollectionRoomChest && window.CollectionRoomChest.updateAim) {
      window.CollectionRoomChest.updateAim(pos.x, pos.z, camera);
    }
    if (window.WorldLootBox && window.WorldLootBox.updateAim) {
      window.WorldLootBox.updateAim(pos.x, pos.z, camera);
    }
  }

  function onInteractHintTap(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!interactHintEl || interactHintEl.hidden || !running || isUiBlocking()) return;
    e.preventDefault();
    e.stopPropagation();
    refreshInteractAim();
    tryInteract({ fromHint: true });
  }

  function tryInteract(opts) {
    if (!running || isUiBlocking()) return false;
    var relaxAim = !!(opts && opts.fromHint && shouldUseDragLook());
    if (currentMapId === "test") {
      if (tryOpenTestNorthIronGates()) {
        return true;
      }
      if (window.ActionDropLoot && window.ActionDropLoot.tryPickup(pos.x, pos.z)) {
        return true;
      }
      if (
        window.CollectionRoomFloorLoot &&
        window.CollectionRoomFloorLoot.tryPickup(pos.x, pos.z)
      ) {
        return true;
      }
      if (window.ActionWasteBin) {
        if (camera && window.ActionWasteBin.updateAim) {
          window.ActionWasteBin.updateAim(pos.x, pos.z, camera);
        }
        if (window.ActionWasteBin.tryOpenAimed(pos.x, pos.z)) {
          releasePointerForUi();
          return true;
        }
      }
      if (window.HiddenLootBox) {
        if (camera && window.HiddenLootBox.updateAim) {
          window.HiddenLootBox.updateAim(pos.x, pos.z, camera);
        }
        if (window.HiddenLootBox.tryInteract()) {
          releasePointerForUi();
          return true;
        }
      }
      if (window.WaitingHallLockbox) {
        if (camera && window.WaitingHallLockbox.updateAim) {
          window.WaitingHallLockbox.updateAim(pos.x, pos.z, camera);
        }
        if (
          window.WaitingHallLockbox.tryInteract() ||
          (relaxAim &&
            window.WaitingHallLockbox.tryInteractNear &&
            window.WaitingHallLockbox.tryInteractNear(pos.x, pos.z))
        ) {
          releasePointerForUi();
          return true;
        }
      }
      if (window.CollectionRoomChest) {
        if (camera && window.CollectionRoomChest.updateAim) {
          window.CollectionRoomChest.updateAim(pos.x, pos.z, camera);
        }
        if (window.CollectionRoomChest.tryStartLockpick()) {
          releasePointerForUi();
          return true;
        }
      }
      return false;
    }
    if (window.ActionDropLoot && window.ActionDropLoot.tryPickup(pos.x, pos.z)) {
      return true;
    }
    if (currentMapId === "tutorial" && window.WorldLootBox) {
      if (camera && window.WorldLootBox.updateAim) {
        window.WorldLootBox.updateAim(pos.x, pos.z, camera);
      }
      if (
        window.WorldLootBox.tryStartLockpick({ px: pos.x, pz: pos.z }) ||
        (relaxAim &&
          window.WorldLootBox.tryInteractNear &&
          window.WorldLootBox.tryInteractNear(pos.x, pos.z))
      ) {
        releasePointerForUi();
        return true;
      }
    }
    trySwipeDoor();
    return true;
  }

  /** 出生点已在搜刮间内时，视为门已刷开（避免门未解锁导致宝箱无法交互） */
  function syncTutorialAccessForSpawn() {
    if (currentMapId !== "tutorial") return;
    if (TUTORIAL_SPAWN.z >= DOOR_Z + CORRIDOR_LEN - 0.5) {
      unlockSecurityDoor();
    }
  }

  function unlockSecurityDoor() {
    if (doorUnlocked) return;
    doorUnlocked = true;
    removeDoorColliders();
    securityDoorOpenCollider = null;
    if (securityDoorRoot && doorHomePosition) {
      setDoorGreen(securityDoorRoot);
      securityDoorRoot.position.copy(doorHomePosition);
      securityDoorRoot.position.x += DOOR_OPEN_OFFSET_X;
      securityDoorOpenCollider = addColliderFromObject(securityDoorRoot, 0.06);
    }
    setInteractHintVisible(false);
  }

  function trySwipeDoor() {
    if (doorUnlocked) return;
    if (!isNearSecurityDoor()) return;
    unlockSecurityDoor();
  }

  function updateCrosshair() {
    if (!crosshairEl) return;
    var show =
      running &&
      pointerLocked &&
      !isUiBlocking() &&
      document.body.classList.contains("action-open");
    crosshairEl.classList.toggle("action-crosshair--hidden", !show);
    if (window.ActionWeapon && window.ActionWeapon.hasUziEquipped) {
      crosshairEl.classList.toggle(
        "action-crosshair--weapon",
        show && window.ActionWeapon.hasUziEquipped()
      );
    }
  }

  function updateInteractHints() {
    updateCrosshair();

    if (currentMapId === "test") {
      if (camera && window.ActionWasteBin) {
        window.ActionWasteBin.updateAim(pos.x, pos.z, camera);
        if (window.ActionWasteBin.isAimedAtBin()) {
          setInteractHintVisible(true);
          if (interactHintEl) {
            interactHintEl.textContent = formatInteractHint(
              "准星对准工业废料桶 · 按 E 翻找"
            );
          }
          return;
        }
      }
      if (camera && window.HiddenLootBox) {
        window.HiddenLootBox.updateAim(pos.x, pos.z, camera);
        if (
          !window.HiddenLootBox.isOpened() &&
          window.HiddenLootBox.isAimed()
        ) {
          setInteractHintVisible(true);
          if (interactHintEl) {
            interactHintEl.textContent = formatInteractHint(
              "准星对准隐秘藏品箱1 · 按 E 输入密码"
            );
          }
          return;
        }
        if (
          window.HiddenLootBox.isOpened() &&
          window.HiddenLootBox.isAimed() &&
          window.HiddenLootBox.playerNear(pos.x, pos.z)
        ) {
          setInteractHintVisible(true);
          if (interactHintEl) {
            interactHintEl.textContent = formatInteractHint(
              "按 E 查看隐秘藏品箱1"
            );
          }
          return;
        }
      }
      if (camera && window.WaitingHallLockbox) {
        window.WaitingHallLockbox.updateAim(pos.x, pos.z, camera);
        if (window.WaitingHallLockbox.isAimedAtChest()) {
          setInteractHintVisible(true);
          if (interactHintEl) {
            interactHintEl.textContent = formatInteractHint(
              window.WaitingHallLockbox.isOpened()
                ? "按 E 查看古董匣"
                : "按 E 打开古董匣"
            );
          }
          return;
        }
      }
      if (
        window.ActionDropLoot &&
        window.ActionDropLoot.shouldShowPickupHint(pos.x, pos.z)
      ) {
        setInteractHintVisible(true);
        if (interactHintEl) {
          interactHintEl.textContent = formatInteractHint("按 E 拾取丢下物");
        }
        return;
      }
      if (
        window.CollectionRoomFloorLoot &&
        window.CollectionRoomFloorLoot.shouldShowPickupHint(pos.x, pos.z)
      ) {
        setInteractHintVisible(true);
        if (interactHintEl) {
          interactHintEl.textContent = formatInteractHint("按 E 拾取");
        }
        return;
      }
      if (camera && window.CollectionRoomChest) {
        window.CollectionRoomChest.updateAim(pos.x, pos.z, camera);
        if (window.CollectionRoomChest.isAimedAtChest()) {
          setInteractHintVisible(true);
          if (interactHintEl) {
            interactHintEl.textContent = formatInteractHint("按 E 打开宝箱");
          }
          return;
        }
      }
      if (isNearTestNorthIronGates()) {
        setInteractHintVisible(true);
        if (interactHintEl) {
          interactHintEl.textContent = formatInteractHint(
            "靠近铁门 · 按 E 向内打开"
          );
        }
        return;
      }
      setInteractHintVisible(false);
      return;
    }

    if (currentMapId !== "tutorial") {
      setInteractHintVisible(false);
      return;
    }

    if (
      window.ActionDropLoot &&
      window.ActionDropLoot.shouldShowPickupHint(pos.x, pos.z)
    ) {
      setInteractHintVisible(true);
      if (interactHintEl) {
        interactHintEl.textContent = formatInteractHint("按 E 拾取丢下物");
      }
      return;
    }

    if (camera && canvas && window.WorldLootBox) {
      var relaxChestAim = shouldUseDragLook();
      window.WorldLootBox.updateAim(pos.x, pos.z, camera);
      if (
        !window.WorldLootBox.isOpened() &&
        window.WorldLootBox.shouldShowLockpickHint(
          pos.x,
          pos.z,
          relaxChestAim
        )
      ) {
        setInteractHintVisible(true);
        if (interactHintEl) {
          interactHintEl.textContent = formatInteractHint(
            relaxChestAim || window.WorldLootBox.isAimed()
              ? "靠近海盗宝箱 · 按 E 开锁"
              : "靠近宝箱 · 准星对准后按 E 开锁"
          );
        }
        return;
      }
      if (
        window.WorldLootBox.isOpened() &&
        window.WorldLootBox.shouldShowLockpickHint(
          pos.x,
          pos.z,
          relaxChestAim
        )
      ) {
        setInteractHintVisible(true);
        if (interactHintEl) {
          interactHintEl.textContent = formatInteractHint(
            "按 E 查看海盗宝箱"
          );
        }
        return;
      }
      if (explosionCounting) {
        setInteractHintVisible(true);
        if (interactHintEl) {
          interactHintEl.textContent =
            "爆炸倒计时 " +
            Math.max(0, Math.ceil(explosionTimeLeft)) +
            " 秒 · 请离开 5×5 搜刮间";
        }
        return;
      }
      if (evacCounting && isInEvacZone()) {
        setInteractHintVisible(true);
        if (interactHintEl) {
          interactHintEl.textContent =
            "撤离倒计时 " +
            Math.max(0, Math.ceil(evacTimeLeft)) +
            " 秒 · 离开区域将重置";
        }
        return;
      }
      if (isInEvacZone()) {
        setInteractHintVisible(true);
        if (interactHintEl) {
          interactHintEl.textContent = "进入撤离点 · 自动开始 10 秒倒计时";
        }
        return;
      }
      if (pos.z >= EVAC_CORRIDOR_START_Z + 1) {
        setInteractHintVisible(true);
        if (interactHintEl) {
          interactHintEl.textContent = "前方撤离走廊 · 进入 3×3 撤离点";
        }
        return;
      }
    }

    if (doorUnlocked) {
      setInteractHintVisible(false);
      return;
    }
    setInteractHintVisible(isNearSecurityDoor());
  }

  function detachObject3D(obj) {
    if (obj && obj.parent) obj.parent.remove(obj);
  }

  function disposeObject3D(root) {
    if (!root) return;
    root.traverse(function (child) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(function (mat) {
            mat.dispose();
          });
        } else {
          child.material.dispose();
        }
      }
    });
  }

  function teardownWorld() {
    if (window.WorldLootBox && window.WorldLootBox.destroyChest) {
      window.WorldLootBox.destroyChest();
    }
    if (backroomsHorror) {
      backroomsHorror.dispose();
      backroomsHorror = null;
    }
    if (backroomsL1Stream) {
      backroomsL1Stream.dispose();
      backroomsL1Stream = null;
    }
    backroomsL1Lights = [];
    if (worldRoot && scene) {
      scene.remove(worldRoot);
      disposeObject3D(worldRoot);
      worldRoot = null;
    }
    colliders = [];
    binRoomBackWallMeshes = [];
    binRoomBackWallColliders = [];
    wallExploded = false;
    wallStrikeFallbackLeft = 0;
    tacticalTruckRoot = null;
    clearExplosionEffects();
    securityDoorRoot = null;
    doorHomePosition = null;
    doorUnlocked = false;
    testNorthIronGates = null;
    testWaitingHall = null;
    testCollectionRoom = null;
    testNorthRearHouse = null;
    testNorthCatColliders = [];
    securityDoorOpenCollider = null;
    loadedMapId = null;
  }

  function applyMapBounds(mapId) {
    worldWrapEnabled = false;
    if (mapId === "test") {
      BOUNDS_X = 55;
      BOUNDS_Z_MIN = -55;
      var rearHouseBounds = getTestNorthRearHouseLayout();
      BOUNDS_Z_MAX = rearHouseBounds.centerZ + rearHouseBounds.halfD + 2.5;
      if (scene) {
        scene.fog = new THREE.Fog(0x8ecfff, 50, 245);
      }
      return;
    }
    if (mapId === "backrooms") {
      BOUNDS_X = 1e9;
      BOUNDS_Z_MIN = -1e9;
      BOUNDS_Z_MAX = 1e9;
      if (scene) {
        scene.fog = new THREE.Fog(0x1a252f, 6, 42);
      }
      return;
    }
    BOUNDS_X = TUTORIAL_BOUNDS_X;
    BOUNDS_Z_MIN = TUTORIAL_BOUNDS_Z_MIN;
    BOUNDS_Z_MAX = EVAC_ROOM_START_Z + EVAC_ROOM_SIZE + 0.35;
    if (scene) {
      scene.fog = new THREE.Fog(0x8ecfff, 35, 95);
    }
  }

  function updateMapNameDisplay() {
    if (!mapNameEl) return;
    if (currentMapId === "backrooms") {
      mapNameEl.textContent = "后室 Level 1";
      return;
    }
    mapNameEl.textContent = currentMapId === "test" ? "测试" : "新手教程";
  }

  /** 后室工业灯 — 非暴盲时段的日常微闪烁 */
  function runBackroomsL1MicroFlicker(now) {
    if (now >= backroomsL1FlickerAt) {
      backroomsL1FlickerUntil = now + 200;
      backroomsL1FlickerAt = now + 10000 + Math.random() * 20000;
    }
    var flickering = now < backroomsL1FlickerUntil;
    var i;
    for (i = 0; i < backroomsL1Lights.length; i++) {
      var f = backroomsL1Lights[i];
      var mul = flickering ? 0.08 + Math.random() * 0.35 : 1;
      f.light.intensity = f.baseIntensity * mul;
      f.panelMat.emissiveIntensity = f.baseEmissive * mul;
    }
  }

  /** 后室 Level 1 — 暴盲 + 量子宝箱（每帧在 tick 中调用） */
  function updateBackroomsHorrorSystems(nowMs) {
    if (!backroomsHorror || currentMapId !== "backrooms") {
      return { blackout: false };
    }
    return backroomsHorror.update(nowMs, pos.x, pos.z);
  }

  /** 构建后室 Level 1 工业仓库（原生 Box + 量子海盗宝箱） */
  function buildBackroomsLevel1(parent) {
    colliders = [];
    backroomsHorror = createBackroomsHorrorSystem({
      blackoutChance: BLACKOUT_CHANCE,
    });
    backroomsHorror.setFlickerHandler(runBackroomsL1MicroFlicker);

    var built = buildBackroomsLevel1World(parent, {
      horror: backroomsHorror,
      loadGltf: loadGltfCached,
      onWallCollider: function (c) {
        colliders.push({
          minX: c.minX,
          maxX: c.maxX,
          minY: 0,
          maxY: BACKROOMS_L1_HEIGHT,
          minZ: c.minZ,
          maxZ: c.maxZ,
        });
      },
      onWallColliderRemove: function (c) {
        var i;
        for (i = colliders.length - 1; i >= 0; i--) {
          var ci = colliders[i];
          if (
            ci.minX === c.minX &&
            ci.maxX === c.maxX &&
            ci.minZ === c.minZ &&
            ci.maxZ === c.maxZ
          ) {
            colliders.splice(i, 1);
            break;
          }
        }
      },
    });

    backroomsL1Stream = built;
    backroomsL1Lights = built.industrialLights;
    backroomsSpawn.x = built.spawnX;
    backroomsSpawn.z = built.spawnZ;
    backroomsHorror.resetSchedule(performance.now());
    backroomsL1FlickerAt = performance.now() + 8000;
  }

  function setPosHudVisible(show) {
    if (!posHudEl) return;
    posHudEl.hidden = !show;
  }

  function updatePosHud() {
    if (!posHudEl || !running) return;
    posHudEl.textContent =
      "X " +
      pos.x.toFixed(2) +
      " · Z " +
      pos.z.toFixed(2);
  }

  function loadWorldMap(mapId) {
    if (!scene) return;

    teardownWorld();
    applyMapBounds(mapId);

    worldRoot = new THREE.Group();
    worldRoot.name = "World_" + mapId;
    scene.add(worldRoot);

    if (mapId === "test") {
      buildTestMap(worldRoot);
    } else if (mapId === "backrooms") {
      buildBackroomsLevel1(worldRoot);
    } else {
      buildSectorZero(worldRoot);
    }

    loadedMapId = mapId;
    currentMapId = mapId;
    updateMapNameDisplay();

    if (window.ActionDropLoot && worldRoot) {
      window.ActionDropLoot.bindWorld(worldRoot, {
        loadGltfCached: loadGltfCached,
        fitModelToBox: fitModelToBox,
        fitModelUniformToBox: fitModelUniformToBox,
      });
    }
  }

  /** 测试地图 — S 形马路 + 沿路两侧包山 */
  function buildTestMap(parent) {
    colliders = [];
    var root = new THREE.Group();
    root.name = "TestMap_测试";
    parent.add(root);

    var grass = new THREE.Mesh(
      new THREE.PlaneGeometry(TEST_GRASS_W, TEST_GRASS_Z, 1, 1),
      makeGroundLambertMaterial(0x4a7c3f)
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, TEST_GRASS_Y, TEST_GRASS_Z_CENTER);
    grass.receiveShadow = true;
    root.add(grass);

    var edge = new THREE.Mesh(
      new THREE.PlaneGeometry(TEST_EDGE_W, TEST_EDGE_Z, 1, 1),
      makeGroundLambertMaterial(0x3d6634)
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(0, TEST_EDGE_Y, TEST_EDGE_Z_CENTER);
    root.add(edge);

    resetTestRoadSampleSets();
    var roadSamples = sampleTestRoadCurve(72);
    var branchSamples = sampleStraightRoad(
      TEST_BRANCH_ROAD.from.x,
      TEST_BRANCH_ROAD.from.z,
      TEST_BRANCH_ROAD.to.x,
      TEST_BRANCH_ROAD.to.z,
      30
    );
    var northBranchSamples = sampleStraightRoad(
      TEST_NORTH_BRANCH_ROAD.from.x,
      TEST_NORTH_BRANCH_ROAD.from.z,
      TEST_NORTH_BRANCH_ROAD.to.x,
      TEST_NORTH_BRANCH_ROAD.to.z,
      48
    );
    registerTestRoadSamples(roadSamples);
    registerTestRoadSamples(branchSamples);
    registerTestRoadSamples(northBranchSamples);
    buildTestMapMountains(root, roadSamples);
    buildTestMapRoad(root);
    buildTestMapStraightRoadBranch(root, branchSamples);
    buildTestMapStraightRoadBranch(root, northBranchSamples, {
      withMountains: false,
    });
    buildTestMapNorthEndGateWalls(root);
    buildTestMapNorthEndVerticalWalls(root);
    buildTestMapNorthEndIronGates(root);
    buildTestMapNorthEndCatSculptures(root);
    buildTestMapNorthWaitingHall(root);
    buildTestMapNorthCollectionRoom(root);
    buildTestMapNorthRearHouse(root);
    buildTestMapHiddenRoom(root);
    if (window.HiddenLootBox && window.HiddenLootBox.build) {
      window.HiddenLootBox.build(root, {
        registerCollider: registerCollider,
      });
    }
    if (window.ActionWasteBin) {
      var binFlank = getTestMapFirstBendBinFlank();
      window.ActionWasteBin.setBinPositions([
        {
          id: 0,
          x: binFlank.x,
          z: binFlank.z,
          label: "路边废料桶",
          aimY: 0.95,
        },
      ]);
      buildIndustrialWasteBins(root);
    }
  }

  /** 【新手教程】 — 与 Unity 生成器同规格 */
  function buildSectorZero(parent) {
    colliders = [];
    var root = new THREE.Group();
    root.name = "SectorZero_新手教程";
    parent.add(root);

    addBox(root, 12, 0.1, 60, 0, 0.05, 30, 0x5a5e64, false);
    addBox(root, 0.5, 3.5, 60, -6.25, 1.75, 30, 0x2e3338);
    addBox(root, 0.5, 3.5, 60, 6.25, 1.75, 30, 0x2e3338);
    buildTruck(root);

    buildConcreteBarriers(root);

    buildWoodenCrates(root);

    var floor = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshLambertMaterial({ color: 0x1a1c20 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.02, 30);
    root.add(floor);

    // 起点封口墙
    addBox(root, 12, SECTOR_WALL_H, 0.5, 0, SECTOR_WALL_H * 0.5, 0, 0x2e3338);
    buildEndWallWithDoorGap(root);
    buildCorridorBeyondDoor(root);
    buildCorridorSideSeals(root);
    buildSectorWallExtension(root);
    buildBinRoomAtEnd(root);
    buildEvacCorridor(root);
    buildEvacCorridorSideSeals(root);
    buildEvacRoom(root);
    buildSecurityDoor(root);
    if (window.WorldLootBox && window.WorldLootBox.build) {
      window.WorldLootBox.build(root, {
        loadGltfCached: loadGltfCached,
        fitModelToBox: fitModelToBox,
        fitModelUniformToBox: fitModelUniformToBox,
        registerCollider: registerCollider,
      });
    }
  }

  function cloudMaterial(opacity) {
    return new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: opacity,
      fog: false,
      depthWrite: false,
    });
  }

  /** 单朵云：随机组合球体 / 方块，多种造型 */
  function createCloud() {
    var cloud = new THREE.Group();
    var puffCount = 4 + Math.floor(Math.random() * 4);
    var i;
    for (i = 0; i < puffCount; i++) {
      var mat = cloudMaterial(0.78 + Math.random() * 0.18);
      var mesh;
      var sx = 1.2 + Math.random() * 2.8;
      var sy = 0.7 + Math.random() * 1.4;
      var sz = 1 + Math.random() * 2.2;
      if (Math.random() > 0.45) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(1, 10, 8),
          mat
        );
        var s = 0.9 + Math.random() * 1.1;
        mesh.scale.set(s * sx * 0.45, s * sy * 0.4, s * sz * 0.45);
      } else if (Math.random() > 0.5) {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
        mesh.scale.set(sx, sy, sz);
      } else {
        mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.7, 0.9, 1, 8),
          mat
        );
        mesh.scale.set(sx * 0.5, sy * 0.35, sz * 0.5);
        mesh.rotation.z = (Math.random() - 0.5) * 0.5;
      }
      mesh.position.set(
        (Math.random() - 0.5) * 4.5,
        (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 3
      );
      mesh.rotation.y = Math.random() * Math.PI;
      cloud.add(mesh);
    }
    cloud.userData.driftX = (Math.random() - 0.5) * 1.2;
    cloud.userData.driftZ = 0.15 + Math.random() * 0.55;
    cloud.userData.bobPhase = Math.random() * Math.PI * 2;
    cloud.userData.bobSpeed = 0.3 + Math.random() * 0.4;
    cloud.userData.baseY = 0;
    return cloud;
  }

  function buildSkyAndClouds(parent) {
    var skyColor = 0x4aabf5;
    var horizonColor = 0x8ecfff;
    parent.background = new THREE.Color(skyColor);
    parent.fog = new THREE.Fog(horizonColor, 35, 95);

    var cloudRoot = new THREE.Group();
    cloudRoot.name = "SkyClouds";
    parent.add(cloudRoot);
    clouds = [];

    var n = 22;
    var c;
    for (c = 0; c < n; c++) {
      var cl = createCloud();
      var spreadX = 70;
      cl.position.set(
        (Math.random() - 0.5) * spreadX,
        14 + Math.random() * 14,
        5 + Math.random() * 55
      );
      cl.userData.baseY = cl.position.y;
      cl.userData.wrapX = spreadX * 0.5;
      cl.userData.wrapZMin = -5;
      cl.userData.wrapZMax = 68;
      cloudRoot.add(cl);
      clouds.push(cl);
    }
  }

  function updateClouds(dt, time) {
    var i;
    for (i = 0; i < clouds.length; i++) {
      var cl = clouds[i];
      var ud = cl.userData;
      cl.position.x += ud.driftX * dt;
      cl.position.z += ud.driftZ * dt;
      cl.position.y =
        ud.baseY + Math.sin(time * ud.bobSpeed + ud.bobPhase) * 0.35;

      if (cl.position.x > ud.wrapX) cl.position.x = -ud.wrapX;
      if (cl.position.x < -ud.wrapX) cl.position.x = ud.wrapX;
      if (cl.position.z > ud.wrapZMax) {
        cl.position.z = ud.wrapZMin + (cl.position.z - ud.wrapZMax);
      }
    }
  }

  function handMaterial(color) {
    return new THREE.MeshLambertMaterial({ color: color, fog: false });
  }

  function addHandBox(parent, w, h, d, x, y, z, mat) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  function createHand(isLeft) {
    var root = new THREE.Group();
    var side = isLeft ? -1 : 1;
    var skin = handMaterial(0xc9956e);
    var glove = handMaterial(0x2c3848);
    var gloveHi = handMaterial(0x3a4a5c);

    addHandBox(root, 0.11, 0.2, 0.1, 0, -0.06, 0.02, glove).rotation.x = 0.35;
    addHandBox(root, 0.14, 0.1, 0.08, 0, 0.06, 0.04, gloveHi);
    addHandBox(root, 0.05, 0.04, 0.06, side * 0.07, 0.05, 0.02, skin);

    var f;
    for (f = 0; f < 4; f++) {
      addHandBox(
        root,
        0.028,
        0.09,
        0.034,
        side * (-0.045 + f * 0.03),
        0.11,
        0.06,
        glove
      );
    }
    addHandBox(root, 0.034, 0.055, 0.038, side * 0.09, 0.07, 0.02, glove);

    var base = isLeft ? HAND_BASE.left : HAND_BASE.right;
    root.position.set(base.x, base.y, base.z);
    root.rotation.set(base.rx, base.ry, base.rz);
    return root;
  }

  function createUnityCapsule() {
    var geo;
    if (typeof THREE.CapsuleGeometry === "function") {
      geo = new THREE.CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_CYL_LEN, 12, 24);
    } else {
      geo = new THREE.CylinderGeometry(
        CAPSULE_RADIUS,
        CAPSULE_RADIUS,
        CAPSULE_HEIGHT,
        16
      );
    }
    var mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0xc8c8c8,
        roughness: 0.45,
        metalness: 0.05,
      })
    );
    mesh.position.y = CAPSULE_HEIGHT / 2;
    mesh.visible = false;
    return mesh;
  }

  function mountActionWeapon() {
    if (!window.ActionWeapon || !camera) return;
    window.ActionWeapon.mount(camera, canvas, {
      loadGltfCached: loadGltfCached,
      prepareFpsViewModel: prepareFpsViewModel,
      fitModelToBox: fitModelToBox,
      getArmsRoot: function () {
        return fpsArmsRoot;
      },
      getHandAnchor: function () {
        return {
          x: 0,
          y: (HAND_BASE.left.y + HAND_BASE.right.y) * 0.5,
          z: (HAND_BASE.left.z + HAND_BASE.right.z) * 0.5,
        };
      },
    });
  }

  function initScene() {
    if (typeof THREE === "undefined") {
      showLoadError("Three.js 未加载。");
      return false;
    }

    if (scene && ready) {
      loadWorldMap(currentMapId);
      return true;
    }

    if (scene) return true;

    try {
      scene = new THREE.Scene();
      buildSkyAndClouds(scene);

      player = new THREE.Group();
      scene.add(player);

      bodyCapsule = createUnityCapsule();
      player.add(bodyCapsule);

      camera = new THREE.PerspectiveCamera(72, 1, 0.01, 120);
      camera.position.set(0, bodyHeightCurrent * EYE_RATIO, 0);
      camera.rotation.order = "YXZ";
      player.add(camera);

      leftHand = createHand(true);
      rightHand = createHand(false);
      leftHand.renderOrder = 10;
      rightHand.renderOrder = 10;
      camera.add(leftHand);
      camera.add(rightHand);
      loadFpsArms(camera);

      mountActionWeapon();

      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      scene.add(new THREE.AmbientLight(0xe8f4ff, 0.72));
      var sun = new THREE.DirectionalLight(0xfffaf0, 1.05);
      sun.position.set(25, 50, 15);
      scene.add(sun);
      var hemi = new THREE.HemisphereLight(0x87ceeb, 0x5a5e64, 0.45);
      scene.add(hemi);

      loadWorldMap(currentMapId);

      hideLoadError();
      ready = true;
      return true;
    } catch (err) {
      console.error(err);
      showLoadError(err.message || String(err));
      return false;
    }
  }

  function resize() {
    if (!renderer || !camera) return;
    var w = actionRoot.clientWidth || window.innerWidth;
    var h = actionRoot.clientHeight || window.innerHeight;
    if (w < 1 || h < 1) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function wantsCrouchInput() {
    if (keys.KeyC) return true;
    return !!(
      window.ActionJoystick &&
      window.ActionJoystick.isCrouchHeld &&
      window.ActionJoystick.isCrouchHeld()
    );
  }

  function updateCrouch(dt) {
    var wantsCrouch = wantsCrouchInput();
    var targetH = wantsCrouch ? CROUCH_HEIGHT : STAND_HEIGHT;
    var t = Math.min(1, CROUCH_LERP * dt);
    bodyHeightCurrent += (targetH - bodyHeightCurrent) * t;
    if (Math.abs(bodyHeightCurrent - targetH) < 0.008) {
      bodyHeightCurrent = targetH;
    }
    camera.position.y = bodyHeightCurrent * EYE_RATIO;
    if (bodyCapsule) {
      bodyCapsule.position.y = bodyHeightCurrent / 2;
      var sy = bodyHeightCurrent / STAND_HEIGHT;
      bodyCapsule.scale.set(1, sy, 1);
    }
  }

  function isCrouching() {
    return bodyHeightCurrent < STAND_HEIGHT - 0.05;
  }

  function updatePlayerTransform() {
    player.position.set(pos.x, pos.y, pos.z);
    player.rotation.y = yaw;
    camera.rotation.x = pitch;
  }

  /** 24×24 迷宫边界包抄 — 同一帧内瞬移 pos，再统一 updatePlayerTransform，避免摄像机抖动 */
  function applyWorldWrap() {
    if (!worldWrapEnabled) return;
    if (pos.x > WORLD_WRAP_HALF) pos.x = -WORLD_WRAP_HALF;
    else if (pos.x < -WORLD_WRAP_HALF) pos.x = WORLD_WRAP_HALF;
    if (pos.z > WORLD_WRAP_HALF) pos.z = -WORLD_WRAP_HALF;
    else if (pos.z < -WORLD_WRAP_HALF) pos.z = WORLD_WRAP_HALF;
  }

  function clampPosition() {
    if (currentMapId === "backrooms") return;
    if (worldWrapEnabled) {
      applyWorldWrap();
      return;
    }
    pos.x = Math.max(-BOUNDS_X, Math.min(BOUNDS_X, pos.x));
    pos.z = Math.max(BOUNDS_Z_MIN, Math.min(BOUNDS_Z_MAX, pos.z));
  }

  /** 仅当玩家身高与碰撞盒在 Y 上重叠时，才参与 XZ 阻挡（天花板不再当隐形墙） */
  function colliderOverlapsPlayerY(c, feetY, headY, pad) {
    pad = pad == null ? 0.04 : pad;
    return headY + pad > c.minY && feetY - pad < c.maxY;
  }

  /** 薄顶棚只顶头，不参与 XZ 推开（否则贴墙跳跃会被横向挤出房间） */
  function isCeilingOnlyCollider(c) {
    return c.minY >= CEILING_COLLIDE_MIN_Y && c.maxY - c.minY < 0.3;
  }

  var LOS_FLOOR_SKIP_MAX_Y = 0.22;

  /** 射线与轴对齐盒最近进入距离；无交返回 null */
  function rayAabbHitDistance(ox, oy, oz, dx, dy, dz, box) {
    var tmin = -Infinity;
    var tmax = Infinity;
    var t1;
    var t2;
    var tmp;

    if (Math.abs(dx) < 1e-8) {
      if (ox < box.minX || ox > box.maxX) return null;
    } else {
      t1 = (box.minX - ox) / dx;
      t2 = (box.maxX - ox) / dx;
      if (t1 > t2) {
        tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
    }

    if (Math.abs(dy) < 1e-8) {
      if (oy < box.minY || oy > box.maxY) return null;
    } else {
      t1 = (box.minY - oy) / dy;
      t2 = (box.maxY - oy) / dy;
      if (t1 > t2) {
        tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
    }

    if (Math.abs(dz) < 1e-8) {
      if (oz < box.minZ || oz > box.maxZ) return null;
    } else {
      t1 = (box.minZ - oz) / dz;
      t2 = (box.maxZ - oz) / dz;
      if (t1 > t2) {
        tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
    }

    if (tmax < 0 || tmin > tmax) return null;
    return Math.max(0, tmin);
  }

  /** 玩家视线到目标点是否被墙体/家具碰撞盒挡住（防穿墙交互） */
  function hasLineOfSight(px, feetY, pz, tx, ty, tz, margin) {
    margin = margin == null ? 0.42 : margin;
    var eyeY = feetY + bodyHeightCurrent * EYE_RATIO;
    var dx = tx - px;
    var dy = ty - eyeY;
    var dz = tz - pz;
    var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 0.08) return true;

    dx /= dist;
    dy /= dist;
    dz /= dist;

    var limit = dist - margin;
    if (limit <= 0) return true;

    var i;
    var c;
    var t;
    var pad = 0.12;
    for (i = 0; i < colliders.length; i++) {
      c = colliders[i];
      if (c.maxY < LOS_FLOOR_SKIP_MAX_Y) continue;
      if (
        tx >= c.minX - pad &&
        tx <= c.maxX + pad &&
        ty >= c.minY - pad &&
        ty <= c.maxY + pad &&
        tz >= c.minZ - pad &&
        tz <= c.maxZ + pad
      ) {
        continue;
      }
      t = rayAabbHitDistance(px, eyeY, pz, dx, dy, dz, c);
      if (t != null && t < limit) return false;
    }
    return true;
  }

  /** 圆柱体（XZ）与轴对齐盒分离 — 用于卡车 / 水泥墙 / 木箱 */
  function pushOutCircleAABB(px, pz, radius, box) {
    var closestX = Math.max(box.minX, Math.min(px, box.maxX));
    var closestZ = Math.max(box.minZ, Math.min(pz, box.maxZ));
    var dx = px - closestX;
    var dz = pz - closestZ;
    var distSq = dx * dx + dz * dz;
    var r2 = radius * radius;

    if (distSq > r2) {
      return { x: px, z: pz };
    }

    if (distSq > 1e-8) {
      var dist = Math.sqrt(distSq);
      var push = radius - dist;
      return {
        x: px + (dx / dist) * push,
        z: pz + (dz / dist) * push,
      };
    }

    var penL = px + radius - box.minX;
    var penR = box.maxX - (px - radius);
    var penB = pz + radius - box.minZ;
    var penF = box.maxZ - (pz - radius);
    var minPen = Math.min(penL, penR, penB, penF);

    if (minPen === penL) px -= penL;
    else if (minPen === penR) px += penR;
    else if (minPen === penB) pz -= penB;
    else pz += penF;

    return { x: px, z: pz };
  }

  function resolvePositionY() {
    var radius = CAPSULE_RADIUS;
    var px = pos.x;
    var pz = pos.z;
    var feetY = pos.y;
    var headY = pos.y + bodyHeightCurrent;
    var pad = 0.03;
    var i;
    var c;

    for (i = 0; i < colliders.length; i++) {
      c = colliders[i];
      if (c.minY < CEILING_COLLIDE_MIN_Y) continue;
      if (
        px + radius < c.minX ||
        px - radius > c.maxX ||
        pz + radius < c.minZ ||
        pz - radius > c.maxZ
      ) {
        continue;
      }
      if (headY <= c.minY + pad) continue;
      if (feetY >= c.maxY) continue;
      pos.y = c.minY - pad - bodyHeightCurrent;
      if (velY > 0) velY = 0;
    }
  }

  function resolvePositionXZ() {
    var radius = CAPSULE_RADIUS;
    var px = pos.x;
    var pz = pos.z;
    var feetY = pos.y;
    var headY = pos.y + bodyHeightCurrent;
    var iter;
    var i;
    var c;
    var out;
    var moved;

    var nearPad = 10;

    for (iter = 0; iter < 8; iter++) {
      moved = false;
      for (i = 0; i < colliders.length; i++) {
        c = colliders[i];
        if (
          px + radius < c.minX - nearPad ||
          px - radius > c.maxX + nearPad ||
          pz + radius < c.minZ - nearPad ||
          pz - radius > c.maxZ + nearPad
        ) {
          continue;
        }
        if (!colliderOverlapsPlayerY(c, feetY, headY)) continue;
        if (isCeilingOnlyCollider(c)) continue;
        if (c.maxY < LOS_FLOOR_SKIP_MAX_Y) continue;
        out = pushOutCircleAABB(px, pz, radius, c);
        if (out.x !== px || out.z !== pz) {
          px = out.x;
          pz = out.z;
          moved = true;
        }
      }
      if (!moved) break;
    }

    pos.x = px;
    pos.z = pz;
  }

  function getStaminaSegments() {
    if (window.ActionJoystick && window.ActionJoystick.getStamina) {
      return window.ActionJoystick.getStamina();
    }
    return 10;
  }

  function wantsSprint() {
    if (keys.ShiftLeft || keys.ShiftRight) return true;
    if (window.ActionJoystick && window.ActionJoystick.isSprintRequested) {
      return window.ActionJoystick.isSprintRequested();
    }
    return false;
  }

  function isActuallySprinting(moving) {
    if (!moving || wantsCrouchInput() || isCrouching()) return false;
    if (!wantsSprint()) return false;
    if (getStaminaSegments() <= 0) return false;
    return true;
  }

  function updateStamina(dt, moving) {
    if (!window.ActionJoystick || !window.ActionJoystick.setStamina) return;
    if (!isActuallySprinting(moving)) {
      staminaDrainAcc = 0;
      return;
    }
    staminaDrainAcc += dt;
    while (staminaDrainAcc >= STAMINA_DRAIN_SEC && getStaminaSegments() > 0) {
      staminaDrainAcc -= STAMINA_DRAIN_SEC;
      window.ActionJoystick.setStamina(getStaminaSegments() - 1);
    }
  }

  function getMoveSpeed(moving) {
    if (wantsCrouchInput() || isCrouching()) return CROUCH_SPEED;
    if (moving && isActuallySprinting(moving)) return SPRINT_SPEED;
    return WALK_SPEED;
  }

  function tryJump() {
    if (grounded && !isCrouching() && !wantsCrouchInput()) {
      velY = JUMP_SPEED;
      grounded = false;
    }
  }

  function updatePhysics(dt) {
    velY -= GRAVITY * dt;
    pos.y += velY * dt;
    if (pos.y <= 0) {
      pos.y = 0;
      velY = 0;
      grounded = true;
    }
  }

  function updateHands(dt, moving) {
    animTime += dt;
    var bob = moving ? Math.sin(animTime * 11) * 0.035 : 0;
    var sway = moving ? Math.cos(animTime * 11) * 0.025 : 0;
    var jumpTuck = grounded ? 0 : Math.min(Math.max(-velY * 0.018, -0.06), 0.14);

    function applyHand(hand, base, phase) {
      if (!hand) return;
      hand.position.x = base.x + sway * phase * 0.4;
      hand.position.y = base.y - bob * phase + jumpTuck;
      hand.position.z = base.z + (grounded ? 0 : jumpTuck * 1.2);
      hand.rotation.x = base.rx + bob * 0.5 * phase;
      hand.rotation.z = base.rz + sway * phase;
    }

    if (window.ActionWeapon && window.ActionWeapon.hasUziEquipped()) {
      return;
    }

    if (fpsArmsRoot) {
      fpsArmsRoot.position.x = fpsArmsAlignX + sway * 0.1;
      fpsArmsRoot.position.y = fpsArmsRestY - bob * 0.75 + jumpTuck;
      fpsArmsRoot.position.z =
        fpsArmsRestZ + (grounded ? 0 : jumpTuck * 1.05);
      fpsArmsRoot.rotation.x = bob * 0.3;
      fpsArmsRoot.rotation.y = 0;
      fpsArmsRoot.rotation.z = sway * 0.22;
      return;
    }

    applyHand(leftHand, HAND_BASE.left, 1);
    applyHand(rightHand, HAND_BASE.right, -1);
  }

  function isInventoryOpen() {
    return window.ActionInventory && window.ActionInventory.isOpen();
  }

  function isUiBlocking() {
    return (
      isInventoryOpen() ||
      (window.LockpickingQTE && window.LockpickingQTE.isOpen()) ||
      (window.WorldLootBox && window.WorldLootBox.isPanelOpen()) ||
      (window.HiddenLootBox && window.HiddenLootBox.isPuzzleOpen()) ||
      (window.HiddenLootBox && window.HiddenLootBox.isPanelOpen()) ||
      (window.WaitingHallLockbox && window.WaitingHallLockbox.isPanelOpen()) ||
      (window.CollectionRoomChest && window.CollectionRoomChest.isPanelOpen()) ||
      (window.ActionWasteBin && window.ActionWasteBin.isOpen())
    );
  }

  function releasePointerForUi() {
    if (document.pointerLockElement === canvas && document.exitPointerLock) {
      document.exitPointerLock();
    }
    pointerLocked = false;
    document.body.classList.add("show-cursor");
    setHintVisible(false);
  }

  function restoreGameCursor() {
    document.body.classList.remove("show-cursor");
  }

  function toggleInventory() {
    if (!window.ActionInventory) return;
    window.ActionInventory.toggle();
  }

  function onInventoryOpened() {
    clearInputKeys();
    releasePointerForUi();
    syncLookLayer();
    if (window.ActionWeapon) window.ActionWeapon.sync();
  }

  function onInventoryClosed() {
    restoreGameCursor();
    syncLookLayer();
    if (running && !pointerLocked) {
      setHintVisible(true);
    }
  }

  function tick() {
    if (!running) return;
    if (playerDead) {
      animId = requestAnimationFrame(tick);
      if (renderer && scene && camera) {
        renderer.render(scene, camera);
      }
      return;
    }
    animId = requestAnimationFrame(tick);
    var dt = Math.min(clock.getDelta(), 0.05);

    updateTestNorthIronGates(dt);
    updateTestNorthSideRooms();
    updateSecurityDoorOpenCollider();

    if (doorUnlocked) {
      updateEvacZone(dt);
    }

    if (explosionCounting) {
      updateExplosionCountdown(dt);
    }

    if (hasExplosionEffects()) {
      updateExplosionEffects(dt);
    }

    if (isUiBlocking()) {
      if (window.ActionJoystick) window.ActionJoystick.setBlocked(true);
      if (window.LockpickingQTE && window.LockpickingQTE.isOpen()) {
        window.LockpickingQTE.update(dt);
      }
      updatePlayerTransform();
      renderer.render(scene, camera);
      return;
    }

    if (window.ActionJoystick) window.ActionJoystick.setBlocked(false);

    var move = getMoveAxes();
    var forward = move.forward;
    var strafe = move.strafe;
    var moving = !!(forward || strafe);
    updateStamina(dt, moving);
    var speed = moving ? getMoveSpeed(moving) : 0;

    if (moving && speed > 0) {
      var sinY = Math.sin(yaw);
      var cosY = Math.cos(yaw);
      pos.x += (cosY * strafe - sinY * forward) * speed * dt;
      pos.z += (-cosY * forward - sinY * strafe) * speed * dt;
      resolvePositionXZ();
    }

    updatePhysics(dt);
    resolvePositionY();
    resolvePositionXZ();
    clampPosition();
    if (currentMapId === "backrooms") {
      if (backroomsL1Stream) backroomsL1Stream.update(pos.x, pos.z);
      updateBackroomsHorrorSystems(performance.now());
    }
    updateCrouch(dt);
    updatePlayerTransform();
    updateHands(dt, moving);
    if (pos.z < EVAC_ROOM_START_Z + EVAC_ROOM_SIZE + 2 || currentMapId === "test") {
      updateClouds(dt, animTime);
    }
    updateInteractHints();
    updatePosHud();

    if (window.LockpickingQTE && window.LockpickingQTE.isOpen()) {
      window.LockpickingQTE.update(dt);
    }

    if (window.ActionWeapon) {
      window.ActionWeapon.update(
        dt,
        {
          bob: moving ? Math.sin(animTime * 11) * 0.035 : 0,
          sway: moving ? Math.cos(animTime * 11) * 0.025 : 0,
          jumpTuck: grounded ? 0 : Math.min(Math.max(-velY * 0.018, -0.06), 0.14),
          grounded: grounded,
        },
        {
          pointerLocked: pointerLocked,
          uiBlocking: isUiBlocking(),
          running: running,
        }
      );
      pitch += window.ActionWeapon.consumeRecoilPitch();
      var maxPitch = Math.PI / 2 - 0.05;
      pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
    }

    renderer.render(scene, camera);
  }

  function resetPlayer() {
    yaw = 0;
    pitch = -0.08;
    if (currentMapId === "test") {
      pos.x = TEST_SPAWN.x;
      pos.y = 0;
      pos.z = TEST_SPAWN.z;
      resolvePositionXZ();
      clampPosition();
    } else if (currentMapId === "backrooms") {
      pos.x = backroomsSpawn.x;
      pos.y = 0;
      pos.z = backroomsSpawn.z;
      resolvePositionXZ();
      clampPosition();
    } else {
      pos.x = TUTORIAL_SPAWN.x;
      pos.y = TUTORIAL_SPAWN.y;
      pos.z = TUTORIAL_SPAWN.z;
      syncTutorialAccessForSpawn();
    }
    velY = 0;
    grounded = true;
    animTime = 0;
    staminaDrainAcc = 0;
    resetPlayerDeathState();
    if (window.ActionHealth && window.ActionHealth.reset) {
      window.ActionHealth.reset();
    }
    if (window.ActionJoystick && window.ActionJoystick.resetStamina) {
      window.ActionJoystick.resetStamina();
    }
    bodyHeightCurrent = STAND_HEIGHT;
    if (player) {
      updatePlayerTransform();
      camera.position.y = EYE_HEIGHT_STAND;
    }
  }

  function startLoop() {
    if (!initScene()) return;
    running = true;
    setPosHudVisible(true);
    updatePosHud();
    clock.start();
    resize();
    tick();
  }

  function stopLoop() {
    running = false;
    setPosHudVisible(false);
    if (animId) {
      cancelAnimationFrame(animId);
      animId = 0;
    }
  }

  function setHintVisible(show) {
    if (!hintEl) return;
    hintEl.classList.toggle("action-scene__hint--hidden", !show);
  }

  function requestLock() {
    if (canvas && canvas.requestPointerLock) {
      canvas.requestPointerLock();
    }
  }

  function finishEnterAfterPreload() {
    enterInProgress = false;
    hideEnterLoading();
    hideLoadError();

    actionRoot.hidden = false;
    if (window.LobbyUI && window.LobbyUI.hidePanelsForAction) {
      window.LobbyUI.hidePanelsForAction();
    } else {
      document.body.classList.remove(
        "room-open",
        "stash-open",
        "tutorial-open",
        "map-open"
      );
    }
    document.body.classList.add("action-open");
    document.body.classList.remove("hub-home");

    if (!initScene()) {
      showLoadError("3D 场景初始化失败，请刷新页面重试。");
      return;
    }

    mountActionWeapon();
    startLoop();
    resetPlayer();
    if (window.ActionWeapon) {
      window.ActionWeapon.sync();
      requestAnimationFrame(function () {
        if (window.ActionWeapon) window.ActionWeapon.sync();
      });
    }
    setWeaponHint();
    setHintVisible(true);
    if (window.ActionHealth) window.ActionHealth.show();
    if (window.ActionJoystick) window.ActionJoystick.show();
    mountLookLayer();
    syncLookLayer();

    requestAnimationFrame(function () {
      resize();
      if (shouldUseDragLook()) {
        document.body.classList.add("show-cursor");
      } else {
        requestLock();
      }
    });

    if (window.LobbyNet && window.LobbyNet.startSessionProbe) {
      window.LobbyNet.startSessionProbe();
    }
  }

  function isOfflinePlay() {
    return !!(
      window.LobbyNet &&
      window.LobbyNet.isLoggedIn &&
      !window.LobbyNet.isLoggedIn()
    );
  }

  function resolveDefaultMapId() {
    if (isOfflinePlay()) return "tutorial";
    if (window.TutorialProgress && window.TutorialProgress.isComplete()) {
      if (window.LobbyUI && window.LobbyUI.getSelectedMapId) {
        return window.LobbyUI.getSelectedMapId();
      }
      return "test";
    }
    return "tutorial";
  }

  function normalizeMapId(mapId) {
    if (isOfflinePlay()) return "tutorial";
    if (!window.TutorialProgress || !window.TutorialProgress.isComplete()) {
      return "tutorial";
    }
    if (mapId === "tutorial") {
      if (window.LobbyUI && window.LobbyUI.getSelectedMapId) {
        return window.LobbyUI.getSelectedMapId();
      }
      return "test";
    }
    if (mapId === "test") return "test";
    if (window.LobbyUI && window.LobbyUI.getSelectedMapId) {
      return window.LobbyUI.getSelectedMapId();
    }
    return "test";
  }

  function withPlayCheck(callback) {
    var net = window.LobbyNet;
    if (net && net.isLoggedIn && !net.isLoggedIn()) {
      if (net.canPlayOfflineTutorial && net.canPlayOfflineTutorial()) {
        callback();
        return;
      }
      if (net.handlePlayBlocked) {
        net.handlePlayBlocked(net.getBlockMessage && net.getBlockMessage());
      }
      return;
    }

    if (net && net.assertCanPlay) {
      net.assertCanPlay(function (ok, msg) {
        if (!ok) {
          if (net.handlePlayBlocked) {
            net.handlePlayBlocked(msg);
          } else if (window.LobbyUI) {
            if (msg) {
              var joinError = document.getElementById("joinError");
              if (joinError) joinError.textContent = msg;
            }
            window.LobbyUI.openRoom();
            if (window.LobbyUI.shakeRoomBtn) window.LobbyUI.shakeRoomBtn();
          }
          return;
        }
        callback();
      });
      return;
    }

    if (
      window.LobbyUI &&
      window.LobbyUI.requireLogin &&
      !window.LobbyUI.requireLogin("未注册不能玩")
    ) {
      return;
    }

    callback();
  }

  function startEnter(mapId) {
    var net = window.LobbyNet;
    if (net && net.isLoggedIn && !net.isLoggedIn()) {
      if (net.canPlayOfflineTutorial && !net.canPlayOfflineTutorial()) {
        if (net.handlePlayBlocked) {
          net.handlePlayBlocked(net.getBlockMessage && net.getBlockMessage());
        }
        return;
      }
      currentMapId = "tutorial";
      enterConfirmed();
      return;
    }

    if (net && net.canPlay && !net.canPlay()) {
      if (net.handlePlayBlocked) {
        net.handlePlayBlocked(net.getBlockMessage && net.getBlockMessage());
      }
      return;
    }

    currentMapId = normalizeMapId(mapId || resolveDefaultMapId());
    enterConfirmed();
  }

  function enter() {
    if (enterInProgress) {
      if (loadScreenEl && !loadScreenEl.hidden) return;
      enterInProgress = false;
      hideEnterLoading();
    }
    withPlayCheck(function () {
      startEnter(resolveDefaultMapId());
    });
  }

  function enterMap(mapId) {
    withPlayCheck(function () {
      startEnter(mapId);
    });
  }

  function enterConfirmed() {
    if (typeof THREE === "undefined") {
      actionRoot.hidden = false;
      document.body.classList.add("action-open");
      showLoadError("Three.js 未加载，请检查 js/vendor/three.module.min.js 是否存在。");
      return;
    }

    if (enterInProgress) return;
    enterInProgress = true;

    if (window.PlayerStatePersist && window.PlayerStatePersist.save) {
      window.PlayerStatePersist.save();
    }

    if (window.LobbyUI && window.LobbyUI.goHome) {
      window.LobbyUI.goHome();
    }

    actionRoot.hidden = true;
    document.body.classList.remove("room-open", "stash-open", "tutorial-open", "map-open");
    document.body.classList.remove("hub-home");

    clearInputKeys();
    teardownWorld();
    resetSecurityDoorState();
    resetExplosionState();
    if (
      currentMapId === "tutorial" &&
      window.WorldLootBox &&
      window.WorldLootBox.resetForNewRun
    ) {
      window.WorldLootBox.resetForNewRun({ firstChestGuarantee: true });
    }
    if (
      currentMapId === "test" &&
      window.HiddenLootBox &&
      window.HiddenLootBox.resetForNewRun
    ) {
      window.HiddenLootBox.resetForNewRun();
    }
    if (window.WaitingHallLockbox && window.WaitingHallLockbox.resetForNewRun) {
      window.WaitingHallLockbox.resetForNewRun();
    }
    if (window.CollectionRoomChest && window.CollectionRoomChest.resetForNewRun) {
      window.CollectionRoomChest.resetForNewRun();
    }
    if (window.CollectionRoomFloorLoot && window.CollectionRoomFloorLoot.resetForNewRun) {
      window.CollectionRoomFloorLoot.resetForNewRun();
    }
    if (window.ActionDropLoot && window.ActionDropLoot.resetForNewRun) {
      window.ActionDropLoot.resetForNewRun();
    }
    if (window.ActionWasteBin && window.ActionWasteBin.resetForNewRun) {
      window.ActionWasteBin.resetForNewRun();
    }
    if (window.LockpickingQTE && window.LockpickingQTE.close) {
      window.LockpickingQTE.close();
    }
    showEnterLoading();

    var preloadPromise;
    if (assetsPreloaded) {
      updateEnterLoadingProgress(1, 1);
      preloadPromise = Promise.resolve();
    } else {
      var urls = getActionPreloadUrls();
      preloadPromise = preloadAllActionAssets(function (done, total) {
        updateEnterLoadingProgress(done, total);
      }).then(function () {
        assetsPreloaded = true;
      });
    }

    preloadPromise
      .then(function () {
        var n = getActionPreloadUrls().length;
        updateEnterLoadingProgress(n, n);
        finishEnterAfterPreload();
      })
      .catch(function (err) {
        console.error("[ActionScene] 进入场景失败", err);
        enterInProgress = false;
        hideEnterLoading();
        actionRoot.hidden = false;
        document.body.classList.add("action-open");
        showLoadError(err.message || String(err));
      });
  }

  function setWeaponHint() {
    if (!hintEl) return;
    if (shouldUseDragLook()) {
      var mobileCtrl =
        " · 左下背包 · 摇杆上推过线疾跑 · 右下蹲伏 · 右下跳跃";
      if (window.ActionWeapon && window.ActionWeapon.hasUziEquipped()) {
        hintEl.textContent =
          "拖动转视角 · 摇杆移动" +
          mobileCtrl +
          " · 点词条交互 · B 背包 · Q 返回";
      } else {
        hintEl.textContent =
          "拖动转视角 · 摇杆移动" +
          mobileCtrl +
          " · 点词条交互 · B 背包 · Q 返回大厅";
      }
      return;
    }
    if (window.ActionWeapon && window.ActionWeapon.hasUziEquipped()) {
      hintEl.textContent =
        "WASD 移动 · Shift 疾跑 · 空格跳跃 · 左键连发 · 右键开镜 · E 交互 · B 背包 · Q 返回";
    } else {
      hintEl.textContent =
        "WASD 移动 · Shift 疾跑 · 空格跳跃 · E 交互 · B 背包 · Q 返回大厅";
    }
  }

  /**
   * @param {{ clearLoadout?: boolean }} [options]
   *   clearLoadout 默认 true：清空胸挂/背包/装备（保留安全箱）。撤离成功传 false。
   */
  function exit(options) {
    options = options || {};
    var clearLoadout = options.clearLoadout !== false;

    if (window.LobbyNet && window.LobbyNet.stopSessionProbe) {
      window.LobbyNet.stopSessionProbe();
    }

    if (clearLoadout && window.PlayerLoadout && window.PlayerLoadout.applyDeathDrop) {
      window.PlayerLoadout.applyDeathDrop();
    }
    if (window.ActionInventory && window.ActionInventory.refresh) {
      window.ActionInventory.refresh();
    }

    if (window.PlayerStatePersist && window.PlayerStatePersist.save) {
      window.PlayerStatePersist.save();
    }
    resetEvacState();
    resetPlayerDeathState();
    resetExplosionState();
    if (window.WorldLootBox && window.WorldLootBox.resetForNewRun) {
      window.WorldLootBox.resetForNewRun();
    }
    if (window.HiddenLootBox && window.HiddenLootBox.resetForNewRun) {
      window.HiddenLootBox.resetForNewRun();
    }
    if (window.WaitingHallLockbox && window.WaitingHallLockbox.resetForNewRun) {
      window.WaitingHallLockbox.resetForNewRun();
    }
    if (window.CollectionRoomChest && window.CollectionRoomChest.resetForNewRun) {
      window.CollectionRoomChest.resetForNewRun();
    }
    if (window.CollectionRoomFloorLoot && window.CollectionRoomFloorLoot.resetForNewRun) {
      window.CollectionRoomFloorLoot.resetForNewRun();
    }
    if (window.ActionDropLoot && window.ActionDropLoot.resetForNewRun) {
      window.ActionDropLoot.resetForNewRun();
    }
    if (window.ActionWasteBin && window.ActionWasteBin.resetForNewRun) {
      window.ActionWasteBin.resetForNewRun();
    }
    enterInProgress = false;
    hideEnterLoading();
    if (window.ActionWeapon) window.ActionWeapon.dispose();
    if (window.ActionHealth) {
      if (window.ActionHealth.reset) window.ActionHealth.reset();
      window.ActionHealth.hide();
    }
    if (window.ActionJoystick) window.ActionJoystick.hide();
    syncLookLayer();
    clearInputKeys();
    if (window.ActionInventory) window.ActionInventory.close();
    restoreGameCursor();
    if (document.pointerLockElement === canvas && document.exitPointerLock) {
      document.exitPointerLock();
    }
    stopLoop();
    teardownWorld();
    actionRoot.hidden = true;
    document.body.classList.remove("action-open");
    document.body.classList.add("hub-home");
    pointerLocked = false;
    setHintVisible(true);
  }

  function closeActionUiOnEscape() {
    if (
      window.GridStashUI &&
      window.GridStashUI.isPopoverOpen &&
      window.GridStashUI.isPopoverOpen()
    ) {
      window.GridStashUI.hidePopover();
      return true;
    }
    if (window.ActionWasteBin && window.ActionWasteBin.isOpen()) {
      window.ActionWasteBin.close();
      return true;
    }
    if (window.HiddenLootBox && window.HiddenLootBox.isPuzzleOpen()) {
      window.HiddenLootBox.closePuzzle();
      return true;
    }
    if (window.LockpickingQTE && window.LockpickingQTE.isOpen()) {
      window.LockpickingQTE.close();
      return true;
    }
    if (window.HiddenLootBox && window.HiddenLootBox.isPanelOpen()) {
      window.HiddenLootBox.closeChestPanel();
      return true;
    }
    if (window.WaitingHallLockbox && window.WaitingHallLockbox.isPanelOpen()) {
      window.WaitingHallLockbox.closeChestPanel();
      return true;
    }
    if (window.CollectionRoomChest && window.CollectionRoomChest.isPanelOpen()) {
      window.CollectionRoomChest.closeChestPanel();
      return true;
    }
    if (window.WorldLootBox && window.WorldLootBox.isPanelOpen()) {
      window.WorldLootBox.closeChestPanel();
      return true;
    }
    if (isInventoryOpen() || document.body.classList.contains("inventory-open")) {
      if (window.ActionInventory) window.ActionInventory.close();
      return true;
    }
    return false;
  }

  function onEscapeKey(e) {
    if (!running || e.code !== "Escape" || e.repeat) return;
    if (e.defaultPrevented) return;
    e.preventDefault();
    e.stopPropagation();
    if (closeActionUiOnEscape()) return;
    exit();
    if (window.LobbyUI && window.LobbyUI.goHome) {
      window.LobbyUI.goHome();
    }
  }

  function onKeyDown(e) {
    if (!running) return;

    if (e.code === "KeyB" || e.code === "Tab") {
      e.preventDefault();
      if (!e.repeat) toggleInventory();
      return;
    }

    if (e.code === "KeyG" && !e.repeat) {
      if (
        window.ActionInventory &&
        window.ActionInventory.isOpen() &&
        window.GridStashUI &&
        window.GridStashUI.tryDropHoveredItem
      ) {
        e.preventDefault();
        window.GridStashUI.tryDropHoveredItem();
      }
      return;
    }

    if (e.code === "KeyE" && !e.repeat) {
      e.preventDefault();
      tryInteract();
      return;
    }

    if (e.code === "KeyQ" && !e.repeat) {
      e.preventDefault();
      exit();
      return;
    }

    if (isUiBlocking()) return;

    keys[e.code] = true;
    keys[e.key] = true;
    if (e.code === "Space" && !e.repeat) {
      e.preventDefault();
      if (window.LockpickingQTE && window.LockpickingQTE.isOpen()) {
        return;
      }
      tryJump();
    }
  }

  function onKeyUp(e) {
    if (!running) return;
    releaseKeyFromEvent(e);
    if (isUiBlocking()) return;
  }

  function onMouseMove(e) {
    if (!running || !pointerLocked || isUiBlocking()) return;
    applyLookDelta(e.movementX, e.movementY);
  }

  function onPointerLockChange() {
    var wasLocked = pointerLocked;
    pointerLocked = document.pointerLockElement === canvas;
    if (wasLocked && !pointerLocked) {
      clearInputKeys();
    }
    if (pointerLocked) {
      restoreGameCursor();
    } else if (shouldUseDragLook()) {
      document.body.classList.add("show-cursor");
    }
    setHintVisible(!pointerLocked && !isInventoryOpen());
    syncLookLayer();
    updateCrosshair();
  }

  function bindUI() {
    if (!actionRoot || !canvas) return;

    hideEnterLoading();
    document.body.classList.remove("action-loading");

    mountLookLayer();

    if (btnBack) btnBack.addEventListener("click", exit);
    if (interactHintEl) {
      interactHintEl.addEventListener("pointerdown", onInteractHintTap, {
        passive: false,
      });
    }
    canvas.addEventListener("click", function () {
      if (!running || pointerLocked || isUiBlocking() || lookDidDrag) return;
      if (shouldUseDragLook()) return;
      ensureExplosionAudio();
      requestLock();
    });
    canvas.addEventListener("mousedown", function (e) {
      if (!running || isUiBlocking()) return;
      if (shouldUseDragLook()) return;
      if (window.ActionWeapon) window.ActionWeapon.onPointerDown(e);
    });
    canvas.addEventListener("mouseup", function (e) {
      if (window.ActionWeapon) window.ActionWeapon.onPointerUp(e);
    });
    canvas.addEventListener("contextmenu", function (e) {
      if (running && pointerLocked) e.preventDefault();
    });
    window.addEventListener("mouseup", function (e) {
      if (window.ActionWeapon) window.ActionWeapon.onPointerUp(e);
    });

    var invBackdrop = document.getElementById("actionInventoryBackdrop");
    if (invBackdrop) {
      invBackdrop.addEventListener("click", function () {
        if (window.ActionInventory) window.ActionInventory.close();
      });
    }

    document.addEventListener("keydown", onEscapeKey, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    window.addEventListener("resize", resize);
    window.addEventListener("blur", clearInputKeys);

    if (typeof THREE === "undefined") {
      console.warn("[ActionScene] Three.js 未就绪，请通过 HTTP 服务打开页面。");
    }
  }

  window.ActionScene = {
    enter: enter,
    enterMap: enterMap,
    exit: exit,
    onChestOpened: onChestOpened,
    onPlayerDeath: onPlayerDeath,
    resetExplosionState: resetExplosionState,
    isActive: function () {
      return running && actionRoot && !actionRoot.hidden;
    },
    ready: function () {
      return ready;
    },
    onInventoryOpened: onInventoryOpened,
    onInventoryClosed: onInventoryClosed,
    showDurabilityBanner: showDurabilityBanner,
    releaseUiPointer: releasePointerForUi,
    tryJump: tryJump,
    toggleInventory: toggleInventory,
    hasLineOfSight: function (px, pz, tx, ty, tz, margin) {
      return hasLineOfSight(px, pos.y, pz, tx, ty, tz, margin);
    },
    isRunning: function () {
      return running;
    },
    getDropPlacement: function () {
      var dist = 0.9;
      return {
        x: pos.x + Math.sin(yaw) * dist,
        z: pos.z + Math.cos(yaw) * dist,
        floorY: 0,
        yaw: yaw,
      };
    },
  };

  bindUI();
})();

window.addEventListener("error", function (ev) {
  var src = ev.filename || "";
  if (src.indexOf("action-scene") >= 0 || src.indexOf("GLTFLoader") >= 0) {
    console.error("[ActionScene] 脚本加载失败:", ev.message, src);
  }
});
