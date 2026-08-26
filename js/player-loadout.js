/**
 * 身上装备栏 — 大厅仓库左侧 / 教程背包共用状态
 */
(function () {
  "use strict";

  var G = window.GridInventory;

  var CARD_SLOTS = 4;
  var lobbyLoadoutEl = document.getElementById("lobbyLoadout");

  var loadout = {
    primary: null,
    melee: null,
    secondary: null,
    pistol: null,
    helmet: null,
    armor: null,
    rig: null,
    backpack: null,
    cards: [null, null, null, null],
  };

  var rigManager = null;
  var backpackManager = null;

  var SLOT_LABELS = {
    primary: "主枪",
    melee: "刀",
    secondary: "副枪",
    pistol: "手枪",
    helmet: "头盔",
    armor: "护甲",
    rig: "胸挂",
    backpack: "背包",
  };

  function getSecureManager() {
    if (window.GridStashUI && window.GridStashUI.getSecureManager) {
      return window.GridStashUI.getSecureManager();
    }
    return null;
  }

  function getKeycardImage(item) {
    if (item && item.image) return item.image;
    var kc =
      window.ItemCatalog && window.ItemCatalog.getItem("keycard");
    return (kc && kc.image) || "img/market/keycard-side-entrance.png";
  }

  function cloneItem(item, opts) {
    if (!item) return null;
    opts = opts || {};
    var c = Object.assign({}, item);
    if (isKeycard(c)) {
      if (c.maxDurability == null) c.maxDurability = 10;
      if (opts.fresh) {
        c.durability = c.maxDurability;
      } else if (c.durability == null) {
        c.durability = c.maxDurability;
      }
      c.image = c.image || getKeycardImage(c);
    }
    return c;
  }

  function isKeycard(item) {
    return !!(item && (item.type === "keycard" || item.id === "keycard"));
  }

  function isUsableKeycard(item, requiredId) {
    if (!isKeycard(item)) return false;
    if (requiredId && item.id !== requiredId) return false;
    return item.durability == null || item.durability > 0;
  }

  function mergeItemForEquip(itemOrData) {
    if (!itemOrData || !window.ItemCatalog) return null;
    var cat = window.ItemCatalog.getItem(itemOrData.id);
    if (!cat) return null;
    var merged = Object.assign({}, cat);
    if (itemOrData.durability != null) {
      merged.durability = itemOrData.durability;
    }
    if (itemOrData.maxDurability != null) {
      merged.maxDurability = itemOrData.maxDurability;
    }
    return merged;
  }

  function purgeDepletedKeycards() {
    var changed = false;
    var i;
    for (i = 0; i < CARD_SLOTS; i++) {
      var card = loadout.cards[i];
      if (
        isKeycard(card) &&
        card.durability != null &&
        card.durability <= 0
      ) {
        loadout.cards[i] = null;
        changed = true;
      }
    }
    var secure = getSecureManager();
    if (secure) {
      var toRemove = [];
      for (i = 0; i < secure.items.length; i++) {
        var inst = secure.items[i];
        if (
          inst.itemData &&
          isKeycard(inst.itemData) &&
          inst.itemData.durability != null &&
          inst.itemData.durability <= 0
        ) {
          toRemove.push(inst);
        }
      }
      for (i = 0; i < toRemove.length; i++) {
        secure.removeItem(toRemove[i]);
        changed = true;
      }
    }
    if (changed && window.GridStashUI) {
      window.GridStashUI.render();
    }
    return changed;
  }

  function findKeycard(requiredId) {
    purgeDepletedKeycards();
    var i;
    for (i = 0; i < CARD_SLOTS; i++) {
      if (isUsableKeycard(loadout.cards[i], requiredId)) {
        return { source: "card", index: i, item: loadout.cards[i] };
      }
    }
    var secure = getSecureManager();
    if (secure) {
      for (i = 0; i < secure.items.length; i++) {
        var inst = secure.items[i];
        if (inst.itemData && isUsableKeycard(inst.itemData, requiredId)) {
          return {
            source: "secure",
            index: i,
            item: inst.itemData,
            instance: inst,
          };
        }
      }
    }
    return null;
  }

  function consumeKeycardDurability(amount, requiredId) {
    amount = amount || 1;
    var found = findKeycard(requiredId);
    if (!found || !found.item) return null;

    var max = found.item.maxDurability || 10;
    var remaining;

    if (found.source === "card") {
      found.item.durability -= amount;
      remaining = found.item.durability;
      if (remaining <= 0) {
        loadout.cards[found.index] = null;
      }
    } else if (found.instance) {
      found.instance.itemData.durability -= amount;
      remaining = found.instance.itemData.durability;
      if (remaining <= 0) {
        getSecureManager().removeItem(found.instance);
      }
    }

    if (remaining < 0) remaining = 0;

    renderLobby();
    if (window.GridStashUI) window.GridStashUI.render();
    if (window.ActionInventory && window.ActionInventory.isOpen()) {
      window.ActionInventory.refresh();
    }

    return { remaining: remaining, max: max };
  }

  function findKeycardFromIds(requiredIds) {
    if (!Array.isArray(requiredIds)) return findKeycard(requiredIds);
    var i;
    for (i = 0; i < requiredIds.length; i++) {
      var found = findKeycard(requiredIds[i]);
      if (found) return found;
    }
    return null;
  }

  function consumeKeycardDurabilityFromIds(amount, requiredIds) {
    var found = findKeycardFromIds(requiredIds);
    if (!found || !found.item) return null;
    var result = consumeKeycardDurability(amount, found.item.id);
    if (result) result.itemId = found.item.id;
    return result;
  }

  function ensureTutorialKeycard() {
    if (findKeycard()) return;
    if (!window.ItemCatalog) return;
    var kc = window.ItemCatalog.getItem("keycard");
    if (!kc) return;
    loadout.cards[0] = cloneItem(kc, { fresh: true });
  }

  function equipKeycardFromItemData(itemData) {
    if (!itemData || !isKeycard(itemData)) return false;
    if (itemData.durability != null && itemData.durability <= 0) {
      return false;
    }
    var merged = mergeItemForEquip(itemData);
    if (!merged) return false;
    var i;
    for (i = 0; i < CARD_SLOTS; i++) {
      if (!loadout.cards[i]) {
        return equipToSlot("card", merged, i);
      }
    }
    return false;
  }

  function getRigGridSize(rigItem) {
    var n = (rigItem && rigItem.rigSlots) || 6;
    var cols = 3;
    return { cols: cols, rows: Math.ceil(n / cols) };
  }

  function resetRigGrid(rigItem) {
    if (!G || !rigItem) {
      rigManager = null;
      return;
    }
    var sz = getRigGridSize(rigItem);
    rigManager = new G.GridManager(sz.cols, sz.rows);
  }

  function resetBackpackGrid(cols, rows) {
    if (!G || !cols || !rows) {
      backpackManager = null;
      return;
    }
    backpackManager = new G.GridManager(cols, rows);
  }

  function serializeSlotItem(item) {
    if (!item) return null;
    var o = { id: item.id };
    if (item.durability != null) o.durability = item.durability;
    if (item.maxDurability != null) o.maxDurability = item.maxDurability;
    if (item.stackSize != null) o.stackSize = item.stackSize;
    return o;
  }

  function itemFromPersistSlot(saved) {
    if (!saved || !saved.id || !window.ItemCatalog) return null;
    var cat = window.ItemCatalog.getItem(saved.id);
    if (!cat) return null;
    var item = Object.assign({}, cat);
    if (saved.durability != null) item.durability = saved.durability;
    if (saved.maxDurability != null) item.maxDurability = saved.maxDurability;
    if (saved.stackSize != null) item.stackSize = saved.stackSize;
    return item;
  }

  function hardResetLoadout() {
    loadout.primary = null;
    loadout.melee = null;
    loadout.secondary = null;
    loadout.pistol = null;
    loadout.helmet = null;
    loadout.armor = null;
    loadout.rig = null;
    loadout.backpack = null;
    loadout.cards = [null, null, null, null];
    rigManager = null;
    backpackManager = null;
  }

  function clearManagerItems(manager) {
    if (!manager) return;
    var list = manager.items.slice();
    var i;
    for (i = 0; i < list.length; i++) {
      manager.removeItem(list[i]);
    }
  }

  /** 行动内死亡：清空身上装备与背包/胸挂格，保留安全箱 */
  function applyDeathDrop() {
    clearManagerItems(rigManager);
    clearManagerItems(backpackManager);
    hardResetLoadout();
    if (window.GridStashUI && window.GridStashUI.refreshStashPanel) {
      window.GridStashUI.refreshStashPanel();
    }
    renderLobby();
    return true;
  }

  function deserializeIntoManager(manager, items) {
    if (!manager || !G || !items || !items.length) return;
    manager.deserialize(items, function (itemId, entry) {
      var cat = window.ItemCatalog && window.ItemCatalog.getItem(itemId);
      if (!cat) return null;
      var data = G.itemDataFromCatalog(cat);
      if (!data || !entry) return data;
      if (entry.durability != null) data.durability = entry.durability;
      if (entry.maxDurability != null) data.maxDurability = entry.maxDurability;
      if (entry.stackSize != null) data.stackSize = entry.stackSize;
      return data;
    });
  }

  function moveRigItemsToStash() {
    if (!rigManager || !window.GridStashUI) return;
    var stash = window.GridStashUI.getManager();
    if (!stash) return;
    var items = rigManager.items.slice();
    var i;
    for (i = 0; i < items.length; i++) {
      var inst = items[i];
      var ox = inst.x;
      var oy = inst.y;
      rigManager.removeItem(inst);
      if (!stash.tryAutoPlace(inst)) {
        rigManager.placeItem(inst, ox, oy);
      }
    }
    window.GridStashUI.render();
  }

  function moveBackpackItemsToStash() {
    if (!backpackManager || !window.GridStashUI) return;
    var stash = window.GridStashUI.getManager();
    if (!stash) return;
    var items = backpackManager.items.slice();
    var i;
    for (i = 0; i < items.length; i++) {
      var inst = items[i];
      var ox = inst.x;
      var oy = inst.y;
      backpackManager.removeItem(inst);
      if (!stash.tryAutoPlace(inst)) {
        backpackManager.placeItem(inst, ox, oy);
      }
    }
    window.GridStashUI.render();
  }

  function slotHtml(key, wide) {
    var item = loadout[key];
    var label = SLOT_LABELS[key] || key;
    var inner = item
      ? '<span class="loadout-slot__item">' + item.name + "</span>"
      : '<span class="loadout-slot__placeholder">' + label + "</span>";
    return (
      '<button type="button" class="loadout-slot' +
      (wide ? " loadout-slot--wide" : "") +
      '" data-slot="' +
      key +
      '" title="' +
      label +
      '">' +
      inner +
      "</button>"
    );
  }

  function renderCardSlots(el, useActionClasses) {
    if (!el) return;
    el.innerHTML = "";
    el.style.gridTemplateColumns = "repeat(" + CARD_SLOTS + ", 1fr)";
    var c;
    for (c = 0; c < CARD_SLOTS; c++) {
      var card = loadout.cards[c];
      var cell = document.createElement("div");
      cell.className = useActionClasses
        ? "action-grid__cell"
        : "loadout-grid__cell loadout-grid__cell--mini";
      if (card) {
        cell.classList.add(
          useActionClasses
            ? "action-grid__cell--item"
            : "loadout-grid__cell--item"
        );
        cell.textContent = card.name.slice(0, 4);
        if (isKeycard(card)) {
          cell.classList.add("action-cell--keycard");
          cell.dataset.durability = String(card.durability);
          cell.dataset.maxDurability = String(card.maxDurability || 10);
        } else {
          cell.title = card.name;
        }
      } else {
        cell.textContent = "卡" + (c + 1);
        cell.classList.add("action-grid__cell--empty");
      }
      el.appendChild(cell);
    }
  }

  function renderLobby() {
    if (!lobbyLoadoutEl) return;

    var html = "";
    html += '<p class="lobby-loadout__title">身上装备</p>';
    html +=
      '<p class="lobby-loadout__hint">双击卸下 · 可拖到仓库/下方胸挂格</p>';
    html +=
      '<div class="loadout-row loadout-row--dual">' +
      slotHtml("primary", true) +
      slotHtml("melee", true) +
      "</div>";
    html +=
      '<div class="loadout-row loadout-row--dual">' +
      slotHtml("secondary", true) +
      slotHtml("pistol", true) +
      "</div>";
    html +=
      '<div class="loadout-row loadout-row--dual">' +
      slotHtml("helmet", true) +
      slotHtml("armor", true) +
      "</div>";
    html +=
      '<div class="loadout-row loadout-row--container">' +
      '<button type="button" class="loadout-slot loadout-slot--equip" data-slot="rig">' +
      (loadout.rig
        ? '<span class="loadout-slot__item">' + loadout.rig.name + "</span>"
        : '<span class="loadout-slot__placeholder">胸挂</span>') +
      "</button>" +
      '<div class="loadout-preview" id="lobbyRigPreview"></div>' +
      "</div>";
    html +=
      '<div class="loadout-row loadout-row--container">' +
      '<button type="button" class="loadout-slot loadout-slot--equip" data-slot="backpack">' +
      (loadout.backpack
        ? '<span class="loadout-slot__item">' + loadout.backpack.name + "</span>"
        : '<span class="loadout-slot__placeholder">背包</span>') +
      "</button>" +
      '<div class="loadout-preview loadout-preview--bp" id="lobbyBpPreview"></div>' +
      "</div>";
    html += '<p class="loadout-section__title">卡槽 · 新手教程 4 张</p>';
    html += '<div class="loadout-row loadout-row--cards">';
    var c;
    for (c = 0; c < CARD_SLOTS; c++) {
      var card = loadout.cards[c];
      html +=
        '<button type="button" class="loadout-slot loadout-slot--card" data-slot="card" data-card-index="' +
        c +
        '">' +
        (card
          ? isKeycard(card)
            ? '<span class="loadout-slot__item loadout-slot__item--keycard" style="background-image:url(\'' +
              getKeycardImage() +
              "')\"><span class=\"loadout-slot__dur\">" +
              card.durability +
              "/" +
              (card.maxDurability || 10) +
              "</span></span>"
            : '<span class="loadout-slot__item">' + card.name + "</span>"
          : '<span class="loadout-slot__placeholder">卡' +
            (c + 1) +
            "</span>") +
        "</button>";
    }
    html += "</div>";

    lobbyLoadoutEl.innerHTML = html;

    var rigEl = document.getElementById("lobbyRigPreview");
    var bpEl = document.getElementById("lobbyBpPreview");

    if (rigEl) {
      if (!loadout.rig) {
        rigEl.innerHTML = '<span class="loadout-preview__hint">未装备</span>';
      } else {
        var rigSz = getRigGridSize(loadout.rig);
        rigEl.innerHTML =
          '<span class="loadout-preview__hint">' +
          rigSz.cols +
          "×" +
          rigSz.rows +
          " · 1×1 · 整理见下方胸挂格</span>";
      }
    }

    if (bpEl) {
      if (!loadout.backpack) {
        bpEl.innerHTML = '<span class="loadout-preview__hint">未装备</span>';
      } else {
        bpEl.innerHTML =
          '<span class="loadout-preview__hint">' +
          loadout.backpack.cols +
          "×" +
          loadout.backpack.rows +
          " · 整理见下方背包格</span>";
      }
    }

    lobbyLoadoutEl.querySelectorAll("[data-slot]").forEach(function (btn) {
      btn.addEventListener("dblclick", onSlotDblClick);
    });

    if (window.GridStashUI && window.GridStashUI.bindLoadoutSlots) {
      window.GridStashUI.bindLoadoutSlots();
    }
    if (window.GridStashUI) window.GridStashUI.render();
  }

  function equipToSlot(slotKey, item, cardIndex) {
    if (!window.ItemCatalog || !item) return false;
    if (slotKey === "card") {
      if (cardIndex < 0 || cardIndex >= CARD_SLOTS) return false;
      loadout.cards[cardIndex] = cloneItem(item);
      return true;
    }
    if (!window.ItemCatalog.acceptsSlot(slotKey, item)) return false;

    if (slotKey === "rig") {
      loadout.rig = cloneItem(item);
      resetRigGrid(item);
      return true;
    }
    if (slotKey === "backpack") {
      loadout.backpack = cloneItem(item);
      resetBackpackGrid(item.cols, item.rows);
      return true;
    }
    loadout[slotKey] = cloneItem(item);
    return true;
  }

  function unequipSlot(slotKey, cardIndex) {
    if (slotKey === "card") {
      if (cardIndex < 0 || cardIndex >= CARD_SLOTS) return null;
      var c = loadout.cards[cardIndex];
      loadout.cards[cardIndex] = null;
      return c;
    }
    var prev = loadout[slotKey];
    loadout[slotKey] = null;
    if (slotKey === "rig") {
      loadout.rig = null;
      moveRigItemsToStash();
      resetRigGrid(null);
    }
    if (slotKey === "backpack") {
      loadout.backpack = null;
      moveBackpackItemsToStash();
      resetBackpackGrid(0, 0);
    }
    return prev;
  }

  function onSlotDblClick(e) {
    e.preventDefault();
    var btn = e.currentTarget;
    var slotKey = btn.dataset.slot;
    var cardIndex = parseInt(btn.dataset.cardIndex, 10);
    var item =
      slotKey === "card" && !isNaN(cardIndex)
        ? loadout.cards[cardIndex]
        : loadout[slotKey];
    if (!item) return;

    var removed =
      slotKey === "card" && !isNaN(cardIndex)
        ? unequipSlot("card", cardIndex)
        : unequipSlot(slotKey);
    if (!removed) return;

    if (
      window.GridStashUI &&
      window.GridStashUI.tryAddCatalogItem(removed)
    ) {
      renderLobby();
      return;
    }

    equipToSlot(slotKey, removed, cardIndex);
    alert("仓库空间不足，无法卸下「" + removed.name + "」。");
  }

  function equipFromCatalogItemId(catalogId) {
    var item = window.ItemCatalog && window.ItemCatalog.getItem(catalogId);
    if (!item) return false;
    if (item.type === "helmet") return equipToSlot("helmet", item);
    if (item.type === "armor") return equipToSlot("armor", item);
    if (item.type === "rig") return equipToSlot("rig", item);
    if (item.type === "backpack") return equipToSlot("backpack", item);
    if (item.type === "weapon_primary") return equipToSlot("primary", item);
    if (isKeycard(item)) {
      var i;
      for (i = 0; i < CARD_SLOTS; i++) {
        if (!loadout.cards[i]) return equipToSlot("card", item, i);
      }
    }
    return false;
  }

  function equipFromStashId(stashId) {
    var item = window.ItemCatalog && window.ItemCatalog.fromStashId(stashId);
    if (!item) return false;
    if (item.type === "helmet") return equipToSlot("helmet", item);
    if (item.type === "armor") return equipToSlot("armor", item);
    if (item.type === "rig") return equipToSlot("rig", item);
    if (item.type === "backpack") return equipToSlot("backpack", item);
    if (item.type === "weapon_primary") return equipToSlot("primary", item);
    if (isKeycard(item)) {
      var i;
      for (i = 0; i < CARD_SLOTS; i++) {
        if (!loadout.cards[i]) return equipToSlot("card", item, i);
      }
    }
    return false;
  }

  function countBrassInManager(mgr) {
    if (!mgr) return 0;
    var total = 0;
    var i;
    for (i = 0; i < mgr.items.length; i++) {
      var inst = mgr.items[i];
      if (!inst.itemData || inst.itemData.id !== "brass_bullet") continue;
      total += inst.itemData.stackSize != null ? inst.itemData.stackSize : 1;
    }
    return total;
  }

  function getBrassAmmoCount() {
    return (
      countBrassInManager(rigManager) +
      countBrassInManager(backpackManager) +
      countBrassInManager(getSecureManager())
    );
  }

  function consumeBrassFromManager(mgr, amount) {
    if (!mgr || amount <= 0) return amount;
    var left = amount;
    var toTouch = mgr.items.slice();
    var j;
    for (j = 0; j < toTouch.length && left > 0; j++) {
      var inst = toTouch[j];
      if (!inst.itemData || inst.itemData.id !== "brass_bullet") continue;
      var n = inst.itemData.stackSize != null ? inst.itemData.stackSize : 1;
      if (n <= left) {
        mgr.removeItem(inst);
        left -= n;
      } else {
        inst.itemData.stackSize = n - left;
        left = 0;
      }
    }
    return left;
  }

  function consumeBrassAmmo(amount) {
    amount = amount || 1;
    if (getBrassAmmoCount() < amount) {
      return { ok: false, remaining: getBrassAmmoCount() };
    }

    var left = consumeBrassFromManager(rigManager, amount);
    if (left > 0) left = consumeBrassFromManager(backpackManager, left);
    if (left > 0) left = consumeBrassFromManager(getSecureManager(), left);

    if (left > 0) {
      return { ok: false, remaining: getBrassAmmoCount() };
    }

    if (window.GridStashUI) window.GridStashUI.render();
    renderLobby();
    return { ok: true, remaining: getBrassAmmoCount() };
  }

  function tryPlaceLootInBackpackOnly(item) {
    if (!item || !G || !loadout.backpack || !backpackManager) return false;
    var data = G.itemDataFromCatalog(item);
    if (!data) return false;
    var inst = G.createInventoryItem(data);
    return backpackManager.tryAutoPlace(inst);
  }

  function tryPlaceLootInSecureOnly(item) {
    if (!item || !G) return false;
    var secure = getSecureManager();
    if (!secure) return false;
    var data = G.itemDataFromCatalog(item);
    if (!data) return false;
    var inst = G.createInventoryItem(data);
    return secure.tryAutoPlace(inst);
  }

  /**
   * 宝箱双击：先安全箱，再背包。
   * @returns {"secure"|"backpack"|false}
   */
  function tryPlaceLootInSecureThenBackpack(item) {
    if (!item || !G) return false;
    var data = G.itemDataFromCatalog(item);
    if (!data) return false;

    var secure = getSecureManager();
    if (secure) {
      var instSecure = G.createInventoryItem(data);
      if (secure.tryAutoPlace(instSecure)) return "secure";
    }

    if (!loadout.backpack || !backpackManager) return false;
    var instBackpack = G.createInventoryItem(data);
    if (backpackManager.tryAutoPlace(instBackpack)) return "backpack";
    return false;
  }

  function tryPlaceInBackpackOrSecure(item) {
    if (!item || !G) return false;
    var cat = item;
    var data = G.itemDataFromCatalog(cat);
    if (!data) return false;
    var inst = G.createInventoryItem(data);
    if (
      rigManager &&
      item.w === 1 &&
      item.h === 1 &&
      rigManager.tryAutoPlace(inst)
    ) {
      return true;
    }
    var secure = getSecureManager();
    if (secure && secure.tryAutoPlace(inst)) return true;
    if (backpackManager && backpackManager.tryAutoPlace(inst)) return true;
    return false;
  }

  function exportPersistState() {
    var c;
    var cards = [];
    for (c = 0; c < CARD_SLOTS; c++) {
      cards.push(serializeSlotItem(loadout.cards[c]));
    }
    return {
      primary: serializeSlotItem(loadout.primary),
      melee: serializeSlotItem(loadout.melee),
      secondary: serializeSlotItem(loadout.secondary),
      pistol: serializeSlotItem(loadout.pistol),
      helmet: serializeSlotItem(loadout.helmet),
      armor: serializeSlotItem(loadout.armor),
      rig: serializeSlotItem(loadout.rig),
      backpack: serializeSlotItem(loadout.backpack),
      cards: cards,
      rigItems: rigManager ? rigManager.serialize() : [],
      backpackItems: backpackManager ? backpackManager.serialize() : [],
    };
  }

  function importPersistState(data) {
    if (!data) return false;
    hardResetLoadout();

    var item;
    item = itemFromPersistSlot(data.primary);
    if (item) equipToSlot("primary", item);
    item = itemFromPersistSlot(data.melee);
    if (item) equipToSlot("melee", item);
    item = itemFromPersistSlot(data.secondary);
    if (item) equipToSlot("secondary", item);
    item = itemFromPersistSlot(data.pistol);
    if (item) equipToSlot("pistol", item);
    item = itemFromPersistSlot(data.helmet);
    if (item) equipToSlot("helmet", item);
    item = itemFromPersistSlot(data.armor);
    if (item) equipToSlot("armor", item);

    item = itemFromPersistSlot(data.rig);
    if (item) {
      equipToSlot("rig", item);
      deserializeIntoManager(rigManager, data.rigItems);
    }

    item = itemFromPersistSlot(data.backpack);
    if (item) {
      equipToSlot("backpack", item);
      deserializeIntoManager(backpackManager, data.backpackItems);
    }

    if (data.cards && data.cards.length) {
      var c;
      for (c = 0; c < CARD_SLOTS && c < data.cards.length; c++) {
        item = itemFromPersistSlot(data.cards[c]);
        if (item) equipToSlot("card", item, c);
      }
    }

    purgeDepletedKeycards();
    return true;
  }

  window.PlayerLoadout = {
    getLoadout: function () {
      return loadout;
    },
    exportPersistState: exportPersistState,
    importPersistState: importPersistState,
    getBackpackManager: function () {
      return backpackManager;
    },
    getRigManager: function () {
      return rigManager;
    },
    getRigGridSize: getRigGridSize,
    canStoreInRig: function (itemOrData) {
      if (!itemOrData) return false;
      var w = itemOrData.w != null ? itemOrData.w : itemOrData.width;
      var h = itemOrData.h != null ? itemOrData.h : itemOrData.height;
      return w === 1 && h === 1;
    },
    getSecureManager: getSecureManager,
    renderLobby: renderLobby,
    equipFromStashId: equipFromStashId,
    equipFromCatalogItemId: equipFromCatalogItemId,
    equipKeycardFromItemData: equipKeycardFromItemData,
    equipToSlot: equipToSlot,
    unequipSlot: unequipSlot,
    findKeycard: findKeycard,
    consumeKeycardDurability: consumeKeycardDurability,
    findKeycardFromIds: findKeycardFromIds,
    consumeKeycardDurabilityFromIds: consumeKeycardDurabilityFromIds,
    ensureTutorialKeycard: ensureTutorialKeycard,
    getBrassAmmoCount: getBrassAmmoCount,
    consumeBrassAmmo: consumeBrassAmmo,
    renderCardSlots: renderCardSlots,
    isKeycard: isKeycard,
    unequipToStash: function (slotKey, cardIndex) {
      var item =
        slotKey === "card" && cardIndex != null
          ? loadout.cards[cardIndex]
          : loadout[slotKey];
      if (!item) return false;
      var removed =
        slotKey === "card" && cardIndex != null
          ? unequipSlot("card", cardIndex)
          : unequipSlot(slotKey);
      if (!removed) return false;
      if (
        window.GridStashUI &&
        window.GridStashUI.tryAddCatalogItem(removed)
      ) {
        renderLobby();
        return true;
      }
      equipToSlot(slotKey, removed, cardIndex);
      return false;
    },
    tryPlaceLoot: tryPlaceInBackpackOrSecure,
    tryPlaceLootInBackpackOnly: tryPlaceLootInBackpackOnly,
    tryPlaceLootInSecureOnly: tryPlaceLootInSecureOnly,
    tryPlaceLootInSecureThenBackpack: tryPlaceLootInSecureThenBackpack,
    applyDeathDrop: applyDeathDrop,
  };
})();
