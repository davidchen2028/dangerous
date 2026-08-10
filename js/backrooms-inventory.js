/**
 * 后室独立背包 — 4×5（20 格），无胸挂，仅存放杏仁水等消耗品
 */

export const BACKPACK_COLS = 4;
export const BACKPACK_ROWS = 5;
export const BACKPACK_CAPACITY = BACKPACK_COLS * BACKPACK_ROWS;

/** 后室物品图标（与主游戏 item-catalog 分离，仅 UI 用） */
const ITEM_ICONS = {
  almond_water: "img/backrooms/almond-water.png",
  night_vision_potion: "img/backrooms/night-vision-potion.png",
};

/** @type {(null | { id: string, name: string })[]} */
export const backpackSlots = new Array(BACKPACK_CAPACITY).fill(null);

const BACKPACK_STORAGE_KEY = "backrooms_backpack_v1";

function persistBackpack() {
  try {
    sessionStorage.setItem(BACKPACK_STORAGE_KEY, JSON.stringify(backpackSlots));
  } catch (err) {
    /* ignore */
  }
}

export function loadBackpackFromSession() {
  try {
    var raw = sessionStorage.getItem(BACKPACK_STORAGE_KEY);
    if (!raw) return;
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== BACKPACK_CAPACITY) return;
    var i;
    for (i = 0; i < BACKPACK_CAPACITY; i++) {
      var slot = parsed[i];
      if (slot == null) {
        backpackSlots[i] = null;
      } else if (slot && typeof slot.id === "string") {
        backpackSlots[i] = {
          id: slot.id,
          name: slot.name || slot.id,
        };
      } else {
        backpackSlots[i] = null;
      }
    }
    renderGrid();
  } catch (err) {
    /* ignore */
  }
}

if (typeof window !== "undefined") {
  loadBackpackFromSession();
  window.addEventListener("pagehide", function () {
    persistBackpack();
  });
}

let panelEl = null;
let gridEl = null;
let titleEl = null;
let open = false;
let onOpenChange = null;

export function setInventoryOpenHandler(fn) {
  onOpenChange = fn;
}

export function isInventoryOpen() {
  return open;
}

export function countItem(itemId) {
  var n = 0;
  var i;
  for (i = 0; i < backpackSlots.length; i++) {
    if (backpackSlots[i] && backpackSlots[i].id === itemId) n++;
  }
  return n;
}

export function countUsedSlots() {
  var n = 0;
  var i;
  for (i = 0; i < backpackSlots.length; i++) {
    if (backpackSlots[i]) n++;
  }
  return n;
}

function findEmptySlotIndex() {
  var i;
  for (i = 0; i < backpackSlots.length; i++) {
    if (!backpackSlots[i]) return i;
  }
  return -1;
}

export function addItem(item) {
  if (!item || !item.id) return false;
  var idx = findEmptySlotIndex();
  if (idx < 0) return false;
  backpackSlots[idx] = {
    id: item.id,
    name: item.name || item.id,
  };
  persistBackpack();
  renderGrid();
  return true;
}

export function addAlmondWater(count) {
  var added = 0;
  var i;
  for (i = 0; i < count; i++) {
    if (!addItem({ id: "almond_water", name: "杏仁水" })) break;
    added++;
  }
  return added;
}

export function removeFirstItem(itemId) {
  var i;
  for (i = 0; i < backpackSlots.length; i++) {
    if (backpackSlots[i] && backpackSlots[i].id === itemId) {
      backpackSlots[i] = null;
      persistBackpack();
      renderGrid();
      return true;
    }
  }
  return false;
}

export function resetBackpack() {
  var i;
  for (i = 0; i < backpackSlots.length; i++) {
    backpackSlots[i] = null;
  }
  persistBackpack();
  renderGrid();
}

function renderGrid() {
  if (!gridEl) return;
  var i;
  gridEl.innerHTML = "";
  for (i = 0; i < BACKPACK_CAPACITY; i++) {
    var cell = document.createElement("div");
    cell.className = "br-pack__cell";
    if (backpackSlots[i]) {
      cell.classList.add("br-pack__cell--filled");
      cell.title = backpackSlots[i].name;
      var iconSrc = ITEM_ICONS[backpackSlots[i].id];
      if (iconSrc) {
        var img = document.createElement("img");
        img.className = "br-pack__icon";
        img.src = iconSrc;
        img.alt = backpackSlots[i].name;
        img.draggable = false;
        cell.appendChild(img);
      } else {
        cell.textContent = backpackSlots[i].name.slice(0, 1);
      }
    }
    gridEl.appendChild(cell);
  }
  if (titleEl) {
    titleEl.textContent =
      "背包 " + countUsedSlots() + "/" + BACKPACK_CAPACITY + " · 双击格位使用消耗品";
  }
}

export function mountBackpackPanel(parent) {
  if (panelEl) return panelEl;
  var host = parent || document.body;
  panelEl = document.createElement("div");
  panelEl.id = "backroomsBackpack";
  panelEl.className = "br-pack";
  panelEl.hidden = true;
  panelEl.innerHTML =
    '<div class="br-pack__panel">' +
    '<p class="br-pack__title">背包</p>' +
    '<div class="br-pack__grid"></div>' +
    '<p class="br-pack__foot"><kbd>B</kbd> 关闭 · 双击格位使用消耗品</p>' +
    "</div>";
  host.appendChild(panelEl);
  titleEl = panelEl.querySelector(".br-pack__title");
  gridEl = panelEl.querySelector(".br-pack__grid");
  gridEl.style.setProperty("--br-cols", String(BACKPACK_COLS));
  gridEl.style.setProperty("--br-rows", String(BACKPACK_ROWS));

  gridEl.addEventListener("dblclick", function (e) {
    var cell = e.target.closest(".br-pack__cell");
    if (!cell) return;
    var idx = Array.prototype.indexOf.call(gridEl.children, cell);
    if (idx < 0 || !backpackSlots[idx]) return;
    if (backpackSlots[idx].id === "almond_water") {
      if (typeof window.__backroomsUseAlmondWater === "function") {
        window.__backroomsUseAlmondWater();
      }
    } else if (backpackSlots[idx].id === "night_vision_potion") {
      if (typeof window.__backroomsUseNightVisionPotion === "function") {
        window.__backroomsUseNightVisionPotion();
      }
    }
  });

  renderGrid();
  return panelEl;
}

export function toggleBackpack() {
  if (!panelEl) mountBackpackPanel();
  open = !open;
  panelEl.hidden = !open;
  document.body.classList.toggle("backrooms-pack-open", open);
  if (onOpenChange) onOpenChange(open);
  return open;
}

export function closeBackpack() {
  if (!open) return;
  open = false;
  if (panelEl) panelEl.hidden = true;
  document.body.classList.remove("backrooms-pack-open");
  if (onOpenChange) onOpenChange(false);
}

if (typeof window !== "undefined") {
  window.BackroomsInventory = {
    backpackSlots: backpackSlots,
    BACKPACK_COLS: BACKPACK_COLS,
    BACKPACK_ROWS: BACKPACK_ROWS,
    BACKPACK_CAPACITY: BACKPACK_CAPACITY,
    mountBackpackPanel: mountBackpackPanel,
    toggleBackpack: toggleBackpack,
    closeBackpack: closeBackpack,
    isInventoryOpen: isInventoryOpen,
    addAlmondWater: addAlmondWater,
    addItem: addItem,
    removeFirstItem: removeFirstItem,
    countItem: countItem,
    resetBackpack: resetBackpack,
    loadBackpackFromSession: loadBackpackFromSession,
  };
}
