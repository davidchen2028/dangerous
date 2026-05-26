/**
 * 路线 B — 二维硬核网格仓库（核心数据结构与空间算法）
 *
 * ItemData      物品静态定义（宽、高、图标等）
 * InventoryItem 网格内实例（左上角坐标 + 引用 ItemData）
 * GridManager   占用矩阵 + 放置 / 移除 / 检测
 */
(function () {
  "use strict";

  var _instanceSeq = 1;

  /**
   * @typedef {Object} ItemData
   * @property {string} id
   * @property {string} name
   * @property {string|null} icon 图标路径或 URL
   * @property {number} width  占用列数
   * @property {number} height 占用行数
   */

  /**
   * @typedef {Object} InventoryItem
   * @property {number} instanceId  网格内唯一实例 ID（对应占用矩阵中的值）
   * @property {ItemData} itemData
   * @property {number} x 左上角列（0-based）
   * @property {number} y 左上角行（0-based）
   */

  /**
   * 创建物品静态数据（等价于 ScriptableObject / 配置表一行）
   * @param {Object} spec
   * @returns {ItemData}
   */
  function createItemData(spec) {
    var w = Math.max(1, Math.floor(spec.width || spec.w || 1));
    var h = Math.max(1, Math.floor(spec.height || spec.h || 1));
    return {
      id: String(spec.id),
      name: String(spec.name || spec.id),
      icon: spec.icon != null ? String(spec.icon) : null,
      width: w,
      height: h,
    };
  }

  /** 从现有 ItemCatalog 条目转换 */
  function itemDataFromCatalog(cat) {
    if (!cat) return null;
    var data = createItemData({
      id: cat.id,
      name: cat.name,
      icon: cat.image || null,
      width: cat.w,
      height: cat.h,
    });
    if (cat.reclaimMin != null) data.reclaimMin = cat.reclaimMin;
    if (cat.minMarketPrice != null) data.minMarketPrice = cat.minMarketPrice;
    if (cat.maxMarketPrice != null) data.maxMarketPrice = cat.maxMarketPrice;
    if (cat.rarity) data.rarity = cat.rarity;
    if (cat.rarityLabel) data.rarityLabel = cat.rarityLabel;
    if (cat.rarityIcon) data.rarityIcon = cat.rarityIcon;
    if (cat.maxDurability != null) data.maxDurability = cat.maxDurability;
    if (cat.durability != null) data.durability = cat.durability;
    if (cat.stackSize != null) data.stackSize = cat.stackSize;
    return data;
  }

  /**
   * 创建网格内物品实例
   * @param {ItemData} itemData
   * @param {number} [x]
   * @param {number} [y]
   * @param {number} [instanceId]
   * @returns {InventoryItem}
   */
  function createInventoryItem(itemData, x, y, instanceId) {
    return {
      instanceId: instanceId != null ? instanceId : _instanceSeq++,
      itemData: itemData,
      x: x != null ? x : -1,
      y: y != null ? y : -1,
    };
  }

  /**
   * @param {number} columns
   * @param {number} rows
   * @constructor
   */
  function GridManager(columns, rows) {
    this.columns = columns;
    this.rows = rows;
    /** @type {number[][]} 0=空，非0=InventoryItem.instanceId */
    this.grid = [];
    /** @type {InventoryItem[]} */
    this.items = [];
    this._initGrid();
  }

  GridManager.STASH_COLS = 6;
  GridManager.STASH_ROWS = 10;
  GridManager.BACKPACK_COLS = 4;
  GridManager.BACKPACK_ROWS = 5;

  GridManager.createStash = function () {
    return new GridManager(GridManager.STASH_COLS, GridManager.STASH_ROWS);
  };

  GridManager.createBackpack = function () {
    return new GridManager(GridManager.BACKPACK_COLS, GridManager.BACKPACK_ROWS);
  };

  GridManager.prototype._initGrid = function () {
    var r;
    this.grid = [];
    for (r = 0; r < this.rows; r++) {
      var row = [];
      var c;
      for (c = 0; c < this.columns; c++) row.push(0);
      this.grid.push(row);
    }
  };

  GridManager.prototype._inBounds = function (x, y, w, h) {
    return (
      x >= 0 &&
      y >= 0 &&
      x + w <= this.columns &&
      y + h <= this.rows
    );
  };

  GridManager.prototype._cellOwner = function (col, row) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.columns) {
      return -1;
    }
    return this.grid[row][col];
  };

  /**
   * 检测矩形区域是否可放置
   * @param {number} startX
   * @param {number} startY
   * @param {number} itemWidth
   * @param {number} itemHeight
   * @param {InventoryItem|null} [ignoringItem] 拖拽自身时排除占用
   * @returns {boolean}
   */
  GridManager.prototype.isSpaceAvailable = function (
    startX,
    startY,
    itemWidth,
    itemHeight,
    ignoringItem
  ) {
    var ignoreId = ignoringItem ? ignoringItem.instanceId : 0;

    if (!this._inBounds(startX, startY, itemWidth, itemHeight)) {
      return false;
    }

    var dy;
    for (dy = 0; dy < itemHeight; dy++) {
      var dx;
      for (dx = 0; dx < itemWidth; dx++) {
        var col = startX + dx;
        var row = startY + dy;
        var owner = this._cellOwner(col, row);
        if (owner === 0) continue;
        if (ignoreId && owner === ignoreId) continue;
        return false;
      }
    }
    return true;
  };

  GridManager.prototype._markCells = function (item, value) {
    var w = item.itemData.width;
    var h = item.itemData.height;
    var dy;
    for (dy = 0; dy < h; dy++) {
      var dx;
      for (dx = 0; dx < w; dx++) {
        this.grid[item.y + dy][item.x + dx] = value;
      }
    }
  };

  /**
   * 从网格移除物品（格子置 0），不销毁实例对象
   * @param {InventoryItem} item
   */
  GridManager.prototype.removeItem = function (item) {
    if (!item || item.x < 0 || item.y < 0) return;

    if (this._inBounds(item.x, item.y, item.itemData.width, item.itemData.height)) {
      this._markCells(item, 0);
    }

    item.x = -1;
    item.y = -1;

    var idx = this.items.indexOf(item);
    if (idx >= 0) this.items.splice(idx, 1);
  };

  /**
   * 放置物品到指定左上角坐标
   * @param {InventoryItem} item
   * @param {number} successX
   * @param {number} successY
   * @returns {boolean}
   */
  GridManager.prototype.placeItem = function (item, successX, successY) {
    if (!item || !item.itemData) return false;

    var w = item.itemData.width;
    var h = item.itemData.height;

    if (
      !this.isSpaceAvailable(successX, successY, w, h, item)
    ) {
      return false;
    }

    if (item.x >= 0 && item.y >= 0) {
      this._markCells(item, 0);
    }

    item.x = successX;
    item.y = successY;
    this._markCells(item, item.instanceId);

    if (this.items.indexOf(item) < 0) {
      this.items.push(item);
    }
    return true;
  };

  /**
   * 尝试自动寻找第一个可放位置（拾取进仓库时用）
   * @param {InventoryItem} item
   * @returns {boolean}
   */
  GridManager.prototype.tryAutoPlace = function (item) {
    var row;
    for (row = 0; row <= this.rows - item.itemData.height; row++) {
      var col;
      for (col = 0; col <= this.columns - item.itemData.width; col++) {
        if (this.placeItem(item, col, row)) return true;
      }
    }
    return false;
  };

  /**
   * 根据实例 ID 查找物品
   * @param {number} instanceId
   * @returns {InventoryItem|null}
   */
  GridManager.prototype.findByInstanceId = function (instanceId) {
    var i;
    for (i = 0; i < this.items.length; i++) {
      if (this.items[i].instanceId === instanceId) return this.items[i];
    }
    return null;
  };

  /**
   * 点击格子时查找该格上的物品（返回锚点物品）
   * @param {number} col
   * @param {number} row
   * @returns {InventoryItem|null}
   */
  GridManager.prototype.getItemAtCell = function (col, row) {
    var owner = this._cellOwner(col, row);
    if (!owner) return null;
    return this.findByInstanceId(owner);
  };

  /**
   * 屏幕坐标 → 网格坐标（需传入格子 DOM 的 getBoundingClientRect）
   * @param {number} clientX
   * @param {number} clientY
   * @param {DOMRect} gridRect
   * @param {number} [anchorCol=0] 以物品左上角对齐时的列偏移
   * @param {number} [anchorRow=0] 以物品左上角对齐时的行偏移
   * @returns {{ col: number, row: number }}
   */
  GridManager.screenToGrid = function (
    clientX,
    clientY,
    gridRect,
    anchorCol,
    anchorRow
  ) {
    var ac = anchorCol || 0;
    var ar = anchorRow || 0;
    var cellW = gridRect.width;
    var cellH = gridRect.height;
    var cols = GridManager.STASH_COLS;
    var rows = GridManager.STASH_ROWS;
    if (gridRect.dataset && gridRect.dataset.gridCols) {
      cols = parseInt(gridRect.dataset.gridCols, 10) || cols;
      rows = parseInt(gridRect.dataset.gridRows, 10) || rows;
    }
    var relX = clientX - gridRect.left;
    var relY = clientY - gridRect.top;
    var col = Math.floor((relX / cellW) * cols) - ac;
    var row = Math.floor((relY / cellH) * rows) - ar;
    return { col: col, row: row };
  };

  /** 简单序列化（后续可同步服务器） */
  GridManager.prototype.serialize = function () {
    return this.items.map(function (it) {
      return {
        instanceId: it.instanceId,
        itemId: it.itemData.id,
        x: it.x,
        y: it.y,
      };
    });
  };

  /**
   * @param {Array<{instanceId:number,itemId:string,x:number,y:number}>} data
   * @param {function(string): ItemData|null} resolveItemData
   */
  GridManager.prototype.deserialize = function (data, resolveItemData) {
    var self = this;
    this._initGrid();
    this.items = [];
    (data || []).forEach(function (entry) {
      var idata = resolveItemData(entry.itemId);
      if (!idata) return;
      var inst = createInventoryItem(idata, -1, -1, entry.instanceId);
      if (entry.instanceId >= _instanceSeq) {
        _instanceSeq = entry.instanceId + 1;
      }
      self.placeItem(inst, entry.x, entry.y);
    });
  };

  window.GridInventory = {
    createItemData: createItemData,
    itemDataFromCatalog: itemDataFromCatalog,
    createInventoryItem: createInventoryItem,
    GridManager: GridManager,
  };
})();
