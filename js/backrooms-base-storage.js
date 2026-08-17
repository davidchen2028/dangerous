/**
 * 基地寄存柜 — 100 格，仅能在 L1 / L4 / L11(BNTG) 基地操作。
 * 死亡不清除；整局 resetBackroomsRun 时随 session 键清理。
 */
import {
  backpackSlots,
  hotbarSlots,
  BACKPACK_CAPACITY,
  HOTBAR_CAPACITY,
  addItem,
} from "./backrooms-inventory.js";
import { showBackroomsLootToast } from "./backrooms-fps-controller.js";

export const BASE_STORAGE_KEY = "backrooms_base_storage_v1";
export const BASE_STORAGE_CAPACITY = 100;
export const BASE_STORAGE_COLS = 10;
export const BASE_STORAGE_ROWS = 10;

/** @type {(null | { id: string, name: string })[]} */
let storageSlots = new Array(BASE_STORAGE_CAPACITY).fill(null);
let panelEl = null;
let open = false;
let onOpenChange = null;
let selected = null; // { side: "storage"|"backpack"|"hotbar", index: number }
let dragging = null; // { side, index } 拖拽起点

function cloneItem(item) {
  if (!item || !item.id) return null;
  return { id: item.id, name: item.name || item.id };
}

function loadStorage() {
  try {
    var raw = sessionStorage.getItem(BASE_STORAGE_KEY);
    if (!raw) return;
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (var i = 0; i < BASE_STORAGE_CAPACITY; i++) {
      storageSlots[i] = parsed[i] && parsed[i].id ? cloneItem(parsed[i]) : null;
    }
  } catch (err) {
    /* ignore */
  }
}

function persistStorage() {
  try {
    sessionStorage.setItem(BASE_STORAGE_KEY, JSON.stringify(storageSlots));
  } catch (err) {
    /* ignore */
  }
}

loadStorage();

export function isBaseStorageOpen() {
  return open;
}

export function setBaseStorageOpenHandler(fn) {
  onOpenChange = typeof fn === "function" ? fn : null;
}

export function countBaseStorageFree() {
  var n = 0;
  for (var i = 0; i < storageSlots.length; i++) {
    if (!storageSlots[i]) n++;
  }
  return n;
}

/** 背包满时奖励/发放写入寄存柜。 */
export function addToBaseStorage(item) {
  if (!item || !item.id) return false;
  for (var i = 0; i < storageSlots.length; i++) {
    if (!storageSlots[i]) {
      storageSlots[i] = cloneItem(item);
      persistStorage();
      if (panelEl && open) renderStorageUi();
      return true;
    }
  }
  return false;
}

/** 从寄存柜移除首个匹配 id 的物品（接取失败回滚用）。 */
export function removeFirstFromBaseStorage(itemId) {
  if (!itemId) return false;
  for (var i = 0; i < storageSlots.length; i++) {
    if (storageSlots[i] && storageSlots[i].id === itemId) {
      storageSlots[i] = null;
      persistStorage();
      if (panelEl && open) renderStorageUi();
      return true;
    }
  }
  return false;
}

/**
 * 优先放进背包；满则寄存。
 * @returns {{ ok: boolean, stored: boolean }}
 */
export function grantItemOrStore(item) {
  if (addItem(item)) return { ok: true, stored: false };
  if (addToBaseStorage(item)) return { ok: true, stored: true };
  return { ok: false, stored: false };
}

/**
 * 批量发放；返回寄存件数。
 * @param {{ id: string, name: string, count?: number }[]} list
 */
export function grantItemListOrStore(list, onToast) {
  var stored = 0;
  var failed = 0;
  if (!list || !list.length) return { stored: 0, failed: 0 };
  for (var i = 0; i < list.length; i++) {
    var entry = list[i];
    var count = entry.count > 0 ? entry.count : 1;
    for (var n = 0; n < count; n++) {
      var r = grantItemOrStore({ id: entry.id, name: entry.name || entry.id });
      if (!r.ok) failed++;
      else if (r.stored) stored++;
    }
  }
  if (stored > 0 && typeof onToast === "function") {
    onToast("背包满了，工作人员帮你寄存了 " + stored + " 件物品（可在 L1 / L4 / L11 基地取出）");
  }
  return { stored: stored, failed: failed };
}

function getSlot(side, index) {
  if (side === "storage") return storageSlots[index] || null;
  if (side === "backpack") return backpackSlots[index] || null;
  if (side === "hotbar") return hotbarSlots[index] || null;
  return null;
}

function setSlot(side, index, item) {
  if (side === "storage") {
    storageSlots[index] = item;
    persistStorage();
    return;
  }
  if (side === "backpack") {
    backpackSlots[index] = item;
    try {
      sessionStorage.setItem("backrooms_backpack_v1", JSON.stringify(backpackSlots));
    } catch (err) {
      /* ignore */
    }
    return;
  }
  if (side === "hotbar") {
    hotbarSlots[index] = item;
    try {
      sessionStorage.setItem("backrooms_hotbar_v1", JSON.stringify(hotbarSlots));
    } catch (err) {
      /* ignore */
    }
  }
}

function capacityOf(side) {
  if (side === "storage") return BASE_STORAGE_CAPACITY;
  if (side === "backpack") return BACKPACK_CAPACITY;
  if (side === "hotbar") return HOTBAR_CAPACITY;
  return 0;
}

function swapOrMove(fromSide, fromIndex, toSide, toIndex) {
  if (fromSide === toSide && fromIndex === toIndex) return;
  var a = getSlot(fromSide, fromIndex);
  var b = getSlot(toSide, toIndex);
  setSlot(fromSide, fromIndex, b);
  setSlot(toSide, toIndex, a);
  selected = null;
  renderStorageUi();
}

function ensurePanel() {
  if (panelEl) return panelEl;
  panelEl = document.createElement("div");
  panelEl.id = "backroomsBaseStorage";
  panelEl.hidden = true;
  panelEl.style.cssText =
    "position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;" +
    "background:rgba(8,10,14,.72);font-family:ui-sans-serif,system-ui,sans-serif;color:#efe8d8;";
  panelEl.innerHTML =
    '<div style="width:min(920px,96vw);max-height:92vh;overflow:auto;background:#1c1f24;border:1px solid #6a6354;padding:1rem 1.1rem 1.2rem;">' +
    '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:1rem;margin-bottom:.7rem;">' +
    "<strong style=\"font-size:1.05rem;\">基地寄存柜 · 100 格</strong>" +
    '<span style="opacity:.75;font-size:.85rem;">拖拽移动 · 或点击两格互换 · Esc / B 关闭 · 死亡不会清空</span>' +
    "</div>" +
    '<p style="margin:.2rem 0 .55rem;opacity:.8;font-size:.86rem;">寄存区</p>' +
    '<div id="brStorageGrid" style="display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:4px;"></div>' +
    '<p style="margin:.85rem 0 .45rem;opacity:.8;font-size:.86rem;">随身背包</p>' +
    '<div id="brStorageBackpack" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;max-width:280px;"></div>' +
    '<p style="margin:.85rem 0 .45rem;opacity:.8;font-size:.86rem;">快捷栏</p>' +
    '<div id="brStorageHotbar" style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px;max-width:420px;"></div>' +
    "</div>";
  document.body.appendChild(panelEl);
  panelEl.addEventListener("click", function (e) {
    if (e.target === panelEl) closeBaseStorage();
  });
  bindStorageDragAndDrop(panelEl);
  return panelEl;
}

function parseCellRef(el) {
  if (!el) return null;
  var side = el.getAttribute("data-side");
  var index = Number(el.getAttribute("data-index"));
  if (!side || Number.isNaN(index)) return null;
  return { side: side, index: index };
}

function bindStorageDragAndDrop(root) {
  root.addEventListener("dragstart", function (e) {
    var cell = e.target.closest && e.target.closest("[data-side][data-index]");
    var ref = parseCellRef(cell);
    if (!ref || !getSlot(ref.side, ref.index)) {
      e.preventDefault();
      return;
    }
    dragging = ref;
    selected = null;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      // Firefox 需要设置数据才会触发 drop
      try {
        e.dataTransfer.setData("text/plain", ref.side + ":" + ref.index);
      } catch (err) {
        /* ignore */
      }
    }
    cell.style.opacity = "0.45";
  });
  root.addEventListener("dragend", function (e) {
    var cell = e.target.closest && e.target.closest("[data-side][data-index]");
    if (cell) cell.style.opacity = "";
    dragging = null;
  });
  root.addEventListener("dragover", function (e) {
    var cell = e.target.closest && e.target.closest("[data-side][data-index]");
    if (!cell || !dragging) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  });
  root.addEventListener("drop", function (e) {
    var cell = e.target.closest && e.target.closest("[data-side][data-index]");
    var ref = parseCellRef(cell);
    if (!ref || !dragging) return;
    e.preventDefault();
    var from = dragging;
    dragging = null;
    swapOrMove(from.side, from.index, ref.side, ref.index);
  });
}

function cellHtml(side, index, item) {
  var label = item ? (item.name || item.id).slice(0, 4) : "";
  var sel =
    selected && selected.side === side && selected.index === index
      ? "outline:2px solid #e0c070;"
      : "";
  return (
    '<button type="button" draggable="' +
    (item ? "true" : "false") +
    '" data-side="' +
    side +
    '" data-index="' +
    index +
    '" style="min-height:44px;border:1px solid #4a463c;background:' +
    (item ? "#2c3038" : "#15171b") +
    ";color:#efe8d8;font-size:.72rem;cursor:" +
    (item ? "grab" : "pointer") +
    ";" +
    sel +
    '">' +
    label +
    "</button>"
  );
}

function renderStorageUi() {
  if (!panelEl) return;
  var grid = panelEl.querySelector("#brStorageGrid");
  var pack = panelEl.querySelector("#brStorageBackpack");
  var hot = panelEl.querySelector("#brStorageHotbar");
  var i;
  var html = "";
  for (i = 0; i < BASE_STORAGE_CAPACITY; i++) {
    html += cellHtml("storage", i, storageSlots[i]);
  }
  grid.innerHTML = html;
  html = "";
  for (i = 0; i < BACKPACK_CAPACITY; i++) {
    html += cellHtml("backpack", i, backpackSlots[i]);
  }
  pack.innerHTML = html;
  html = "";
  for (i = 0; i < HOTBAR_CAPACITY; i++) {
    html += cellHtml("hotbar", i, hotbarSlots[i]);
  }
  hot.innerHTML = html;

  panelEl.querySelectorAll("button[data-side]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var side = btn.getAttribute("data-side");
      var index = Number(btn.getAttribute("data-index"));
      if (!selected) {
        selected = { side: side, index: index };
        renderStorageUi();
        return;
      }
      swapOrMove(selected.side, selected.index, side, index);
    });
  });
}

export function openBaseStorage(opts) {
  opts = opts || {};
  ensurePanel();
  loadStorage();
  open = true;
  selected = null;
  panelEl.hidden = false;
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  renderStorageUi();
  if (opts.toast !== false) {
    showBackroomsLootToast("寄存柜已打开 · 把物品挪进寄存区即可离开后保管", {
      durationMs: 2800,
    });
  }
  if (onOpenChange) onOpenChange(true);
}

export function closeBaseStorage() {
  if (!open) return;
  open = false;
  selected = null;
  if (panelEl) panelEl.hidden = true;
  persistStorage();
  if (onOpenChange) onOpenChange(false);
}

export function toggleBaseStorage() {
  if (open) closeBaseStorage();
  else openBaseStorage();
}

window.addEventListener("keydown", function (e) {
  if (!open) return;
  if (e.code === "Escape" || e.code === "KeyB") {
    e.preventDefault();
    closeBaseStorage();
  }
});

/** 各关卡设置背包开关回调时包一层，避免寄存与背包叠开。 */
export function wrapInventoryOpenHandler(fn) {
  return function (isOpen) {
    if (isOpen && open) closeBaseStorage();
    if (typeof fn === "function") fn(isOpen);
  };
}
