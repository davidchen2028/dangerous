/**
 * 海盗宝箱 — 3D 模型 + QTE 开锁 + 内部 4×4 网格搜刮
 */
(function () {
  "use strict";

  var G = window.GridInventory;
  var CHEST_GLB_URL = "models/pirate-chest.glb";
  var CHEST_X = 0;
  var CHEST_Z = 77.5;
  /** 直立摆放碰撞盒（宽 × 高 × 深） */
  var CHEST_SIZE = { x: 1.05, y: 1.05, z: 0.85 };
  /**
   * 调朝向只改下面 4 个常量；保存后必须 Cmd+Shift+R 硬刷新页面。
   * 进教程后可在控制台：WorldLootBox.getChestOrientation()
   * MODEL_* → ChestModelPivot；YAW → ChestYawPivot（与收藏室同款 Y=90 + yaw）
   */
  var CHEST_MODEL_ROT_X_DEG = 0;
  var CHEST_MODEL_ROT_Y_DEG = 90;
  var CHEST_MODEL_ROT_Z_DEG = 0;
  /** 场景水平朝向（度）；180 = 正面朝玩家（教程出生点 -Z） */
  var CHEST_YAW_DEG = 180;
  /** true = 用旧版自动猜朝向；建模朝向已固定时保持 false */
  var CHEST_USE_AUTO_ORIENT = false;
  var CHEST_COLS = 4;
  var CHEST_ROWS = 4;
  var INTERACT_DIST = 4.2;
  var AIM_MAX_DIST = 12;
  var PICK_MESH_SCALE = 0.78;
  var STORAGE_KEY = "dangerous_pirate_chest_opened";
  /** 新手教程首箱：若无紫色则强制塞一件史诗 */
  var firstChestGuarantee = false;

  var pickMesh = null;
  var chestRoot = null;
  var chestModel = null;
  var chestYawPivot = null;
  var chestModelPivot = null;
  var chestBuildGeneration = 0;
  var lidNode = null;
  var lidClosedRotation = null;
  var aimed = false;
  var opened = false;
  var sceneHelpers = null;
  var panelOpen = false;
  var chestManager = null;
  var revealTimers = [];
  var itemMeta = Object.create(null);

  var panelEl = null;
  var gridHostEl = null;
  var statusEl = null;
  var backdropEl = null;
  var btnClose = null;

  var _raycaster = null;
  var _ndc = null;

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
    if (lidNode && lidClosedRotation) {
      lidNode.rotation.x = lidClosedRotation.x - 1.15;
      lidNode.rotation.y = lidClosedRotation.y;
      lidNode.rotation.z = lidClosedRotation.z + 0.08;
    }
    if (chestRoot) {
      chestRoot.traverse(function (o) {
        if (!o.isMesh || !o.material) return;
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        var i;
        for (i = 0; i < mats.length; i++) {
          if (mats[i].emissive) mats[i].emissive.setHex(0x1a2a18);
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
        n.indexOf("cap") >= 0 ||
        n.indexOf("hatch") >= 0 ||
        n.indexOf("盖") >= 0
      ) {
        found = o;
      }
    });
    return found;
  }

  function degToRad(deg) {
    return (deg * Math.PI) / 180;
  }

  function getChestYaw() {
    return degToRad(CHEST_YAW_DEG);
  }

  function getChestModelNode(root) {
    if (!root) return null;
    var i;
    for (i = 0; i < root.children.length; i++) {
      if (root.children[i].name !== "ChestPickVolume") {
        return root.children[i];
      }
    }
    return null;
  }

  function resetGltfScenePose(model) {
    if (!model) return;
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.updateMatrixWorld(true);
  }

  function applyChestModelPivotRotation() {
    if (!chestModelPivot) return;
    chestModelPivot.rotation.order = "XYZ";
    chestModelPivot.rotation.set(
      degToRad(CHEST_MODEL_ROT_X_DEG),
      degToRad(CHEST_MODEL_ROT_Y_DEG),
      degToRad(CHEST_MODEL_ROT_Z_DEG)
    );
    chestModelPivot.updateMatrixWorld(true);
  }

  function applyChestYawPivotRotation() {
    if (!chestYawPivot) return;
    chestYawPivot.rotation.set(0, getChestYaw(), 0);
    chestYawPivot.updateMatrixWorld(true);
  }

  function applyChestRootYaw(root) {
    if (!root) return;
    root.rotation.set(0, getChestYaw(), 0);
    root.updateMatrixWorld(true);
  }

  function destroyChest() {
    chestBuildGeneration += 1;
    chestRoot = null;
    chestModel = null;
    chestYawPivot = null;
    chestModelPivot = null;
    lidNode = null;
    lidClosedRotation = null;
    pickMesh = null;
  }

  function fitChestToTargetSize(root) {
    if (!sceneHelpers || !root) return;
    if (sceneHelpers.fitModelUniformToBox) {
      sceneHelpers.fitModelUniformToBox(root, CHEST_SIZE);
      return;
    }
    if (sceneHelpers.fitModelToBox) {
      sceneHelpers.fitModelToBox(root, CHEST_SIZE);
      sceneHelpers.fitModelToBox(root, CHEST_SIZE);
    }
  }

  function isProceduralChestRoot(root) {
    return !!(root && root.name === "PirateLootChest_Fallback");
  }

  /** 模型 pivot 扶正 → fit → yaw pivot（两步分开，改常量才能看出区别） */
  function applyChestTransformAndFit(root) {
    if (!root) return;

    root.rotation.set(0, 0, 0);
    root.scale.set(1, 1, 1);

    if (isProceduralChestRoot(root)) {
      applyChestRootYaw(root);
      return;
    }

    if (!chestYawPivot || !chestModelPivot) return;

    chestYawPivot.rotation.set(0, 0, 0);
    chestModelPivot.rotation.set(0, 0, 0);
    chestModelPivot.scale.set(1, 1, 1);
    if (chestModel) resetGltfScenePose(chestModel);
    if (CHEST_USE_AUTO_ORIENT && chestModel) {
      orientChestModel(chestModel);
    } else {
      applyChestModelPivotRotation();
    }
    fitChestToTargetSize(root);
    applyChestYawPivotRotation();
  }

  function snapChestToWorld(root) {
    if (!window.THREE || !root) return;

    var THREE = window.THREE;
    var box = new THREE.Box3();
    var center = new THREE.Vector3();

    root.updateMatrixWorld(true);
    box.setFromObject(root);
    box.getCenter(center);
    root.position.set(CHEST_X - center.x, -box.min.y, CHEST_Z - center.z);
    root.updateMatrixWorld(true);
  }

  function syncChestPickVolume(root) {
    if (!window.THREE || !root) return;

    var THREE = window.THREE;
    var box = new THREE.Box3();
    var center = new THREE.Vector3();
    var size = new THREE.Vector3();
    var inv = new THREE.Matrix4();
    var pick = root.getObjectByName("ChestPickVolume");

    root.updateMatrixWorld(true);
    box.setFromObject(root);
    box.getSize(size);
    box.getCenter(center);
    inv.copy(root.matrixWorld).invert();
    center.applyMatrix4(inv);

    if (!pick) {
      pick = new THREE.Mesh(
        new THREE.BoxGeometry(
          size.x * PICK_MESH_SCALE,
          size.y * PICK_MESH_SCALE,
          size.z * PICK_MESH_SCALE
        ),
        new THREE.MeshBasicMaterial({ visible: false, depthWrite: false })
      );
      pick.name = "ChestPickVolume";
      pick.position.copy(center);
      root.add(pick);
      registerPickMesh(pick);
      return;
    }

    pick.position.copy(center);
    if (pick.geometry) pick.geometry.dispose();
    pick.geometry = new THREE.BoxGeometry(
      size.x * PICK_MESH_SCALE,
      size.y * PICK_MESH_SCALE,
      size.z * PICK_MESH_SCALE
    );
  }

  /** 正放贴地；默认用手动度数，CHEST_USE_AUTO_ORIENT 时走旧启发式 */
  function orientChestModel(model) {
    if (!window.THREE || !model) return;
    if (!CHEST_USE_AUTO_ORIENT) {
      applyChestModelPivotRotation();
      return;
    }
    var THREE = window.THREE;
    var presets = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: Math.PI / 2, z: 0 },
      { x: 0, y: Math.PI, z: 0 },
      { x: 0, y: -Math.PI / 2, z: 0 },
      { x: Math.PI / 2, y: 0, z: 0 },
      { x: -Math.PI / 2, y: 0, z: 0 },
      { x: Math.PI / 2, y: Math.PI / 2, z: 0 },
      { x: -Math.PI / 2, y: Math.PI / 2, z: 0 },
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
      var score = 0;
      if (size.y >= size.x && size.y >= size.z) score += 60;
      score +=
        50 -
        (Math.abs(size.x - CHEST_SIZE.x) +
          Math.abs(size.y - CHEST_SIZE.y) +
          Math.abs(size.z - CHEST_SIZE.z)) *
          12;
      if (-box.min.z >= box.max.z) score += 45;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }

    model.rotation.set(best.x, best.y, best.z);
    model.updateMatrixWorld(true);

    var upright = new THREE.Box3().setFromObject(model);
    var upSize = new THREE.Vector3();
    upright.getSize(upSize);
    if (upSize.y < upSize.x * 0.9) {
      model.rotation.x -= Math.PI / 2;
      model.updateMatrixWorld(true);
    }

    model.rotation.z = 0;
    model.updateMatrixWorld(true);
  }

  function rememberLidPose() {
    lidClosedRotation = null;
    if (!lidNode) return;
    lidClosedRotation = {
      x: lidNode.rotation.x,
      y: lidNode.rotation.y,
      z: lidNode.rotation.z,
    };
  }

  function resetChestPose() {
    if (chestRoot) {
      applyChestTransformAndFit(chestRoot);
      snapChestToWorld(chestRoot);
      syncChestPickVolume(chestRoot);
    }
    if (lidNode && lidClosedRotation) {
      lidNode.rotation.set(
        lidClosedRotation.x,
        lidClosedRotation.y,
        lidClosedRotation.z
      );
    }
  }

  function finalizeChestPlacement(root, binSize) {
    if (!window.THREE || !root) return;

    applyChestTransformAndFit(root);
    snapChestToWorld(root);

    lidNode = findLidNode(root);
    rememberLidPose();

    syncChestPickVolume(root);

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
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.75), wood));
    root.children[0].position.y = 0.325;
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
    var buildGen = chestBuildGeneration;
    sceneHelpers.loadGltfCached(
      CHEST_GLB_URL,
      function (gltf) {
        if (buildGen !== chestBuildGeneration) return;
        var THREE = window.THREE;
        if (!THREE) {
          buildProceduralChest(parent);
          return;
        }
        var model = gltf.scene.clone(true);
        var root = new THREE.Group();
        var yawPivot = new THREE.Group();
        var modelPivot = new THREE.Group();
        root.name = "PirateLootChest_GLB";
        yawPivot.name = "ChestYawPivot";
        modelPivot.name = "ChestModelPivot";
        chestModel = model;
        chestYawPivot = yawPivot;
        chestModelPivot = modelPivot;
        resetGltfScenePose(model);
        modelPivot.add(model);
        yawPivot.add(modelPivot);
        root.add(yawPivot);
        model.traverse(function (child) {
          if (!child.isMesh || !child.material) return;
          child.castShadow = true;
          child.receiveShadow = true;
        });
        parent.add(root);
        finalizeChestPlacement(root, CHEST_SIZE);
      },
      function () {
        if (buildGen !== chestBuildGeneration) return;
        buildProceduralChest(parent);
      }
    );
  }

  function getChestOrientation() {
    var radToDeg = function (rad) {
      return (rad * 180) / Math.PI;
    };
    return {
      config: {
        CHEST_MODEL_ROT_X_DEG: CHEST_MODEL_ROT_X_DEG,
        CHEST_MODEL_ROT_Y_DEG: CHEST_MODEL_ROT_Y_DEG,
        CHEST_MODEL_ROT_Z_DEG: CHEST_MODEL_ROT_Z_DEG,
        CHEST_YAW_DEG: CHEST_YAW_DEG,
      },
      chestRootName: chestRoot ? chestRoot.name : null,
      modelPivotDeg: chestModelPivot
        ? {
            x: radToDeg(chestModelPivot.rotation.x),
            y: radToDeg(chestModelPivot.rotation.y),
            z: radToDeg(chestModelPivot.rotation.z),
          }
        : null,
      yawPivotDeg: chestYawPivot
        ? radToDeg(chestYawPivot.rotation.y)
        : null,
    };
  }

  function refreshChestOrientation() {
    resetChestPose();
    return getChestOrientation();
  }

  function build(parent, helpers) {
    sceneHelpers = helpers || null;
    if (!parent) return null;
    destroyChest();
    bindPanelDom();
    buildGlbChest(parent);
    return chestRoot;
  }

  function canSeeChest(px, pz) {
    if (window.ActionScene && window.ActionScene.hasLineOfSight) {
      return window.ActionScene.hasLineOfSight(
        px,
        pz,
        CHEST_X,
        CHEST_SIZE.y * 0.55,
        CHEST_Z
      );
    }
    return true;
  }

  function updateAim(px, pz, camera) {
    aimed = false;
    if (!camera || !pickMesh) return;
    if (!playerNear(px, pz) || !canSeeChest(px, pz)) return;

    var THREE = window.THREE;
    if (!THREE) return;

    if (!_raycaster) _raycaster = new THREE.Raycaster();
    if (!_ndc) _ndc = new THREE.Vector2(0, 0);

    pickMesh.updateMatrixWorld(true);
    _raycaster.setFromCamera(_ndc, camera);
    var hits = _raycaster.intersectObject(pickMesh, false);
    if (hits.length > 0) {
      aimed = true;
    }
  }

  function isAimed() {
    return aimed;
  }

  function isAimedAtChest() {
    if (!aimed) return false;
    if (!opened && !isOpenedPersisted()) return true;
    return chestManager && chestManager.items.length > 0;
  }

  /** 是否显示开锁/查看提示；未开锁时靠近即显示，已开则须对准（手机可放宽） */
  function shouldShowLockpickHint(px, pz, relaxAim) {
    if (!playerNear(px, pz) || !canSeeChest(px, pz)) return false;
    if (!opened && !isOpenedPersisted()) return true;
    if (!aimed && !relaxAim) return false;
    return !!(chestManager && chestManager.items.length > 0);
  }

  function canInteractWithChest(px, pz, relaxAim) {
    if (relaxAim) {
      if (px == null || pz == null) return false;
      return shouldShowLockpickHint(px, pz, true);
    }
    if (!aimed) return false;
    if (!opened && !isOpenedPersisted()) return true;
    return !!(chestManager && chestManager.items.length > 0);
  }

  function clearRevealTimers() {
    var i;
    for (i = 0; i < revealTimers.length; i++) {
      clearTimeout(revealTimers[i]);
    }
    revealTimers = [];
  }

  function revealDelayMs(cat) {
    var price = cat.reclaimMin || 0;
    if (price >= 30000) return 2200;
    if (price >= 8000) return 1300;
    if (price >= 1000) return 700;
    return 400;
  }

  function ensureChestManager() {
    if (!G) return null;
    if (!chestManager) {
      chestManager = new G.GridManager(CHEST_COLS, CHEST_ROWS);
    }
    return chestManager;
  }

  function tryPlaceInChestGrid(cat) {
    var mgr = ensureChestManager();
    if (!mgr || !cat) return null;
    var data = G.itemDataFromCatalog(cat);
    if (!data) return null;
    var inst = G.createInventoryItem(data);
    if (!mgr.tryAutoPlace(inst)) return null;
    return inst;
  }

  function populateChestFromRoll() {
    if (!window.PirateLootRoll || !window.ItemCatalog) return;

    var mgr = ensureChestManager();
    if (!mgr) return;

    mgr.items = [];
    mgr._initGrid();

    var catalogIds = window.PirateLootRoll.rollPirateChest({
      guaranteeEpic: firstChestGuarantee,
    });
    if (firstChestGuarantee) {
      firstChestGuarantee = false;
    }
    var queue = [];
    var i;
    var cum = 350;

    for (i = 0; i < catalogIds.length; i++) {
      var cat = window.ItemCatalog.getItem(catalogIds[i]);
      if (!cat) continue;
      var inst = tryPlaceInChestGrid(cat);
      if (!inst) continue;
      cum += revealDelayMs(cat);
      queue.push({
        instanceId: inst.instanceId,
        revealAt: cum,
      });
      itemMeta[inst.instanceId] = { revealed: false };
    }

    queue.sort(function (a, b) {
      return a.revealAt - b.revealAt;
    });

    clearRevealTimers();
    for (i = 0; i < queue.length; i++) {
      (function (entry) {
        var t = setTimeout(function () {
          revealChestItem(entry.instanceId);
        }, entry.revealAt);
        revealTimers.push(t);
      })(queue[i]);
    }

    if (statusEl) {
      statusEl.textContent =
        queue.length > 0
          ? "物资逐渐显现… 双击：先安全箱，再背包"
          : "箱内没有空间放下本次掉落";
    }
  }

  function bindPanelDom() {
    if (panelEl) return;
    panelEl = document.getElementById("pirateChestLoot");
    gridHostEl = document.getElementById("pirateChestLootGrid");
    statusEl = document.getElementById("pirateChestLootStatus");
    backdropEl = document.getElementById("pirateChestLootBackdrop");
    btnClose = document.getElementById("pirateChestLootClose");

    if (btnClose) {
      btnClose.addEventListener("click", closeChestPanel);
    }
    if (backdropEl) {
      backdropEl.addEventListener("click", closeChestPanel);
    }
  }

  function buildGridDom() {
    if (!gridHostEl || !chestManager) return;
    gridHostEl.innerHTML = "";
    gridHostEl.className = "inv-grid-host pirate-chest-loot__grid";

    var wrap = document.createElement("div");
    wrap.className = "inv-grid-board pirate-chest-loot__board";
    wrap.style.setProperty("--inv-cols", String(CHEST_COLS));
    wrap.style.setProperty("--inv-rows", String(CHEST_ROWS));

    var bg = document.createElement("div");
    bg.className = "inv-grid-bg";
    var itemsLayer = document.createElement("div");
    itemsLayer.className = "inv-items-layer";

    var n = CHEST_COLS * CHEST_ROWS;
    var i;
    for (i = 0; i < n; i++) {
      var cell = document.createElement("div");
      cell.className = "inv-grid-bg__cell";
      bg.appendChild(cell);
    }

    wrap.appendChild(bg);
    wrap.appendChild(itemsLayer);
    gridHostEl.appendChild(wrap);

    for (i = 0; i < chestManager.items.length; i++) {
      itemsLayer.appendChild(
        renderChestItemElement(chestManager.items[i])
      );
    }
  }

  function renderChestItemElement(inst) {
    var el = document.createElement("div");
    el.className = "inv-item pirate-chest-loot__item";
    el.dataset.instanceId = String(inst.instanceId);
    el.style.left = (inst.x / CHEST_COLS) * 100 + "%";
    el.style.top = (inst.y / CHEST_ROWS) * 100 + "%";
    el.style.width = (inst.itemData.width / CHEST_COLS) * 100 + "%";
    el.style.height = (inst.itemData.height / CHEST_ROWS) * 100 + "%";

    var meta = itemMeta[inst.instanceId];
    if (!meta || !meta.revealed) {
      el.classList.add("pirate-chest-loot__item--hidden");
    }

    var label = document.createElement("span");
    label.className = "inv-item__label";
    label.textContent = inst.itemData.name;
    el.appendChild(label);

    if (inst.itemData.icon) {
      el.style.backgroundImage = "url(" + inst.itemData.icon + ")";
    }

    el.title = inst.itemData.name + " · 双击：先安全箱，放不下再试背包";

    el.addEventListener("dblclick", function (e) {
      e.preventDefault();
      e.stopPropagation();
      tryTakeToSecure(inst);
    });

    return el;
  }

  function revealChestItem(instanceId) {
    var meta = itemMeta[instanceId];
    if (!meta || meta.revealed) return;
    meta.revealed = true;

    if (!gridHostEl) return;
    var el = gridHostEl.querySelector(
      '[data-instance-id="' + instanceId + '"]'
    );
    if (!el) return;
    el.classList.remove("pirate-chest-loot__item--hidden");
    el.classList.add("pirate-chest-loot__item--pop");
  }

  function setChestLootStatus(text) {
    if (!statusEl) return;
    statusEl.textContent = text;
  }

  function tryTakeToSecure(inst) {
    if (!inst || !chestManager) return;
    var meta = itemMeta[inst.instanceId];
    if (!meta || !meta.revealed) return;

    var cat = window.ItemCatalog.getItem(inst.itemData.id);
    if (!cat) return;

    if (
      !window.PlayerLoadout ||
      !window.PlayerLoadout.tryPlaceLootInSecureThenBackpack
    ) {
      return;
    }

    var dest = window.PlayerLoadout.tryPlaceLootInSecureThenBackpack(cat);
    if (!dest) {
      if (!window.PlayerLoadout.getLoadout().backpack) {
        setChestLootStatus(
          "「" + cat.name + "」安全箱已满，且未装备背包 · 仍留在箱内"
        );
      } else {
        setChestLootStatus(
          "「" + cat.name + "」安全箱与背包均无空位 · 仍留在箱内"
        );
      }
      return;
    }

    chestManager.removeItem(inst);
    delete itemMeta[inst.instanceId];
    buildGridDom();

    if (window.GridStashUI) window.GridStashUI.render();
    if (window.ActionInventory && window.ActionInventory.refresh) {
      window.ActionInventory.refresh();
    }

    if (dest === "secure") {
      setChestLootStatus("已放入安全箱：「" + cat.name + "」");
    } else {
      setChestLootStatus("安全箱已满，已放入背包：「" + cat.name + "」");
    }

    if (chestManager.items.length === 0) {
      setChestLootStatus("已搬空");
    }
  }

  function openChestPanel() {
    bindPanelDom();
    if (!panelEl) return;
    if (!chestManager) {
      ensureChestManager();
    }
    buildGridDom();
    panelEl.hidden = false;
    panelOpen = true;
    document.body.classList.add("pirate-chest-loot-open", "show-cursor");
  }

  function closeChestPanel() {
    if (!panelEl) return;
    panelEl.hidden = true;
    panelOpen = false;
    document.body.classList.remove("pirate-chest-loot-open");
    if (
      !window.ActionInventory ||
      !window.ActionInventory.isOpen ||
      !window.ActionInventory.isOpen()
    ) {
      document.body.classList.remove("show-cursor");
    }
  }

  function onQTESuccess() {
    if (opened || isOpenedPersisted()) {
      openChestPanel();
      return;
    }
    markOpened();
    populateChestFromRoll();
    openChestPanel();
    if (window.ActionScene && window.ActionScene.onChestOpened) {
      window.ActionScene.onChestOpened();
    }
  }

  function tryStartLockpick(opts) {
    opts = opts || {};
    var px = opts.px;
    var pz = opts.pz;
    var relaxAim = !!opts.relaxAim;

    if (!canInteractWithChest(px, pz, relaxAim)) return false;

    if (opened || isOpenedPersisted()) {
      openChestPanel();
      return true;
    }
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

  /** 手机点词条：靠近且视线通畅即可开锁 */
  function tryInteractNear(px, pz) {
    return tryStartLockpick({ px: px, pz: pz, relaxAim: true });
  }

  function resetForNewRun(options) {
    options = options || {};
    firstChestGuarantee = !!options.firstChestGuarantee;
    aimed = false;
    opened = false;
    clearRevealTimers();
    itemMeta = Object.create(null);
    chestManager = null;
    closeChestPanel();
    if (chestRoot && chestRoot.parent) {
      refreshChestOrientation();
    }
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  window.WorldLootBox = {
    CHEST_GLB_URL: CHEST_GLB_URL,
    CHEST_X: CHEST_X,
    CHEST_Z: CHEST_Z,
    CHEST_MODEL_ROT_X_DEG: CHEST_MODEL_ROT_X_DEG,
    CHEST_MODEL_ROT_Y_DEG: CHEST_MODEL_ROT_Y_DEG,
    CHEST_MODEL_ROT_Z_DEG: CHEST_MODEL_ROT_Z_DEG,
    CHEST_YAW_DEG: CHEST_YAW_DEG,
    getChestOrientation: getChestOrientation,
    refreshChestOrientation: refreshChestOrientation,
    destroyChest: destroyChest,
    build: build,
    registerPickMesh: registerPickMesh,
    updateAim: updateAim,
    isAimed: isAimed,
    isAimedAtChest: isAimedAtChest,
    shouldShowLockpickHint: shouldShowLockpickHint,
    playerNear: playerNear,
    canSeeChest: canSeeChest,
    tryStartLockpick: tryStartLockpick,
    tryInteractNear: tryInteractNear,
    onQTESuccess: onQTESuccess,
    isOpened: function () {
      return opened || isOpenedPersisted();
    },
    isPanelOpen: function () {
      return panelOpen;
    },
    openChestPanel: openChestPanel,
    closeChestPanel: closeChestPanel,
    resetForNewRun: resetForNewRun,
  };
})();
