/**
 * 教程 — 工业废料桶（准星对准 + F 搜索）
 */
(function () {
  "use strict";

  var G = window.GridInventory;
  var COLS = 4;
  var ROWS = 5;
  var INTERACT_DIST = 5.5;
  var AIM_MAX_DIST = 10;
  var AIM_DOT_MIN = 0.9;

  var panelEl = document.getElementById("wasteBinSearch");
  var statusEl = document.getElementById("wasteBinSearchStatus");
  var gridHostEl = document.getElementById("wasteBinSearchGrid");
  var btnClose = document.getElementById("wasteBinSearchClose");
  var backdropEl = document.getElementById("wasteBinSearchBackdrop");

  var bins = [];

  function setBinPositions(list) {
    bins = [];
    binPickMeshes = [];
    var i;
    for (i = 0; i < (list || []).length; i++) {
      bins.push({
        id: list[i].id != null ? list[i].id : i,
        x: list[i].x,
        z: list[i].z,
        label: list[i].label || "工业废料桶",
        aimY: list[i].aimY != null ? list[i].aimY : 0.95,
      });
    }
  }

  var binPickMeshes = [];
  var open = false;
  var activeBin = null;
  var revealTimers = [];
  var aimedBinId = null;
  var _raycaster = null;
  var _ndc = null;
  var _dirToBin = null;

  function reclaimDelayMs(catalogId) {
    var price = 0;
    if (window.LobbyMarket && window.LobbyMarket.getReclaimPrice) {
      price = window.LobbyMarket.getReclaimPrice(catalogId) || 0;
    } else if (window.ItemCatalog) {
      var it = window.ItemCatalog.getItem(catalogId);
      if (it && it.reclaimMin) price = it.reclaimMin;
    }
    if (price >= 30000) return 2400;
    if (price >= 8000) return 1400;
    if (price >= 1000) return 650;
    return 380;
  }

  function shuffle(arr) {
    var i;
    for (i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function generateLoot() {
    if (!G || !window.ItemCatalog) return null;

    var mgr = new G.GridManager(COLS, ROWS);
    var ids = [];
    var oilN = 2 + Math.floor(Math.random() * 2);
    var i;
    for (i = 0; i < oilN; i++) ids.push("sealed_motor_oil");
    if (Math.random() < 0.2) ids.push("heavy_industrial_drill");
    if (Math.random() < 0.42) ids.push("circuit");
    if (Math.random() < 0.22) ids.push("circuit");
    shuffle(ids);

    var queue = [];
    var itemMeta = Object.create(null);
    for (i = 0; i < ids.length; i++) {
      var cat = window.ItemCatalog.getItem(ids[i]);
      if (!cat) continue;
      var data = G.itemDataFromCatalog(cat);
      var inst = G.createInventoryItem(data);
      if (!mgr.tryAutoPlace(inst)) continue;
      itemMeta[inst.instanceId] = { revealed: false };
      queue.push({
        instanceId: inst.instanceId,
        catalogId: ids[i],
        delay: reclaimDelayMs(ids[i]),
        taken: false,
        revealed: false,
      });
    }

    queue.sort(function (a, b) {
      return a.delay - b.delay;
    });

    var cum = 400;
    for (i = 0; i < queue.length; i++) {
      cum += queue[i].delay;
      queue[i].revealAt = cum;
    }

    return { manager: mgr, queue: queue, itemMeta: itemMeta, emptied: false };
  }

  function clearRevealTimers() {
    var i;
    for (i = 0; i < revealTimers.length; i++) {
      clearTimeout(revealTimers[i]);
    }
    revealTimers = [];
  }

  function normalizeInstanceId(id) {
    var n = Number(id);
    return isFinite(n) ? n : id;
  }

  function findQueueEntry(bin, instanceId) {
    var want = normalizeInstanceId(instanceId);
    var i;
    for (i = 0; i < bin.loot.queue.length; i++) {
      if (bin.loot.queue[i].instanceId === want) return bin.loot.queue[i];
    }
    return null;
  }

  /** 从桶内网格移除物品（须传入完整 InventoryItem） */
  function removeBinGridItem(mgr, instanceId) {
    var id = normalizeInstanceId(instanceId);
    var inst = mgr.findByInstanceId(id);
    if (!inst) {
      var j;
      for (j = 0; j < mgr.items.length; j++) {
        if (mgr.items[j].instanceId === id) {
          inst = mgr.items[j];
          break;
        }
      }
    }
    if (!inst) return false;
    if (inst.x >= 0 && inst.y >= 0) {
      mgr.removeItem(inst);
    } else {
      var idx = mgr.items.indexOf(inst);
      if (idx >= 0) mgr.items.splice(idx, 1);
    }
    return true;
  }

  function removeBinItemDom(instanceId) {
    if (!gridHostEl) return;
    var id = normalizeInstanceId(instanceId);
    var el = gridHostEl.querySelector(
      '[data-instance-id="' + id + '"]'
    );
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  function buildGridDom(bin) {
    if (!gridHostEl || !G || !bin.loot || !bin.loot.manager) return;
    var mgr = bin.loot.manager;
    var itemMeta = bin.loot.itemMeta;
    gridHostEl.innerHTML = "";
    gridHostEl.className = "inv-grid-host pirate-chest-loot__grid waste-bin-search__grid";

    var wrap = document.createElement("div");
    wrap.className = "inv-grid-board pirate-chest-loot__board";
    wrap.style.setProperty("--inv-cols", String(COLS));
    wrap.style.setProperty("--inv-rows", String(ROWS));

    var bg = document.createElement("div");
    bg.className = "inv-grid-bg";
    var itemsLayer = document.createElement("div");
    itemsLayer.className = "inv-items-layer";

    var n = COLS * ROWS;
    var i;
    for (i = 0; i < n; i++) {
      var cell = document.createElement("div");
      cell.className = "inv-grid-bg__cell";
      bg.appendChild(cell);
    }

    wrap.appendChild(bg);
    wrap.appendChild(itemsLayer);
    gridHostEl.appendChild(wrap);

    for (i = 0; i < mgr.items.length; i++) {
      var inst = mgr.items[i];
      var entry = findQueueEntry(bin, inst.instanceId);
      if (entry && entry.taken) continue;
      itemsLayer.appendChild(renderBinItemElement(bin, inst, itemMeta));
    }
  }

  function renderBinItemElement(bin, inst, itemMeta) {
    var el = document.createElement("div");
    el.className = "inv-item pirate-chest-loot__item waste-bin-loot__item";
    el.dataset.instanceId = String(inst.instanceId);
    el.style.left = (inst.x / COLS) * 100 + "%";
    el.style.top = (inst.y / ROWS) * 100 + "%";
    el.style.width = (inst.itemData.width / COLS) * 100 + "%";
    el.style.height = (inst.itemData.height / ROWS) * 100 + "%";

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

    el.title = inst.itemData.name + " · 单击或双击拾取（先安全箱，再背包）";

    el.addEventListener("dblclick", function (e) {
      e.preventDefault();
      e.stopPropagation();
      takeOne(bin, inst.instanceId);
    });

    return el;
  }

  function revealEntry(bin, instanceId) {
    var itemMeta = bin.loot.itemMeta;
    var meta = itemMeta[instanceId];
    if (!meta || meta.revealed) return;
    meta.revealed = true;

    var entry = findQueueEntry(bin, instanceId);
    if (entry) entry.revealed = true;

    if (!gridHostEl) return;
    var el = gridHostEl.querySelector(
      '[data-instance-id="' + instanceId + '"]'
    );
    if (!el) return;
    el.classList.remove("pirate-chest-loot__item--hidden");
    el.classList.add("pirate-chest-loot__item--pop");
  }

  function startRevealSequence(bin) {
    clearRevealTimers();
    var i;
    for (i = 0; i < bin.loot.queue.length; i++) {
      (function (entry) {
        var timer = setTimeout(function () {
          revealEntry(bin, entry.instanceId);
          setBinStatus("格子亮起后可单击/双击拾取 · 先安全箱再背包");
        }, entry.revealAt);
        revealTimers.push(timer);
      })(bin.loot.queue[i]);
    }
  }

  function setBinStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function takeOne(bin, instanceId) {
    instanceId = normalizeInstanceId(instanceId);
    var entry = findQueueEntry(bin, instanceId);
    if (!entry || entry.taken) return;

    if (!entry.revealed) {
      setBinStatus("还在翻找中，请等格子亮起后再拾取");
      return;
    }

    if (!window.PlayerLoadout || !window.ItemCatalog) {
      setBinStatus("装备系统未就绪，请刷新页面后重试");
      return;
    }

    var cat = window.ItemCatalog.getItem(entry.catalogId);
    if (!cat) {
      setBinStatus("未知物品，无法拾取");
      return;
    }

    if (!window.PlayerLoadout.tryPlaceLootInSecureThenBackpack) {
      setBinStatus("拾取功能未就绪，请刷新页面后重试");
      return;
    }

    var dest = window.PlayerLoadout.tryPlaceLootInSecureThenBackpack(cat);
    if (!dest) {
      if (!window.PlayerLoadout.getLoadout().backpack) {
        setBinStatus(
          "「" +
            cat.name +
            "」放不下：未装备背包（大厅仓库左侧先穿背包），安全箱也塞不下大件"
        );
      } else {
        setBinStatus(
          "「" + cat.name + "」安全箱与背包均无空位 · 仍留在桶内（可先整理 B 背包）"
        );
      }
      return;
    }

    entry.taken = true;
    removeBinGridItem(bin.loot.manager, instanceId);
    delete bin.loot.itemMeta[instanceId];
    removeBinItemDom(instanceId);
    buildGridDom(bin);

    if (window.GridStashUI && window.GridStashUI.render) {
      window.GridStashUI.render();
    }
    if (window.ActionInventory && window.ActionInventory.refresh) {
      window.ActionInventory.refresh();
    }

    if (dest === "secure") {
      setBinStatus("已放入安全箱：「" + cat.name + "」");
    } else {
      setBinStatus("安全箱已满，已放入背包：「" + cat.name + "」");
    }

    if (allTaken(bin)) {
      bin.loot.emptied = true;
      setBinStatus("桶内已搬空");
    }
  }

  function allTaken(bin) {
    var i;
    for (i = 0; i < bin.loot.queue.length; i++) {
      if (!bin.loot.queue[i].taken) return false;
    }
    return true;
  }

  function openBin(bin) {
    if (!panelEl) return;
    activeBin = bin;

    if (!bin.loot) {
      bin.loot = generateLoot();
      bin.searched = true;
    }

    if (bin.loot.emptied || bin.loot.queue.length === 0) {
      alert("这个桶已经被搜刮干净了。");
      return;
    }

    open = true;
    panelEl.hidden = false;
    document.body.classList.add("waste-bin-open", "show-cursor");

    if (window.ActionScene && window.ActionScene.releaseUiPointer) {
      window.ActionScene.releaseUiPointer();
    }

    if (statusEl) {
      statusEl.textContent =
        "正在翻找「" + bin.label + "」… 价值越高出现越慢";
    }

    buildGridDom(bin);

    if (!bin.revealStarted) {
      bin.revealStarted = true;
      startRevealSequence(bin);
    } else {
      var i;
      for (i = 0; i < bin.loot.queue.length; i++) {
        if (bin.loot.queue[i].revealed && !bin.loot.queue[i].taken) {
          revealEntry(bin, bin.loot.queue[i].instanceId);
        }
      }
      setBinStatus("格子亮起后可单击/双击拾取 · 先安全箱再背包");
    }
  }

  function closeSearch() {
    clearRevealTimers();
    open = false;
    activeBin = null;
    if (panelEl) panelEl.hidden = true;
    document.body.classList.remove("waste-bin-open");
    if (!document.body.classList.contains("inventory-open")) {
      document.body.classList.remove("show-cursor");
    }
  }

  function getBinById(id) {
    var i;
    for (i = 0; i < bins.length; i++) {
      if (bins[i].id === id) return bins[i];
    }
    return null;
  }

  function playerNearBin(bin, px, pz) {
    var dx = px - bin.x;
    var dz = pz - bin.z;
    return dx * dx + dz * dz <= INTERACT_DIST * INTERACT_DIST;
  }

  function isNearAnyBin(px, pz) {
    var i;
    for (i = 0; i < bins.length; i++) {
      if (playerNearBin(bins[i], px, pz)) return true;
    }
    return false;
  }

  function syncBinWorldCenter(index, x, aimY, z) {
    if (bins[index]) {
      bins[index].x = x;
      bins[index].z = z;
      bins[index].aimY = aimY;
    }
  }

  function registerBinPickMesh(index, mesh) {
    binPickMeshes[index] = mesh;
  }

  function canSeeBin(px, pz, bin) {
    if (!bin) return false;
    var aimY = bin.aimY != null ? bin.aimY : 0.95;
    if (window.ActionScene && window.ActionScene.hasLineOfSight) {
      return window.ActionScene.hasLineOfSight(px, pz, bin.x, aimY, bin.z);
    }
    return true;
  }

  function aimFallbackAngular(px, pz, camera) {
    if (!_raycaster) _raycaster = new window.THREE.Raycaster();
    if (!_ndc) _ndc = new window.THREE.Vector2(0, 0);
    if (!_dirToBin) _dirToBin = new window.THREE.Vector3();

    _raycaster.setFromCamera(_ndc, camera);
    var rayDir = _raycaster.ray.direction;
    var origin = _raycaster.ray.origin;

    var bestId = null;
    var bestDot = AIM_DOT_MIN;
    var i;

    for (i = 0; i < bins.length; i++) {
      var b = bins[i];
      if (!playerNearBin(b, px, pz) || !canSeeBin(px, pz, b)) continue;

      var aimY = b.aimY != null ? b.aimY : 0.95;
      _dirToBin.set(b.x - origin.x, aimY - origin.y, b.z - origin.z);
      var dist3 = _dirToBin.length();
      if (dist3 > AIM_MAX_DIST) continue;

      _dirToBin.multiplyScalar(1 / dist3);
      var dot = rayDir.dot(_dirToBin);
      if (dot > bestDot) {
        bestDot = dot;
        bestId = b.id;
      }
    }

    aimedBinId = bestId;
  }

  /**
   * 准星对准：仅射线检测轻量拾取盒（不遍历整棵 GLB）
   */
  function updateAim(px, pz, camera) {
    aimedBinId = null;
    if (!camera) return;

    var THREE = window.THREE;
    if (!THREE) return;

    if (!_raycaster) _raycaster = new THREE.Raycaster();
    if (!_ndc) _ndc = new THREE.Vector2(0, 0);

    _raycaster.setFromCamera(_ndc, camera);

    var picks = [];
    var i;
    for (i = 0; i < binPickMeshes.length; i++) {
      if (binPickMeshes[i]) picks.push(binPickMeshes[i]);
    }

    if (picks.length > 0) {
      var hits = _raycaster.intersectObjects(picks, false);
      if (hits.length > 0) {
        var mesh = hits[0].object;
        for (i = 0; i < binPickMeshes.length; i++) {
          if (
            binPickMeshes[i] === mesh &&
            playerNearBin(bins[i], px, pz) &&
            canSeeBin(px, pz, bins[i])
          ) {
            aimedBinId = bins[i].id;
            return;
          }
        }
      }
    }

    aimFallbackAngular(px, pz, camera);
  }

  function isAimedAtBin() {
    return aimedBinId !== null;
  }

  function getAimedBin() {
    return aimedBinId !== null ? getBinById(aimedBinId) : null;
  }

  function resetForNewRun() {
    closeSearch();
    aimedBinId = null;
    binPickMeshes = [];
    var i;
    for (i = 0; i < bins.length; i++) {
      bins[i].loot = null;
      bins[i].searched = false;
      bins[i].revealStarted = false;
    }
  }

  if (panelEl) {
    panelEl.hidden = true;
  }

  if (btnClose) {
    btnClose.addEventListener("click", closeSearch);
  }
  if (backdropEl) {
    backdropEl.addEventListener("click", closeSearch);
  }

  window.ActionWasteBin = {
    isOpen: function () {
      return open;
    },
    close: closeSearch,
    setBinPositions: setBinPositions,
    resetForNewRun: resetForNewRun,
    updateAim: updateAim,
    syncBinWorldCenter: syncBinWorldCenter,
    registerBinPickMesh: registerBinPickMesh,
    isAimedAtBin: isAimedAtBin,
    isNearAnyBin: isNearAnyBin,
    getAimedBin: getAimedBin,
    tryOpenAimed: function (px, pz) {
      var bin = getAimedBin();
      if (!bin || !playerNearBin(bin, px, pz)) return false;
      openBin(bin);
      return true;
    },
    getBinPositions: function () {
      return bins;
    },
    BIN_SIZE: { x: 0.95, y: 1.15, z: 0.95 },
    BIN_GLB_URL: "models/industrial-waste-bin.glb",
  };
})();
