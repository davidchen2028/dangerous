/**
 * 测试地图 · 隐秘藏品箱 — 黑色宝箱 + 算术密码 + 4×4 固定藏品
 */
(function () {
  "use strict";

  var G = window.GridInventory;
  var CHEST_X = -30;
  var CHEST_Z = 48;
  var CHEST_SIZE = { x: 1.05, y: 1.05, z: 0.85 };
  var CHEST_COLS = 4;
  var CHEST_ROWS = 4;
  var FIXED_ITEM_ID = "collectible_3002";
  var INTERACT_DIST = 4.2;
  var AIM_MAX_DIST = 12;
  var AIM_DOT_MIN = 0.88;
  var STORAGE_KEY = "dangerous_hidden_chest_opened";

  var pickMesh = null;
  var chestRoot = null;
  var lidNode = null;
  var lidClosedRotation = null;
  var aimed = false;
  var opened = false;
  var sceneHelpers = null;
  var panelOpen = false;
  var puzzleOpen = false;
  var chestManager = null;
  var itemMeta = Object.create(null);
  var currentPuzzle = null;

  var panelEl = null;
  var gridHostEl = null;
  var statusEl = null;
  var backdropEl = null;
  var btnClose = null;
  var puzzleEl = null;
  var puzzleQuestionEl = null;
  var puzzleInputEl = null;
  var puzzleErrorEl = null;
  var puzzleSubmitEl = null;
  var puzzleCancelEl = null;

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
    if (lidNode && lidClosedRotation) {
      lidNode.rotation.x = lidClosedRotation.x - 1.15;
      lidNode.rotation.y = lidClosedRotation.y;
      lidNode.rotation.z = lidClosedRotation.z + 0.08;
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
    if (chestRoot) chestRoot.rotation.set(0, 0, 0);
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

    var THREE = window.THREE;
    root.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(root);
    var center = new THREE.Vector3();
    box.getCenter(center);
    root.position.set(CHEST_X - center.x, -box.min.y, CHEST_Z - center.z);
    root.updateMatrixWorld(true);

    rememberLidPose();

    var pick = new THREE.Mesh(
      new THREE.BoxGeometry(binSize.x, binSize.y, binSize.z),
      new THREE.MeshBasicMaterial({ visible: false, depthWrite: false })
    );
    pick.name = "HiddenChestPickVolume";
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
    root.name = "HiddenLootChest";
    var bodyMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
    var trimMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0a });
    var lockMat = new THREE.MeshLambertMaterial({
      color: 0x1f1f1f,
      emissive: 0x050505,
    });

    root.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.75), bodyMat));
    root.children[0].position.y = 0.325;
    var band = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.12, 0.78), trimMat);
    band.position.y = 0.42;
    root.add(band);
    lidNode = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.22, 0.72), bodyMat);
    lidNode.position.set(0, 0.76, -0.08);
    lidNode.rotation.x = -0.35;
    root.add(lidNode);
    var lockPlate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.06), lockMat);
    lockPlate.position.set(0, 0.58, 0.38);
    root.add(lockPlate);
    parent.add(root);
    finalizeChestPlacement(root, CHEST_SIZE);
    return root;
  }

  function build(parent, helpers) {
    sceneHelpers = helpers || null;
    if (!parent) return null;
    bindDom();
    buildProceduralChest(parent);
    return chestRoot;
  }

  function updateAim(px, pz, camera) {
    aimed = false;
    if (!camera) return;
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
      _dir.set(
        CHEST_X - _raycaster.ray.origin.x,
        0.85 - _raycaster.ray.origin.y,
        CHEST_Z - _raycaster.ray.origin.z
      );
      var dist = _dir.length();
      if (dist <= AIM_MAX_DIST) {
        _dir.multiplyScalar(1 / dist);
        if (_raycaster.ray.direction.dot(_dir) >= AIM_DOT_MIN) {
          aimed = true;
        }
      }
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

  function populateFixedLoot() {
    if (!window.ItemCatalog) return;

    var mgr = ensureChestManager();
    if (!mgr) return;

    mgr.items = [];
    mgr._initGrid();

    var cat = window.ItemCatalog.getItem(FIXED_ITEM_ID);
    if (!cat) return;

    var inst = tryPlaceInChestGrid(cat);
    if (!inst) {
      if (statusEl) statusEl.textContent = "箱内没有空间放下藏品";
      return;
    }

    itemMeta[inst.instanceId] = { revealed: true };

    if (statusEl) {
      statusEl.textContent = "双击：先安全箱，再背包";
    }
  }

  function bindDom() {
    if (panelEl) return;

    panelEl = document.getElementById("hiddenChestLoot");
    gridHostEl = document.getElementById("hiddenChestLootGrid");
    statusEl = document.getElementById("hiddenChestLootStatus");
    backdropEl = document.getElementById("hiddenChestLootBackdrop");
    btnClose = document.getElementById("hiddenChestLootClose");

    puzzleEl = document.getElementById("hiddenChestPuzzle");
    puzzleQuestionEl = document.getElementById("hiddenChestPuzzleQuestion");
    puzzleInputEl = document.getElementById("hiddenChestPuzzleInput");
    puzzleErrorEl = document.getElementById("hiddenChestPuzzleError");
    puzzleSubmitEl = document.getElementById("hiddenChestPuzzleSubmit");
    puzzleCancelEl = document.getElementById("hiddenChestPuzzleCancel");

    if (btnClose) btnClose.addEventListener("click", closeChestPanel);
    if (backdropEl) backdropEl.addEventListener("click", closeChestPanel);
    if (puzzleCancelEl) puzzleCancelEl.addEventListener("click", closePuzzle);
    if (puzzleSubmitEl) puzzleSubmitEl.addEventListener("click", submitPuzzle);
    if (puzzleInputEl) {
      puzzleInputEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          submitPuzzle();
        }
      });
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

    el.title = inst.itemData.name + " · 双击：先安全箱，放不下再试背包";

    el.addEventListener("dblclick", function (e) {
      e.preventDefault();
      e.stopPropagation();
      tryTakeToSecure(inst);
    });

    return el;
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
    bindDom();
    if (!panelEl) return;
    if (!chestManager) ensureChestManager();
    buildGridDom();
    panelEl.hidden = false;
    panelOpen = true;
    document.body.classList.add("hidden-chest-loot-open", "show-cursor");
  }

  function closeChestPanel() {
    if (!panelEl) return;
    panelEl.hidden = true;
    panelOpen = false;
    document.body.classList.remove("hidden-chest-loot-open");
    if (
      !puzzleOpen &&
      (!window.ActionInventory ||
        !window.ActionInventory.isOpen ||
        !window.ActionInventory.isOpen())
    ) {
      document.body.classList.remove("show-cursor");
    }
  }

  function randomTwoDigit() {
    return 10 + Math.floor(Math.random() * 90);
  }

  function newPuzzle() {
    var a = randomTwoDigit();
    var b = randomTwoDigit();
    currentPuzzle = { a: a, b: b, answer: a + b };
    return currentPuzzle;
  }

  function openPuzzle() {
    bindDom();
    if (!puzzleEl) return;
    var p = newPuzzle();
    if (puzzleQuestionEl) {
      puzzleQuestionEl.textContent = p.a + " + " + p.b + " = ?";
    }
    if (puzzleInputEl) {
      puzzleInputEl.value = "";
      puzzleInputEl.focus();
    }
    if (puzzleErrorEl) puzzleErrorEl.hidden = true;
    puzzleEl.hidden = false;
    puzzleOpen = true;
    document.body.classList.add("hidden-chest-puzzle-open", "show-cursor");
  }

  function closePuzzle() {
    if (!puzzleEl) return;
    puzzleEl.hidden = true;
    puzzleOpen = false;
    currentPuzzle = null;
    document.body.classList.remove("hidden-chest-puzzle-open");
    if (
      !panelOpen &&
      (!window.ActionInventory ||
        !window.ActionInventory.isOpen ||
        !window.ActionInventory.isOpen())
    ) {
      document.body.classList.remove("show-cursor");
    }
  }

  function submitPuzzle() {
    if (!currentPuzzle || !puzzleInputEl) return;
    var raw = String(puzzleInputEl.value || "").trim();
    if (!raw) {
      if (puzzleErrorEl) {
        puzzleErrorEl.hidden = false;
        puzzleErrorEl.textContent = "请输入答案";
      }
      return;
    }
    var val = parseInt(raw, 10);
    if (isNaN(val) || val !== currentPuzzle.answer) {
      if (puzzleErrorEl) {
        puzzleErrorEl.hidden = false;
        puzzleErrorEl.textContent = "密码错误，请重试";
      }
      if (puzzleInputEl) {
        puzzleInputEl.select();
        puzzleInputEl.focus();
      }
      return;
    }
    closePuzzle();
    onUnlockSuccess();
  }

  function onUnlockSuccess() {
    if (opened || isOpenedPersisted()) {
      openChestPanel();
      return;
    }
    markOpened();
    populateFixedLoot();
    openChestPanel();
  }

  function tryInteract() {
    if (opened || isOpenedPersisted()) {
      if (!aimed) return false;
      openChestPanel();
      return true;
    }
    if (!aimed) return false;

    if (document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock();
    }
    openPuzzle();
    return true;
  }

  function resetForNewRun() {
    aimed = false;
    opened = false;
    itemMeta = Object.create(null);
    chestManager = null;
    currentPuzzle = null;
    closeChestPanel();
    closePuzzle();
    resetChestPose();
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  window.HiddenLootBox = {
    CHEST_X: CHEST_X,
    CHEST_Z: CHEST_Z,
    build: build,
    updateAim: updateAim,
    isAimed: isAimed,
    isAimedAtChest: isAimedAtChest,
    playerNear: playerNear,
    tryInteract: tryInteract,
    isOpened: function () {
      return opened || isOpenedPersisted();
    },
    isPanelOpen: function () {
      return panelOpen;
    },
    isPuzzleOpen: function () {
      return puzzleOpen;
    },
    openChestPanel: openChestPanel,
    closeChestPanel: closeChestPanel,
    closePuzzle: closePuzzle,
    resetForNewRun: resetForNewRun,
  };
})();
