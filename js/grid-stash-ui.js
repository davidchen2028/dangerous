/**
 * 大厅网格：仓库 + 背包 + 安全箱（统一格宽、跨容器拖拽、定价/回收）
 */
(function () {
  "use strict";

  var G = window.GridInventory;
  if (!G) return;

  var DRAG_THRESHOLD_PX = 6;
  var STASH_COLS = G.GridManager.STASH_COLS;
  var STASH_ROWS = G.GridManager.STASH_ROWS;

  var stashHost = document.getElementById("stashGrid");
  var rigHost = document.getElementById("lobbyRigGrid");
  var rigMetaEl = document.getElementById("lobbyRigMeta");
  var secureHost = document.getElementById("lobbySecureGrid");
  var backpackHost = document.getElementById("lobbyBackpackGrid");
  var backpackMetaEl = document.getElementById("lobbyBackpackMeta");
  var popoverEl = document.getElementById("stashItemPopover");
  var popoverTextEl = document.getElementById("stashItemPopoverText");
  var popoverSellBtn = document.getElementById("stashItemSellBtn");
  var popoverCloseBtn = document.getElementById("stashItemPopoverClose");

  var stashManager = G.GridManager.createStash();
  var secureManager = new G.GridManager(1, 2);
  var backpackManager = null;

  var boards = [];
  var extraBoards = [];
  var drag = null;
  var pending = null;
  var selectedInst = null;
  var selectedBoardId = null;
  var seeded = false;
  var didDragThisGesture = false;
  var loadoutPending = null;
  var loadoutDragActive = false;
  var persistReady = false;

  function catalogToItem(cat) {
    if (!cat || !window.ItemCatalog) return null;
    return G.itemDataFromCatalog(cat);
  }

  /** 身上卸下 / 带耐久的物品进仓库 */
  function itemDataFromLoadoutItem(item) {
    if (!item || !window.ItemCatalog) return null;
    var cat = window.ItemCatalog.getItem(item.id);
    if (!cat) return null;
    var data = G.itemDataFromCatalog(cat);
    if (!data) return null;
    if (item.durability != null) data.durability = item.durability;
    if (item.maxDurability != null) data.maxDurability = item.maxDurability;
    if (
      item.id === "keycard" &&
      data.durability != null &&
      data.durability <= 0
    ) {
      return null;
    }
    return data;
  }

  function tryAddToManager(mgr, catItem, opts) {
    if (!mgr || !catItem) return false;
    opts = opts || {};
    var data;
    if (
      catItem.id === "keycard" &&
      catItem.durability != null &&
      !opts.fresh
    ) {
      data = itemDataFromLoadoutItem(catItem);
    } else {
      data = catalogToItem(catItem);
    }
    if (!data) return false;
    if (catItem.id === "keycard") {
      if (data.maxDurability == null) data.maxDurability = 10;
      if (opts.fresh || data.durability == null) {
        data.durability = data.maxDurability;
      }
    }
    if (catItem.stackSize != null && data.stackSize == null) {
      data.stackSize = catItem.stackSize;
    }
    var inst = G.createInventoryItem(data);
    return mgr.tryAutoPlace(inst);
  }

  /** 身上装备 → 网格物品数据（保留 stackSize 等） */
  function equippedItemToGridData(item) {
    if (!item || !window.ItemCatalog) return null;
    var cat = window.ItemCatalog.getItem(item.id);
    if (!cat) return null;
    var data = G.itemDataFromCatalog(cat);
    if (!data) return null;
    if (item.stackSize != null) data.stackSize = item.stackSize;
    if (item.durability != null) data.durability = item.durability;
    if (item.maxDurability != null) data.maxDurability = item.maxDurability;
    return data;
  }

  function tryPlaceEquippedInStash(item, clientX, clientY) {
    var data = equippedItemToGridData(item);
    if (!data) return false;
    var inst = G.createInventoryItem(data);
    var target =
      clientX != null && clientY != null
        ? findBoardAt(clientX, clientY)
        : null;
    if (target && target.id === "stash" && !target.disabled) {
      var pos = pointerToGrid(target, clientX, clientY, inst);
      if (
        target.manager.isSpaceAvailable(
          pos.col,
          pos.row,
          data.width,
          data.height
        )
      ) {
        return target.manager.placeItem(inst, pos.col, pos.row);
      }
    }
    return stashManager.tryAutoPlace(inst);
  }

  function getBackpackManager() {
    if (!window.PlayerLoadout) return backpackManager;
    return window.PlayerLoadout.getBackpackManager
      ? window.PlayerLoadout.getBackpackManager()
      : backpackManager;
  }

  function syncBackpackManagerFromLoadout() {
    backpackManager = getBackpackManager();
  }

  function getRigManager() {
    if (!window.PlayerLoadout) return null;
    return window.PlayerLoadout.getRigManager
      ? window.PlayerLoadout.getRigManager()
      : null;
  }

  function canPlaceInRig(itemData) {
    if (!itemData) return false;
    if (window.PlayerLoadout && window.PlayerLoadout.canStoreInRig) {
      return window.PlayerLoadout.canStoreInRig(itemData);
    }
    return itemData.width === 1 && itemData.height === 1;
  }

  function allBoards() {
    return boards.concat(extraBoards);
  }

  function boardById(id) {
    var list = allBoards();
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function findBoardAt(clientX, clientY) {
    var list = allBoards();
    var i;
    for (i = list.length - 1; i >= 0; i--) {
      var b = list[i];
      if (!b.el || b.disabled) continue;
      var r = b.el.getBoundingClientRect();
      if (
        clientX >= r.left &&
        clientX <= r.right &&
        clientY >= r.top &&
        clientY <= r.bottom
      ) {
        return b;
      }
    }
    return null;
  }

  function pointerToGrid(board, clientX, clientY, item) {
    var rect = board.el.getBoundingClientRect();
    var relX = clientX - rect.left;
    var relY = clientY - rect.top;
    var col = Math.floor((relX / rect.width) * board.cols);
    var row = Math.floor((relY / rect.height) * board.rows);
    if (item) {
      col -= Math.floor(item.itemData.width / 2);
      row -= Math.floor(item.itemData.height / 2);
    }
    col = Math.max(0, Math.min(board.cols - (item ? item.itemData.width : 1), col));
    row = Math.max(0, Math.min(board.rows - (item ? item.itemData.height : 1), row));
    return { col: col, row: row };
  }

  function pointerDistFromStart(e, startX, startY) {
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function hidePopover() {
    if (popoverEl) popoverEl.classList.add("ui-hidden");
    selectedInst = null;
    selectedBoardId = null;
  }

  function clearEquipDropHighlight() {
    var nodes = document.querySelectorAll(".loadout-slot--drop-target");
    var i;
    for (i = 0; i < nodes.length; i++) {
      nodes[i].classList.remove("loadout-slot--drop-target");
    }
  }

  function catalogItemFromInstance(inst) {
    if (!inst || !inst.itemData || !window.ItemCatalog) return null;
    var cat = window.ItemCatalog.getItem(inst.itemData.id);
    if (!cat) return null;
    var out = Object.assign({}, cat);
    if (inst.itemData.durability != null) {
      out.durability = inst.itemData.durability;
    }
    if (inst.itemData.maxDurability != null) {
      out.maxDurability = inst.itemData.maxDurability;
    }
    return out;
  }

  function getEquipSlotElement(clientX, clientY, itemData) {
    if (!window.ItemCatalog || !itemData) return null;
    var cat = window.ItemCatalog.getItem(itemData.id);
    if (!cat) return null;

    var nodes = document.elementsFromPoint
      ? document.elementsFromPoint(clientX, clientY)
      : [document.elementFromPoint(clientX, clientY)];
    var i;
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || !el.closest || !el.closest("#lobbyLoadout")) continue;

      var slotBtn = el.closest("[data-slot]");
      if (!slotBtn || !slotBtn.dataset || !slotBtn.dataset.slot) continue;

      var slotKey = slotBtn.dataset.slot;
      if (slotKey === "card") {
        if (cat.id !== "keycard") continue;
        if (window.ItemCatalog.acceptsSlot(slotKey, cat)) {
          return slotBtn;
        }
        continue;
      }
      if (window.ItemCatalog.acceptsSlot(slotKey, cat)) {
        return slotBtn;
      }
    }
    return null;
  }

  function tryEquipDragToSlot(slotEl, inst, sourceBoard, originX, originY) {
    if (!slotEl || !window.PlayerLoadout || !window.ItemCatalog) return false;
    var slotKey = slotEl.dataset.slot;
    var cat = window.ItemCatalog.getItem(inst.itemData.id);
    if (!cat || !window.ItemCatalog.acceptsSlot(slotKey, cat)) return false;

    var loadout = window.PlayerLoadout.getLoadout();

    if (slotKey === "card") {
      var cardIndex = parseInt(slotEl.dataset.cardIndex, 10);
      if (isNaN(cardIndex) || cat.id !== "keycard") return false;

      var existingCard = loadout.cards[cardIndex];
      if (existingCard) {
        if (!tryAddCatalogItem(existingCard)) {
          alert("仓库已满，无法替换当前卡槽物品。");
          return false;
        }
      }

      var cardItem = catalogItemFromInstance(inst);
      if (!cardItem) return false;

      sourceBoard.manager.removeItem(inst);
      if (!window.PlayerLoadout.equipToSlot("card", cardItem, cardIndex)) {
        sourceBoard.manager.placeItem(inst, originX, originY);
        return false;
      }
      return true;
    }

    if (slotKey === "primary" && loadout.primary) {
      if (!tryAddCatalogItem(loadout.primary)) {
        alert("仓库已满，无法替换当前主武器。");
        return false;
      }
    }
    if (slotKey === "rig" && loadout.rig) {
      if (!tryAddCatalogItem(loadout.rig)) {
        alert("仓库已满，无法替换当前胸挂。");
        return false;
      }
    }
    if (slotKey === "backpack" && loadout.backpack) {
      if (!tryAddCatalogItem(loadout.backpack)) {
        alert("仓库已满，无法替换当前背包。");
        return false;
      }
    }

    var equipItem = catalogItemFromInstance(inst);
    if (!equipItem) return false;

    sourceBoard.manager.removeItem(inst);
    if (!window.PlayerLoadout.equipToSlot(slotKey, equipItem)) {
      sourceBoard.manager.placeItem(inst, originX, originY);
      return false;
    }
    return true;
  }

  function showPopover(inst, boardId) {
    if (!popoverEl || !popoverTextEl || !inst || !inst.itemData) return;
    selectedInst = inst;
    selectedBoardId = boardId;

    var hint = "";
    if (window.LobbyMarket && window.LobbyMarket.getPriceHintByCatalogId) {
      hint = window.LobbyMarket.getPriceHintByCatalogId(inst.itemData.id);
    }
    if (!hint) {
      hint = inst.itemData.name + " · 暂无黑市挂牌信息";
    }

    var reclaim =
      window.LobbyMarket && window.LobbyMarket.getReclaimPrice
        ? window.LobbyMarket.getReclaimPrice(inst.itemData.id)
        : null;

    popoverTextEl.textContent = hint;

    if (popoverSellBtn) {
      if (reclaim != null) {
        popoverSellBtn.disabled = false;
        popoverSellBtn.textContent =
          "官方回收 +" + reclaim.toLocaleString() + " 极危币";
      } else {
        popoverSellBtn.disabled = true;
        popoverSellBtn.textContent = "不可官方回收";
      }
    }

    popoverEl.classList.remove("ui-hidden");
  }

  function sellSelectedItem() {
    if (!selectedInst || !selectedBoardId || !window.LobbyMarket) return;
    var board = boardById(selectedBoardId);
    if (!board) return;

    var itemName = selectedInst.itemData.name;
    var price = window.LobbyMarket.sellCatalogItem(selectedInst.itemData.id);
    if (price == null) {
      alert("该物品无法官方回收。");
      return;
    }

    board.manager.removeItem(selectedInst);
    hidePopover();
    renderAll();
    alert(
      "已回收「" + itemName + "」，获得 " + price.toLocaleString() + " 极危币。"
    );
  }

  function hostGridClass(board) {
    if (board.id === "stash") return "stash-grid inv-grid-host";
    return "inv-grid-host";
  }

  function buildBoardDom(board) {
    if (!board.host) return;
    board.host.innerHTML = "";
    board.host.className = hostGridClass(board);

    var wrap = document.createElement("div");
    wrap.className = "inv-grid-board";
    wrap.dataset.boardId = board.id;
    wrap.style.setProperty("--inv-cols", String(board.cols));
    wrap.style.setProperty("--inv-rows", String(board.rows));

    var bg = document.createElement("div");
    bg.className = "inv-grid-bg";
    bg.setAttribute("aria-hidden", "true");

    var itemsLayer = document.createElement("div");
    itemsLayer.className = "inv-items-layer";

    var preview = document.createElement("div");
    preview.className = "inv-drop-preview";
    preview.hidden = true;

    var i;
    var n = board.cols * board.rows;
    for (i = 0; i < n; i++) {
      var cell = document.createElement("div");
      cell.className = "inv-grid-bg__cell";
      bg.appendChild(cell);
    }

    wrap.appendChild(bg);
    wrap.appendChild(itemsLayer);
    wrap.appendChild(preview);
    board.host.appendChild(wrap);

    board.el = wrap;
    board.bgEl = bg;
    board.itemsLayerEl = itemsLayer;
    board.previewEl = preview;
  }

  function setPreview(board, col, row, w, h, ok) {
    if (!board.previewEl) return;
    var p = board.previewEl;
    p.hidden = false;
    p.style.left = (col / board.cols) * 100 + "%";
    p.style.top = (row / board.rows) * 100 + "%";
    p.style.width = (w / board.cols) * 100 + "%";
    p.style.height = (h / board.rows) * 100 + "%";
    p.classList.toggle("inv-drop-preview--ok", !!ok);
    p.classList.toggle("inv-drop-preview--bad", !ok);
  }

  function hideAllPreviews() {
    var list = allBoards();
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].previewEl) list[i].previewEl.hidden = true;
    }
  }

  function updateItemElement(board, inst, el) {
    el.style.left = (inst.x / board.cols) * 100 + "%";
    el.style.top = (inst.y / board.rows) * 100 + "%";
    el.style.width = (inst.itemData.width / board.cols) * 100 + "%";
    el.style.height = (inst.itemData.height / board.rows) * 100 + "%";
  }

  function renderBoard(board) {
    if (!board.itemsLayerEl || board.disabled) return;
    board.itemsLayerEl.innerHTML = "";
    var i;
    for (i = 0; i < board.manager.items.length; i++) {
      board.itemsLayerEl.appendChild(
        renderItemElement(board, board.manager.items[i])
      );
    }
  }

  function renderItemElement(board, inst) {
    var el = document.createElement("div");
    el.className = "inv-item";
    el.dataset.instanceId = String(inst.instanceId);
    el.dataset.boardId = board.id;
    updateItemElement(board, inst, el);

    var label = document.createElement("span");
    label.className = "inv-item__label";
    if (inst.itemData.id === "keycard") {
      el.classList.add("inv-item--keycard");
      label.classList.add("inv-item__label--dur");
      label.textContent =
        (inst.itemData.durability != null
          ? inst.itemData.durability
          : inst.itemData.maxDurability || 10) +
        "/" +
        (inst.itemData.maxDurability || 10);
    } else if (inst.itemData.stackSize != null && inst.itemData.stackSize > 1) {
      label.textContent = "×" + inst.itemData.stackSize;
    } else {
      label.textContent = inst.itemData.name;
    }
    el.appendChild(label);

    if (inst.itemData.icon) {
      el.style.backgroundImage = "url(" + inst.itemData.icon + ")";
    }

    el.title =
      inst.itemData.name +
      " · 单击定价/回收 · 拖拽移动 · 双击装备（仓库内）";

    el.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || board.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      hidePopover();
      didDragThisGesture = false;
      pending = {
        board: board,
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
      if (
        board.id === "stash" ||
        board.id === "rig" ||
        board.id === "secure" ||
        board.id === "backpack"
      ) {
        tryEquipFromGrid(inst, board);
      }
    });

    return el;
  }

  function startDrag(board, inst, el, e) {
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerUp);
    el.removeEventListener("pointercancel", onPointerUp);
    didDragThisGesture = true;
    drag = {
      board: board,
      item: inst,
      originX: inst.x,
      originY: inst.y,
      el: el,
      pointerId: e.pointerId,
    };
    el.classList.add("inv-item--dragging");
    el.style.pointerEvents = "none";
    el.addEventListener("pointermove", onDragMove);
    el.addEventListener("pointerup", onDragEnd);
    el.addEventListener("pointercancel", onDragEnd);
  }

  function onPointerMove(e) {
    if (!pending || e.pointerId !== pending.pointerId) return;
    if (drag) {
      onDragMove(e);
      return;
    }
    if (
      pointerDistFromStart(e, pending.startX, pending.startY) >=
      DRAG_THRESHOLD_PX
    ) {
      startDrag(pending.board, pending.item, pending.el, e);
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
      var b = pending.board;
      var inst = pending.item;
      var el = pending.el;
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      if (
        !didDragThisGesture &&
        pointerDistFromStart(e, pending.startX, pending.startY) <
          DRAG_THRESHOLD_PX
      ) {
        showPopover(inst, b.id);
      }
      pending = null;
    }
  }

  function onDragMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    clearEquipDropHighlight();
    var slotEl = getEquipSlotElement(e.clientX, e.clientY, drag.item.itemData);
    if (slotEl) {
      slotEl.classList.add("loadout-slot--drop-target");
      hideAllPreviews();
      return;
    }
    var target = findBoardAt(e.clientX, e.clientY) || drag.board;
    if (target.disabled) {
      hideAllPreviews();
      return;
    }
    var pos = pointerToGrid(target, e.clientX, e.clientY, drag.item);
    var ok =
      (target.id !== "rig" || canPlaceInRig(drag.item.itemData)) &&
      target.manager.isSpaceAvailable(
        pos.col,
        pos.row,
        drag.item.itemData.width,
        drag.item.itemData.height,
        drag.board === target ? drag.item : null
      );
    hideAllPreviews();
    setPreview(
      target,
      pos.col,
      pos.row,
      drag.item.itemData.width,
      drag.item.itemData.height,
      ok
    );
  }

  function onDragEnd(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    var source = drag.board;
    var inst = drag.item;
    var el = drag.el;
    var originX = drag.originX;
    var originY = drag.originY;

    el.classList.remove("inv-item--dragging");
    el.style.pointerEvents = "";
    hideAllPreviews();
    clearEquipDropHighlight();
    el.removeEventListener("pointermove", onDragMove);
    el.removeEventListener("pointerup", onDragEnd);
    el.removeEventListener("pointercancel", onDragEnd);

    var slotEl = getEquipSlotElement(e.clientX, e.clientY, inst.itemData);
    if (slotEl && tryEquipDragToSlot(slotEl, inst, source, originX, originY)) {
      drag = null;
      pending = null;
      renderAll();
      window.PlayerLoadout.renderLobby();
      return;
    }

    var target = findBoardAt(e.clientX, e.clientY);
    var placed = false;

    if (target && !target.disabled) {
      var pos = pointerToGrid(target, e.clientX, e.clientY, inst);
      var rigOk =
        target.id !== "rig" || canPlaceInRig(inst.itemData);
      if (source === target) {
        placed =
          rigOk && target.manager.placeItem(inst, pos.col, pos.row);
      } else if (
        rigOk &&
        target.manager.isSpaceAvailable(
          pos.col,
          pos.row,
          inst.itemData.width,
          inst.itemData.height
        )
      ) {
        source.manager.removeItem(inst);
        placed = target.manager.placeItem(inst, pos.col, pos.row);
        if (!placed) {
          source.manager.placeItem(inst, originX, originY);
        }
      }
    }

    if (!placed) {
      source.manager.placeItem(inst, originX, originY);
      if (source !== target) {
        el.classList.add("inv-item--bounce");
        setTimeout(function () {
          el.classList.remove("inv-item--bounce");
        }, 320);
      }
    }

    drag = null;
    pending = null;
    renderAll();
  }

  function tryEquipFromGrid(inst, board) {
    if (!window.PlayerLoadout || !inst.itemData) return;

    if (inst.itemData.id === "keycard") {
      if (
        inst.itemData.durability != null &&
        inst.itemData.durability <= 0
      ) {
        if (board && board.manager) board.manager.removeItem(inst);
        renderAll();
        window.PlayerLoadout.renderLobby();
        return;
      }
      if (window.PlayerLoadout.equipKeycardFromItemData(inst.itemData)) {
        if (board && board.manager) board.manager.removeItem(inst);
        renderAll();
        window.PlayerLoadout.renderLobby();
      }
      return;
    }

    var equipMap = {
      rig_light: "riglt",
      bp_sport: "bpspt",
      bp_light: "bplgt",
      helm_basic: "helm1",
      armr_basic: "armr1",
      uzi_smg: "uzism",
    };
    var stashId = equipMap[inst.itemData.id];
    if (!stashId) return;
    if (window.PlayerLoadout.equipFromStashId(stashId)) {
      if (board && board.manager) board.manager.removeItem(inst);
      else stashManager.removeItem(inst);
      renderAll();
      window.PlayerLoadout.renderLobby();
    }
  }

  function rebuildBoardList() {
    syncBackpackManagerFromLoadout();
    var loadout = window.PlayerLoadout && window.PlayerLoadout.getLoadout();
    var rig = loadout && loadout.rig;
    var rigMgr = getRigManager();
    var rigDims =
      rig && window.PlayerLoadout.getRigGridSize
        ? window.PlayerLoadout.getRigGridSize(rig)
        : { cols: 0, rows: 0 };
    var rigDisabled = !rig || !rigMgr;
    var bp = loadout && loadout.backpack;
    var bpDisabled = !bp || !backpackManager;

    if (rigMetaEl) {
      rigMetaEl.textContent = rig
        ? rig.name +
          " " +
          rigDims.cols +
          "×" +
          rigDims.rows +
          " · 仅 1×1"
        : "未装备 · 请双击仓库胸挂装备";
    }

    if (backpackMetaEl) {
      backpackMetaEl.textContent = bp
        ? bp.name + " " + bp.cols + "×" + bp.rows
        : "未装备 · 请双击仓库背包装备";
    }

    boards = [
      {
        id: "stash",
        host: stashHost,
        manager: stashManager,
        cols: STASH_COLS,
        rows: STASH_ROWS,
        disabled: false,
      },
      {
        id: "rig",
        host: rigHost,
        manager: rigMgr,
        cols: rigDims.cols,
        rows: rigDims.rows,
        disabled: rigDisabled,
      },
      {
        id: "backpack",
        host: backpackHost,
        manager: backpackManager,
        cols: bp ? bp.cols : 0,
        rows: bp ? bp.rows : 0,
        disabled: bpDisabled,
      },
      {
        id: "secure",
        host: secureHost,
        manager: secureManager,
        cols: 1,
        rows: 2,
        disabled: false,
      },
    ];
  }

  function renderDisabledHost(board) {
    if (!board.host) return;
    board.host.innerHTML =
      '<p class="inv-grid-host__empty">' +
      (board.id === "backpack"
        ? "未装备背包"
        : board.id === "rig"
          ? "未装备胸挂"
          : "暂无格子") +
      "</p>";
    board.el = null;
  }

  function resolvePersistEntry(itemId, entry) {
    var cat = window.ItemCatalog && window.ItemCatalog.getItem(itemId);
    if (!cat) return null;
    var data = G.itemDataFromCatalog(cat);
    if (!data || !entry) return data;
    if (entry.durability != null) data.durability = entry.durability;
    if (entry.maxDurability != null) data.maxDurability = entry.maxDurability;
    if (entry.stackSize != null) data.stackSize = entry.stackSize;
    return data;
  }

  function deserializeIntoManager(manager, items) {
    if (!manager) return;
    manager.deserialize(items || [], resolvePersistEntry);
  }

  function notifyPersist() {
    if (
      persistReady &&
      window.PlayerStatePersist &&
      window.PlayerStatePersist.scheduleSave
    ) {
      window.PlayerStatePersist.scheduleSave();
    }
  }

  function renderAll() {
    purgeDepletedKeycardsInManager(stashManager);
    purgeDepletedKeycardsInManager(secureManager);
    purgeDepletedKeycardsInManager(getBackpackManager());
    purgeDepletedKeycardsInManager(getRigManager());
    rebuildBoardList();
    var i;
    for (i = 0; i < boards.length; i++) {
      var b = boards[i];
      if (b.disabled || !b.cols || !b.rows) {
        renderDisabledHost(b);
        continue;
      }
      buildBoardDom(b);
      renderBoard(b);
    }
    notifyPersist();
  }

  function countStashItem(id) {
    var n = 0;
    var i;
    for (i = 0; i < stashManager.items.length; i++) {
      if (stashManager.items[i].itemData.id === id) n += 1;
    }
    return n;
  }

  var STARTER_KIT_STORAGE_KEY = "dangerous_starter_kit_granted";

  function isStarterKitGranted() {
    try {
      if (localStorage.getItem(STARTER_KIT_STORAGE_KEY) === "1") return true;
      if (localStorage.getItem("dangerous_starter_kit_v1") === "1") {
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  function markStarterKitGranted() {
    try {
      localStorage.setItem(STARTER_KIT_STORAGE_KEY, "1");
    } catch (e) {
      /* ignore */
    }
  }

  /** 仅首次进游戏：UZI ×1 + 黄铜子弹 60发 ×2（之后卖掉也不会再刷） */
  function placeStarterKitOnce() {
    if (!window.ItemCatalog) return false;

    var changed = false;
    var bulletStacks = countStashItem("brass_bullet");

    if (countStashItem("uzi_smg") < 1) {
      var uzi = window.ItemCatalog.getItem("uzi_smg");
      if (uzi) {
        var uziData = catalogToItem(uzi);
        if (uziData) {
          var uziInst = G.createInventoryItem(uziData);
          if (
            stashManager.tryAutoPlace(uziInst) ||
            stashManager.placeItem(uziInst, 0, 0)
          ) {
            changed = true;
          } else {
            console.warn("[GridStash] 新手 UZI 无法放入仓库，请整理格子");
          }
        }
      }
    }

    var bullet = window.ItemCatalog.getItem("brass_bullet");
    while (bulletStacks < 2 && bullet) {
      var stack = Object.assign({}, bullet);
      stack.stackSize = 60;
      var bulletData = catalogToItem(stack);
      if (!bulletData) break;
      var bulletInst = G.createInventoryItem(bulletData);
      if (
        stashManager.tryAutoPlace(bulletInst) ||
        stashManager.placeItem(bulletInst, 0, 3)
      ) {
        bulletStacks += 1;
        changed = true;
      } else {
        break;
      }
    }

    return changed;
  }

  function seedStarterKit() {
    if (seeded) return;
    seeded = true;
    if (isStarterKitGranted()) return;
    if (!window.ItemCatalog) return;

    var changed = placeStarterKitOnce();
    markStarterKitGranted();
    if (changed) renderAll();
  }

  function getEquippedFromSlot(slotKey, cardIndex) {
    if (!window.PlayerLoadout) return null;
    var loadout = window.PlayerLoadout.getLoadout();
    if (slotKey === "card") {
      if (cardIndex == null || isNaN(cardIndex)) return null;
      return loadout.cards[cardIndex];
    }
    if (slotKey === "rig") return loadout.rig;
    if (slotKey === "backpack") return loadout.backpack;
    return loadout[slotKey];
  }

  function clearLoadoutDragUi() {
    loadoutPending = null;
    loadoutDragActive = false;
    var nodes = document.querySelectorAll(".loadout-slot--dragging");
    var i;
    for (i = 0; i < nodes.length; i++) {
      nodes[i].classList.remove("loadout-slot--dragging");
    }
    document.body.classList.remove("loadout-drag-active");
  }

  function onLoadoutPointerMove(e) {
    if (!loadoutPending || e.pointerId !== loadoutPending.pointerId) return;
    if (
      !loadoutDragActive &&
      pointerDistFromStart(e, loadoutPending.startX, loadoutPending.startY) >=
        DRAG_THRESHOLD_PX
    ) {
      loadoutDragActive = true;
      loadoutPending.btn.classList.add("loadout-slot--dragging");
      document.body.classList.add("loadout-drag-active");
    }
    if (!loadoutDragActive) return;
    var target = findBoardAt(e.clientX, e.clientY);
    hideAllPreviews();
    if (target && target.id === "stash" && !target.disabled) {
      var data = equippedItemToGridData(loadoutPending.item);
      if (!data) return;
      var fakeInst = { itemData: data, x: 0, y: 0 };
      var pos = pointerToGrid(target, e.clientX, e.clientY, fakeInst);
      var ok = target.manager.isSpaceAvailable(
        pos.col,
        pos.row,
        data.width,
        data.height
      );
      setPreview(target, pos.col, pos.row, data.width, data.height, ok);
    }
  }

  function onLoadoutPointerUp(e) {
    if (!loadoutPending || e.pointerId !== loadoutPending.pointerId) return;
    window.removeEventListener("pointermove", onLoadoutPointerMove);
    window.removeEventListener("pointerup", onLoadoutPointerUp);
    window.removeEventListener("pointercancel", onLoadoutPointerUp);
    hideAllPreviews();

    var pending = loadoutPending;
    var wasDrag = loadoutDragActive;
    clearLoadoutDragUi();

    if (!wasDrag) return;

    if (!window.PlayerLoadout) return;
    var removed =
      pending.slotKey === "card" && pending.cardIndex != null
        ? window.PlayerLoadout.unequipSlot("card", pending.cardIndex)
        : window.PlayerLoadout.unequipSlot(pending.slotKey);
    if (!removed) return;

    var placed = tryPlaceEquippedInStash(removed, e.clientX, e.clientY);
    if (!placed) {
      window.PlayerLoadout.equipToSlot(
        pending.slotKey,
        removed,
        pending.cardIndex
      );
      alert("仓库已满或该格放不下，已放回身上。");
    }
    renderAll();
    window.PlayerLoadout.renderLobby();
  }

  function bindLoadoutSlots() {
    var root = document.getElementById("lobbyLoadout");
    if (!root) return;
    var slots = root.querySelectorAll(".loadout-slot");
    var i;
    for (i = 0; i < slots.length; i++) {
      (function (btn) {
        if (btn.dataset.loadoutDragBound === "1") return;
        btn.dataset.loadoutDragBound = "1";
        btn.addEventListener("pointerdown", function (ev) {
          if (ev.button !== 0) return;
          var slotKey = btn.dataset.slot;
          if (!slotKey) return;
          var cardIndex =
            btn.dataset.cardIndex != null
              ? parseInt(btn.dataset.cardIndex, 10)
              : null;
          var item = getEquippedFromSlot(slotKey, cardIndex);
          if (!item) return;
          loadoutPending = {
            slotKey: slotKey,
            cardIndex: cardIndex,
            item: item,
            btn: btn,
            pointerId: ev.pointerId,
            startX: ev.clientX,
            startY: ev.clientY,
          };
          loadoutDragActive = false;
          window.addEventListener("pointermove", onLoadoutPointerMove);
          window.addEventListener("pointerup", onLoadoutPointerUp);
          window.addEventListener("pointercancel", onLoadoutPointerUp);
        });
      })(slots[i]);
    }
  }

  function purgeDepletedKeycardsInManager(mgr) {
    if (!mgr) return false;
    var changed = false;
    var toRemove = [];
    var i;
    for (i = 0; i < mgr.items.length; i++) {
      var inst = mgr.items[i];
      if (
        inst.itemData &&
        inst.itemData.id === "keycard" &&
        inst.itemData.durability != null &&
        inst.itemData.durability <= 0
      ) {
        toRemove.push(inst);
      }
    }
    for (i = 0; i < toRemove.length; i++) {
      mgr.removeItem(toRemove[i]);
      changed = true;
    }
    return changed;
  }

  function tryAddMarketItem(stashId) {
    if (!window.ItemCatalog) return false;
    var cat = window.ItemCatalog.fromStashId(stashId);
    if (!cat) return false;
    var opts = cat.id === "keycard" ? { fresh: true } : {};
    if (!tryAddToManager(stashManager, cat, opts)) return false;
    renderAll();
    return true;
  }

  function canAddMarketItem(stashId) {
    if (!window.ItemCatalog || !stashManager) return false;
    var cat = window.ItemCatalog.fromStashId(stashId);
    if (!cat) return false;
    var data = catalogToItem(cat);
    if (!data) return false;
    if (cat.stackSize != null && data.stackSize == null) {
      data.stackSize = cat.stackSize;
    }
    var w = data.width;
    var h = data.height;
    var row;
    for (row = 0; row <= stashManager.rows - h; row++) {
      var col;
      for (col = 0; col <= stashManager.columns - w; col++) {
        if (stashManager.isSpaceAvailable(col, row, w, h, null)) {
          return true;
        }
      }
    }
    return false;
  }

  function tryAddCatalogItem(catItem, opts) {
    if (!tryAddToManager(stashManager, catItem, opts)) return false;
    renderAll();
    return true;
  }

  function mountExternalBoard(hostEl, manager, cols, rows, boardId) {
    var id = boardId || "external";
    extraBoards = extraBoards.filter(function (b) {
      return b.id !== id;
    });
    if (!hostEl || !manager || !cols || !rows) {
      if (hostEl) {
        hostEl.innerHTML = '<p class="inv-grid-host__empty">未装备</p>';
      }
      return;
    }
    var board = {
      id: id,
      host: hostEl,
      manager: manager,
      cols: cols,
      rows: rows,
      disabled: false,
    };
    extraBoards.push(board);
    buildBoardDom(board);
    renderBoard(board);
  }

  function refreshStashPanel() {
    renderAll();
    if (window.PlayerLoadout && window.PlayerLoadout.renderLobby) {
      window.PlayerLoadout.renderLobby();
    }
    var layout = document.querySelector(".hub-panel__box--stash > .stash-layout");
    if (layout) layout.scrollTop = 0;
  }

  function init() {
    if (popoverCloseBtn) {
      popoverCloseBtn.addEventListener("click", hidePopover);
    }
    if (popoverSellBtn) {
      popoverSellBtn.addEventListener("click", sellSelectedItem);
    }
    bindLoadoutSlots();
  }

  function exportPersistState() {
    return {
      stash: stashManager.serialize(),
      secure: secureManager.serialize(),
    };
  }

  function importPersistState(data) {
    if (!data) return false;
    stashManager = G.GridManager.createStash();
    secureManager = new G.GridManager(1, 2);
    deserializeIntoManager(stashManager, data.stash);
    deserializeIntoManager(secureManager, data.secure);
    seeded = true;
    return true;
  }

  function enablePersist() {
    persistReady = true;
  }

  function disablePersist() {
    persistReady = false;
  }

  window.GridStashUI = {
    init: init,
    ensureSeeded: seedStarterKit,
    markSeeded: function () {
      seeded = true;
    },
    enablePersist: enablePersist,
    disablePersist: disablePersist,
    exportPersistState: exportPersistState,
    importPersistState: importPersistState,
    render: renderAll,
    refreshStashPanel: refreshStashPanel,
    bindLoadoutSlots: bindLoadoutSlots,
    tryAddMarketItem: tryAddMarketItem,
    canAddMarketItem: canAddMarketItem,
    tryAddCatalogItem: tryAddCatalogItem,
    getManager: function () {
      return stashManager;
    },
    getSecureManager: function () {
      return secureManager;
    },
    getBackpackManager: function () {
      return getBackpackManager();
    },
    mountExternalBoard: mountExternalBoard,
  };

  init();
})();
