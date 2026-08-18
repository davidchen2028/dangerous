/**
 * 后室独立背包 — 4×5（20 格）+ 底部 6 格快捷栏
 * 获得物品优先进快捷栏；可从背包拖到快捷栏；←/→ 选中，R 使用选中格
 */

export const BACKPACK_COLS = 4;
export const BACKPACK_ROWS = 5;
export const BACKPACK_CAPACITY = BACKPACK_COLS * BACKPACK_ROWS;
export const HOTBAR_CAPACITY = 6;

/** 后室物品图标（与主游戏 item-catalog 分离，仅 UI 用） */
const ITEM_ICONS = {
  almond_water: "img/backrooms/almond-water.png",
  strawberry_soy_milk: "img/backrooms/strawberry-soy-milk.png",
  banana_soy_milk: "img/backrooms/banana-soy-milk.png",
  strawberry_lucky_soy_milk: "img/backrooms/strawberry-soy-milk.png",
  banana_lucky_soy_milk: "img/backrooms/banana-soy-milk.png",
  lucky_soy_milk: "img/backrooms/lucky-soy-milk.png",
  lucky_soy_milk_cold: "img/backrooms/lucky-soy-milk.png",
  lucky_soy_milk_hot: "img/backrooms/lucky-soy-milk-hot.png",
  night_vision_potion: "img/backrooms/night-vision-potion.png",
  royal_rations: "img/backrooms/royal-rations.png",
  royal_rations_medium: "img/backrooms/royal-rations-medium.png",
  fire_salt: "img/backrooms/fire-salt.png",
  archive_c11: "img/backrooms/archive-viewer.png",
  roulette: "img/backrooms/roulette-revolver.png",
  roulette_revolver: "img/backrooms/roulette-revolver.png",
  package_l1: "img/backrooms/package.png",
  package_l159: "img/backrooms/package.png",
  sample_can_c144: "img/backrooms/package.png",
  sample_can_c1299: "img/backrooms/sample-can-c1299.png",
  beacon_c1299: "img/backrooms/archive-viewer.png",
  scrap_page_c1299: "img/backrooms/archive-viewer.png",
  level_key_l14: "img/backrooms/archive-viewer.png",
  meg_recorder: "img/backrooms/archive-viewer.png",
};

/** @type {(null | { id: string, name: string })[]} */
export const backpackSlots = new Array(BACKPACK_CAPACITY).fill(null);
/** @type {(null | { id: string, name: string })[]} */
export const hotbarSlots = new Array(HOTBAR_CAPACITY).fill(null);

const BACKPACK_STORAGE_KEY = "backrooms_backpack_v1";
const HOTBAR_STORAGE_KEY = "backrooms_hotbar_v1";
const HOTBAR_SELECTED_KEY = "backrooms_hotbar_selected_v1";
const FIRE_SALT_AUTOFILL_KEY = "backrooms_firesalt_autofill_v1";

let selectedHotbarIndex = 0;
/** R 使用时优先从当前选中快捷栏格移除 */
let preferSelectedHotbarRemoval = false;
/** 火盐从快捷栏用掉后，是否从背包或其他快捷栏格自动补回该格（默认关，设置里双击开启） */
let fireSaltAutofillEnabled = false;

let panelEl = null;
let gridEl = null;
let titleEl = null;
let hotbarEl = null;
let hotbarSlotsEl = null;
let settingsEl = null;
let settingsAutofillRow = null;
let open = false;
let settingsOpen = false;
let onOpenChange = null;
let hotbarKeysBound = false;
/** 商店收购模式：设置后点击格子交给商店报价，而不是普通选中 */
let sellPickHandler = null;
/** @type {null | { source: "backpack" | "hotbar", index: number }} */
let sellPick = null;

function cloneItem(item) {
  if (!item || !item.id) return null;
  return { id: item.id, name: item.name || item.id };
}

function persistBackpack() {
  try {
    sessionStorage.setItem(BACKPACK_STORAGE_KEY, JSON.stringify(backpackSlots));
  } catch (err) {
    /* ignore */
  }
}

function persistHotbar() {
  try {
    sessionStorage.setItem(HOTBAR_STORAGE_KEY, JSON.stringify(hotbarSlots));
    sessionStorage.setItem(HOTBAR_SELECTED_KEY, String(selectedHotbarIndex));
  } catch (err) {
    /* ignore */
  }
}

function persistAll() {
  persistBackpack();
  persistHotbar();
}

function loadSlotsArray(raw, target, capacity) {
  if (!raw) return;
  var parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length !== capacity) return;
  var i;
  for (i = 0; i < capacity; i++) {
    var slot = parsed[i];
    if (slot == null) {
      target[i] = null;
    } else if (slot && typeof slot.id === "string") {
      target[i] = { id: slot.id, name: slot.name || slot.id };
    } else {
      target[i] = null;
    }
  }
}

export function loadBackpackFromSession() {
  try {
    loadSlotsArray(sessionStorage.getItem(BACKPACK_STORAGE_KEY), backpackSlots, BACKPACK_CAPACITY);
    loadSlotsArray(sessionStorage.getItem(HOTBAR_STORAGE_KEY), hotbarSlots, HOTBAR_CAPACITY);
    var sel = parseInt(sessionStorage.getItem(HOTBAR_SELECTED_KEY) || "0", 10);
    selectedHotbarIndex = Number.isFinite(sel)
      ? Math.max(0, Math.min(HOTBAR_CAPACITY - 1, sel))
      : 0;
    fireSaltAutofillEnabled = sessionStorage.getItem(FIRE_SALT_AUTOFILL_KEY) === "1";
    renderGrid();
    renderHotbar();
    renderSettings();
  } catch (err) {
    /* ignore */
  }
}

if (typeof window !== "undefined") {
  loadBackpackFromSession();
  window.addEventListener("pagehide", function () {
    persistAll();
  });
}

export function setInventoryOpenHandler(fn) {
  onOpenChange = fn;
}

/** 背包或设置任一打开时视为阻断操作（指针锁定 / 准星等） */
export function isInventoryOpen() {
  return open || settingsOpen;
}

/** 全屏模态（轮盘赌 / 档案查看器）是否挡住快捷栏输入 */
export function isAnyModalOverlayOpen() {
  if (archiveOverlayEl) return true;
  try {
    if (document.getElementById("backroomsRoulette")) return true;
  } catch (err) {
    /* ignore */
  }
  return false;
}

export function isBackpackOpen() {
  return open;
}

export function isSettingsOpen() {
  return settingsOpen;
}

function notifyUiOpenChange() {
  if (onOpenChange) onOpenChange(open || settingsOpen);
}

export function isFireSaltAutofillEnabled() {
  return fireSaltAutofillEnabled;
}

export function setFireSaltAutofillEnabled(enabled) {
  fireSaltAutofillEnabled = !!enabled;
  try {
    if (fireSaltAutofillEnabled) sessionStorage.setItem(FIRE_SALT_AUTOFILL_KEY, "1");
    else sessionStorage.removeItem(FIRE_SALT_AUTOFILL_KEY);
  } catch (err) {
    /* ignore */
  }
  renderSettings();
  return fireSaltAutofillEnabled;
}

export function toggleFireSaltAutofill() {
  return setFireSaltAutofillEnabled(!fireSaltAutofillEnabled);
}

/** 从背包或其他快捷栏格取一块火盐填到指定空快捷栏格 */
export function tryAutofillFireSaltToHotbar(slotIndex) {
  if (!fireSaltAutofillEnabled) return false;
  if (!Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= HOTBAR_CAPACITY) {
    return false;
  }
  if (hotbarSlots[slotIndex]) return false;
  var i;
  for (i = 0; i < backpackSlots.length; i++) {
    if (backpackSlots[i] && backpackSlots[i].id === "fire_salt") {
      hotbarSlots[slotIndex] = cloneItem(backpackSlots[i]);
      backpackSlots[i] = null;
      persistAll();
      renderGrid();
      renderHotbar();
      return true;
    }
  }
  for (i = 0; i < hotbarSlots.length; i++) {
    if (i === slotIndex) continue;
    if (hotbarSlots[i] && hotbarSlots[i].id === "fire_salt") {
      hotbarSlots[slotIndex] = cloneItem(hotbarSlots[i]);
      hotbarSlots[i] = null;
      persistHotbar();
      renderHotbar();
      return true;
    }
  }
  return false;
}

export function getSelectedHotbarIndex() {
  return selectedHotbarIndex;
}

/** @returns {{ id: string, name: string } | null} */
export function getSelectedHotbarItem() {
  return hotbarSlots[selectedHotbarIndex] || null;
}

export function setSelectedHotbarIndex(index) {
  if (!Number.isFinite(index)) return;
  selectedHotbarIndex =
    ((Math.floor(index) % HOTBAR_CAPACITY) + HOTBAR_CAPACITY) % HOTBAR_CAPACITY;
  persistHotbar();
  renderHotbar();
}

export function countItem(itemId) {
  var n = 0;
  var i;
  for (i = 0; i < hotbarSlots.length; i++) {
    if (hotbarSlots[i] && hotbarSlots[i].id === itemId) n++;
  }
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

export function countUsedHotbarSlots() {
  var n = 0;
  var i;
  for (i = 0; i < hotbarSlots.length; i++) {
    if (hotbarSlots[i]) n++;
  }
  return n;
}

function findEmptyHotbarIndex() {
  var i;
  for (i = 0; i < hotbarSlots.length; i++) {
    if (!hotbarSlots[i]) return i;
  }
  return -1;
}

function findEmptyBackpackIndex() {
  var i;
  for (i = 0; i < backpackSlots.length; i++) {
    if (!backpackSlots[i]) return i;
  }
  return -1;
}

/** 获得物品：优先进快捷栏空位，其次背包 */
export function addItem(item) {
  if (!item || !item.id) return false;
  var packed = cloneItem(item);
  var hotIdx = findEmptyHotbarIndex();
  if (hotIdx >= 0) {
    hotbarSlots[hotIdx] = packed;
    persistAll();
    renderHotbar();
    renderGrid();
    notifyItemAdded(packed);
    return true;
  }
  var packIdx = findEmptyBackpackIndex();
  if (packIdx < 0) return false;
  backpackSlots[packIdx] = packed;
  persistBackpack();
  renderGrid();
  notifyItemAdded(packed);
  return true;
}

function notifyItemAdded(item) {
  try {
    if (typeof window.__backroomsOnItemAdded === "function") {
      window.__backroomsOnItemAdded(item);
    }
  } catch (err) {
    /* ignore */
  }
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

export function addFireSalt(count) {
  var added = 0;
  var i;
  for (i = 0; i < count; i++) {
    if (!addItem({ id: "fire_salt", name: "火盐" })) break;
    added++;
  }
  return added;
}

/** 随机丢弃背包或快捷栏物品，为强制奖励腾出空间 */
export function removeRandomItems(count) {
  var occupied = [];
  var i;
  for (i = 0; i < hotbarSlots.length; i++) {
    if (hotbarSlots[i]) occupied.push({ where: "hotbar", index: i });
  }
  for (i = 0; i < backpackSlots.length; i++) {
    if (backpackSlots[i]) occupied.push({ where: "backpack", index: i });
  }
  var removed = [];
  var removeCount = Math.min(Math.max(0, count | 0), occupied.length);
  for (i = 0; i < removeCount; i++) {
    var pick = i + Math.floor(Math.random() * (occupied.length - i));
    var tmp = occupied[i];
    occupied[i] = occupied[pick];
    occupied[pick] = tmp;
    var ref = occupied[i];
    if (ref.where === "hotbar") {
      removed.push(hotbarSlots[ref.index]);
      hotbarSlots[ref.index] = null;
    } else {
      removed.push(backpackSlots[ref.index]);
      backpackSlots[ref.index] = null;
    }
  }
  if (removed.length) {
    persistAll();
    renderGrid();
    renderHotbar();
  }
  return removed;
}

export function removeFirstItem(itemId) {
  var i;
  if (
    preferSelectedHotbarRemoval &&
    hotbarSlots[selectedHotbarIndex] &&
    hotbarSlots[selectedHotbarIndex].id === itemId
  ) {
    var filledSlot = selectedHotbarIndex;
    hotbarSlots[filledSlot] = null;
    persistHotbar();
    renderHotbar();
    if (itemId === "fire_salt") tryAutofillFireSaltToHotbar(filledSlot);
    return true;
  }
  // 背包双击等：优先扣背包，避免误删快捷栏同名物
  for (i = 0; i < backpackSlots.length; i++) {
    if (backpackSlots[i] && backpackSlots[i].id === itemId) {
      backpackSlots[i] = null;
      persistBackpack();
      renderGrid();
      return true;
    }
  }
  for (i = 0; i < hotbarSlots.length; i++) {
    if (hotbarSlots[i] && hotbarSlots[i].id === itemId) {
      hotbarSlots[i] = null;
      persistHotbar();
      renderHotbar();
      if (itemId === "fire_salt") tryAutofillFireSaltToHotbar(i);
      return true;
    }
  }
  return false;
}

export function resetBackpack() {
  var i;
  for (i = 0; i < backpackSlots.length; i++) backpackSlots[i] = null;
  for (i = 0; i < hotbarSlots.length; i++) hotbarSlots[i] = null;
  selectedHotbarIndex = 0;
  persistAll();
  renderGrid();
  renderHotbar();
}

export function renderGridPublic() {
  renderGrid();
  renderHotbar();
}

/**
 * 进入/退出商店收购模式。
 * @param {null | ((item: { id: string, name: string }, source: "backpack" | "hotbar", index: number) => void)} handler
 */
export function setInventorySellMode(handler) {
  sellPickHandler = typeof handler === "function" ? handler : null;
  sellPick = null;
  renderGrid();
  renderHotbar();
}

export function isInventorySellMode() {
  return !!sellPickHandler;
}

export function clearInventorySellPick() {
  sellPick = null;
  renderGrid();
  renderHotbar();
}

/** 按格子精确移除（商店收购成交用） */
export function removeItemAt(source, index) {
  var arr = source === "hotbar" ? hotbarSlots : backpackSlots;
  if (!Number.isFinite(index) || index < 0 || index >= arr.length) return null;
  var item = arr[index];
  if (!item) return null;
  arr[index] = null;
  if (sellPick && sellPick.source === source && sellPick.index === index) {
    sellPick = null;
  }
  persistAll();
  renderGrid();
  renderHotbar();
  return item;
}

function handleSellClick(source, index) {
  if (!sellPickHandler) return false;
  var arr = source === "hotbar" ? hotbarSlots : backpackSlots;
  var item = arr[index];
  if (!item) return true;
  sellPick = { source: source, index: index };
  renderGrid();
  renderHotbar();
  sellPickHandler(cloneItem(item), source, index);
  return true;
}

function markSellPickCell(cell, source, index) {
  if (!sellPick || sellPick.source !== source || sellPick.index !== index) return;
  cell.style.outline = "2px solid #ffd479";
  cell.style.outlineOffset = "-2px";
}

function appendItemIcon(cell, item) {
  var iconSrc = ITEM_ICONS[item.id];
  if (iconSrc) {
    var img = document.createElement("img");
    img.className = "br-pack__icon";
    img.src = iconSrc;
    img.alt = item.name;
    img.draggable = false;
    cell.appendChild(img);
  } else {
    cell.textContent = item.name.slice(0, 1);
  }
}

function dispatchUseItemId(itemId) {
  if (itemId === "almond_water") {
    if (typeof window.__backroomsUseAlmondWater === "function") {
      window.__backroomsUseAlmondWater();
    }
  } else if (itemId === "strawberry_soy_milk") {
    if (typeof window.__backroomsUseStrawberrySoyMilk === "function") {
      window.__backroomsUseStrawberrySoyMilk();
    }
  } else if (itemId === "banana_soy_milk") {
    if (typeof window.__backroomsUseBananaSoyMilk === "function") {
      window.__backroomsUseBananaSoyMilk();
    }
  } else if (
    itemId === "lucky_soy_milk" ||
    itemId === "strawberry_lucky_soy_milk" ||
    itemId === "banana_lucky_soy_milk"
  ) {
    if (typeof window.__backroomsUseVaultSoyMilk === "function") {
      window.__backroomsUseVaultSoyMilk(itemId);
    }
  } else if (itemId === "lucky_soy_milk_cold" || itemId === "lucky_soy_milk_hot") {
    if (typeof window.__backroomsUseLuckySoyMilk === "function") {
      window.__backroomsUseLuckySoyMilk(itemId);
    }
  } else if (itemId === "night_vision_potion") {
    if (typeof window.__backroomsUseNightVisionPotion === "function") {
      window.__backroomsUseNightVisionPotion();
    }
  } else if (itemId === "royal_rations") {
    if (typeof window.__backroomsUseRoyalRations === "function") {
      window.__backroomsUseRoyalRations();
    }
  } else if (itemId === "royal_rations_medium") {
    if (typeof window.__backroomsUseRoyalRationsMedium === "function") {
      window.__backroomsUseRoyalRationsMedium();
    }
  } else if (itemId === "fire_salt") {
    if (typeof window.__backroomsUseFireSalt === "function") {
      window.__backroomsUseFireSalt();
    }
  } else if (itemId === "archive_c11") {
    useArchiveC11();
  } else if (itemId === "roulette") {
    if (typeof window.__backroomsUseRoulette === "function") {
      window.__backroomsUseRoulette();
    }
  } else if (itemId === "bandage") {
    if (typeof window.__backroomsUseBandage === "function") {
      window.__backroomsUseBandage();
    }
  } else if (itemId === "scrap_page_c1299") {
    if (typeof window.__backroomsUseScrapPage === "function") {
      window.__backroomsUseScrapPage();
    } else {
      useScrapPageSafe();
    }
  }
}

const SCRAP_PAGE_SAFE_TEXT = [
  "【飘流残页 · 已带回安全区查阅】",
  "",
  "……十连死区共享同一套切出拓扑……",
  "……C-1289 是阀门，吞咽与切出只是不同旋钮……",
  "……黑石不是出口，是另一口锅的锅沿……",
  "……不要相信香味，那是消融的邀请函……",
  "",
  "（残页仍留在背包；建议勿在汤雾中展开。）",
].join("\n");

function useScrapPageSafe() {
  showArchiveOverlay(SCRAP_PAGE_SAFE_TEXT);
}

const C11_ARCHIVE_TEXT = [
  "【M.E.G 层级档案 · Level C-11】",
  "分类：安全 · 稳定 · 无实体（长期观测）",
  "",
  "Level C-11 是一片一望无际的田园乡村，起伏的绿色丘陵、",
  "成熟的麦田与零星的木屋在温暖的日光下延展，天空恒为黄昏前",
  "的金色。此层被流浪者视为少数可长期定居的『家园层级』之一。",
  "",
  "· 环境：气候温和，昼长夜短；作物可安全食用，溪水近似杏仁水。",
  "· 居民：存在友善的社区聚落，多由早期定居者与其后代组成。",
  "· 危险：几乎没有敌对实体；主要风险为迷路与低估补给。",
  "· 出入口：多与 Level 11 的郊区、Level 10 的田野相连。",
  "",
  "（一次性查看工具已消耗。）",
].join("\n");

let archiveOverlayEl = null;

function closeArchiveOverlay() {
  if (archiveOverlayEl) {
    archiveOverlayEl.remove();
    archiveOverlayEl = null;
  }
  document.removeEventListener("keydown", onArchiveKeydown, true);
}

function onArchiveKeydown(e) {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  if (e.code === "Escape" || e.code === "KeyQ" || e.code === "Enter") {
    closeArchiveOverlay();
  }
}

function showArchiveOverlay(text) {
  if (archiveOverlayEl) return;
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  var overlay = document.createElement("div");
  overlay.id = "backroomsArchiveOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:120;display:grid;place-items:center;" +
    "background:rgba(6,10,16,0.82);backdrop-filter:blur(2px);";
  var panel = document.createElement("div");
  panel.style.cssText =
    "max-width:min(680px,86vw);max-height:80vh;overflow:auto;padding:26px 30px;" +
    "background:#12161d;border:1px solid #3a4658;border-radius:12px;color:#e7eef6;" +
    "font:14px/1.7 system-ui,sans-serif;white-space:pre-wrap;box-shadow:0 18px 60px #000;";
  panel.textContent = text;
  var tip = document.createElement("p");
  tip.style.cssText = "margin:18px 0 0;text-align:center;color:#8fa2b8;font:13px system-ui;";
  tip.innerHTML = "按 <kbd>Q</kbd> / <kbd>Esc</kbd> 关闭";
  panel.appendChild(tip);
  overlay.appendChild(panel);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeArchiveOverlay();
  });
  document.body.appendChild(overlay);
  archiveOverlayEl = overlay;
  document.addEventListener("keydown", onArchiveKeydown, true);
}

function useArchiveC11() {
  if (archiveOverlayEl) return;
  if (!removeFirstItem("archive_c11")) return;
  showArchiveOverlay(C11_ARCHIVE_TEXT);
}

/** 按 R：使用当前加粗选中的快捷栏物品 */
export function useSelectedHotbarItem() {
  var item = hotbarSlots[selectedHotbarIndex];
  if (!item) return false;
  preferSelectedHotbarRemoval = true;
  try {
    dispatchUseItemId(item.id);
  } finally {
    preferSelectedHotbarRemoval = false;
  }
  return true;
}

function renderGrid() {
  if (!gridEl) return;
  var i;
  gridEl.innerHTML = "";
  for (i = 0; i < BACKPACK_CAPACITY; i++) {
    var cell = document.createElement("div");
    cell.className = "br-pack__cell";
    cell.dataset.slot = String(i);
    cell.dataset.source = "backpack";
    if (backpackSlots[i]) {
      cell.classList.add("br-pack__cell--filled");
      cell.title = backpackSlots[i].name + " · 拖到快捷栏";
      if (backpackSlots[i].id === "lucky_soy_milk_cold") {
        cell.title = backpackSlots[i].name + " · 把火盐拖到此格可加热";
      }
      cell.draggable = true;
      appendItemIcon(cell, backpackSlots[i]);
      if (sellPickHandler) {
        cell.classList.add("br-pack__cell--sell");
        cell.title = backpackSlots[i].name + " · 点击询价";
      }
    }
    markSellPickCell(cell, "backpack", i);
    gridEl.appendChild(cell);
  }
  if (titleEl) {
    titleEl.textContent = sellPickHandler
      ? "背包 " + countUsedSlots() + "/" + BACKPACK_CAPACITY + " · 点击物品询价"
      : "背包 " +
        countUsedSlots() +
        "/" +
        BACKPACK_CAPACITY +
        " · 拖到快捷栏 / 双击使用";
  }
}

function renderHotbar() {
  if (!hotbarSlotsEl) return;
  var i;
  hotbarSlotsEl.innerHTML = "";
  for (i = 0; i < HOTBAR_CAPACITY; i++) {
    var cell = document.createElement("div");
    cell.className = "br-hotbar__cell";
    cell.dataset.slot = String(i);
    cell.dataset.source = "hotbar";
    if (i === selectedHotbarIndex) cell.classList.add("br-hotbar__cell--active");
    if (hotbarSlots[i]) {
      cell.classList.add("br-hotbar__cell--filled");
      cell.title =
        hotbarSlots[i].id === "lucky_soy_milk_cold"
          ? hotbarSlots[i].name + " · 把火盐拖到此格可加热"
          : hotbarSlots[i].name;
      cell.draggable = true;
      appendItemIcon(cell, hotbarSlots[i]);
    } else {
      cell.title = "快捷栏 " + (i + 1);
    }
    markSellPickCell(cell, "hotbar", i);
    hotbarSlotsEl.appendChild(cell);
  }
}

function renderSettings() {
  if (!settingsAutofillRow) return;
  settingsAutofillRow.classList.toggle(
    "br-settings__row--on",
    fireSaltAutofillEnabled
  );
  settingsAutofillRow.setAttribute(
    "aria-checked",
    fireSaltAutofillEnabled ? "true" : "false"
  );
  var stateEl = settingsAutofillRow.querySelector(".br-settings__state");
  if (stateEl) {
    stateEl.textContent = fireSaltAutofillEnabled ? "开" : "关";
  }
}

function moveItem(fromSource, fromIndex, toSource, toIndex) {
  if (fromSource === toSource && fromIndex === toIndex) return;
  var fromArr = fromSource === "hotbar" ? hotbarSlots : backpackSlots;
  var toArr = toSource === "hotbar" ? hotbarSlots : backpackSlots;
  if (fromIndex < 0 || fromIndex >= fromArr.length) return;
  if (toIndex < 0 || toIndex >= toArr.length) return;
  var moving = fromArr[fromIndex];
  if (!moving) return;
  var dest = toArr[toIndex];
  toArr[toIndex] = moving;
  fromArr[fromIndex] = dest;
  persistAll();
  renderGrid();
  renderHotbar();
}

/** 火盐拖到冷幸运豆奶格子 → 消耗火盐，豆奶变为热幸运豆奶 */
function tryHeatLuckySoyMilk(fromSource, fromIndex, toSource, toIndex) {
  var fromArr = fromSource === "hotbar" ? hotbarSlots : backpackSlots;
  var toArr = toSource === "hotbar" ? hotbarSlots : backpackSlots;
  if (fromIndex < 0 || fromIndex >= fromArr.length) return false;
  if (toIndex < 0 || toIndex >= toArr.length) return false;
  var moving = fromArr[fromIndex];
  var dest = toArr[toIndex];
  if (!moving || !dest) return false;
  if (moving.id !== "fire_salt" || dest.id !== "lucky_soy_milk_cold") return false;
  fromArr[fromIndex] = null;
  toArr[toIndex] = {
    id: "lucky_soy_milk_hot",
    name: "幸运豆奶（热）",
  };
  persistAll();
  renderGrid();
  renderHotbar();
  if (typeof window.__backroomsOnLuckySoyMilkHeated === "function") {
    window.__backroomsOnLuckySoyMilkHeated();
  }
  return true;
}

function bindDragAndDrop(root) {
  root.addEventListener("dragstart", function (e) {
    var cell = e.target.closest("[data-source][data-slot]");
    if (!cell || !cell.draggable) return;
    var payload = cell.dataset.source + ":" + cell.dataset.slot;
    e.dataTransfer.setData("text/plain", payload);
    e.dataTransfer.effectAllowed = "move";
    cell.classList.add("br-slot--dragging");
  });
  root.addEventListener("dragend", function (e) {
    var cell = e.target.closest("[data-source][data-slot]");
    if (cell) cell.classList.remove("br-slot--dragging");
  });
  root.addEventListener("dragover", function (e) {
    var cell = e.target.closest("[data-source][data-slot]");
    if (!cell) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    cell.classList.add("br-slot--drop");
  });
  root.addEventListener("dragleave", function (e) {
    var cell = e.target.closest("[data-source][data-slot]");
    if (cell) cell.classList.remove("br-slot--drop");
  });
  root.addEventListener("drop", function (e) {
    var cell = e.target.closest("[data-source][data-slot]");
    if (!cell) return;
    e.preventDefault();
    cell.classList.remove("br-slot--drop");
    var raw = e.dataTransfer.getData("text/plain") || "";
    var parts = raw.split(":");
    if (parts.length !== 2) return;
    var fromSource = parts[0];
    var fromIndex = parseInt(parts[1], 10);
    var toSource = cell.dataset.source;
    var toIndex = parseInt(cell.dataset.slot, 10);
    if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex)) return;
    if (fromSource !== "backpack" && fromSource !== "hotbar") return;
    if (toSource !== "backpack" && toSource !== "hotbar") return;
    if (tryHeatLuckySoyMilk(fromSource, fromIndex, toSource, toIndex)) return;
    moveItem(fromSource, fromIndex, toSource, toIndex);
  });
}

function bindHotbarKeys() {
  if (hotbarKeysBound || typeof window === "undefined") return;
  hotbarKeysBound = true;
  window.addEventListener("keydown", function (e) {
    if (e.repeat) return;
    // 商店收购中：物品交易由商店对话接管，避免误用道具
    if (sellPickHandler) return;
    // 轮盘赌 / 档案查看器等全屏遮罩开启时禁止快捷栏
    if (isAnyModalOverlayOpen()) return;
    if (e.code === "KeyP") {
      e.preventDefault();
      toggleSettings();
      return;
    }
    if (e.code === "ArrowLeft") {
      e.preventDefault();
      setSelectedHotbarIndex(selectedHotbarIndex - 1);
      return;
    }
    if (e.code === "ArrowRight") {
      e.preventDefault();
      setSelectedHotbarIndex(selectedHotbarIndex + 1);
      return;
    }
    // 数字键 1–6（含小键盘）直接选中对应快捷栏格
    var digitMap = {
      Digit1: 0,
      Digit2: 1,
      Digit3: 2,
      Digit4: 3,
      Digit5: 4,
      Digit6: 5,
      Numpad1: 0,
      Numpad2: 1,
      Numpad3: 2,
      Numpad4: 3,
      Numpad5: 4,
      Numpad6: 5,
    };
    if (Object.prototype.hasOwnProperty.call(digitMap, e.code)) {
      e.preventDefault();
      setSelectedHotbarIndex(digitMap[e.code]);
      return;
    }
    if (e.code === "KeyR") {
      e.preventDefault();
      useSelectedHotbarItem();
    }
  });
}

export function mountHotbar(parent) {
  if (hotbarEl) return hotbarEl;
  var host = parent || document.body;
  hotbarEl = document.createElement("div");
  hotbarEl.id = "backroomsHotbar";
  hotbarEl.className = "br-hotbar";
  hotbarEl.innerHTML =
    '<div class="br-hotbar__slots" role="listbox" aria-label="快捷栏"></div>' +
    '<p class="br-hotbar__hint"><kbd>1</kbd>–<kbd>6</kbd> / <kbd>←</kbd><kbd>→</kbd> 切换 · <kbd>R</kbd> 使用</p>';
  host.appendChild(hotbarEl);
  hotbarSlotsEl = hotbarEl.querySelector(".br-hotbar__slots");
  bindDragAndDrop(hotbarEl);
  hotbarEl.addEventListener("click", function (e) {
    var cell = e.target.closest(".br-hotbar__cell");
    if (!cell) return;
    var idx = parseInt(cell.dataset.slot, 10);
    if (!Number.isFinite(idx)) return;
    if (handleSellClick("hotbar", idx)) return;
    setSelectedHotbarIndex(idx);
  });
  bindHotbarKeys();
  renderHotbar();
  return hotbarEl;
}

export function mountSettingsPanel(parent) {
  if (settingsEl) return settingsEl;
  var host = parent || document.body;
  settingsEl = document.createElement("div");
  settingsEl.id = "backroomsSettings";
  settingsEl.className = "br-settings";
  settingsEl.hidden = true;
  settingsEl.innerHTML =
    '<div class="br-settings__panel">' +
    '<p class="br-settings__title">设置</p>' +
    '<div class="br-settings__row" role="checkbox" aria-checked="false" tabindex="0">' +
    '<span class="br-settings__label">火盐自动填充</span>' +
    '<span class="br-settings__state">关</span>' +
    "</div>" +
    '<p class="br-settings__foot"><kbd>P</kbd> 关闭 · 双击切换开关</p>' +
    "</div>";
  host.appendChild(settingsEl);
  settingsAutofillRow = settingsEl.querySelector(".br-settings__row");
  settingsAutofillRow.addEventListener("dblclick", function (e) {
    e.preventDefault();
    toggleFireSaltAutofill();
  });
  renderSettings();
  return settingsEl;
}

export function mountBackpackPanel(parent) {
  if (panelEl) return panelEl;
  var host = parent || document.body;
  mountHotbar(host);
  mountSettingsPanel(host);
  panelEl = document.createElement("div");
  panelEl.id = "backroomsBackpack";
  panelEl.className = "br-pack";
  panelEl.hidden = true;
  panelEl.innerHTML =
    '<div class="br-pack__panel">' +
    '<p class="br-pack__title">背包</p>' +
    '<div class="br-pack__grid"></div>' +
    '<p class="br-pack__foot"><kbd>B</kbd> 关闭 · 拖到快捷栏 · 双击使用</p>' +
    "</div>";
  host.appendChild(panelEl);
  titleEl = panelEl.querySelector(".br-pack__title");
  gridEl = panelEl.querySelector(".br-pack__grid");
  gridEl.style.setProperty("--br-cols", String(BACKPACK_COLS));
  gridEl.style.setProperty("--br-rows", String(BACKPACK_ROWS));

  gridEl.addEventListener("click", function (e) {
    if (!sellPickHandler) return;
    var cell = e.target.closest(".br-pack__cell");
    if (!cell) return;
    var idx = Array.prototype.indexOf.call(gridEl.children, cell);
    if (idx < 0) return;
    e.preventDefault();
    handleSellClick("backpack", idx);
  });

  gridEl.addEventListener("dblclick", function (e) {
    if (sellPickHandler) return;
    var cell = e.target.closest(".br-pack__cell");
    if (!cell) return;
    var idx = Array.prototype.indexOf.call(gridEl.children, cell);
    if (idx < 0 || !backpackSlots[idx]) return;
    preferSelectedHotbarRemoval = false;
    dispatchUseItemId(backpackSlots[idx].id);
  });

  bindDragAndDrop(panelEl);
  renderGrid();
  return panelEl;
}

export function toggleBackpack() {
  if (!panelEl) mountBackpackPanel();
  if (!open) closeSettings();
  open = !open;
  panelEl.hidden = !open;
  document.body.classList.toggle("backrooms-pack-open", open);
  notifyUiOpenChange();
  return open;
}

export function openBackpack() {
  if (!panelEl) mountBackpackPanel();
  if (open) return open;
  closeSettings();
  open = true;
  panelEl.hidden = false;
  document.body.classList.add("backrooms-pack-open");
  notifyUiOpenChange();
  return open;
}

export function closeBackpack() {
  if (!open) return;
  open = false;
  if (panelEl) panelEl.hidden = true;
  document.body.classList.remove("backrooms-pack-open");
  notifyUiOpenChange();
}

export function toggleSettings() {
  if (!settingsEl) mountSettingsPanel();
  if (!settingsOpen) closeBackpack();
  settingsOpen = !settingsOpen;
  settingsEl.hidden = !settingsOpen;
  document.body.classList.toggle("backrooms-settings-open", settingsOpen);
  if (settingsOpen) renderSettings();
  notifyUiOpenChange();
  return settingsOpen;
}

export function closeSettings() {
  if (!settingsOpen) return;
  settingsOpen = false;
  if (settingsEl) settingsEl.hidden = true;
  document.body.classList.remove("backrooms-settings-open");
  notifyUiOpenChange();
}

if (typeof window !== "undefined") {
  window.BackroomsInventory = {
    backpackSlots: backpackSlots,
    hotbarSlots: hotbarSlots,
    BACKPACK_COLS: BACKPACK_COLS,
    BACKPACK_ROWS: BACKPACK_ROWS,
    BACKPACK_CAPACITY: BACKPACK_CAPACITY,
    HOTBAR_CAPACITY: HOTBAR_CAPACITY,
    mountBackpackPanel: mountBackpackPanel,
    mountHotbar: mountHotbar,
    mountSettingsPanel: mountSettingsPanel,
    toggleBackpack: toggleBackpack,
    openBackpack: openBackpack,
    closeBackpack: closeBackpack,
    setInventorySellMode: setInventorySellMode,
    isInventorySellMode: isInventorySellMode,
    clearInventorySellPick: clearInventorySellPick,
    removeItemAt: removeItemAt,
    toggleSettings: toggleSettings,
    closeSettings: closeSettings,
    isInventoryOpen: isInventoryOpen,
    isBackpackOpen: isBackpackOpen,
    isSettingsOpen: isSettingsOpen,
    isFireSaltAutofillEnabled: isFireSaltAutofillEnabled,
    setFireSaltAutofillEnabled: setFireSaltAutofillEnabled,
    toggleFireSaltAutofill: toggleFireSaltAutofill,
    addAlmondWater: addAlmondWater,
    addFireSalt: addFireSalt,
    removeRandomItems: removeRandomItems,
    addItem: addItem,
    removeFirstItem: removeFirstItem,
    countItem: countItem,
    resetBackpack: resetBackpack,
    loadBackpackFromSession: loadBackpackFromSession,
    useSelectedHotbarItem: useSelectedHotbarItem,
    setSelectedHotbarIndex: setSelectedHotbarIndex,
    getSelectedHotbarIndex: getSelectedHotbarIndex,
  };
}
