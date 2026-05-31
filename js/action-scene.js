/**
 * 新手教程 — 0 号模拟围区（第一人称）
 */
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

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
  var truckFlight = null;
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
  var TUTORIAL_BOUNDS_X = 5.5;
  var TUTORIAL_BOUNDS_Z_MIN = 1.2;

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
    disposeTruckFlight();
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
      if (worldRoot && binRoomBackWallMeshes[i]) {
        worldRoot.remove(binRoomBackWallMeshes[i]);
      }
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
        if (extras[i].parent) extras[i].parent.remove(extras[i]);
        disposeObject3D(extras[i]);
      }
    }
  }

  function onWallMissileImpact() {
    if (!wallExploded) {
      explodeWallIntoFragments();
    }
    if (missileStrike && missileStrike.root) {
      disposeMissileRoot(missileStrike.root);
    }
    missileStrike = { phase: "pause", pauseLeft: 0.85 };
  }

  function onTruckMissileImpact() {
    startTruckExplosion();
    if (missileStrike && missileStrike.root) {
      disposeMissileRoot(missileStrike.root);
    }
    missileStrike = null;
    showDurabilityBanner("第二枚导弹命中 · 卡车被炸飞出围区");
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

  function resolveTruckRoot() {
    if (tacticalTruckRoot && tacticalTruckRoot.parent) return tacticalTruckRoot;
    tacticalTruckRoot = findNamedRoot(worldRoot, "TacticalTruck_GLB");
    if (!tacticalTruckRoot) {
      tacticalTruckRoot = findNamedRoot(worldRoot, "TacticalTruck_Fallback");
    }
    return tacticalTruckRoot;
  }

  function startTruckExplosion() {
    var root = resolveTruckRoot();
    if (!root) return;
    removeTruckCollider();
    truckFlight = {
      root: root,
      vx: (Math.random() - 0.5) * 3.5,
      vy: 16 + Math.random() * 5,
      vz: -18 - Math.random() * 6,
      rvx: (Math.random() - 0.5) * 2.5,
      rvy: (Math.random() - 0.5) * 4,
      rvz: (Math.random() - 0.5) * 2.5,
    };
  }

  function updateExplosionDebris(dt) {
    var g = 22;
    var i;
    var fx;
    for (i = 0; i < explosionDebris.length; i++) {
      fx = explosionDebris[i];
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

  function disposeTruckFlight() {
    if (!truckFlight || !truckFlight.root) {
      truckFlight = null;
      return;
    }
    if (worldRoot) worldRoot.remove(truckFlight.root);
    disposeObject3D(truckFlight.root);
    truckFlight = null;
    tacticalTruckRoot = null;
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

  function shouldRemoveFlyingTruck(root) {
    if (!isTruckOutsideSectorWalls(root)) return false;
    return isTruckOffScreen(root);
  }

  function updateTruckFlight(dt) {
    if (!truckFlight || !truckFlight.root) return;
    var tf = truckFlight;
    tf.vy -= 14 * dt;
    tf.root.position.x += tf.vx * dt;
    tf.root.position.y += tf.vy * dt;
    tf.root.position.z += tf.vz * dt;
    tf.root.rotation.x += tf.rvx * dt;
    tf.root.rotation.y += tf.rvy * dt;
    tf.root.rotation.z += tf.rvz * dt;

    if (shouldRemoveFlyingTruck(tf.root) || tf.root.position.y < -8) {
      disposeTruckFlight();
    }
  }

  function updateExplosionEffects(dt) {
    updateWallStrikeFallback(dt);
    if (missileStrike) updateMissileStrike(dt);
    if (explosionDebris.length) updateExplosionDebris(dt);
    if (truckFlight) updateTruckFlight(dt);
  }

  function hasExplosionEffects() {
    return (
      wallStrikeFallbackLeft > 0 ||
      !!missileStrike ||
      explosionDebris.length > 0 ||
      !!truckFlight
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
      if (window.LobbyUI && window.LobbyUI.syncActionHubButton) {
        window.LobbyUI.syncActionHubButton();
      }
    }
    if (evacOverlayEl) evacOverlayEl.hidden = true;
    if (window.WorldLootBox && window.WorldLootBox.closeChestPanel) {
      window.WorldLootBox.closeChestPanel();
    }
    exit();
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

  function showDurabilityBanner(remaining, max) {
    if (!durabilityBannerEl) return;
    if (max == null && typeof remaining === "string") {
      durabilityBannerEl.textContent = remaining;
    } else {
      durabilityBannerEl.textContent =
        "房卡耐久 " + remaining + " / " + max;
    }
    durabilityBannerEl.hidden = false;
    if (durabilityBannerEl._hideTimer) {
      clearTimeout(durabilityBannerEl._hideTimer);
    }
    durabilityBannerEl._hideTimer = setTimeout(function () {
      durabilityBannerEl.hidden = true;
    }, 2800);
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
    return text.replace(/按 E\s*/g, "点此字条 ");
  }

  function tryInteract() {
    if (!running || isUiBlocking()) return false;
    if (doorUnlocked && window.WorldLootBox) {
      if (camera && window.WorldLootBox.updateAim) {
        window.WorldLootBox.updateAim(pos.x, pos.z, camera);
      }
      if (window.WorldLootBox.tryStartLockpick()) {
        releasePointerForUi();
        return true;
      }
    }
    trySwipeDoor();
    return true;
  }

  function unlockSecurityDoor() {
    if (doorUnlocked) return;
    doorUnlocked = true;
    removeDoorColliders();
    if (securityDoorRoot && doorHomePosition) {
      setDoorGreen(securityDoorRoot);
      securityDoorRoot.position.copy(doorHomePosition);
      securityDoorRoot.position.x += DOOR_OPEN_OFFSET_X;
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

    if (currentMapId !== "tutorial") {
      setInteractHintVisible(false);
      return;
    }

    if (doorUnlocked && camera && canvas && window.WorldLootBox) {
      window.WorldLootBox.updateAim(pos.x, pos.z, camera);
      if (
        !window.WorldLootBox.isOpened() &&
        window.WorldLootBox.isAimed()
      ) {
        setInteractHintVisible(true);
        if (interactHintEl) {
          interactHintEl.textContent = formatInteractHint(
            "准星对准海盗宝箱 · 按 E 开锁"
          );
        }
        return;
      }
      if (
        window.WorldLootBox.isOpened() &&
        window.WorldLootBox.isAimed() &&
        window.WorldLootBox.playerNear(pos.x, pos.z)
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
    loadedMapId = null;
  }

  function applyMapBounds(mapId) {
    if (mapId === "test") {
      BOUNDS_X = 55;
      BOUNDS_Z_MIN = -55;
      BOUNDS_Z_MAX = 55;
      if (scene) {
        scene.fog = new THREE.Fog(0x8ecfff, 50, 160);
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
    mapNameEl.textContent = currentMapId === "test" ? "测试" : "新手教程";
  }

  function loadWorldMap(mapId) {
    if (!scene) return;
    if (loadedMapId === mapId && worldRoot) return;

    teardownWorld();
    applyMapBounds(mapId);

    worldRoot = new THREE.Group();
    worldRoot.name = "World_" + mapId;
    scene.add(worldRoot);

    if (mapId === "test") {
      buildTestMap(worldRoot);
    } else {
      buildSectorZero(worldRoot);
    }

    loadedMapId = mapId;
    currentMapId = mapId;
    updateMapNameDisplay();
  }

  /** 测试地图 — 空旷草地 */
  function buildTestMap(parent) {
    colliders = [];
    var root = new THREE.Group();
    root.name = "TestMap_测试";
    parent.add(root);

    var grass = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0x4a7c3f })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, 0, 0);
    grass.receiveShadow = true;
    root.add(grass);

    var edge = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 140, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0x3d6634 })
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(0, -0.01, 0);
    root.add(edge);
  }

  /** 【新手教程】0 号模拟围区 — 与 Unity 生成器同规格 */
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

  function updateCrouch(dt) {
    var wantsCrouch = !!keys.KeyC;
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

  function clampPosition() {
    pos.x = Math.max(-BOUNDS_X, Math.min(BOUNDS_X, pos.x));
    pos.z = Math.max(BOUNDS_Z_MIN, Math.min(BOUNDS_Z_MAX, pos.z));
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

  function resolvePositionXZ() {
    var radius = CAPSULE_RADIUS;
    var px = pos.x;
    var pz = pos.z;
    var iter;
    var i;
    var c;
    var out;
    var moved;

    var nearPad = 10;

    for (iter = 0; iter < 6; iter++) {
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
    if (!moving || keys.KeyC || isCrouching()) return false;
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
    if (keys.KeyC || isCrouching()) return CROUCH_SPEED;
    if (moving && isActuallySprinting(moving)) return SPRINT_SPEED;
    return WALK_SPEED;
  }

  function tryJump() {
    if (grounded && !isCrouching() && !keys.KeyC) {
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
      (window.WorldLootBox && window.WorldLootBox.isPanelOpen())
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
    animId = requestAnimationFrame(tick);
    var dt = Math.min(clock.getDelta(), 0.05);

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
      clampPosition();
    }

    updatePhysics(dt);
    updateCrouch(dt);
    updatePlayerTransform();
    updateHands(dt, moving);
    if (pos.z < EVAC_ROOM_START_Z + EVAC_ROOM_SIZE + 2 || currentMapId === "test") {
      updateClouds(dt, animTime);
    }
    updateInteractHints();

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
      pos.x = 0;
      pos.y = 0;
      pos.z = 0;
    } else {
      pos.x = 0;
      pos.y = 0;
      pos.z = 2;
    }
    velY = 0;
    grounded = true;
    animTime = 0;
    staminaDrainAcc = 0;
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
    clock.start();
    resize();
    tick();
  }

  function stopLoop() {
    running = false;
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
    document.body.classList.remove("room-open", "stash-open", "tutorial-open", "map-open");
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

  function resolveDefaultMapId() {
    if (window.TutorialProgress && window.TutorialProgress.isComplete()) {
      if (window.LobbyUI && window.LobbyUI.getSelectedMapId) {
        return window.LobbyUI.getSelectedMapId();
      }
      return "test";
    }
    return "tutorial";
  }

  function normalizeMapId(mapId) {
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
    if (window.LobbyNet && window.LobbyNet.assertCanPlay) {
      window.LobbyNet.assertCanPlay(function (ok, msg) {
        if (!ok) {
          if (window.LobbyNet.handlePlayBlocked) {
            window.LobbyNet.handlePlayBlocked(msg);
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
    if (window.LobbyNet && window.LobbyNet.canPlay && !window.LobbyNet.canPlay()) {
      if (window.LobbyNet.handlePlayBlocked) {
        window.LobbyNet.handlePlayBlocked(
          window.LobbyNet.getBlockMessage && window.LobbyNet.getBlockMessage()
        );
      }
      return;
    }

    currentMapId = normalizeMapId(mapId || resolveDefaultMapId());
    enterConfirmed();
  }

  function enter() {
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
    resetSecurityDoorState();
    resetExplosionState();
    if (
      currentMapId === "tutorial" &&
      window.WorldLootBox &&
      window.WorldLootBox.resetForNewRun
    ) {
      window.WorldLootBox.resetForNewRun({ firstChestGuarantee: true });
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
      var mobileCtrl = " · 左下背包 · 摇杆上推过线疾跑 · 右下跳跃";
      if (window.ActionWeapon && window.ActionWeapon.hasUziEquipped()) {
        hintEl.textContent =
          "拖动转视角 · 摇杆移动" +
          mobileCtrl +
          " · E 交互 · B 背包 · Q 返回";
      } else {
        hintEl.textContent =
          "拖动转视角 · 摇杆移动" +
          mobileCtrl +
          " · E 交互 · B 背包 · Q 返回大厅";
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

  function exit() {
    if (window.LobbyNet && window.LobbyNet.stopSessionProbe) {
      window.LobbyNet.stopSessionProbe();
    }
    if (window.PlayerStatePersist && window.PlayerStatePersist.save) {
      window.PlayerStatePersist.save();
    }
    resetEvacState();
    resetExplosionState();
    enterInProgress = false;
    hideEnterLoading();
    if (window.ActionWeapon) window.ActionWeapon.dispose();
    if (window.ActionHealth) window.ActionHealth.hide();
    if (window.ActionJoystick) window.ActionJoystick.hide();
    syncLookLayer();
    clearInputKeys();
    if (window.ActionInventory) window.ActionInventory.close();
    restoreGameCursor();
    if (document.pointerLockElement === canvas && document.exitPointerLock) {
      document.exitPointerLock();
    }
    stopLoop();
    actionRoot.hidden = true;
    document.body.classList.remove("action-open");
    document.body.classList.add("hub-home");
    pointerLocked = false;
    setHintVisible(true);
  }

  function onKeyDown(e) {
    if (!running) return;

    if (e.code === "KeyB" || e.code === "Tab") {
      e.preventDefault();
      if (!e.repeat) toggleInventory();
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

    if (e.code === "Escape") {
      e.preventDefault();
      if (window.LockpickingQTE && window.LockpickingQTE.isOpen()) {
        window.LockpickingQTE.close();
        return;
      }
      if (window.WorldLootBox && window.WorldLootBox.isPanelOpen()) {
        window.WorldLootBox.closeChestPanel();
        return;
      }
      if (isInventoryOpen()) {
        window.ActionInventory.close();
        return;
      }
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
    if (!btnAction || !actionRoot || !canvas) return;

    mountLookLayer();

    btnAction.addEventListener("click", enter);
    if (btnBack) btnBack.addEventListener("click", exit);
    if (interactHintEl) {
      interactHintEl.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (interactHintEl.hidden) return;
        tryInteract();
      });
    }
    canvas.addEventListener("click", function () {
      if (!running || pointerLocked || isUiBlocking() || lookDidDrag) return;
      if (shouldUseDragLook()) return;
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

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    window.addEventListener("resize", resize);
    window.addEventListener("blur", clearInputKeys);

    window.ActionScene = {
      enter: enter,
      enterMap: enterMap,
      exit: exit,
      onChestOpened: onChestOpened,
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
    };

    if (typeof THREE === "undefined") {
      console.warn("[ActionScene] Three.js 未就绪，请通过 HTTP 服务打开页面。");
    }
  }

  bindUI();
})();

window.addEventListener("error", function (ev) {
  var src = ev.filename || "";
  if (src.indexOf("action-scene") >= 0 || src.indexOf("GLTFLoader") >= 0) {
    console.error("[ActionScene] 脚本加载失败:", ev.message, src);
  }
});
