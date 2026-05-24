/**
 * 新手教程 — 0 号模拟围区（第一人称）
 */
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

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
  var ready = false;

  var WALK_SPEED = 2.5;
  var SPRINT_SPEED = 5.5;
  var CROUCH_SPEED = 1.2;
  var LOOK_SENS = 0.0022;
  var GRAVITY = 32;
  var JUMP_SPEED = 9;
  var BOUNDS_X = 5.5;
  var BOUNDS_Z_MIN = 1.2;
  var BOUNDS_Z_MAX = 58.8;
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
  var CRATE_X = [3.0, 4.0, 3.0, 4.0];
  var CRATE_GLB_URL = "models/wooden-crate.glb";

  function buildTruck(parent) {
    registerCollider(
      TRUCK_SIZE.x,
      TRUCK_SIZE.y,
      TRUCK_SIZE.z,
      TRUCK_CENTER.x,
      TRUCK_CENTER.y,
      TRUCK_CENTER.z
    );

    var loader = new GLTFLoader();
    loader.load(
      TRUCK_GLB_URL,
      function (gltf) {
        placeTruckModel(gltf.scene, parent);
      },
      function (xhr) {
        if (xhr.total) {
          console.log(
            "[ActionScene] 卡车加载 " +
              Math.round((xhr.loaded / xhr.total) * 100) +
              "%"
          );
        }
      },
      function (err) {
        console.error("[ActionScene] 卡车模型加载失败", err);
        addTruckFallback(parent);
      }
    );
  }

  function addTruckFallback(parent) {
    addBox(
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

    var loader = new GLTFLoader();
    loader.load(
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
      undefined,
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

    var loader = new GLTFLoader();
    loader.load(
      BARRIER_GLB_URL,
      function (gltf) {
        for (i = 0; i < BARRIER_Z.length; i++) {
          placeBarrierInstance(gltf.scene.clone(true), parent, BARRIER_Z[i]);
        }
      },
      undefined,
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

    // 走廊前后封口墙（与侧墙同高，挡住两端）
    var endWallH = 3.5;
    var endWallY = endWallH * 0.5;
    addBox(root, 12, endWallH, 0.5, 0, endWallY, 0, 0x2e3338);
    addBox(root, 12, endWallH, 0.5, 0, endWallY, 60, 0x2e3338);
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

  function initScene() {
    if (scene) return true;

    if (typeof THREE === "undefined") {
      showLoadError("Three.js 未加载。");
      return false;
    }

    try {
      scene = new THREE.Scene();
      buildSkyAndClouds(scene);
      buildSectorZero(scene);

      player = new THREE.Group();
      scene.add(player);

      bodyCapsule = createUnityCapsule();
      player.add(bodyCapsule);

      camera = new THREE.PerspectiveCamera(72, 1, 0.05, 120);
      camera.position.set(0, bodyHeightCurrent * EYE_RATIO, 0);
      camera.rotation.order = "YXZ";
      player.add(camera);

      leftHand = createHand(true);
      rightHand = createHand(false);
      leftHand.renderOrder = 10;
      rightHand.renderOrder = 10;
      camera.add(leftHand);
      camera.add(rightHand);

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
    var wantsCrouch = !!(keys.KeyC || keys.c);
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

    for (iter = 0; iter < 6; iter++) {
      moved = false;
      for (i = 0; i < colliders.length; i++) {
        c = colliders[i];
        if (
          px + radius <= c.minX ||
          px - radius >= c.maxX ||
          pz + radius <= c.minZ ||
          pz - radius >= c.maxZ
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

  function getMoveSpeed() {
    if (keys.KeyC || keys.c) return CROUCH_SPEED;
    if (keys.ShiftLeft || keys.ShiftRight) return SPRINT_SPEED;
    return WALK_SPEED;
  }

  function tryJump() {
    if (grounded && !isCrouching() && !(keys.KeyC || keys.c)) {
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
      hand.position.x = base.x + sway * phase * 0.4;
      hand.position.y = base.y - bob * phase + jumpTuck;
      hand.position.z = base.z + (grounded ? 0 : jumpTuck * 1.2);
      hand.rotation.x = base.rx + bob * 0.5 * phase;
      hand.rotation.z = base.rz + sway * phase;
    }

    applyHand(leftHand, HAND_BASE.left, 1);
    applyHand(rightHand, HAND_BASE.right, -1);
  }

  function isInventoryOpen() {
    return window.ActionInventory && window.ActionInventory.isOpen();
  }

  function isUiBlocking() {
    return isInventoryOpen();
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
    var opened = window.ActionInventory.toggle();
    if (opened) {
      releasePointerForUi();
    } else {
      restoreGameCursor();
      if (running && !pointerLocked) {
        setHintVisible(true);
      }
    }
  }

  function tick() {
    if (!running) return;
    animId = requestAnimationFrame(tick);
    var dt = Math.min(clock.getDelta(), 0.05);

    if (isUiBlocking()) {
      updateClouds(dt, animTime);
      renderer.render(scene, camera);
      return;
    }

    var forward = (keys.KeyW || keys.w ? 1 : 0) - (keys.KeyS || keys.s ? 1 : 0);
    var strafe = (keys.KeyD || keys.d ? 1 : 0) - (keys.KeyA || keys.a ? 1 : 0);
    var moving = !!(forward || strafe);
    var speed = getMoveSpeed();

    if (moving) {
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
    updateClouds(dt, animTime);
    renderer.render(scene, camera);
  }

  function resetPlayer() {
    yaw = 0;
    pitch = -0.08;
    pos.x = 0;
    pos.y = 0;
    pos.z = 2;
    velY = 0;
    grounded = true;
    animTime = 0;
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

  function enter() {
    if (typeof THREE === "undefined") {
      actionRoot.hidden = false;
      document.body.classList.add("action-open");
      showLoadError("Three.js 未加载，请检查 js/vendor/three.module.min.js 是否存在。");
      return;
    }

    if (window.LobbyUI && window.LobbyUI.goHome) {
      window.LobbyUI.goHome();
    }

    actionRoot.hidden = false;
    document.body.classList.remove("room-open", "stash-open", "tutorial-open");
    document.body.classList.add("action-open");
    document.body.classList.remove("hub-home");

    startLoop();
    resetPlayer();
    setHintVisible(true);

    requestAnimationFrame(function () {
      resize();
      requestLock();
    });
  }

  function exit() {
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

    if (e.code === "Escape") {
      e.preventDefault();
      if (isInventoryOpen()) {
        window.ActionInventory.close();
        restoreGameCursor();
        setHintVisible(true);
        return;
      }
      exit();
      return;
    }

    if (isUiBlocking()) return;

    keys[e.code] = true;
    keys[e.key] = true;
    if (e.code === "Space" && !e.repeat) {
      e.preventDefault();
      tryJump();
    }
  }

  function onKeyUp(e) {
    if (isUiBlocking()) return;
    keys[e.code] = false;
    keys[e.key] = false;
  }

  function onMouseMove(e) {
    if (!running || !pointerLocked || isUiBlocking()) return;
    yaw -= e.movementX * LOOK_SENS;
    pitch -= e.movementY * LOOK_SENS;
    var maxPitch = Math.PI / 2 - 0.05;
    pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
  }

  function onPointerLockChange() {
    pointerLocked = document.pointerLockElement === canvas;
    if (pointerLocked) {
      restoreGameCursor();
    }
    setHintVisible(!pointerLocked && !isInventoryOpen());
  }

  function bindUI() {
    if (!btnAction || !actionRoot || !canvas) return;

    btnAction.addEventListener("click", enter);
    if (btnBack) btnBack.addEventListener("click", exit);
    canvas.addEventListener("click", function () {
      if (running && !pointerLocked && !isUiBlocking()) requestLock();
    });

    var invBackdrop = document.getElementById("actionInventoryBackdrop");
    if (invBackdrop) {
      invBackdrop.addEventListener("click", function () {
        if (window.ActionInventory) window.ActionInventory.close();
        restoreGameCursor();
        setHintVisible(true);
      });
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    window.addEventListener("resize", resize);

    window.ActionScene = { enter: enter, exit: exit, ready: function () {
      return ready;
    } };

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
