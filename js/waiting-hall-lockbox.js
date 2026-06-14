/**
 * 等候厅 · 古董匣 — 4×4 藏品箱，按 E 直接打开（无密码）
 */
(function () {
  "use strict";

  var G = window.GridInventory;
  var LOCKBOX_GLB_URL = "models/historical-lockbox.glb";
  var CHEST_COLS = 4;
  var CHEST_ROWS = 4;
  var FALLBACK_CHEST_SIZE = { x: 1.05, y: 1.05, z: 0.85 };
  var chestBoundsSize = { x: 1, y: 1, z: 1 };
  var CHEST_YAW = Math.PI * 0.15;
  /** 与等候厅地板顶面对齐（TEST_ROAD_SURFACE_Y） */
  var LOCKBOX_FLOOR_Y = 0.08;
  /** 摆在等候厅中桌桌面上的占位 */
  var LOCKBOX_ON_TABLE_SIZE = { x: 0.52, y: 0.48, z: 0.52 };
  var hallCorner = null;
  var tablePlacement = null;
  var INTERACT_DIST = 2.8;
  var PICK_MESH_SCALE = 0.78;
  var STORAGE_KEY = "dangerous_waiting_lockbox_opened";

  var chestX = 0;
  var chestZ = 0;
  var pickMesh = null;
  var chestRoot = null;
  var lidNode = null;
  var lidClosedRotation = null;
  var aimed = false;
  var opened = false;
  var lootRolled = false;
  var sceneHelpers = null;
  var panelOpen = false;
  var chestManager = null;
  var itemMeta = Object.create(null);

  var panelEl = null;
  var gridHostEl = null;
  var statusEl = null;
  var backdropEl = null;
  var btnClose = null;

  var _raycaster = null;
  var _ndc = null;
  var _footprintVec = null;

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
      lidNode.rotation.x = lidClosedRotation.x - 1.05;
      lidNode.rotation.y = lidClosedRotation.y;
      lidNode.rotation.z = lidClosedRotation.z + 0.06;
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

  /** 采样某高度附近在 XZ 上的占地，用于判断哪一面是底 */
  function xzFootprintAreaAtWorldY(object, worldY, tolerance) {
    if (!window.THREE) return 0;
    var minX = Infinity;
    var maxX = -Infinity;
    var minZ = Infinity;
    var maxZ = -Infinity;
    var found = false;
    if (!_footprintVec) _footprintVec = new window.THREE.Vector3();

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

  /** 顶面比底面宽时翻转 180°，保证宽底朝下 */
  function ensureLockboxBaseOnFloor(model) {
    if (!window.THREE || !model) return;
    var THREE = window.THREE;
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

  /** 底面朝下：世界 Y 为高度轴（通常 Y 为最短边），宽底贴地 */
  function orientLockboxModel(model) {
    if (!window.THREE) return;
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
      { x: 0, y: 0, z: Math.PI / 2 },
      { x: 0, y: Math.PI / 2, z: Math.PI / 2 },
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
      var dims = [size.x, size.y, size.z].sort(function (a, b) {
        return a - b;
      });
      var score = 0;

      if (size.y <= size.x && size.y <= size.z) score += 90;
      else score -= 220;
      if (Math.abs(size.y - dims[0]) < dims[0] * 0.22) score += 50;
      score += (size.x * size.z) / Math.max(0.01, size.y);

      var tol = Math.max(0.04, size.y * 0.08);
      var areaBottom = xzFootprintAreaAtWorldY(model, box.min.y + tol, tol);
      var areaTop = xzFootprintAreaAtWorldY(model, box.max.y - tol, tol);
      if (areaBottom >= areaTop) score += 70;
      else score -= 40;

      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }

    model.rotation.set(best.x, best.y, best.z);
    model.updateMatrixWorld(true);

    var upBox = new THREE.Box3().setFromObject(model);
    var upSize = new THREE.Vector3();
    upBox.getSize(upSize);
    if (upSize.y > upSize.x && upSize.y > upSize.z) {
      model.rotation.x -= Math.PI / 2;
      model.updateMatrixWorld(true);
    }

    ensureLockboxBaseOnFloor(model);
    model.rotation.z = 0;
    model.rotation.y = 0;
    model.updateMatrixWorld(true);
  }

  function snapLockboxToHallWalls(root) {
    if (!hallCorner || !window.THREE || !root) return;
    var westInnerX = hallCorner.centerX - hallCorner.halfW;
    var northInnerZ = hallCorner.centerZ + hallCorner.halfD;
    var wallPad = 0.12;
    var box = new THREE.Box3();

    root.updateMatrixWorld(true);
    box.setFromObject(root);
    if (box.min.x < westInnerX + wallPad) {
      root.position.x += westInnerX + wallPad - box.min.x;
    }
    if (box.max.z > northInnerZ - wallPad) {
      root.position.z += northInnerZ - wallPad - box.max.z;
    }
  }

  function snapLockboxToFloor(root) {
    if (!window.THREE || !root) return;
    var box = new THREE.Box3().setFromObject(root);
    root.position.y += LOCKBOX_FLOOR_Y - box.min.y;
  }

  function snapLockboxToSurfaceY(root, surfaceY) {
    if (!window.THREE || !root) return;
    var box = new THREE.Box3().setFromObject(root);
    root.position.y += surfaceY - box.min.y;
    root.updateMatrixWorld(true);
  }

  function faceLockboxIntoHall(root) {
    if (!hallCorner || !root || !root.children.length) return;
    var model = root.children[0];
    root.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(root);
    var cx = (box.min.x + box.max.x) * 0.5;
    var cz = (box.min.z + box.max.z) * 0.5;
    var dx = hallCorner.centerX - cx;
    var dz = hallCorner.centerZ - cz;
    model.rotation.y = Math.atan2(dx, dz) + CHEST_YAW;
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
    if (lidNode && lidClosedRotation) {
      lidNode.rotation.set(
        lidClosedRotation.x,
        lidClosedRotation.y,
        lidClosedRotation.z
      );
    }
  }

  function measureChestSize(root) {
    if (!window.THREE || !root) return FALLBACK_CHEST_SIZE;
    var THREE = window.THREE;
    root.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(root);
    var size = new THREE.Vector3();
    box.getSize(size);
    return {
      x: Math.max(0.2, size.x),
      y: Math.max(0.2, size.y),
      z: Math.max(0.2, size.z),
    };
  }

  function finalizeChestPlacement(root, binSize) {
    if (!window.THREE || !root) return;

    var THREE = window.THREE;
    var box = new THREE.Box3();
    var center = new THREE.Vector3();
    var size = new THREE.Vector3();
    var inv = new THREE.Matrix4();

    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.updateMatrixWorld(true);
    chestBoundsSize = binSize || measureChestSize(root);

    if (tablePlacement) {
      chestX = tablePlacement.x;
      chestZ = tablePlacement.z;
      if (sceneHelpers && sceneHelpers.fitModelToBox) {
        sceneHelpers.fitModelToBox(root, LOCKBOX_ON_TABLE_SIZE);
        sceneHelpers.fitModelToBox(root, LOCKBOX_ON_TABLE_SIZE);
        chestBoundsSize = measureChestSize(root);
      }
    } else if (hallCorner) {
      chestX = hallCorner.centerX - hallCorner.halfW + 1.2;
      chestZ = hallCorner.centerZ + hallCorner.halfD - 1.2;
    }

    root.updateMatrixWorld(true);
    box.setFromObject(root);
    box.getCenter(center);
    root.position.set(chestX - center.x, 0, chestZ - center.z);
    root.updateMatrixWorld(true);

    if (tablePlacement) {
      snapLockboxToSurfaceY(root, tablePlacement.topY);
      faceLockboxIntoHall(root);
      snapLockboxToSurfaceY(root, tablePlacement.topY);
    } else {
      snapLockboxToHallWalls(root);
      snapLockboxToFloor(root);
      faceLockboxIntoHall(root);
      snapLockboxToHallWalls(root);
      snapLockboxToFloor(root);
    }
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
    pick.name = "WaitingLockboxPickVolume";
    pick.position.copy(center);
    root.add(pick);
    registerPickMesh(pick);
    chestRoot = root;

    if (sceneHelpers && sceneHelpers.registerCollider) {
      box.setFromObject(root);
      var chestCy = (box.min.y + box.max.y) * 0.5;
      sceneHelpers.registerCollider(
        chestBoundsSize.x,
        chestBoundsSize.y,
        chestBoundsSize.z,
        chestX,
        chestCy,
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
    root.name = "WaitingLockbox_Fallback";
    var body = new THREE.MeshLambertMaterial({ color: 0x3a3228 });
    var trim = new THREE.MeshLambertMaterial({ color: 0x8a7048 });
    root.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.38), body));
    root.children[0].position.y = 0.16;
    lidNode = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.36), trim);
    lidNode.position.set(0, 0.38, -0.04);
    lidNode.rotation.x = -0.4;
    root.add(lidNode);
    parent.add(root);
    finalizeChestPlacement(root, FALLBACK_CHEST_SIZE);
    return root;
  }

  function buildGlbChest(parent) {
    if (!sceneHelpers || !sceneHelpers.loadGltfCached) {
      buildProceduralChest(parent);
      return;
    }
    sceneHelpers.loadGltfCached(
      LOCKBOX_GLB_URL,
      function (gltf) {
        var THREE = window.THREE;
        if (!THREE || !gltf || !gltf.scene) {
          buildProceduralChest(parent);
          return;
        }
        var model = gltf.scene.clone(true);
        var root = new THREE.Group();
        root.name = "WaitingLockbox_GLB";
        root.add(model);
        orientLockboxModel(model);
        model.traverse(function (child) {
          if (!child.isMesh || !child.material) return;
          child.castShadow = true;
          child.receiveShadow = true;
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
    hallCorner = null;
    tablePlacement = null;
    if (placement && placement.hall) {
      hallCorner = {
        centerX: placement.hall.centerX,
        centerZ: placement.hall.centerZ,
        halfW: placement.hall.halfW,
        halfD: placement.hall.halfD,
      };
    }
    if (placement && placement.tableTop) {
      tablePlacement = placement.tableTop;
    } else if (placement && placement.x != null && placement.z != null) {
      chestX = placement.x;
      chestZ = placement.z;
    }
    if (!parent) return null;
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

  /** 准星命中箱体拾取盒，且视线不被墙挡 */
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

  function populateChestRoll() {
    if (!window.PirateLootRoll || !window.ItemCatalog) return;

    var mgr = ensureChestManager();
    if (!mgr) return;

    mgr.items = [];
    mgr._initGrid();
    itemMeta = Object.create(null);
    lootRolled = true;

    var catalogIds = window.PirateLootRoll.rollPirateChest();
    var placed = 0;
    var i;
    var lastName = "";

    for (i = 0; i < catalogIds.length; i++) {
      var cat = window.ItemCatalog.getItem(catalogIds[i]);
      if (!cat) continue;
      var inst = tryPlaceInChestGrid(cat);
      if (!inst) continue;
      itemMeta[inst.instanceId] = { revealed: true };
      placed += 1;
      lastName = cat.name;
    }

    if (statusEl) {
      if (placed === 0) {
        statusEl.textContent = "箱内没有空间放下本次掉落";
      } else if (placed === 1) {
        statusEl.textContent = "「" + lastName + "」 · 双击取出";
      } else {
        statusEl.textContent =
          "共 " + placed + " 件 · 双击取出（先安全箱，再背包）";
      }
    }
  }

  function bindDom() {
    if (panelEl) return;
    panelEl = document.getElementById("waitingLockboxLoot");
    gridHostEl = document.getElementById("waitingLockboxLootGrid");
    statusEl = document.getElementById("waitingLockboxLootStatus");
    backdropEl = document.getElementById("waitingLockboxLootBackdrop");
    btnClose = document.getElementById("waitingLockboxLootClose");
    if (btnClose) btnClose.addEventListener("click", closeChestPanel);
    if (backdropEl) backdropEl.addEventListener("click", closeChestPanel);
  }

  function buildGridDom() {
    if (!gridHostEl || !chestManager) return;
    gridHostEl.innerHTML = "";
    gridHostEl.className = "inv-grid-host pirate-chest-loot__grid";

    var wrap = document.createElement("div");
    wrap.className = "inv-grid-board pirate-chest-loot__board waiting-lockbox-loot__board";
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

    var label = document.createElement("span");
    label.className = "inv-item__label";
    label.textContent = inst.itemData.name;
    el.appendChild(label);

    if (inst.itemData.icon) {
      el.style.backgroundImage = "url(" + inst.itemData.icon + ")";
    }

    el.title = inst.itemData.name + " · 双击取出";

    el.addEventListener("dblclick", function (e) {
      e.preventDefault();
      e.stopPropagation();
      tryTakeToSecure(inst);
    });

    return el;
  }

  function setChestLootStatus(text) {
    if (statusEl) statusEl.textContent = text;
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
      setChestLootStatus("安全箱与背包均无空位 · 仍留在匣内");
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
      setChestLootStatus("已取空");
    }
  }

  function openChestPanel() {
    bindDom();
    if (!panelEl) return;
    if (!chestManager) ensureChestManager();
    buildGridDom();
    panelEl.hidden = false;
    panelOpen = true;
    document.body.classList.add("waiting-lockbox-loot-open", "show-cursor");
  }

  function closeChestPanel() {
    if (!panelEl) return;
    panelEl.hidden = true;
    panelOpen = false;
    document.body.classList.remove("waiting-lockbox-loot-open");
    if (
      !window.ActionInventory ||
      !window.ActionInventory.isOpen ||
      !window.ActionInventory.isOpen()
    ) {
      document.body.classList.remove("show-cursor");
    }
  }

  function onOpenSuccess() {
    if (!opened && !isOpenedPersisted()) {
      markOpened();
      populateChestRoll();
    } else if (!lootRolled) {
      populateChestRoll();
    }
    openChestPanel();
  }

  function tryInteract() {
    if (!aimed) return false;
    if (document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock();
    }
    onOpenSuccess();
    return true;
  }

  /** 手机点词条：靠近且视线通畅即可，不要求准星对准 */
  function tryInteractNear(px, pz) {
    if (!playerNear(px, pz) || !canSeeChest(px, pz)) return false;
    if (document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock();
    }
    onOpenSuccess();
    return true;
  }

  function resetForNewRun() {
    aimed = false;
    opened = false;
    lootRolled = false;
    itemMeta = Object.create(null);
    chestManager = null;
    closeChestPanel();
    resetChestPose();
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  window.WaitingHallLockbox = {
    LOCKBOX_GLB_URL: LOCKBOX_GLB_URL,
    build: build,
    updateAim: updateAim,
    isAimed: function () {
      return aimed;
    },
    isAimedAtChest: isAimedAtChest,
    playerNear: playerNear,
    tryInteract: tryInteract,
    tryInteractNear: tryInteractNear,
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
