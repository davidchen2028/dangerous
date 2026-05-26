/**
 * 海盗宝箱 — 5×5 搜刮间中央 · GLB 模型 + QTE 开锁
 */
(function () {
  "use strict";

  var CHEST_GLB_URL = "models/pirate-chest.glb";
  var CHEST_X = 0;
  var CHEST_Z = 77.5;
  var CHEST_SIZE = { x: 1.15, y: 0.9, z: 0.95 };
  var INTERACT_DIST = 4.2;
  var AIM_MAX_DIST = 12;
  var AIM_DOT_MIN = 0.88;
  var STORAGE_KEY = "dangerous_pirate_chest_opened";

  var pickMesh = null;
  var chestRoot = null;
  var lidNode = null;
  var aimed = false;
  var opened = false;
  var sceneHelpers = null;

  var _raycaster = null;
  var _ndc = null;
  var _dir = null;

  function isOpenedPersisted() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch (e) {
      return opened;
    }
  }

  function markOpened() {
    opened = true;
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch (e) {
      /* ignore */
    }
    applyOpenedVisual();
  }

  function applyOpenedVisual() {
    if (lidNode && lidNode.rotation) {
      lidNode.rotation.x -= 1.15;
      lidNode.rotation.z += 0.08;
    } else if (chestRoot) {
      chestRoot.rotation.x -= 0.12;
    }
    if (chestRoot) {
      chestRoot.traverse(function (o) {
        if (!o.isMesh || !o.material) return;
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        var i;
        for (i = 0; i < mats.length; i++) {
          if (mats[i].emissive) {
            mats[i].emissive.setHex(0x1a2a18);
          }
        }
      });
    }
  }

  function playerNear(px, pz) {
    var dx = px - CHEST_X;
    var dz = pz - CHEST_Z;
    return dx * dx + dz * dz <= INTERACT_DIST * INTERACT_DIST;
  }

  function registerPickMesh(mesh) {
    pickMesh = mesh;
  }

  function findLidNode(root) {
    var found = null;
    root.traverse(function (o) {
      if (found) return;
      var n = (o.name || "").toLowerCase();
      if (
        n.indexOf("lid") >= 0 ||
        n.indexOf("cover") >= 0 ||
        n.indexOf("top") >= 0 ||
        n.indexOf("盖") >= 0
      ) {
        found = o;
      }
    });
    return found;
  }

  function orientChestModel(model) {
    if (!window.THREE) return;
    var THREE = window.THREE;
    var presets = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: Math.PI, z: 0 },
      { x: 0, y: Math.PI / 2, z: 0 },
      { x: 0, y: -Math.PI / 2, z: 0 },
    ];
    var best = presets[0];
    var bestScore = -1e9;
    var i;

    for (i = 0; i < presets.length; i++) {
      var p = presets[i];
      model.rotation.set(p.x, p.y, p.z);
      model.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(model);
      var size = new THREE.Vector3();
      box.getSize(size);
      var score = size.y;
      if (size.y >= size.x * 0.5 && size.y >= size.z * 0.5) score += 50;
      var forward = -box.min.z;
      var backward = box.max.z;
      if (forward > backward) score += 40;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }

    model.rotation.set(best.x, best.y, best.z);
    model.updateMatrixWorld(true);
  }

  function finalizeChestPlacement(root, binSize) {
    if (!window.THREE || !root) return;

    var THREE = window.THREE;
    root.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(root);
    var center = new THREE.Vector3();
    box.getCenter(center);
    root.position.set(CHEST_X - center.x, -box.min.y, CHEST_Z - center.z);
    root.updateMatrixWorld(true);

    lidNode = findLidNode(root);

    var pick = new THREE.Mesh(
      new THREE.BoxGeometry(binSize.x, binSize.y, binSize.z),
      new THREE.MeshBasicMaterial({ visible: false, depthWrite: false })
    );
    pick.name = "ChestPickVolume";
    pick.position.y = binSize.y * 0.5;
    root.add(pick);
    registerPickMesh(pick);

    chestRoot = root;

    if (sceneHelpers && sceneHelpers.registerCollider) {
      sceneHelpers.registerCollider(
        binSize.x,
        binSize.y,
        binSize.z,
        CHEST_X,
        binSize.y * 0.5,
        CHEST_Z
      );
    }

    if (isOpenedPersisted()) {
      opened = true;
      applyOpenedVisual();
    }
  }

  function buildProceduralChest(parent) {
    if (!window.THREE) return null;

    var THREE = window.THREE;
    var root = new THREE.Group();
    root.name = "PirateLootChest_Fallback";

    var wood = new THREE.MeshLambertMaterial({ color: 0x5c3d28 });
    var gold = new THREE.MeshLambertMaterial({
      color: 0xc9a227,
      emissive: 0x332200,
    });
    var iron = new THREE.MeshLambertMaterial({ color: 0x3a3f44 });

    var body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.75), wood);
    body.position.y = 0.325;
    root.add(body);

    var band = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.12, 0.78), iron);
    band.position.y = 0.42;
    root.add(band);

    lidNode = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.22, 0.72), wood);
    lidNode.position.set(0, 0.76, -0.08);
    lidNode.rotation.x = -0.35;
    root.add(lidNode);

    var lockPlate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.06), gold);
    lockPlate.position.set(0, 0.58, 0.38);
    root.add(lockPlate);

    parent.add(root);
    finalizeChestPlacement(root, CHEST_SIZE);
    return root;
  }

  function buildGlbChest(parent) {
    if (!sceneHelpers || !sceneHelpers.loadGltfCached) {
      return buildProceduralChest(parent);
    }

    sceneHelpers.loadGltfCached(
      CHEST_GLB_URL,
      function (gltf) {
        var THREE = window.THREE;
        if (!THREE) {
          buildProceduralChest(parent);
          return;
        }

        var model = gltf.scene.clone(true);
        model.scale.set(1, 1, 1);

        var root = new THREE.Group();
        root.name = "PirateLootChest_GLB";
        root.add(model);

        orientChestModel(model);
        if (sceneHelpers.fitModelToBox) {
          sceneHelpers.fitModelToBox(root, CHEST_SIZE);
          sceneHelpers.fitModelToBox(root, CHEST_SIZE);
        }

        model.traverse(function (child) {
          if (!child.isMesh || !child.material) return;
          child.castShadow = true;
          child.receiveShadow = true;
          var mats = Array.isArray(child.material)
            ? child.material
            : [child.material];
          var i;
          for (i = 0; i < mats.length; i++) {
            mats[i].side = window.THREE.FrontSide;
          }
        });

        parent.add(root);
        finalizeChestPlacement(root, CHEST_SIZE);
      },
      function (err) {
        console.error("[WorldLootBox] 宝箱模型加载失败，使用占位几何体:", err);
        buildProceduralChest(parent);
      }
    );
  }

  function build(parent, helpers) {
    sceneHelpers = helpers || null;
    if (!parent) return null;
    buildGlbChest(parent);
    return chestRoot;
  }

  function updateAim(px, pz, camera) {
    aimed = false;
    if (!camera || opened || isOpenedPersisted()) return;
    if (!playerNear(px, pz)) return;

    var THREE = window.THREE;
    if (!THREE) return;

    if (!_raycaster) _raycaster = new THREE.Raycaster();
    if (!_ndc) _ndc = new THREE.Vector2(0, 0);
    if (!_dir) _dir = new THREE.Vector3();

    _raycaster.setFromCamera(_ndc, camera);

    if (pickMesh) {
      var hits = _raycaster.intersectObject(pickMesh, false);
      if (hits.length > 0) {
        aimed = true;
        return;
      }
    }

    _dir.set(
      CHEST_X - _raycaster.ray.origin.x,
      0.85 - _raycaster.ray.origin.y,
      CHEST_Z - _raycaster.ray.origin.z
    );
    var dist = _dir.length();
    if (dist > AIM_MAX_DIST) return;
    _dir.multiplyScalar(1 / dist);
    if (_raycaster.ray.direction.dot(_dir) >= AIM_DOT_MIN) {
      aimed = true;
    }
  }

  function isAimed() {
    return aimed && !opened && !isOpenedPersisted();
  }

  function grantLootRewards() {
    if (!window.ItemCatalog || !window.PlayerLoadout) return;

    var ids = ["brass_bullet", "circuit", "sealed_motor_oil"];
    if (Math.random() < 0.35) ids.push("circuit");
    var placed = [];
    var missed = [];
    var i;

    for (i = 0; i < ids.length; i++) {
      var cat = window.ItemCatalog.getItem(ids[i]);
      if (!cat) continue;
      if (ids[i] === "brass_bullet") {
        cat = Object.assign({}, cat);
        cat.stackSize = 60;
      }
      if (window.PlayerLoadout.tryPlaceLoot(cat)) {
        placed.push(cat.name);
      } else if (
        window.GridStashUI &&
        window.GridStashUI.tryAddCatalogItem(cat)
      ) {
        placed.push(cat.name + "→仓库");
      } else {
        missed.push(cat.name);
      }
    }

    if (window.GridStashUI) window.GridStashUI.render();
    if (window.PlayerLoadout.renderLobby) window.PlayerLoadout.renderLobby();

    var msg = "宝箱已开启！获得：" + (placed.length ? placed.join("、") : "无");
    if (missed.length) {
      msg += "\n背包已满，未装入：" + missed.join("、");
    }
    alert(msg);
  }

  function onQTESuccess() {
    if (opened || isOpenedPersisted()) return;
    markOpened();
    grantLootRewards();
  }

  function tryStartLockpick() {
    if (opened || isOpenedPersisted()) return false;
    if (!aimed) return false;
    if (!window.LockpickingQTE) return false;

    if (document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock();
    }

    window.LockpickingQTE.open({
      greenMin: 0.4,
      greenMax: 0.68,
      speed: 0.72,
      onSuccess: function () {
        onQTESuccess();
      },
    });
    return true;
  }

  function resetForNewRun() {
    aimed = false;
  }

  window.WorldLootBox = {
    CHEST_GLB_URL: CHEST_GLB_URL,
    CHEST_X: CHEST_X,
    CHEST_Z: CHEST_Z,
    CHEST_SIZE: CHEST_SIZE,
    build: build,
    registerPickMesh: registerPickMesh,
    updateAim: updateAim,
    isAimed: isAimed,
    isAimedAtChest: isAimed,
    playerNear: playerNear,
    tryStartLockpick: tryStartLockpick,
    onQTESuccess: onQTESuccess,
    isOpened: function () {
      return opened || isOpenedPersisted();
    },
    resetForNewRun: resetForNewRun,
  };
})();
