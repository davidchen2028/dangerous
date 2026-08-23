/**
 * 总统办公室：两个海盗宝箱 + 一个藏宝匣。
 * 使用与收藏室 / 等候厅相同的 GLB 建模。
 */
(function () {
  "use strict";

  var G = window.GridInventory;
  var CHEST_GLB_URL = "models/pirate-chest.glb";
  var LOCKBOX_GLB_URL = "models/historical-lockbox.glb";
  var CHEST_SIZE = { x: 1.05, y: 1.05, z: 0.85 };
  var LOCKBOX_SIZE = { x: 0.72, y: 0.55, z: 0.55 };
  var CHEST_MODEL_ROT_Y = (90 * Math.PI) / 180;
  var FLOOR_Y = 0.08;
  var COLS = 4;
  var ROWS = 4;
  var INTERACT_DIST = 3.2;
  var PICK_MESH_SCALE = 0.78;
  var STORAGE_PREFIX = "dangerous_president_office_container_";

  var entries = [];
  var aimedEntry = null;
  var activeEntry = null;
  var panelOpen = false;
  var helpers = null;
  var raycaster = null;
  var ndc = null;

  var panelEl = null;
  var titleEl = null;
  var statusEl = null;
  var gridEl = null;

  function storageKey(entry) {
    return STORAGE_PREFIX + entry.id;
  }

  function isOpenedPersisted(entry) {
    try {
      return sessionStorage.getItem(storageKey(entry)) === "1";
    } catch (e) {
      return entry.opened;
    }
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

  function rememberLidPose(entry) {
    entry.lid = entry.lid || (entry.root && findLidNode(entry.root));
    entry.lidClosed = null;
    if (!entry.lid) return;
    entry.lidClosed = {
      x: entry.lid.rotation.x,
      y: entry.lid.rotation.y,
      z: entry.lid.rotation.z,
    };
  }

  function applyOpenedVisual(entry) {
    if (!entry.lid || !entry.lidClosed) return;
    entry.lid.rotation.x = entry.lidClosed.x - 1.15;
    entry.lid.rotation.y = entry.lidClosed.y;
    entry.lid.rotation.z = entry.lidClosed.z + 0.08;
  }

  function markOpened(entry) {
    entry.opened = true;
    try {
      sessionStorage.setItem(storageKey(entry), "1");
    } catch (e) {
      /* ignore */
    }
    applyOpenedVisual(entry);
  }

  function playerNear(entry, px, pz) {
    var dx = px - entry.x;
    var dz = pz - entry.z;
    return dx * dx + dz * dz <= INTERACT_DIST * INTERACT_DIST;
  }

  function canSee(entry, px, pz) {
    if (!helpers || !helpers.hasLineOfSight) return true;
    var hy = (entry.boundsY || 0.7) * 0.55;
    return helpers.hasLineOfSight(px, pz, entry.x, hy, entry.z, 0.08);
  }

  function resetGltfScenePose(model) {
    if (!model) return;
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.updateMatrixWorld(true);
  }

  function orientModel(model, yaw) {
    if (!model) return;
    model.rotation.order = "XYZ";
    model.rotation.set(0, CHEST_MODEL_ROT_Y + (yaw || 0), 0);
    model.updateMatrixWorld(true);
  }

  function measureSize(root) {
    var box = new THREE.Box3().setFromObject(root);
    var size = new THREE.Vector3();
    box.getSize(size);
    return {
      x: Math.max(0.2, size.x),
      y: Math.max(0.2, size.y),
      z: Math.max(0.2, size.z),
    };
  }

  function finalizeEntry(entry, targetSize) {
    var THREE = window.THREE;
    var root = entry.root;
    var model = entry.model;
    var box = new THREE.Box3();
    var center = new THREE.Vector3();
    var size = new THREE.Vector3();
    var inv = new THREE.Matrix4();

    if (model) orientModel(model, entry.yaw);
    root.rotation.set(0, 0, 0);
    root.updateMatrixWorld(true);

    if (helpers) {
      if (helpers.fitModelUniformToBox) {
        helpers.fitModelUniformToBox(root, targetSize);
      } else if (helpers.fitModelToBox) {
        helpers.fitModelToBox(root, targetSize);
        helpers.fitModelToBox(root, targetSize);
      }
    }
    if (model) orientModel(model, entry.yaw);

    root.updateMatrixWorld(true);
    box.setFromObject(root);
    box.getCenter(center);
    root.position.set(
      entry.targetX - center.x,
      FLOOR_Y - box.min.y,
      entry.targetZ - center.z
    );
    root.updateMatrixWorld(true);

    box.setFromObject(root);
    box.getCenter(center);
    entry.x = center.x;
    entry.z = center.z;
    entry.bounds = measureSize(root);
    entry.boundsY = entry.bounds.y;

    rememberLidPose(entry);
    if (isOpenedPersisted(entry)) {
      entry.opened = true;
      applyOpenedVisual(entry);
    }

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
    pick.name = "PresidentOfficePick_" + entry.id;
    pick.position.copy(center);
    root.add(pick);
    entry.pick = pick;

    if (helpers && helpers.registerCollider) {
      var cy = (box.min.y + box.max.y) * 0.5;
      helpers.registerCollider(
        entry.bounds.x,
        entry.bounds.y,
        entry.bounds.z,
        entry.x,
        cy,
        entry.z
      );
    }
  }

  function buildProceduralFallback(parent, entry) {
    var THREE = window.THREE;
    var root = new THREE.Group();
    root.name = "PresidentOffice_" + entry.id + "_Fallback";
    var bodyMat = new THREE.MeshLambertMaterial({
      color: entry.lockbox ? 0x34302b : 0x5c3d28,
    });
    var trimMat = new THREE.MeshLambertMaterial({
      color: entry.lockbox ? 0xb58a32 : 0xc9a227,
      emissive: entry.lockbox ? 0x241600 : 0x332200,
    });
    var body = new THREE.Mesh(
      new THREE.BoxGeometry(
        entry.lockbox ? 0.88 : 1.1,
        entry.lockbox ? 0.48 : 0.62,
        entry.lockbox ? 0.62 : 0.76
      ),
      bodyMat
    );
    body.position.y = entry.lockbox ? 0.24 : 0.31;
    root.add(body);
    var lid = new THREE.Mesh(
      new THREE.BoxGeometry(
        entry.lockbox ? 0.86 : 1.08,
        0.2,
        entry.lockbox ? 0.6 : 0.74
      ),
      bodyMat
    );
    lid.position.set(0, entry.lockbox ? 0.57 : 0.72, -0.12);
    root.add(lid);
    var plate = new THREE.Mesh(
      new THREE.BoxGeometry(entry.lockbox ? 0.18 : 0.22, 0.17, 0.07),
      trimMat
    );
    plate.position.set(0, entry.lockbox ? 0.42 : 0.54, entry.lockbox ? 0.33 : 0.4);
    root.add(plate);
    parent.add(root);
    entry.root = root;
    entry.lid = lid;
    finalizeEntry(entry, entry.lockbox ? LOCKBOX_SIZE : CHEST_SIZE);
  }

  function mountGlb(parent, entry, gltf) {
    var THREE = window.THREE;
    if (!THREE || !gltf || !gltf.scene) {
      buildProceduralFallback(parent, entry);
      return;
    }
    var model = gltf.scene.clone(true);
    var root = new THREE.Group();
    var pivot = new THREE.Group();
    root.name = "PresidentOffice_" + entry.id + "_GLB";
    pivot.name = "PresidentOffice_" + entry.id + "_Pivot";
    resetGltfScenePose(model);
    pivot.add(model);
    root.add(pivot);
    entry.root = root;
    entry.model = model;
    orientModel(model, entry.yaw);
    model.traverse(function (child) {
      if (!child.isMesh || !child.material) return;
      child.castShadow = false;
      child.receiveShadow = false;
    });
    parent.add(root);
    finalizeEntry(entry, entry.lockbox ? LOCKBOX_SIZE : CHEST_SIZE);
  }

  function makeContainer(parent, spec) {
    var entry = {
      id: spec.id,
      label: spec.label,
      lockbox: !!spec.lockbox,
      targetX: spec.x,
      targetZ: spec.z,
      x: spec.x,
      z: spec.z,
      yaw: spec.yaw || 0,
      root: null,
      model: null,
      lid: null,
      lidClosed: null,
      pick: null,
      bounds: null,
      boundsY: 0.7,
      opened: false,
      rolled: false,
      manager: null,
      itemMeta: Object.create(null),
      revealTimers: [],
    };
    entries.push(entry);

    var url = entry.lockbox ? LOCKBOX_GLB_URL : CHEST_GLB_URL;
    if (!helpers || !helpers.loadGltfCached) {
      buildProceduralFallback(parent, entry);
      return;
    }
    helpers.loadGltfCached(
      url,
      function (gltf) {
        mountGlb(parent, entry, gltf);
      },
      function () {
        buildProceduralFallback(parent, entry);
      }
    );
  }

  function ensurePanel() {
    if (panelEl) return;
    panelEl = document.createElement("div");
    panelEl.className = "pirate-chest-loot collection-room-loot";
    panelEl.hidden = true;
    panelEl.innerHTML =
      '<div class="pirate-chest-loot__backdrop" data-office-close></div>' +
      '<div class="pirate-chest-loot__panel collection-room-loot__panel">' +
      '<header class="pirate-chest-loot__head">' +
      '<h2 class="pirate-chest-loot__title" data-office-title>宝箱</h2>' +
      '<button type="button" class="pirate-chest-loot__close" data-office-close aria-label="关闭">×</button>' +
      "</header>" +
      '<p class="pirate-chest-loot__status" data-office-status>4×4 · 双击取出</p>' +
      '<div class="inv-grid-host" data-office-grid></div>' +
      '<p class="pirate-chest-loot__foot"><kbd>Esc</kbd> 关闭 · 双击先安全箱再背包</p>' +
      "</div>";
    document.body.appendChild(panelEl);
    titleEl = panelEl.querySelector("[data-office-title]");
    statusEl = panelEl.querySelector("[data-office-status]");
    gridEl = panelEl.querySelector("[data-office-grid]");
    var closeEls = panelEl.querySelectorAll("[data-office-close]");
    var i;
    for (i = 0; i < closeEls.length; i++) {
      closeEls[i].addEventListener("click", closePanel);
    }
  }

  function ensureManager(entry) {
    if (!entry.manager) entry.manager = new G.GridManager(COLS, ROWS);
    return entry.manager;
  }

  function clearRevealTimers(entry) {
    if (!entry || !entry.revealTimers) return;
    var i;
    for (i = 0; i < entry.revealTimers.length; i++) {
      clearTimeout(entry.revealTimers[i]);
    }
    entry.revealTimers = [];
  }

  function revealDelayMs(cat) {
    var price = (cat && cat.reclaimMin) || 0;
    if (price >= 30000) return 2200;
    if (price >= 8000) return 1300;
    if (price >= 1000) return 700;
    return 400;
  }

  function revealChestItem(entry, instanceId) {
    var meta = entry.itemMeta[instanceId];
    if (!meta || meta.revealed) return;
    meta.revealed = true;
    if (!gridEl || activeEntry !== entry) return;
    var el = gridEl.querySelector('[data-instance-id="' + instanceId + '"]');
    if (!el) return;
    el.classList.remove("pirate-chest-loot__item--hidden");
    el.classList.add("pirate-chest-loot__item--pop");
  }

  function rollLoot(entry) {
    if (entry.rolled || !window.PirateLootRoll || !window.ItemCatalog) return;
    var mgr = ensureManager(entry);
    mgr.items = [];
    mgr._initGrid();
    entry.itemMeta = Object.create(null);
    clearRevealTimers(entry);
    entry.revealTimers = [];

    var ids = window.PirateLootRoll.rollPirateChest();
    var queue = [];
    var i;
    var cum = 350;
    var gradual = !entry.lockbox;

    for (i = 0; i < ids.length; i++) {
      var cat = window.ItemCatalog.getItem(ids[i]);
      if (!cat) continue;
      var data = G.itemDataFromCatalog(cat);
      var inst = data && G.createInventoryItem(data);
      if (!inst || !mgr.tryAutoPlace(inst)) continue;
      if (gradual) {
        cum += revealDelayMs(cat);
        queue.push({ instanceId: inst.instanceId, revealAt: cum });
        entry.itemMeta[inst.instanceId] = { revealed: false };
      } else {
        entry.itemMeta[inst.instanceId] = { revealed: true };
      }
    }

    entry.rolled = true;

    if (!gradual) return;

    queue.sort(function (a, b) {
      return a.revealAt - b.revealAt;
    });
    for (i = 0; i < queue.length; i++) {
      (function (item) {
        var t = setTimeout(function () {
          revealChestItem(entry, item.instanceId);
        }, item.revealAt);
        entry.revealTimers.push(t);
      })(queue[i]);
    }
  }

  function takeItem(entry, inst) {
    var meta = entry.itemMeta[inst.instanceId];
    if (!meta || !meta.revealed) return;
    if (
      !window.PlayerLoadout ||
      !window.PlayerLoadout.tryPlaceLootInSecureThenBackpack
    ) {
      return;
    }
    var cat = window.ItemCatalog && window.ItemCatalog.getItem(inst.itemData.id);
    if (!cat) return;
    var dest = window.PlayerLoadout.tryPlaceLootInSecureThenBackpack(cat);
    if (!dest) {
      statusEl.textContent = "安全箱与背包均无空位 · 物品仍留在箱内";
      return;
    }
    entry.manager.removeItem(inst);
    delete entry.itemMeta[inst.instanceId];
    renderGrid(entry);
    if (window.GridStashUI) window.GridStashUI.render();
    if (window.ActionInventory && window.ActionInventory.refresh) {
      window.ActionInventory.refresh();
    }
    statusEl.textContent =
      dest === "secure"
        ? "已放入安全箱：「" + cat.name + "」"
        : "安全箱已满，已放入背包：「" + cat.name + "」";
    if (entry.manager.items.length === 0) statusEl.textContent = "已取空";
  }

  function renderGrid(entry) {
    gridEl.innerHTML = "";
    gridEl.className = "inv-grid-host pirate-chest-loot__grid";
    var wrap = document.createElement("div");
    wrap.className =
      "inv-grid-board pirate-chest-loot__board collection-room-loot__board";
    wrap.style.setProperty("--inv-cols", String(COLS));
    wrap.style.setProperty("--inv-rows", String(ROWS));
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
    wrap.appendChild(bg);
    wrap.appendChild(layer);
    gridEl.appendChild(wrap);
    for (i = 0; i < entry.manager.items.length; i++) {
      (function (inst) {
        var el = document.createElement("div");
        el.className = "inv-item pirate-chest-loot__item";
        el.dataset.instanceId = String(inst.instanceId);
        el.style.left = (inst.x / COLS) * 100 + "%";
        el.style.top = (inst.y / ROWS) * 100 + "%";
        el.style.width = (inst.itemData.width / COLS) * 100 + "%";
        el.style.height = (inst.itemData.height / ROWS) * 100 + "%";
        var meta = entry.itemMeta[inst.instanceId];
        if (!meta || !meta.revealed) {
          el.classList.add("pirate-chest-loot__item--hidden");
        }
        if (inst.itemData.icon) {
          el.style.backgroundImage = "url(" + inst.itemData.icon + ")";
        }
        var label = document.createElement("span");
        label.className = "inv-item__label";
        label.textContent = inst.itemData.name;
        el.appendChild(label);
        el.addEventListener("dblclick", function (event) {
          event.preventDefault();
          event.stopPropagation();
          takeItem(entry, inst);
        });
        layer.appendChild(el);
      })(entry.manager.items[i]);
    }
  }

  function openPanel(entry) {
    ensurePanel();
    activeEntry = entry;
    ensureManager(entry);
    renderGrid(entry);
    titleEl.textContent = entry.label;
    if (!entry.manager.items.length) {
      statusEl.textContent = "已取空";
    } else if (!entry.lockbox) {
      statusEl.textContent = "物资逐渐显现… 双击：先安全箱，再背包";
    } else {
      statusEl.textContent =
        "共 " + entry.manager.items.length + " 件 · 双击取出";
    }
    panelEl.hidden = false;
    panelOpen = true;
    document.body.classList.add("collection-room-loot-open", "show-cursor");
  }

  function closePanel() {
    if (!panelEl) return;
    panelEl.hidden = true;
    panelOpen = false;
    activeEntry = null;
    document.body.classList.remove("collection-room-loot-open");
    if (
      !window.ActionInventory ||
      !window.ActionInventory.isOpen ||
      !window.ActionInventory.isOpen()
    ) {
      document.body.classList.remove("show-cursor");
    }
  }

  function exitPointer() {
    if (document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  /** 已开过：只看箱；藏宝匣免开锁；海盗箱首次必须 QTE */
  function tryInteract(opts) {
    var entry = aimedEntry;
    if (!entry && opts && opts.near) {
      entry = nearestInteractive(opts.px, opts.pz);
    }
    if (!entry || !entry.pick) return false;

    if (entry.opened || isOpenedPersisted(entry)) {
      exitPointer();
      if (!entry.rolled) rollLoot(entry);
      openPanel(entry);
      return true;
    }

    if (entry.lockbox) {
      exitPointer();
      markOpened(entry);
      rollLoot(entry);
      openPanel(entry);
      return true;
    }

    if (!window.LockpickingQTE) return false;
    exitPointer();
    window.LockpickingQTE.open({
      greenMin: 0.4,
      greenMax: 0.68,
      speed: 0.72,
      onSuccess: function () {
        markOpened(entry);
        rollLoot(entry);
        openPanel(entry);
      },
    });
    return true;
  }

  function nearestInteractive(px, pz) {
    var best = null;
    var bestD = Infinity;
    var i;
    for (i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e.pick || !playerNear(e, px, pz) || !canSee(e, px, pz)) continue;
      var dx = px - e.x;
      var dz = pz - e.z;
      var d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  function updateAim(px, pz, camera) {
    aimedEntry = null;
    if (!camera || !window.THREE) return;
    if (!raycaster) raycaster = new THREE.Raycaster();
    if (!ndc) ndc = new THREE.Vector2(0, 0);
    raycaster.setFromCamera(ndc, camera);
    var bestDistance = Infinity;
    var i;
    for (i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e.pick || !playerNear(e, px, pz) || !canSee(e, px, pz)) continue;
      e.pick.updateMatrixWorld(true);
      var hits = raycaster.intersectObject(e.pick, false);
      if (hits.length && hits[0].distance < bestDistance) {
        bestDistance = hits[0].distance;
        aimedEntry = e;
      }
    }
  }

  function build(parent, sceneHelpers, house) {
    if (!parent || !house || !window.THREE || !G) return;
    helpers = sceneHelpers || null;
    entries = [];
    var westX = house.centerX - house.topHalfW + 2.2;
    var z0 = house.splitZ + 1.55;
    var z1 = house.northZ - 1.55;
    makeContainer(parent, {
      id: "pirate_1",
      label: "总统办公室宝箱 1",
      x: westX,
      z: z0,
      yaw: Math.PI / 2,
    });
    makeContainer(parent, {
      id: "pirate_2",
      label: "总统办公室宝箱 2",
      x: westX,
      z: z1,
      yaw: Math.PI / 2,
    });
    makeContainer(parent, {
      id: "treasure_lockbox",
      label: "总统办公室藏宝匣",
      lockbox: true,
      x: house.centerX - house.stemHalfW - 2.1,
      z: z1,
      yaw: Math.PI,
    });
  }

  function resetForNewRun() {
    closePanel();
    aimedEntry = null;
    activeEntry = null;
    var i;
    for (i = 0; i < entries.length; i++) {
      clearRevealTimers(entries[i]);
      try {
        sessionStorage.removeItem(storageKey(entries[i]));
      } catch (e) {
        /* ignore */
      }
    }
    try {
      sessionStorage.removeItem(STORAGE_PREFIX + "pirate_1");
      sessionStorage.removeItem(STORAGE_PREFIX + "pirate_2");
      sessionStorage.removeItem(STORAGE_PREFIX + "treasure_lockbox");
    } catch (e2) {
      /* ignore */
    }
    entries = [];
  }

  window.PresidentOfficeChests = {
    CHEST_GLB_URL: CHEST_GLB_URL,
    LOCKBOX_GLB_URL: LOCKBOX_GLB_URL,
    build: build,
    updateAim: updateAim,
    isAimed: function () {
      return !!aimedEntry;
    },
    getAimedLabel: function () {
      if (!aimedEntry) return "";
      return aimedEntry.opened || isOpenedPersisted(aimedEntry)
        ? "按 E 查看" + aimedEntry.label
        : aimedEntry.lockbox
          ? "按 E 打开" + aimedEntry.label
          : "按 E 开锁：" + aimedEntry.label;
    },
    tryInteract: tryInteract,
    tryInteractNear: function (px, pz) {
      return tryInteract({ near: true, px: px, pz: pz });
    },
    isPanelOpen: function () {
      return panelOpen;
    },
    closePanel: closePanel,
    resetForNewRun: resetForNewRun,
  };
})();
