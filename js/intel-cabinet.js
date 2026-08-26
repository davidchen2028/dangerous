/**
 * 情报文件柜 — 程序化金属柜、三连开锁 QTE 与 4×4 搜刮面板。
 */
(function () {
  "use strict";

  var G = window.GridInventory;
  var COLS = 4;
  var ROWS = 4;
  var INTERACT_DIST = 3.8;
  var AIM_MAX_DIST = 10;
  var STORAGE_KEY = "dangerous_intel_cabinet_opened";
  var CABINET_SIZE = { x: 1.08, y: 1.9, z: 0.62 };
  var LOOT = [
    { id: "pirate_1001", weight: 2800 },
    { id: "pirate_1003", weight: 2200 },
    { id: "pirate_1002", weight: 1800 },
    { id: "collectible_3003", weight: 1400 },
    { id: "collectible_3001", weight: 800 },
    { id: "pirate_1004", weight: 400 },
    { id: null, weight: 600 },
  ];

  var cabinetRoot = null;
  var drawerGroups = [];
  var pickMesh = null;
  var sceneHelpers = null;
  var cabinetX = 0;
  var cabinetZ = 0;
  var floorY = 0;
  var cabinetYaw = 0;
  var aimed = false;
  var opened = false;
  var panelOpen = false;
  var lootRolled = false;
  var manager = null;
  var raycaster = null;
  var ndc = null;

  var panelEl = null;
  var gridEl = null;
  var statusEl = null;

  function readState() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      if (raw === "1") return { opened: true, rolled: false, items: [] };
      var state = JSON.parse(raw);
      return state && typeof state === "object" ? state : null;
    } catch (e) {
      return null;
    }
  }

  function currentItemsState() {
    if (!manager) return [];
    return manager.items.map(function (inst) {
      return {
        id: inst.itemData.id,
        x: inst.x,
        y: inst.y,
      };
    });
  }

  function writeState() {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          opened: !!opened,
          rolled: !!lootRolled,
          items: currentItemsState(),
        })
      );
    } catch (e) {
      /* sessionStorage may be unavailable in private/sandboxed contexts. */
    }
  }

  function isOpenedPersisted() {
    var state = readState();
    return state ? !!state.opened : opened;
  }

  function markOpened() {
    opened = true;
    writeState();
    applyOpenedVisual();
  }

  function makeMaterial(color, metalness, roughness) {
    return new window.THREE.MeshStandardMaterial({
      color: color,
      metalness: metalness,
      roughness: roughness,
    });
  }

  function addBox(parent, size, material, position, name) {
    var mesh = new window.THREE.Mesh(
      new window.THREE.BoxGeometry(size.x, size.y, size.z),
      material
    );
    mesh.position.set(position.x, position.y, position.z);
    mesh.name = name || "";
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function applyOpenedVisual() {
    var i;
    for (i = 0; i < drawerGroups.length; i++) {
      drawerGroups[i].position.z = -0.13 - i * 0.035;
    }
  }

  function applyClosedVisual() {
    var i;
    for (i = 0; i < drawerGroups.length; i++) {
      drawerGroups[i].position.z = 0;
    }
  }

  function removeCabinet() {
    if (cabinetRoot && cabinetRoot.parent) {
      cabinetRoot.parent.remove(cabinetRoot);
    }
    cabinetRoot = null;
    drawerGroups = [];
    pickMesh = null;
    aimed = false;
  }

  function buildProceduralCabinet(parent) {
    if (!window.THREE || !parent) return null;
    var THREE = window.THREE;
    var root = new THREE.Group();
    root.name = "IntelCabinet";
    root.position.set(cabinetX, floorY, cabinetZ);
    root.rotation.y = cabinetYaw;

    var steel = makeMaterial(0x586068, 0.86, 0.34);
    var edge = makeMaterial(0x252b30, 0.92, 0.27);
    var drawer = makeMaterial(0x69737b, 0.82, 0.37);
    var label = makeMaterial(0xd3c9a5, 0.15, 0.74);

    addBox(root, { x: 1.08, y: 0.08, z: 0.62 }, edge, { x: 0, y: 0.04, z: 0 }, "CabinetBase");
    addBox(root, { x: 1.08, y: 0.08, z: 0.62 }, edge, { x: 0, y: 1.86, z: 0 }, "CabinetTop");
    addBox(root, { x: 0.07, y: 1.74, z: 0.6 }, steel, { x: -0.505, y: 0.95, z: 0 }, "CabinetLeft");
    addBox(root, { x: 0.07, y: 1.74, z: 0.6 }, steel, { x: 0.505, y: 0.95, z: 0 }, "CabinetRight");
    addBox(root, { x: 0.94, y: 1.74, z: 0.055 }, edge, { x: 0, y: 0.95, z: 0.282 }, "CabinetBack");

    drawerGroups = [];
    var i;
    for (i = 0; i < 4; i++) {
      var drawerGroup = new THREE.Group();
      drawerGroup.name = "IntelDrawer" + (i + 1);
      drawerGroup.position.y = 1.62 - i * 0.43;
      addBox(drawerGroup, { x: 0.91, y: 0.37, z: 0.08 }, drawer, { x: 0, y: 0, z: -0.295 }, "DrawerFace");
      addBox(drawerGroup, { x: 0.34, y: 0.065, z: 0.055 }, edge, { x: 0, y: 0.035, z: -0.355 }, "DrawerHandle");
      addBox(drawerGroup, { x: 0.27, y: 0.09, z: 0.018 }, label, { x: 0, y: -0.09, z: -0.345 }, "DrawerLabel");
      root.add(drawerGroup);
      drawerGroups.push(drawerGroup);
    }

    addBox(root, { x: 0.14, y: 0.18, z: 0.055 }, edge, { x: 0.39, y: 1.77, z: -0.335 }, "CabinetLock");

    pickMesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        CABINET_SIZE.x + 0.12,
        CABINET_SIZE.y + 0.08,
        CABINET_SIZE.z + 0.12
      ),
      new THREE.MeshBasicMaterial({ visible: false, depthWrite: false })
    );
    pickMesh.name = "IntelCabinetPickVolume";
    pickMesh.position.y = CABINET_SIZE.y * 0.5;
    root.add(pickMesh);

    parent.add(root);
    cabinetRoot = root;
    if (opened || isOpenedPersisted()) {
      opened = true;
      applyOpenedVisual();
    }
    return root;
  }

  function registerCollision() {
    if (!sceneHelpers || !sceneHelpers.registerCollider) return;
    var c = Math.abs(Math.cos(cabinetYaw));
    var s = Math.abs(Math.sin(cabinetYaw));
    var worldWidth = CABINET_SIZE.x * c + CABINET_SIZE.z * s;
    var worldDepth = CABINET_SIZE.x * s + CABINET_SIZE.z * c;
    sceneHelpers.registerCollider(
      worldWidth,
      CABINET_SIZE.y,
      worldDepth,
      cabinetX,
      floorY + CABINET_SIZE.y * 0.5,
      cabinetZ
    );
  }

  function build(parent, helpers, placement) {
    placement = placement || {};
    sceneHelpers = helpers || null;
    cabinetX = placement.x != null ? placement.x : 0;
    cabinetZ = placement.z != null ? placement.z : 0;
    floorY = placement.floorY != null ? placement.floorY : 0;
    cabinetYaw = placement.yaw != null ? placement.yaw : 0;
    removeCabinet();
    ensureDom();
    restoreState();
    var root = buildProceduralCabinet(parent);
    if (root) registerCollision();
    return root;
  }

  function playerNear(px, pz) {
    if (px == null || pz == null) return true;
    var dx = px - cabinetX;
    var dz = pz - cabinetZ;
    return dx * dx + dz * dz <= INTERACT_DIST * INTERACT_DIST;
  }

  function canSeeCabinet(px, pz) {
    var los =
      (sceneHelpers && sceneHelpers.hasLineOfSight) ||
      (window.ActionScene && window.ActionScene.hasLineOfSight);
    if (!los || px == null || pz == null) return true;
    return los(px, pz, cabinetX, floorY + CABINET_SIZE.y * 0.55, cabinetZ);
  }

  function updateAim(px, pz, camera) {
    aimed = false;
    if (!pickMesh || !camera || !playerNear(px, pz) || !canSeeCabinet(px, pz)) {
      return;
    }
    var THREE = window.THREE;
    if (!THREE) return;
    if (!raycaster) {
      raycaster = new THREE.Raycaster();
      ndc = new THREE.Vector2(0, 0);
    }
    pickMesh.updateMatrixWorld(true);
    raycaster.setFromCamera(ndc, camera);
    raycaster.far = AIM_MAX_DIST;
    aimed = raycaster.intersectObject(pickMesh, false).length > 0;
  }

  function rollCount(random) {
    var r = random();
    if (r < 0.55) return 1;
    if (r < 0.9) return 2;
    return 3;
  }

  function rollOne(random) {
    var value = Math.floor(random() * 10000) + 1;
    var total = 0;
    var i;
    for (i = 0; i < LOOT.length; i++) {
      total += LOOT[i].weight;
      if (value <= total) return LOOT[i].id;
    }
    return null;
  }

  function rollLoot(random) {
    random = typeof random === "function" ? random : Math.random;
    var count = rollCount(random);
    var ids = [];
    var i;
    for (i = 0; i < count; i++) {
      var id = rollOne(random);
      if (id) ids.push(id);
    }
    return ids;
  }

  function ensureManager() {
    if (!manager && G) manager = new G.GridManager(COLS, ROWS);
    return manager;
  }

  function restoreState() {
    var state = readState();
    manager = null;
    lootRolled = !!(state && state.rolled);
    opened = !!(state && state.opened);
    if (!lootRolled || !state || !Array.isArray(state.items) || !G) return;
    var mgr = ensureManager();
    if (!mgr || !window.ItemCatalog) return;
    state.items.forEach(function (saved) {
      if (!saved || !saved.id) return;
      var cat = window.ItemCatalog.getItem(saved.id);
      var data = cat && G.itemDataFromCatalog(cat);
      if (!data) return;
      var inst = G.createInventoryItem(data);
      if (!mgr.placeItem(inst, Number(saved.x), Number(saved.y))) {
        mgr.tryAutoPlace(inst);
      }
    });
  }

  function populateLoot() {
    var mgr = ensureManager();
    lootRolled = true;
    if (!mgr || !window.ItemCatalog) return;
    mgr.items = [];
    mgr._initGrid();
    var cats = rollLoot()
      .map(function (id) {
        return window.ItemCatalog.getItem(id);
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return b.w * b.h - a.w * a.h;
      });
    var i;
    for (i = 0; i < cats.length; i++) {
      var data = G.itemDataFromCatalog(cats[i]);
      if (data) mgr.tryAutoPlace(G.createInventoryItem(data));
    }
    writeState();
  }

  function ensureDom() {
    if (panelEl && panelEl.isConnected) return;
    if (!document.body) return;
    panelEl = document.createElement("section");
    panelEl.id = "intelCabinetLoot";
    panelEl.className = "pirate-chest-loot";
    panelEl.hidden = true;
    panelEl.setAttribute("aria-label", "情报文件柜搜刮");
    panelEl.innerHTML =
      '<div class="pirate-chest-loot__backdrop" data-intel-close></div>' +
      '<div class="pirate-chest-loot__panel" role="dialog" aria-modal="true">' +
      '<header class="pirate-chest-loot__head">' +
      '<h2 class="pirate-chest-loot__title">情报文件柜</h2>' +
      '<button type="button" class="pirate-chest-loot__close" data-intel-close aria-label="关闭">×</button>' +
      "</header>" +
      '<p class="pirate-chest-loot__status" data-intel-status>双击物品拾取</p>' +
      '<div class="inv-grid-host pirate-chest-loot__grid" data-intel-grid></div>' +
      '<p class="pirate-chest-loot__foot"><kbd>Esc</kbd> 关闭 · 双击先放安全箱，再放背包</p>' +
      "</div>";
    document.body.appendChild(panelEl);
    gridEl = panelEl.querySelector("[data-intel-grid]");
    statusEl = panelEl.querySelector("[data-intel-status]");
    var closers = panelEl.querySelectorAll("[data-intel-close]");
    var i;
    for (i = 0; i < closers.length; i++) {
      closers[i].addEventListener("click", closePanel);
    }
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function takeItem(inst) {
    if (!inst || !manager || !window.ItemCatalog || !window.PlayerLoadout) return;
    var cat = window.ItemCatalog.getItem(inst.itemData.id);
    if (!cat || !window.PlayerLoadout.tryPlaceLootInSecureThenBackpack) return;
    var destination = window.PlayerLoadout.tryPlaceLootInSecureThenBackpack(cat);
    if (!destination) {
      setStatus("安全箱与背包均无空位：「" + cat.name + "」仍留在柜内");
      return;
    }
    manager.removeItem(inst);
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
    if (manager.items.length === 0) setStatus("文件柜已搜刮干净");
  }

  function renderGrid() {
    ensureDom();
    if (!gridEl || !manager) return;
    gridEl.innerHTML = "";
    var board = document.createElement("div");
    board.className = "inv-grid-board pirate-chest-loot__board";
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
    for (i = 0; i < manager.items.length; i++) {
      (function (inst) {
        var el = document.createElement("div");
        el.className = "inv-item pirate-chest-loot__item";
        el.dataset.instanceId = String(inst.instanceId);
        el.style.left = (inst.x / COLS) * 100 + "%";
        el.style.top = (inst.y / ROWS) * 100 + "%";
        el.style.width = (inst.itemData.width / COLS) * 100 + "%";
        el.style.height = (inst.itemData.height / ROWS) * 100 + "%";
        if (inst.itemData.icon) {
          el.style.backgroundImage = "url(" + inst.itemData.icon + ")";
        }
        var label = document.createElement("span");
        label.className = "inv-item__label";
        label.textContent = inst.itemData.name;
        el.appendChild(label);
        el.title = inst.itemData.name + " · 双击拾取";
        el.addEventListener("dblclick", function (event) {
          event.preventDefault();
          event.stopPropagation();
          takeItem(inst);
        });
        layer.appendChild(el);
      })(manager.items[i]);
    }
    board.appendChild(background);
    board.appendChild(layer);
    gridEl.appendChild(board);
  }

  function openPanel() {
    ensureDom();
    if (!panelEl) return;
    if (!lootRolled) populateLoot();
    renderGrid();
    setStatus(
      manager && manager.items.length
        ? "双击物品拾取 · 优先放入安全箱"
        : "文件柜里没有可带走的物品"
    );
    panelEl.hidden = false;
    panelOpen = true;
    document.body.classList.add(
      "pirate-chest-loot-open",
      "intel-cabinet-loot-open",
      "show-cursor"
    );
    if (window.ActionScene && window.ActionScene.releaseUiPointer) {
      window.ActionScene.releaseUiPointer();
    }
  }

  function closePanel() {
    if (panelEl) panelEl.hidden = true;
    panelOpen = false;
    if (!document.body) return;
    document.body.classList.remove(
      "pirate-chest-loot-open",
      "intel-cabinet-loot-open"
    );
    if (
      !window.ActionInventory ||
      !window.ActionInventory.isOpen ||
      !window.ActionInventory.isOpen()
    ) {
      document.body.classList.remove("show-cursor");
    }
  }

  function onQTESuccess() {
    if (!opened && !isOpenedPersisted()) markOpened();
    if (!lootRolled) populateLoot();
    openPanel();
  }

  function tryInteract(px, pz, relaxAim) {
    if (
      (!aimed && !relaxAim) ||
      !playerNear(px, pz) ||
      !canSeeCabinet(px, pz)
    ) {
      return false;
    }
    if (opened || isOpenedPersisted()) {
      opened = true;
      applyOpenedVisual();
      openPanel();
      return true;
    }
    if (!window.LockpickingQTE || !window.LockpickingQTE.open) return false;
    if (document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock();
    }
    return window.LockpickingQTE.open({
      greenMin: 0.4,
      greenMax: 0.66,
      speed: 0.82,
      requiredSuccesses: 3,
      onSuccess: onQTESuccess,
    });
  }

  function resetForNewRun() {
    aimed = false;
    opened = false;
    lootRolled = false;
    manager = null;
    closePanel();
    applyClosedVisual();
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  document.addEventListener(
    "keydown",
    function (event) {
      if (panelOpen && event.key === "Escape" && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        closePanel();
      }
    },
    true
  );

  window.IntelCabinet = {
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
    rollLoot: rollLoot,
  };
})();
