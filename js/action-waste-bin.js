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
  var btnTakeAll = document.getElementById("wasteBinTakeAll");
  var btnClose = document.getElementById("wasteBinSearchClose");
  var backdropEl = document.getElementById("wasteBinSearchBackdrop");

  /** 与 action-scene：DOOR_Z(60)+走廊15m+5m房间中心 */
  var bins = [
    { id: 0, x: -0.55, z: 77.5, label: "左侧废料桶", aimY: 0.95 },
    { id: 1, x: 0.55, z: 77.5, label: "右侧废料桶", aimY: 0.95 },
  ];

  var binPickMeshes = [];
  var LOOT_CELL_PX = 48;
  var open = false;
  var activeBin = null;
  var revealTimers = [];
  var cellEls = [];
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
    for (i = 0; i < ids.length; i++) {
      var cat = window.ItemCatalog.getItem(ids[i]);
      if (!cat) continue;
      var data = G.itemDataFromCatalog(cat);
      var inst = G.createInventoryItem(data);
      if (!mgr.tryAutoPlace(inst)) continue;
      queue.push({
        instanceId: inst.instanceId,
        catalogId: ids[i],
        name: data.name,
        w: data.width,
        h: data.height,
        x: inst.x,
        y: inst.y,
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

    return { manager: mgr, queue: queue, emptied: false };
  }

  function clearRevealTimers() {
    var i;
    for (i = 0; i < revealTimers.length; i++) {
      clearTimeout(revealTimers[i]);
    }
    revealTimers = [];
  }

  function findQueueEntry(bin, instanceId) {
    var i;
    for (i = 0; i < bin.loot.queue.length; i++) {
      if (bin.loot.queue[i].instanceId === instanceId) return bin.loot.queue[i];
    }
    return null;
  }

  function buildGridDom(bin) {
    if (!gridHostEl || !G) return;
    gridHostEl.innerHTML = "";
    cellEls = [];

    var row = document.createElement("div");
    row.className = "waste-bin-loot-row";
    row.setAttribute("role", "list");

    var i;
    for (i = 0; i < bin.loot.queue.length; i++) {
      var entry = bin.loot.queue[i];
      var cat =
        window.ItemCatalog &&
        window.ItemCatalog.getItem(entry.catalogId);
      var el = document.createElement("button");
      el.type = "button";
      el.className = "waste-bin-loot-card waste-bin-item--hidden";
      el.dataset.instanceId = String(entry.instanceId);
      el.style.width =
        entry.w * LOOT_CELL_PX + (entry.w - 1) * 4 + "px";
      el.style.minHeight =
        entry.h * LOOT_CELL_PX + (entry.h - 1) * 4 + "px";
      if (cat && cat.image) {
        el.style.backgroundImage = "url(" + cat.image + ")";
      }

      var label = document.createElement("span");
      label.className = "waste-bin-loot-card__name";
      label.textContent = entry.name;
      el.appendChild(label);

      el.addEventListener("click", function (e) {
        var id = parseInt(e.currentTarget.dataset.instanceId, 10);
        takeOne(bin, id);
      });
      row.appendChild(el);
      cellEls.push({ instanceId: entry.instanceId, el: el });
    }

    gridHostEl.appendChild(row);
  }

  function revealEntry(instanceId) {
    var i;
    for (i = 0; i < cellEls.length; i++) {
      if (cellEls[i].instanceId === instanceId) {
        cellEls[i].el.classList.remove("waste-bin-item--hidden");
        cellEls[i].el.classList.add("waste-bin-item--pop");
        break;
      }
    }
  }

  function startRevealSequence(bin) {
    clearRevealTimers();
    var i;
    for (i = 0; i < bin.loot.queue.length; i++) {
      (function (entry) {
        var timer = setTimeout(function () {
          entry.revealed = true;
          revealEntry(entry.instanceId);
          if (statusEl) {
            statusEl.textContent = "点击物品拾取到背包/安全箱";
          }
        }, entry.revealAt);
        revealTimers.push(timer);
      })(bin.loot.queue[i]);
    }
  }

  function takeOne(bin, instanceId) {
    var entry = findQueueEntry(bin, instanceId);
    if (!entry || entry.taken || !entry.revealed) return;

    if (!window.PlayerLoadout || !window.ItemCatalog) return;
    var cat = window.ItemCatalog.getItem(entry.catalogId);
    if (!cat) return;

    if (!window.PlayerLoadout.tryPlaceLoot(cat)) {
      alert("背包与安全箱已满，无法拾取。");
      return;
    }

    entry.taken = true;
    bin.loot.manager.removeItem({ instanceId: instanceId });

    var i;
    for (i = 0; i < cellEls.length; i++) {
      if (cellEls[i].instanceId === instanceId) {
        cellEls[i].el.remove();
        break;
      }
    }

    if (allTaken(bin)) {
      bin.loot.emptied = true;
      if (statusEl) statusEl.textContent = "桶内已空";
    }

    if (window.ActionInventory && window.ActionInventory.isOpen()) {
      window.ActionInventory.refresh();
    }
  }

  function allTaken(bin) {
    var i;
    for (i = 0; i < bin.loot.queue.length; i++) {
      if (!bin.loot.queue[i].taken) return false;
    }
    return true;
  }

  function takeAll(bin) {
    var copy = bin.loot.queue.slice();
    var i;
    for (i = 0; i < copy.length; i++) {
      if (!copy[i].revealed || copy[i].taken) continue;
      takeOne(bin, copy[i].instanceId);
    }
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
          revealEntry(bin.loot.queue[i].instanceId);
        }
      }
      if (statusEl) {
        statusEl.textContent = "点击物品拾取到背包/安全箱";
      }
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
    cellEls = [];
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
      if (!playerNearBin(b, px, pz)) continue;

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
          if (binPickMeshes[i] === mesh && playerNearBin(bins[i], px, pz)) {
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
  if (btnTakeAll) {
    btnTakeAll.addEventListener("click", function () {
      if (activeBin) takeAll(activeBin);
    });
  }

  window.ActionWasteBin = {
    isOpen: function () {
      return open;
    },
    close: closeSearch,
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
