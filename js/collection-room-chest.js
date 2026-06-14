/**
 * 测试地图 · 收藏室宝箱 — 海盗箱 GLB，按 E 开锁 QTE 后打开，4×4 掉落
 */
(function () {
  "use strict";

  var G = window.GridInventory;
  var CHEST_GLB_URL = "models/pirate-chest.glb";
  var CHEST_SIZE = { x: 1.05, y: 1.05, z: 0.85 };
  var CHEST_COLS = 4;
  var CHEST_ROWS = 4;
  /** 朝收藏室南门 */
  var CHEST_YAW = Math.PI;
  /** 建模导出：绕 Y 旋正（度），再叠 CHEST_YAW */
  var CHEST_MODEL_ROT_Y_DEG = 90;
  var CHEST_MODEL_ROT_Y = (CHEST_MODEL_ROT_Y_DEG * Math.PI) / 180;
  var CHEST_FLOOR_Y = 0.08;
  var INTERACT_DIST = 3.2;
  var PICK_MESH_SCALE = 0.78;
  var STORAGE_KEY = "dangerous_collection_room_chest_opened";

  var hallLayout = null;
  var chestX = 0;
  var chestZ = 0;
  var chestBoundsSize = CHEST_SIZE;
  var pickMesh = null;
  var chestRoot = null;
  var chestPivot = null;
  var chestModel = null;
  var lidNode = null;
  var lidClosedRotation = null;
  var aimed = false;
  var opened = false;
  var lootRolled = false;
  var sceneHelpers = null;
  var panelOpen = false;
  var chestManager = null;
  var itemMeta = Object.create(null);
  var revealTimers = [];

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
  }

  function playerNear(px, pz) {
    var dx = px - chestX;
    var dz = pz - chestZ;
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
        n.indexOf("hatch") >= 0
      ) {
        found = o;
      }
    });
    return found;
  }

  function resetGltfScenePose(model) {
    if (!model) return;
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.updateMatrixWorld(true);
  }

  /** 仅 Y 轴旋正 + 朝门 */
  function orientCollectionChestModel(model) {
    if (!model) return;
    model.rotation.order = "XYZ";
    model.rotation.set(0, CHEST_MODEL_ROT_Y + CHEST_YAW, 0);
    model.updateMatrixWorld(true);
  }

  function rememberLidPose() {
    lidNode = lidNode || (chestRoot && findLidNode(chestRoot));
    lidClosedRotation = null;
    if (!lidNode) return;
    lidClosedRotation = {
      x: lidNode.rotation.x,
      y: lidNode.rotation.y,
      z: lidNode.rotation.z,
    };
  }

  function resetChestPose() {
    if (chestRoot) chestRoot.rotation.set(0, 0, 0);
    if (chestModel) orientCollectionChestModel(chestModel);
    if (lidNode && lidClosedRotation) {
      lidNode.rotation.set(
        lidClosedRotation.x,
        lidClosedRotation.y,
        lidClosedRotation.z
      );
    }
  }

  function measureChestSize(root) {
    if (!window.THREE || !root) return CHEST_SIZE;
    var box = new THREE.Box3().setFromObject(root);
    var size = new THREE.Vector3();
    box.getSize(size);
    return {
      x: Math.max(0.2, size.x),
      y: Math.max(0.2, size.y),
      z: Math.max(0.2, size.z),
    };
  }

  function finalizeChestPlacement(root) {
    if (!window.THREE || !root || !hallLayout) return;

    var THREE = window.THREE;
    var box = new THREE.Box3();
    var center = new THREE.Vector3();
    var size = new THREE.Vector3();
    var inv = new THREE.Matrix4();
    chestX = hallLayout.centerX;
    chestZ = hallLayout.centerZ;

    if (chestModel) orientCollectionChestModel(chestModel);
    root.rotation.set(0, 0, 0);
    if (chestPivot) chestPivot.rotation.set(0, 0, 0);
    root.updateMatrixWorld(true);
    chestBoundsSize = measureChestSize(root);
    box.setFromObject(root);
    box.getCenter(center);
    root.position.set(
      chestX - center.x,
      CHEST_FLOOR_Y - box.min.y,
      chestZ - center.z
    );
    root.updateMatrixWorld(true);
    chestBoundsSize = measureChestSize(root);
    box.setFromObject(root);
    box.getCenter(center);
    chestX = center.x;
    chestZ = center.z;

    lidNode = findLidNode(root);
    rememberLidPose();

    box.setFromObject(root);
    box.getSize(size);
    box.getCenter(center);
    inv.copy(root.matrixWorld).invert();
    center.applyMatrix4(inv);
    var pick = new THREE.Mesh(
      new THREE.BoxGeometry(
        size.x * PICK_MESH_SCALE,
        size.y * PICK_MESH_SCALE,
        size.z * PICK_MESH_SCALE
      ),
      new THREE.MeshBasicMaterial({ visible: false, depthWrite: false })
    );
    pick.name = "CollectionRoomChestPick";
    pick.position.copy(center);
    root.add(pick);
    registerPickMesh(pick);
    chestRoot = root;

    if (sceneHelpers && sceneHelpers.registerCollider) {
      var cy = (box.min.y + box.max.y) * 0.5;
      sceneHelpers.registerCollider(
        chestBoundsSize.x,
        chestBoundsSize.y,
        chestBoundsSize.z,
        chestX,
        cy,
        chestZ
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
    root.name = "CollectionRoomChest_Fallback";
    var wood = new THREE.MeshLambertMaterial({ color: 0x5c3d28 });
    var gold = new THREE.MeshLambertMaterial({
      color: 0xc9a227,
      emissive: 0x332200,
    });
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.75), wood));
    root.children[0].position.y = 0.325;
    lidNode = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.22, 0.72), wood);
    lidNode.position.set(0, 0.76, -0.08);
    lidNode.rotation.x = -0.35;
    root.add(lidNode);
    var lockPlate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.06), gold);
    lockPlate.position.set(0, 0.58, 0.38);
    root.add(lockPlate);
    parent.add(root);
    finalizeChestPlacement(root);
    return root;
  }

  function buildGlbChest(parent) {
    if (!sceneHelpers || !sceneHelpers.loadGltfCached) {
      buildProceduralChest(parent);
      return;
    }
    sceneHelpers.loadGltfCached(
      CHEST_GLB_URL,
      function (gltf) {
        if (!window.THREE || !gltf || !gltf.scene) {
          buildProceduralChest(parent);
          return;
        }
        var model = gltf.scene.clone(true);
        var root = new THREE.Group();
        var pivot = new THREE.Group();
        root.name = "CollectionRoomChest_GLB";
        pivot.name = "CollectionRoomChest_Pivot";
        resetGltfScenePose(model);
        pivot.add(model);
        root.add(pivot);
        chestPivot = pivot;
        chestModel = model;
        orientCollectionChestModel(model);
        if (sceneHelpers.fitModelUniformToBox) {
          sceneHelpers.fitModelUniformToBox(root, CHEST_SIZE);
        } else if (sceneHelpers.fitModelToBox) {
          sceneHelpers.fitModelToBox(root, CHEST_SIZE);
          sceneHelpers.fitModelToBox(root, CHEST_SIZE);
        }
        orientCollectionChestModel(model);
        model.traverse(function (child) {
          if (!child.isMesh || !child.material) return;
          child.castShadow = false;
          child.receiveShadow = false;
        });
        parent.add(root);
        finalizeChestPlacement(root);
      },
      function () {
        buildProceduralChest(parent);
      }
    );
  }

  function build(parent, helpers, placement) {
    sceneHelpers = helpers || null;
    hallLayout = placement && placement.hall ? placement.hall : null;
    if (!parent || !hallLayout) return null;
    bindDom();
    buildGlbChest(parent);
    return chestRoot;
  }

  function canSeeChest(px, pz) {
    if (window.ActionScene && window.ActionScene.hasLineOfSight) {
      return window.ActionScene.hasLineOfSight(
        px,
        pz,
        chestX,
        chestBoundsSize.y * 0.55,
        chestZ
      );
    }
    if (sceneHelpers && sceneHelpers.hasLineOfSight) {
      return sceneHelpers.hasLineOfSight(
        px,
        pz,
        chestX,
        chestBoundsSize.y * 0.55,
        chestZ
      );
    }
    return true;
  }

  function updateAim(px, pz, camera) {
    aimed = false;
    if (!camera || !playerNear(px, pz) || !canSeeChest(px, pz) || !pickMesh) {
      return;
    }

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

  function isAimedAtChest() {
    if (!aimed) return false;
    if (!opened && !isOpenedPersisted()) return true;
    return chestManager && chestManager.items.length > 0;
  }

  function ensureChestManager() {
    if (!G) return null;
    if (
      !chestManager ||
      chestManager.columns !== CHEST_COLS ||
      chestManager.rows !== CHEST_ROWS
    ) {
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

  function populateChestRoll() {
    if (!window.PirateLootRoll || !window.ItemCatalog) return;

    var mgr = ensureChestManager();
    if (!mgr) return;

    mgr.items = [];
    mgr._initGrid();
    itemMeta = Object.create(null);
    lootRolled = true;

    var catalogIds = window.PirateLootRoll.rollPirateChest();
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

  function bindDom() {
    if (panelEl) return;
    panelEl = document.getElementById("collectionRoomChestLoot");
    gridHostEl = document.getElementById("collectionRoomChestLootGrid");
    statusEl = document.getElementById("collectionRoomChestLootStatus");
    backdropEl = document.getElementById("collectionRoomChestLootBackdrop");
    btnClose = document.getElementById("collectionRoomChestLootClose");
    if (btnClose) btnClose.addEventListener("click", closeChestPanel);
    if (backdropEl) backdropEl.addEventListener("click", closeChestPanel);
  }

  function buildGridDom() {
    if (!gridHostEl || !chestManager) return;
    gridHostEl.innerHTML = "";
    gridHostEl.className = "inv-grid-host pirate-chest-loot__grid";

    var wrap = document.createElement("div");
    wrap.className =
      "inv-grid-board pirate-chest-loot__board collection-room-loot__board";
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
      itemsLayer.appendChild(renderChestItemElement(chestManager.items[i]));
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
      if (statusEl) {
        statusEl.textContent = "安全箱与背包均无空位 · 仍留在箱内";
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

    if (statusEl) {
      if (dest === "secure") {
        statusEl.textContent = "已放入安全箱：「" + cat.name + "」";
      } else {
        statusEl.textContent = "安全箱已满，已放入背包：「" + cat.name + "」";
      }
      if (chestManager.items.length === 0) {
        statusEl.textContent = "已取空";
      }
    }
  }

  function openChestPanel() {
    bindDom();
    if (!panelEl) return;
    if (!chestManager) ensureChestManager();
    buildGridDom();
    panelEl.hidden = false;
    panelOpen = true;
    document.body.classList.add("collection-room-loot-open", "show-cursor");
  }

  function closeChestPanel() {
    if (!panelEl) return;
    panelEl.hidden = true;
    panelOpen = false;
    document.body.classList.remove("collection-room-loot-open");
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
    populateChestRoll();
    openChestPanel();
  }

  function tryStartLockpick() {
    if (opened || isOpenedPersisted()) {
      if (!aimed) return false;
      if (document.pointerLockElement && document.exitPointerLock) {
        document.exitPointerLock();
      }
      openChestPanel();
      return true;
    }
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
    opened = false;
    lootRolled = false;
    itemMeta = Object.create(null);
    chestManager = null;
    clearRevealTimers();
    closeChestPanel();
    resetChestPose();
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  window.CollectionRoomChest = {
    CHEST_GLB_URL: CHEST_GLB_URL,
    build: build,
    updateAim: updateAim,
    isAimedAtChest: isAimedAtChest,
    playerNear: playerNear,
    tryStartLockpick: tryStartLockpick,
    tryInteract: tryStartLockpick,
    isOpened: function () {
      return opened || isOpenedPersisted();
    },
    isPanelOpen: function () {
      return panelOpen;
    },
    closeChestPanel: closeChestPanel,
    resetForNewRun: resetForNewRun,
  };
})();
