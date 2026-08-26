/**
 * 弹药铁箱 — 总统府横厅东侧，准星 + E，3 次 QTE 后打开 4×3 搜刮格。
 */
(function () {
  "use strict";

  var G = window.GridInventory;
  var COLS = 4;
  var ROWS = 3;
  var INTERACT_DIST = 3.6;
  var AIM_MAX_DIST = 10;
  var STORAGE_KEY = "dangerous_ammo_crate_opened";
  var CRATE_SIZE = { x: 1.35, y: 0.72, z: 0.78 };
  var LOOT = [
    { id: "brass_bullet", weight: 5000 },
    { id: "uzi_smg", weight: 1800 },
    { id: "pirate_1001", weight: 1500 },
    { id: "collectible_3004", weight: 300 },
  ];

  var crateRoot = null;
  var lidPivot = null;
  var pickMesh = null;
  var aimed = false;
  var opened = false;
  var panelOpen = false;
  var crateManager = null;
  var crateX = 4;
  var crateZ = 0;
  var crateFloorY = 0;
  var crateYaw = 0;
  var raycaster = null;
  var ndc = null;

  var panelEl = null;
  var gridEl = null;
  var statusEl = null;
  var closeEl = null;
  var backdropEl = null;

  function playerNear(px, pz) {
    var dx = px - crateX;
    var dz = pz - crateZ;
    return dx * dx + dz * dz <= INTERACT_DIST * INTERACT_DIST;
  }

  function isOpenedPersisted() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch (e) {
      return opened;
    }
  }

  function setOpened() {
    opened = true;
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch (e) {
      /* ignore */
    }
    applyOpenedVisual();
  }

  function applyOpenedVisual() {
    if (lidPivot) lidPivot.rotation.x = 1.12;
  }

  function makeMaterial(color, metalness, roughness) {
    return new THREE.MeshStandardMaterial({
      color: color,
      metalness: metalness,
      roughness: roughness,
    });
  }

  function addMesh(parent, geometry, material, x, y, z) {
    var mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function buildProceduralCrate(parent) {
    var root = new THREE.Group();
    root.name = "AmmoCrate";
    root.position.set(crateX, crateFloorY, crateZ);
    root.rotation.y = crateYaw;

    var green = makeMaterial(0x394b34, 0.68, 0.52);
    var dark = makeMaterial(0x171b18, 0.82, 0.38);
    var brass = makeMaterial(0xb78b35, 0.72, 0.31);

    addMesh(
      root,
      new THREE.BoxGeometry(CRATE_SIZE.x, 0.5, CRATE_SIZE.z),
      green,
      0,
      0.25,
      0
    );
    addMesh(
      root,
      new THREE.BoxGeometry(CRATE_SIZE.x + 0.05, 0.06, 0.07),
      dark,
      0,
      0.14,
      -CRATE_SIZE.z * 0.5 - 0.02
    );

    lidPivot = new THREE.Group();
    lidPivot.name = "AmmoCrateLidPivot";
    lidPivot.position.set(0, 0.5, CRATE_SIZE.z * 0.5);
    addMesh(
      lidPivot,
      new THREE.BoxGeometry(CRATE_SIZE.x + 0.05, 0.18, CRATE_SIZE.z + 0.05),
      green,
      0,
      0.09,
      -CRATE_SIZE.z * 0.5
    );
    root.add(lidPivot);

    [-0.52, 0.52].forEach(function (x) {
      addMesh(root, new THREE.BoxGeometry(0.06, 0.48, 0.05), dark, x, 0.3, -0.415);
    });
    addMesh(root, new THREE.BoxGeometry(0.24, 0.2, 0.07), dark, 0, 0.42, -0.425);
    addMesh(root, new THREE.BoxGeometry(0.13, 0.08, 0.025), brass, 0, 0.43, -0.466);

    var stencil = document.createElement("canvas");
    stencil.width = 256;
    stencil.height = 64;
    var ctx = stencil.getContext("2d");
    ctx.fillStyle = "#d7d1a7";
    ctx.font = "bold 31px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("AMMO  5.56", 128, 32);
    var label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.74, 0.18),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(stencil),
        transparent: true,
      })
    );
    label.position.set(0, 0.27, -CRATE_SIZE.z * 0.5 - 0.038);
    label.rotation.y = Math.PI;
    root.add(label);

    pickMesh = new THREE.Mesh(
      new THREE.BoxGeometry(CRATE_SIZE.x + 0.18, CRATE_SIZE.y + 0.18, CRATE_SIZE.z + 0.18),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    pickMesh.name = "AmmoCratePickVolume";
    pickMesh.position.y = CRATE_SIZE.y * 0.5;
    root.add(pickMesh);

    parent.add(root);
    crateRoot = root;
    if (opened || isOpenedPersisted()) applyOpenedVisual();
    return root;
  }

  function build(parent, helpers, placement) {
    if (!parent || !placement) return null;
    aimed = false;
    if (placement.x != null) {
      crateX = placement.x;
      crateZ = placement.z;
      crateFloorY = placement.floorY || 0;
      crateYaw = placement.yaw || 0;
    } else {
      crateX = placement.centerX + placement.stemHalfW + 2;
      crateZ = placement.northZ - 1.45;
      crateFloorY = 0;
      crateYaw = 0;
    }
    var root = buildProceduralCrate(parent);
    if (helpers && helpers.registerCollider) {
      var turnsQuarter = Math.abs(Math.sin(crateYaw)) > 0.7;
      helpers.registerCollider(
        turnsQuarter ? CRATE_SIZE.z : CRATE_SIZE.x,
        CRATE_SIZE.y,
        turnsQuarter ? CRATE_SIZE.x : CRATE_SIZE.z,
        crateX,
        crateFloorY + CRATE_SIZE.y * 0.5,
        crateZ
      );
    }
    return root;
  }

  function updateAim(px, pz, camera) {
    aimed = false;
    if (!pickMesh || !camera || !playerNear(px, pz)) return;
    if (!raycaster) {
      raycaster = new THREE.Raycaster();
      ndc = new THREE.Vector2(0, 0);
    }
    pickMesh.updateMatrixWorld(true);
    raycaster.setFromCamera(ndc, camera);
    raycaster.far = AIM_MAX_DIST;
    aimed = raycaster.intersectObject(pickMesh, false).length > 0;
  }

  function rollCount() {
    var r = Math.random();
    if (r < 0.25) return 1;
    if (r < 0.75) return 2;
    return 3;
  }

  function rollItemId() {
    var totalWeight = LOOT.reduce(function (sum, entry) {
      return sum + entry.weight;
    }, 0);
    var roll = Math.random() * totalWeight;
    var acc = 0;
    var i;
    for (i = 0; i < LOOT.length; i++) {
      acc += LOOT[i].weight;
      if (roll < acc) return LOOT[i].id;
    }
    return "brass_bullet";
  }

  function rollLoot() {
    var count = rollCount();
    var ids = [];
    var hasAmmo = false;
    var i;
    for (i = 0; i < count; i++) {
      var id = rollItemId();
      ids.push(id);
      if (id === "brass_bullet") hasAmmo = true;
    }
    if (!hasAmmo) ids[Math.floor(Math.random() * ids.length)] = "brass_bullet";
    return ids;
  }

  function ensureManager() {
    if (!crateManager && G) crateManager = new G.GridManager(COLS, ROWS);
    return crateManager;
  }

  function populateLoot() {
    var mgr = ensureManager();
    if (!mgr || !window.ItemCatalog) return;
    mgr.items = [];
    mgr._initGrid();
    rollLoot()
      .map(function (id) {
        return window.ItemCatalog.getItem(id);
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return b.width * b.height - a.width * a.height;
      })
      .forEach(function (cat) {
        var data = G.itemDataFromCatalog(cat);
        if (!data) return;
        mgr.tryAutoPlace(G.createInventoryItem(data));
      });
  }

  function bindDom() {
    if (panelEl) return;
    panelEl = document.getElementById("ammoCrateLoot");
    gridEl = document.getElementById("ammoCrateLootGrid");
    statusEl = document.getElementById("ammoCrateLootStatus");
    closeEl = document.getElementById("ammoCrateLootClose");
    backdropEl = document.getElementById("ammoCrateLootBackdrop");
    if (closeEl) closeEl.addEventListener("click", closePanel);
    if (backdropEl) backdropEl.addEventListener("click", closePanel);
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function takeItem(inst) {
    if (!inst || !crateManager || !window.ItemCatalog || !window.PlayerLoadout) return;
    var cat = window.ItemCatalog.getItem(inst.itemData.id);
    if (!cat || !window.PlayerLoadout.tryPlaceLootInSecureThenBackpack) return;
    var dest = window.PlayerLoadout.tryPlaceLootInSecureThenBackpack(cat);
    if (!dest) {
      setStatus("安全箱与背包均无空位：「" + cat.name + "」仍留在箱内");
      return;
    }
    crateManager.removeItem(inst);
    renderGrid();
    if (window.GridStashUI) window.GridStashUI.render();
    if (window.ActionInventory && window.ActionInventory.refresh) {
      window.ActionInventory.refresh();
    }
    setStatus(
      dest === "secure"
        ? "已放入安全箱：「" + cat.name + "」"
        : "已放入背包：「" + cat.name + "」"
    );
    if (crateManager.items.length === 0) setStatus("弹药铁箱已搬空");
  }

  function renderGrid() {
    if (!gridEl || !crateManager) return;
    gridEl.innerHTML = "";
    gridEl.className = "inv-grid-host pirate-chest-loot__grid";
    var board = document.createElement("div");
    board.className = "inv-grid-board pirate-chest-loot__board";
    board.style.setProperty("--inv-cols", String(COLS));
    board.style.setProperty("--inv-rows", String(ROWS));
    var bg = document.createElement("div");
    bg.className = "inv-grid-bg";
    var layer = document.createElement("div");
    layer.className = "inv-items-layer";
    var i;
    for (i = 0; i < COLS * ROWS; i++) {
      var cell = document.createElement("div");
      cell.className = "inv-grid-bg__cell";
      bg.appendChild(cell);
    }
    crateManager.items.forEach(function (inst) {
      var el = document.createElement("div");
      el.className = "inv-item pirate-chest-loot__item";
      el.style.left = (inst.x / COLS) * 100 + "%";
      el.style.top = (inst.y / ROWS) * 100 + "%";
      el.style.width = (inst.itemData.width / COLS) * 100 + "%";
      el.style.height = (inst.itemData.height / ROWS) * 100 + "%";
      if (inst.itemData.icon) el.style.backgroundImage = "url(" + inst.itemData.icon + ")";
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
    });
    board.appendChild(bg);
    board.appendChild(layer);
    gridEl.appendChild(board);
  }

  function openPanel() {
    bindDom();
    if (!panelEl) return;
    if (!crateManager) populateLoot();
    renderGrid();
    setStatus(crateManager && crateManager.items.length ? "双击物品拾取" : "弹药铁箱已搬空");
    panelEl.hidden = false;
    panelOpen = true;
    document.body.classList.add("pirate-chest-loot-open", "show-cursor");
  }

  function closePanel() {
    bindDom();
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
    if (!opened && !isOpenedPersisted()) {
      setOpened();
      populateLoot();
    }
    openPanel();
  }

  function tryInteract(px, pz, relaxAim) {
    if (!playerNear(px, pz) || (!aimed && !relaxAim)) return false;
    if (opened || isOpenedPersisted()) {
      openPanel();
      return true;
    }
    if (!window.LockpickingQTE) return false;
    if (document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock();
    }
    window.LockpickingQTE.open({
      greenMin: 0.38,
      greenMax: 0.64,
      speed: 0.86,
      onSuccess: onQTESuccess,
    });
    return true;
  }

  function resetForNewRun() {
    aimed = false;
    opened = false;
    crateManager = null;
    closePanel();
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  window.AmmoCrate = {
    build: build,
    updateAim: updateAim,
    isAimed: function () {
      return aimed && !!pickMesh;
    },
    isOpened: function () {
      return opened || isOpenedPersisted();
    },
    playerNear: playerNear,
    tryInteract: tryInteract,
    closePanel: closePanel,
    isPanelOpen: function () {
      return panelOpen;
    },
    resetForNewRun: resetForNewRun,
    rollLoot: rollLoot,
  };
})();
