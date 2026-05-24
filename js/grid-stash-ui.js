/**
 * 路线 B — 大厅 6×10 仓库拖拽 UI
 */
(function () {
  "use strict";

  var G = window.GridInventory;
  if (!G) return;

  var COLS = G.GridManager.STASH_COLS;
  var ROWS = G.GridManager.STASH_ROWS;
  var DRAG_THRESHOLD_PX = 6;

  var boardEl = document.getElementById("stashGrid");
  var priceHintEl = document.getElementById("stashPriceHint");
  var bgEl;
  var itemsLayerEl;
  var previewEl;

  var manager = G.GridManager.createStash();
  var drag = null;
  var pending = null;
  var seeded = false;

  function itemDataFromStashId(stashId) {
    if (!window.ItemCatalog) return null;
    return G.itemDataFromCatalog(window.ItemCatalog.fromStashId(stashId));
  }

  function ensurePriceHint() {
    if (priceHintEl) return priceHintEl;
    if (!boardEl || !boardEl.parentElement) return null;
    priceHintEl = document.createElement("p");
    priceHintEl.id = "stashPriceHint";
    priceHintEl.className = "stash-price-hint";
    priceHintEl.hidden = true;
    boardEl.parentElement.insertBefore(priceHintEl, boardEl.nextSibling);
    return priceHintEl;
  }

  function showMarketPrice(inst) {
    if (!inst || !inst.itemData || !window.LobbyMarket) return;
    var hintText =
      window.LobbyMarket.getPriceHintByCatalogId &&
      window.LobbyMarket.getPriceHintByCatalogId(inst.itemData.id);
    if (!hintText) {
      var price = window.LobbyMarket.getPriceByCatalogId(inst.itemData.id);
      if (price == null) return;
      hintText =
        inst.itemData.name +
        " · 黑市现货 " +
        price.toLocaleString() +
        " 极危币";
    }

    var hint = ensurePriceHint();
    if (!hint) return;
    hint.textContent = hintText;
    hint.hidden = false;
    if (hint._hideTimer) clearTimeout(hint._hideTimer);
    hint._hideTimer = setTimeout(function () {
      hint.hidden = true;
    }, 3200);
  }

  function buildBoardDom() {
    if (!boardEl) return;
    boardEl.className = "stash-grid-board";
    boardEl.innerHTML =
      '<div class="stash-grid-bg" aria-hidden="true"></div>' +
      '<div class="stash-items-layer"></div>' +
      '<div class="stash-drop-preview" hidden></div>';
    bgEl = boardEl.querySelector(".stash-grid-bg");
    itemsLayerEl = boardEl.querySelector(".stash-items-layer");
    previewEl = boardEl.querySelector(".stash-drop-preview");

    bgEl.style.gridTemplateColumns = "repeat(" + COLS + ", 1fr)";
    bgEl.style.gridTemplateRows = "repeat(" + ROWS + ", 1fr)";
    bgEl.innerHTML = "";
    var i;
    for (i = 0; i < COLS * ROWS; i++) {
      var cell = document.createElement("div");
      cell.className = "stash-grid-bg__cell";
      bgEl.appendChild(cell);
    }
  }

  function gridRect() {
    return boardEl.getBoundingClientRect();
  }

  function pointerToGrid(clientX, clientY, item) {
    var rect = gridRect();
    var relX = clientX - rect.left;
    var relY = clientY - rect.top;
    var col = Math.floor((relX / rect.width) * COLS);
    var row = Math.floor((relY / rect.height) * ROWS);
    if (item) {
      col -= Math.floor(item.itemData.width / 2);
      row -= Math.floor(item.itemData.height / 2);
    }
    col = Math.max(0, Math.min(COLS - (item ? item.itemData.width : 1), col));
    row = Math.max(0, Math.min(ROWS - (item ? item.itemData.height : 1), row));
    return { col: col, row: row };
  }

  function setPreview(col, row, w, h, ok) {
    if (!previewEl) return;
    previewEl.hidden = false;
    previewEl.style.left = (col / COLS) * 100 + "%";
    previewEl.style.top = (row / ROWS) * 100 + "%";
    previewEl.style.width = (w / COLS) * 100 + "%";
    previewEl.style.height = (h / ROWS) * 100 + "%";
    previewEl.classList.toggle("stash-drop-preview--ok", !!ok);
    previewEl.classList.toggle("stash-drop-preview--bad", !ok);
  }

  function hidePreview() {
    if (previewEl) previewEl.hidden = true;
  }

  function pointerDistFromStart(e, startX, startY) {
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function renderItemElement(inst) {
    var el = document.createElement("div");
    el.className = "stash-item";
    el.dataset.instanceId = String(inst.instanceId);
    el.style.left = (inst.x / COLS) * 100 + "%";
    el.style.top = (inst.y / ROWS) * 100 + "%";
    el.style.width = (inst.itemData.width / COLS) * 100 + "%";
    el.style.height = (inst.itemData.height / ROWS) * 100 + "%";

    var label = document.createElement("span");
    label.className = "stash-item__label";
    label.textContent = inst.itemData.name;
    el.appendChild(label);

    if (inst.itemData.icon) {
      el.style.backgroundImage = "url(" + inst.itemData.icon + ")";
    }

    el.title =
      inst.itemData.name +
      " " +
      inst.itemData.width +
      "×" +
      inst.itemData.height +
      " · 单击查市价 · 双击装备";

    el.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      pending = {
        item: inst,
        el: el,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
      };
      el.setPointerCapture(e.pointerId);
      el.addEventListener("pointermove", onPointerMove);
      el.addEventListener("pointerup", onPointerUp);
      el.addEventListener("pointercancel", onPointerUp);
    });

    el.addEventListener("dblclick", function (e) {
      e.preventDefault();
      tryEquipFromGrid(inst);
    });

    return el;
  }

  function onPointerMove(e) {
    if (!pending || e.pointerId !== pending.pointerId) return;
    if (drag) {
      onDragMove(e);
      return;
    }
    if (
      pointerDistFromStart(e, pending.startX, pending.startY) >=
        DRAG_THRESHOLD_PX &&
      !drag
    ) {
      startDrag(pending.item, pending.el, e);
      pending = null;
      onDragMove(e);
    }
  }

  function onPointerUp(e) {
    if (!pending && !drag) return;
    if (drag && e.pointerId === drag.pointerId) {
      onDragEnd(e);
      return;
    }
    if (pending && e.pointerId === pending.pointerId) {
      var inst = pending.item;
      var el = pending.el;
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      if (
        pointerDistFromStart(e, pending.startX, pending.startY) <
        DRAG_THRESHOLD_PX
      ) {
        showMarketPrice(inst);
      }
      pending = null;
    }
  }

  function renderAll() {
    if (!itemsLayerEl) return;
    itemsLayerEl.innerHTML = "";
    var i;
    for (i = 0; i < manager.items.length; i++) {
      itemsLayerEl.appendChild(renderItemElement(manager.items[i]));
    }
  }

  function startDrag(inst, el, e) {
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerUp);
    el.removeEventListener("pointercancel", onPointerUp);
    drag = {
      item: inst,
      originX: inst.x,
      originY: inst.y,
      el: el,
      pointerId: e.pointerId,
    };
    el.classList.add("stash-item--dragging");
    el.addEventListener("pointermove", onDragMove);
    el.addEventListener("pointerup", onDragEnd);
    el.addEventListener("pointercancel", onDragEnd);
  }

  function onDragMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    var pos = pointerToGrid(e.clientX, e.clientY, drag.item);
    var ok = manager.isSpaceAvailable(
      pos.col,
      pos.row,
      drag.item.itemData.width,
      drag.item.itemData.height,
      drag.item
    );
    setPreview(
      pos.col,
      pos.row,
      drag.item.itemData.width,
      drag.item.itemData.height,
      ok
    );
  }

  function onDragEnd(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    var inst = drag.item;
    var el = drag.el;
    var originX = drag.originX;
    var originY = drag.originY;

    el.classList.remove("stash-item--dragging");
    hidePreview();
    el.removeEventListener("pointermove", onDragMove);
    el.removeEventListener("pointerup", onDragEnd);
    el.removeEventListener("pointercancel", onDragEnd);
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerUp);
    el.removeEventListener("pointercancel", onPointerUp);

    var pos = pointerToGrid(e.clientX, e.clientY, inst);
    var placed = manager.placeItem(inst, pos.col, pos.row);

    if (!placed) {
      manager.placeItem(inst, originX, originY);
      el.classList.add("stash-item--bounce");
      setTimeout(function () {
        el.classList.remove("stash-item--bounce");
      }, 320);
    }

    el.style.left = (inst.x / COLS) * 100 + "%";
    el.style.top = (inst.y / ROWS) * 100 + "%";
    drag = null;
    pending = null;
  }

  function tryEquipFromGrid(inst) {
    if (!window.PlayerLoadout || !inst.itemData) return;
    var equipMap = {
      keycard: "keycard",
      rig_light: "riglt",
      bp_sport: "bpspt",
      bp_light: "bplgt",
      helm_basic: "helm1",
      armr_basic: "armr1",
    };
    var stashId = equipMap[inst.itemData.id];
    if (!stashId) return;

    if (window.PlayerLoadout.equipFromStashId(stashId)) {
      manager.removeItem(inst);
      renderAll();
      window.PlayerLoadout.renderLobby();
    }
  }

  function tryAddCatalogItem(catItem) {
    if (!catItem) return false;
    var data = G.itemDataFromCatalog(catItem);
    if (!data) return false;
    var inst = G.createInventoryItem(data);
    if (!manager.tryAutoPlace(inst)) return false;
    renderAll();
    return true;
  }

  function seedDemoIfEmpty() {
    if (seeded || manager.items.length > 0) return;
    seeded = true;
    var demos = ["circuit", "medkit", "bolt"];
    var i;
    for (i = 0; i < demos.length; i++) {
      var data = window.ItemCatalog
        ? G.itemDataFromCatalog(window.ItemCatalog.getItem(demos[i]))
        : null;
      if (!data) continue;
      var inst = G.createInventoryItem(data);
      manager.tryAutoPlace(inst);
    }
  }

  function tryAddMarketItem(stashId) {
    var data = itemDataFromStashId(stashId);
    if (!data) return false;
    var inst = G.createInventoryItem(data);
    if (!manager.tryAutoPlace(inst)) return false;
    renderAll();
    return true;
  }

  function init() {
    if (!boardEl) return;
    buildBoardDom();
    seedDemoIfEmpty();
    renderAll();
  }

  window.GridStashUI = {
    init: init,
    render: renderAll,
    tryAddMarketItem: tryAddMarketItem,
    tryAddCatalogItem: tryAddCatalogItem,
    getManager: function () {
      return manager;
    },
  };

  init();
})();
