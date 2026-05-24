/**
 * 新手教程 — 战术格子背包（B / Tab 开关）
 */
(function () {
  "use strict";

  var panel = document.getElementById("actionInventory");
  var gridEl = document.getElementById("actionInventoryGrid");
  var titleEl = document.getElementById("actionInventoryTitle");
  var metaEl = document.getElementById("actionInventoryMeta");

  if (!panel || !gridEl) return;

  var BAG_COLS = 4;
  var BAG_ROWS = 4;
  var open = false;
  var grid = [];
  var placed = [];

  var SAMPLE_ITEMS = [
    { id: "circuit", name: "电路板", w: 1, h: 1, price: 1200 },
    { id: "bolt", name: "螺栓组", w: 1, h: 2, price: 800 },
    { id: "truck", name: "卡车部件", w: 2, h: 3, price: 8500 },
  ];

  function initGrid() {
    grid = [];
    var r;
    for (r = 0; r < BAG_ROWS; r++) {
      grid[r] = [];
      var c;
      for (c = 0; c < BAG_COLS; c++) grid[r][c] = false;
    }
    placed = [];
  }

  function isRectFree(col, row, w, h) {
    if (col < 0 || row < 0 || col + w > BAG_COLS || row + h > BAG_ROWS) return false;
    var y;
    for (y = row; y < row + h; y++) {
      var x;
      for (x = col; x < col + w; x++) {
        if (grid[y][x]) return false;
      }
    }
    return true;
  }

  function occupy(col, row, w, h, val) {
    var y;
    for (y = row; y < row + h; y++) {
      var x;
      for (x = col; x < col + w; x++) grid[y][x] = val;
    }
  }

  function canAddItem(item, outPos) {
    var row;
    for (row = 0; row <= BAG_ROWS - item.h; row++) {
      var col;
      for (col = 0; col <= BAG_COLS - item.w; col++) {
        if (isRectFree(col, row, item.w, item.h)) {
          outPos.col = col;
          outPos.row = row;
          return true;
        }
      }
    }
    return false;
  }

  function tryAddItem(item) {
    var pos = { col: 0, row: 0 };
    if (!canAddItem(item, pos)) return false;
    occupy(pos.col, pos.row, item.w, item.h, true);
    placed.push({ item: item, col: pos.col, row: pos.row });
    return true;
  }

  function seedTutorialLoot() {
    initGrid();
    tryAddItem(SAMPLE_ITEMS[0]);
    tryAddItem(SAMPLE_ITEMS[1]);
    renderGrid();
  }

  function renderGrid() {
    gridEl.innerHTML = "";
    gridEl.style.gridTemplateColumns = "repeat(" + BAG_COLS + ", 1fr)";
    gridEl.style.gridTemplateRows = "repeat(" + BAG_ROWS + ", 1fr)";

    var row;
    for (row = 0; row < BAG_ROWS; row++) {
      var col;
      for (col = 0; col < BAG_COLS; col++) {
        var anchor = null;
        var covered = false;
        for (p = 0; p < placed.length; p++) {
          var pl = placed[p];
          var inRect =
            col >= pl.col &&
            col < pl.col + pl.item.w &&
            row >= pl.row &&
            row < pl.row + pl.item.h;
          if (!inRect) continue;
          if (pl.col === col && pl.row === row) anchor = pl.item;
          else covered = true;
        }
        if (covered && !anchor) continue;

        var cell = document.createElement("div");
        cell.className = "action-inventory__cell";
        if (anchor) {
          cell.classList.add("action-inventory__cell--item");
          cell.textContent = anchor.name;
          cell.title = anchor.name + " " + anchor.w + "×" + anchor.h;
          if (anchor.w > 1) cell.style.gridColumn = "span " + anchor.w;
          if (anchor.h > 1) cell.style.gridRow = "span " + anchor.h;
        }
        gridEl.appendChild(cell);
      }
    }
  }

  function setOpen(next) {
    open = next;
    panel.hidden = !open;
    document.body.classList.toggle("inventory-open", open);
    document.body.classList.toggle("show-cursor", open);
    if (open) {
      if (placed.length === 0) seedTutorialLoot();
      else renderGrid();
      if (titleEl) titleEl.textContent = "轻型战术包";
      if (metaEl) metaEl.textContent = BAG_COLS + " × " + BAG_ROWS;
      if (window.LobbyMarket && window.LobbyMarket.flushPendingToInventory) {
        window.LobbyMarket.flushPendingToInventory();
      }
    }
  }

  function toggle() {
    setOpen(!open);
    return open;
  }

  function isOpen() {
    return open;
  }

  function close() {
    setOpen(false);
  }

  window.ActionInventory = {
    toggle: toggle,
    isOpen: isOpen,
    close: close,
    tryAddItem: tryAddItem,
    tryRemoveItem: function (item) {
      var i;
      for (i = 0; i < placed.length; i++) {
        if (placed[i].item.id === item.id || placed[i].item === item) {
          var pl = placed[i];
          occupy(pl.col, pl.row, pl.item.w, pl.item.h, false);
          placed.splice(i, 1);
          renderGrid();
          return true;
        }
      }
      return false;
    },
    seedTutorialLoot: seedTutorialLoot,
  };

  initGrid();
})();
