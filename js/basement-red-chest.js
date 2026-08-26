/**
 * 地下室红色海盗宝箱。
 * build(parent, helpers, { x, z, floorY, yaw }) 后由场景循环调用 updateAim，
 * 准星对准并按 E 调用 tryInteract。首次开启需要连续三次开锁成功。
 */
(function () {
  "use strict";

  var MODEL_URL = "models/pirate-chest.glb";
  var STORAGE_KEY = "dangerous_basement_red_chest_v1";
  var COLS = 4;
  var ROWS = 4;
  var INTERACT_DIST = 3.3;
  var AIM_MAX_DIST = 9;
  var TARGET_SIZE = { x: 1.12, y: 1.02, z: 0.86 };
  var MODEL_YAW_OFFSET = Math.PI / 2;

  var helpers = null;
  var chestRoot = null;
  var modelRoot = null;
  var lidNode = null;
  var lidClosedRotation = null;
  var pickMesh = null;
  var manager = null;
  var aimed = false;
  var opened = false;
  var rolled = false;
  var panelOpen = false;
  var chestX = 0;
  var chestZ = 0;
  var floorY = 0;
  var chestYaw = 0;
  var bounds = { x: TARGET_SIZE.x, y: TARGET_SIZE.y, z: TARGET_SIZE.z };
  var raycaster = null;
  var ndc = null;
  var buildToken = 0;

  var panelEl = null;
  var gridEl = null;
  var statusEl = null;

  function gridApi() {
    return window.GridInventory || null;
  }

  function readState() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var state = JSON.parse(raw);
      return state && typeof state === "object" ? state : null;
    } catch (e) {
      return null;
    }
  }

  function currentItemsState() {
    if (!manager) return [];
    return manager.items.map(function (item) {
      return {
        id: item.itemData.id,
        x: item.x,
        y: item.y,
      };
    });
  }

  function writeState() {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          opened: !!opened,
          rolled: !!rolled,
          items: currentItemsState(),
        })
      );
    } catch (e) {
      /* sessionStorage may be unavailable */
    }
  }

  function ensureManager() {
    var G = gridApi();
    if (!manager && G) manager = new G.GridManager(COLS, ROWS);
    return manager;
  }

  function clearManager() {
    var mgr = ensureManager();
    if (!mgr) return null;
    mgr.items = [];
    mgr._initGrid();
    return mgr;
  }

  function placeCatalogItem(cat, x, y) {
    var G = gridApi();
    var mgr = ensureManager();
    if (!G || !mgr || !cat) return null;
    var data = G.itemDataFromCatalog(cat);
    if (!data) return null;
    var item = G.createInventoryItem(data);
    if (x != null && y != null && mgr.placeItem(item, x, y)) return item;
    return mgr.tryAutoPlace(item) ? item : null;
  }

  function restoreState() {
    var state = readState();
    if (!state) {
      opened = false;
      rolled = false;
      manager = null;
      return;
    }
    opened = !!state.opened;
    rolled = !!state.rolled;
    manager = null;
    if (!rolled || !Array.isArray(state.items)) return;
    var mgr = clearManager();
    if (!mgr || !window.ItemCatalog) return;
    state.items.forEach(function (saved) {
      if (!saved || !saved.id) return;
      placeCatalogItem(
        window.ItemCatalog.getItem(saved.id),
        Number(saved.x),
        Number(saved.y)
      );
    });
  }

  function findLid(root) {
    var found = null;
    if (!root || !root.traverse) return null;
    root.traverse(function (node) {
      if (found) return;
      var name = String(node.name || "").toLowerCase();
      if (
        name.indexOf("lid") >= 0 ||
        name.indexOf("cover") >= 0 ||
        name.indexOf("top") >= 0 ||
        name.indexOf("hatch") >= 0
      ) {
        found = node;
      }
    });
    return found;
  }

  function rememberLidPose() {
    if (!lidNode) lidNode = findLid(chestRoot);
    if (!lidNode) return;
    lidClosedRotation = {
      x: lidNode.rotation.x,
      y: lidNode.rotation.y,
      z: lidNode.rotation.z,
    };
  }

  function applyOpenedVisual() {
    if (!lidNode || !lidClosedRotation) return;
    lidNode.rotation.set(
      lidClosedRotation.x - 1.12,
      lidClosedRotation.y,
      lidClosedRotation.z + 0.06
    );
  }

  function tintModelRed(root) {
    if (!root || !root.traverse || !window.THREE) return;
    var red = new THREE.Color(0x8f161b);
    root.traverse(function (node) {
      if (!node.isMesh || !node.material) return;
      var materials = Array.isArray(node.material)
        ? node.material
        : [node.material];
      materials = materials.map(function (source) {
        var material = source.clone ? source.clone() : source;
        if (material.color && material.color.lerp) {
          material.color.lerp(red, 0.62);
        }
        if (material.emissive && material.emissive.setHex) {
          material.emissive.setHex(0x190204);
        }
        material.needsUpdate = true;
        return material;
      });
      node.material = Array.isArray(node.material) ? materials : materials[0];
      node.castShadow = true;
      node.receiveShadow = true;
    });
  }

  function addBox(parent, size, material, x, y, z) {
    var mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      material
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function buildFallback(parent, token) {
    if (!window.THREE || token !== buildToken || chestRoot) return null;
    var root = new THREE.Group();
    root.name = "BasementRedChest_Fallback";
    var redWood = new THREE.MeshStandardMaterial({
      color: 0x7d151b,
      roughness: 0.72,
      metalness: 0.12,
    });
    var darkRed = new THREE.MeshStandardMaterial({
      color: 0x3b090c,
      roughness: 0.62,
      metalness: 0.25,
    });
    var brass = new THREE.MeshStandardMaterial({
      color: 0xc69b3c,
      roughness: 0.35,
      metalness: 0.78,
    });

    addBox(root, { x: 1.12, y: 0.58, z: 0.78 }, redWood, 0, 0.29, 0);
    [-0.46, 0.46].forEach(function (x) {
      addBox(root, { x: 0.075, y: 0.56, z: 0.8 }, darkRed, x, 0.3, 0);
    });
    addBox(root, { x: 1.14, y: 0.07, z: 0.82 }, darkRed, 0, 0.08, 0);

    var lidPivot = new THREE.Group();
    lidPivot.name = "BasementRedChest_Lid";
    lidPivot.position.set(0, 0.57, -0.39);
    addBox(
      lidPivot,
      { x: 1.13, y: 0.24, z: 0.77 },
      redWood,
      0,
      0.12,
      0.385
    );
    addBox(
      lidPivot,
      { x: 1.15, y: 0.065, z: 0.79 },
      darkRed,
      0,
      0.21,
      0.385
    );
    root.add(lidPivot);
    lidNode = lidPivot;

    addBox(root, { x: 0.23, y: 0.22, z: 0.07 }, brass, 0, 0.53, 0.415);
    addBox(root, { x: 0.075, y: 0.095, z: 0.025 }, darkRed, 0, 0.53, 0.456);

    root.rotation.y = chestYaw;
    parent.add(root);
    finalizeChest(root);
    return root;
  }

  function fitRoot(root) {
    if (!helpers) return;
    if (helpers.fitModelUniformToBox) {
      helpers.fitModelUniformToBox(root, TARGET_SIZE);
    } else if (helpers.fitModelToBox) {
      helpers.fitModelToBox(root, TARGET_SIZE);
      helpers.fitModelToBox(root, TARGET_SIZE);
    }
  }

  function mountGltf(parent, gltf, token) {
    if (
      token !== buildToken ||
      chestRoot ||
      !window.THREE ||
      !gltf ||
      !gltf.scene
    ) {
      if (token === buildToken && !chestRoot) buildFallback(parent, token);
      return;
    }
    var root = new THREE.Group();
    var model = gltf.scene.clone(true);
    root.name = "BasementRedChest_GLB";
    model.name = "BasementRedChest_Model";
    model.position.set(0, 0, 0);
    model.rotation.set(0, MODEL_YAW_OFFSET + chestYaw, 0);
    model.scale.set(1, 1, 1);
    tintModelRed(model);
    root.add(model);
    modelRoot = model;
    parent.add(root);
    fitRoot(root);
    model.rotation.set(0, MODEL_YAW_OFFSET + chestYaw, 0);
    finalizeChest(root);
  }

  function finalizeChest(root) {
    if (!window.THREE || !root) return;
    root.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(root);
    var center = new THREE.Vector3();
    var size = new THREE.Vector3();
    box.getCenter(center);
    root.position.x += chestX - center.x;
    root.position.y += floorY - box.min.y;
    root.position.z += chestZ - center.z;
    root.updateMatrixWorld(true);

    box.setFromObject(root);
    box.getCenter(center);
    box.getSize(size);
    chestX = center.x;
    chestZ = center.z;
    bounds = {
      x: Math.max(0.25, size.x),
      y: Math.max(0.25, size.y),
      z: Math.max(0.25, size.z),
    };
    chestRoot = root;
    lidNode = lidNode || findLid(modelRoot || root);
    rememberLidPose();

    var localCenter = center.clone();
    localCenter.applyMatrix4(new THREE.Matrix4().copy(root.matrixWorld).invert());
    pickMesh = new THREE.Mesh(
      new THREE.BoxGeometry(bounds.x * 0.9, bounds.y * 0.9, bounds.z * 0.9),
      new THREE.MeshBasicMaterial({
        visible: false,
        depthWrite: false,
      })
    );
    pickMesh.name = "BasementRedChest_Pick";
    pickMesh.position.copy(localCenter);
    root.add(pickMesh);

    if (helpers && helpers.registerCollider) {
      helpers.registerCollider(
        bounds.x,
        bounds.y,
        bounds.z,
        chestX,
        (box.min.y + box.max.y) * 0.5,
        chestZ
      );
    }
    if (opened) applyOpenedVisual();
  }

  function ensurePanel() {
    if (panelEl || !document.body) return;
    panelEl = document.createElement("div");
    panelEl.className = "pirate-chest-loot collection-room-loot";
    panelEl.hidden = true;
    panelEl.innerHTML =
      '<div class="pirate-chest-loot__backdrop" data-basement-chest-close></div>' +
      '<div class="pirate-chest-loot__panel collection-room-loot__panel">' +
      '<header class="pirate-chest-loot__head">' +
      '<h2 class="pirate-chest-loot__title">地下室红色海盗宝箱</h2>' +
      '<button type="button" class="pirate-chest-loot__close" data-basement-chest-close aria-label="关闭">×</button>' +
      "</header>" +
      '<p class="pirate-chest-loot__status" data-basement-chest-status>4×4 · 双击取出</p>' +
      '<div class="inv-grid-host pirate-chest-loot__grid" data-basement-chest-grid></div>' +
      '<p class="pirate-chest-loot__foot"><kbd>Esc</kbd> 关闭 · 双击先安全箱再背包</p>' +
      "</div>";
    document.body.appendChild(panelEl);
    gridEl = panelEl.querySelector("[data-basement-chest-grid]");
    statusEl = panelEl.querySelector("[data-basement-chest-status]");
    var closeEls = panelEl.querySelectorAll("[data-basement-chest-close]");
    for (var i = 0; i < closeEls.length; i++) {
      closeEls[i].addEventListener("click", closePanel);
    }
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function takeItem(item) {
    if (
      !item ||
      !manager ||
      !window.ItemCatalog ||
      !window.PlayerLoadout ||
      !window.PlayerLoadout.tryPlaceLootInSecureThenBackpack
    ) {
      return;
    }
    var cat = window.ItemCatalog.getItem(item.itemData.id);
    if (!cat) return;
    var destination =
      window.PlayerLoadout.tryPlaceLootInSecureThenBackpack(cat);
    if (!destination) {
      setStatus("安全箱与背包均无空位 · 物品仍留在箱内");
      return;
    }
    manager.removeItem(item);
    writeState();
    renderGrid();
    if (window.GridStashUI && window.GridStashUI.render) {
      window.GridStashUI.render();
    }
    if (window.ActionInventory && window.ActionInventory.refresh) {
      window.ActionInventory.refresh();
    }
    setStatus(
      destination === "secure"
        ? "已放入安全箱：「" + cat.name + "」"
        : "安全箱已满，已放入背包：「" + cat.name + "」"
    );
    if (!manager.items.length) setStatus("宝箱已取空");
  }

  function renderGrid() {
    ensurePanel();
    if (!gridEl || !ensureManager()) return;
    gridEl.innerHTML = "";
    gridEl.className = "inv-grid-host pirate-chest-loot__grid";
    var board = document.createElement("div");
    board.className =
      "inv-grid-board pirate-chest-loot__board collection-room-loot__board";
    board.style.setProperty("--inv-cols", String(COLS));
    board.style.setProperty("--inv-rows", String(ROWS));
    var background = document.createElement("div");
    background.className = "inv-grid-bg";
    var layer = document.createElement("div");
    layer.className = "inv-items-layer";
    var i;
    for (i = 0; i < COLS * ROWS; i++) {
      var cell = document.createElement("div");
      cell.className = "inv-grid-bg__cell";
      background.appendChild(cell);
    }
    board.appendChild(background);
    board.appendChild(layer);
    gridEl.appendChild(board);

    manager.items.forEach(function (item) {
      var el = document.createElement("div");
      el.className = "inv-item pirate-chest-loot__item";
      el.style.left = (item.x / COLS) * 100 + "%";
      el.style.top = (item.y / ROWS) * 100 + "%";
      el.style.width = (item.itemData.width / COLS) * 100 + "%";
      el.style.height = (item.itemData.height / ROWS) * 100 + "%";
      if (item.itemData.icon) {
        el.style.backgroundImage = "url(" + item.itemData.icon + ")";
      }
      var label = document.createElement("span");
      label.className = "inv-item__label";
      label.textContent = item.itemData.name;
      el.appendChild(label);
      el.title = item.itemData.name + " · 双击拾取";
      el.addEventListener("dblclick", function (event) {
        event.preventDefault();
        event.stopPropagation();
        takeItem(item);
      });
      layer.appendChild(el);
    });
  }

  function rollLoot() {
    if (rolled) return;
    var mgr = clearManager();
    if (
      !mgr ||
      !window.PirateLootRoll ||
      !window.PirateLootRoll.rollPirateChest ||
      !window.ItemCatalog
    ) {
      return;
    }
    var ids = window.PirateLootRoll.rollPirateChest();
    ids
      .map(function (id) {
        return window.ItemCatalog.getItem(id);
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return b.w * b.h - a.w * a.h;
      })
      .forEach(function (cat) {
        placeCatalogItem(cat);
      });
    rolled = true;
    writeState();
  }

  function openPanel() {
    ensurePanel();
    if (!panelEl) return;
    renderGrid();
    setStatus(manager && manager.items.length ? "双击物品拾取" : "宝箱已取空");
    panelEl.hidden = false;
    panelOpen = true;
    document.body.classList.add("pirate-chest-loot-open", "show-cursor");
  }

  function closePanel() {
    if (panelEl) panelEl.hidden = true;
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

  function playerNear(px, pz) {
    var dx = Number(px) - chestX;
    var dz = Number(pz) - chestZ;
    return dx * dx + dz * dz <= INTERACT_DIST * INTERACT_DIST;
  }

  function canSeeChest(px, pz) {
    if (!helpers || !helpers.hasLineOfSight) return true;
    return helpers.hasLineOfSight(
      px,
      pz,
      chestX,
      floorY + bounds.y * 0.55,
      chestZ,
      0.08
    );
  }

  function updateAim(px, pz, camera) {
    aimed = false;
    if (
      !pickMesh ||
      !camera ||
      !window.THREE ||
      !playerNear(px, pz) ||
      !canSeeChest(px, pz)
    ) {
      return;
    }
    if (!raycaster) raycaster = new THREE.Raycaster();
    if (!ndc) ndc = new THREE.Vector2(0, 0);
    pickMesh.updateMatrixWorld(true);
    raycaster.setFromCamera(ndc, camera);
    raycaster.far = AIM_MAX_DIST;
    aimed = raycaster.intersectObject(pickMesh, false).length > 0;
  }

  function exitPointerLock() {
    if (document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  function finishOpening() {
    opened = true;
    applyOpenedVisual();
    rollLoot();
    writeState();
    openPanel();
  }

  function tryInteract(px, pz, relaxAim) {
    if (
      !pickMesh ||
      !playerNear(px, pz) ||
      !canSeeChest(px, pz) ||
      (!aimed && !relaxAim)
    ) {
      return false;
    }
    if (opened) {
      if (!rolled) rollLoot();
      exitPointerLock();
      openPanel();
      return true;
    }
    if (!window.LockpickingQTE || !window.LockpickingQTE.open) return false;
    exitPointerLock();
    return window.LockpickingQTE.open({
      requiredSuccesses: 3,
      greenMin: 0.4,
      greenMax: 0.68,
      speed: 0.76,
      onSuccess: finishOpening,
    });
  }

  function build(parent, sceneHelpers, placement) {
    if (!parent || !window.THREE || !placement) return null;
    helpers = sceneHelpers || null;
    chestX = Number(placement.x);
    chestZ = Number(placement.z);
    floorY = Number(placement.floorY);
    chestYaw = Number(placement.yaw) || 0;
    if (!isFinite(chestX) || !isFinite(chestZ) || !isFinite(floorY)) return null;

    buildToken += 1;
    var token = buildToken;
    aimed = false;
    chestRoot = null;
    modelRoot = null;
    lidNode = null;
    lidClosedRotation = null;
    pickMesh = null;
    restoreState();
    ensurePanel();

    if (!helpers || !helpers.loadGltfCached) {
      return buildFallback(parent, token);
    }
    helpers.loadGltfCached(
      MODEL_URL,
      function (gltf) {
        mountGltf(parent, gltf, token);
      },
      function () {
        buildFallback(parent, token);
      }
    );
    return chestRoot;
  }

  function resetForNewRun() {
    aimed = false;
    opened = false;
    rolled = false;
    manager = null;
    closePanel();
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
    if (lidNode && lidClosedRotation) {
      lidNode.rotation.set(
        lidClosedRotation.x,
        lidClosedRotation.y,
        lidClosedRotation.z
      );
    }
  }

  document.addEventListener(
    "keydown",
    function (event) {
      if (panelOpen && event.code === "Escape" && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        closePanel();
      }
    },
    true
  );

  window.BasementRedChest = {
    MODEL_URL: MODEL_URL,
    build: build,
    updateAim: updateAim,
    isAimed: function () {
      return aimed && !!pickMesh;
    },
    tryInteract: tryInteract,
    isPanelOpen: function () {
      return panelOpen;
    },
    closePanel: closePanel,
    resetForNewRun: resetForNewRun,
    getPreloadUrls: function () {
      return [MODEL_URL];
    },
  };
})();
