/**
 * 身上装备栏 — 大厅仓库左侧 / 教程背包共用状态
 */
(function () {
  "use strict";

  var CARD_SLOTS = 4;
  var lobbyLoadoutEl = document.getElementById("lobbyLoadout");
  var lobbySecureEl = document.getElementById("lobbySecureGrid");

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

  var rigSlots = [];
  var secureState = { cols: 1, rows: 2, grid: [], placed: [] };
  var backpackState = { cols: 0, rows: 0, grid: [], placed: [] };

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

  function cloneItem(item) {
    if (!item) return null;
    var c = Object.assign({}, item);
    if (c.id === "keycard") {
      if (c.maxDurability == null) c.maxDurability = 10;
      if (c.durability == null) c.durability = c.maxDurability;
    }
    return c;
  }

  function isKeycard(item) {
    return item && item.id === "keycard";
  }

  function findKeycard() {
    var i;
    for (i = 0; i < CARD_SLOTS; i++) {
      if (isKeycard(loadout.cards[i])) {
        return { source: "card", index: i, item: loadout.cards[i] };
      }
    }
    for (i = 0; i < secureState.placed.length; i++) {
      if (isKeycard(secureState.placed[i].item)) {
        return {
          source: "secure",
          index: i,
          item: secureState.placed[i].item,
          placement: secureState.placed[i],
        };
      }
    }
    return null;
  }

  function removeSecurePlacement(placement) {
    if (!placement) return;
    occupy(
      secureState,
      placement.col,
      placement.row,
      placement.item.w,
      placement.item.h,
      false
    );
    var idx = secureState.placed.indexOf(placement);
    if (idx >= 0) secureState.placed.splice(idx, 1);
  }

  function consumeKeycardDurability(amount) {
    amount = amount || 1;
    var found = findKeycard();
    if (!found || !found.item || found.item.durability <= 0) return null;

    found.item.durability -= amount;
    var max = found.item.maxDurability || 10;
    var remaining = found.item.durability;

    if (remaining <= 0) {
      if (found.source === "card") {
        loadout.cards[found.index] = null;
      } else {
        removeSecurePlacement(found.placement);
      }
      remaining = 0;
    }

    return { remaining: remaining, max: max };
  }

  function ensureTutorialKeycard() {
    if (findKeycard()) return;
    if (!window.ItemCatalog) return;
    var kc = window.ItemCatalog.getItem("keycard");
    if (!kc) return;
    loadout.cards[0] = cloneItem(kc);
  }

  function initContainer(state, cols, rows) {
    state.cols = cols;
    state.rows = rows;
    state.grid = [];
    state.placed = [];
    var r;
    for (r = 0; r < rows; r++) {
      state.grid[r] = [];
      var c;
      for (c = 0; c < cols; c++) state.grid[r][c] = false;
    }
  }

  function isRectFree(state, col, row, w, h) {
    if (col < 0 || row < 0 || col + w > state.cols || row + h > state.rows) {
      return false;
    }
    var y;
    for (y = row; y < row + h; y++) {
      var x;
      for (x = col; x < col + w; x++) {
        if (state.grid[y][x]) return false;
      }
    }
    return true;
  }

  function occupy(state, col, row, w, h, val) {
    var y;
    for (y = row; y < row + h; y++) {
      var x;
      for (x = col; x < col + w; x++) state.grid[y][x] = val;
    }
  }

  function renderGrid(el, state, emptyText, mini) {
    if (!el) return;
    el.innerHTML = "";
    if (!state.cols || !state.rows) {
      el.innerHTML =
        '<p class="loadout-grid__empty">' + (emptyText || "未装备") + "</p>";
      return;
    }
    el.style.gridTemplateColumns = "repeat(" + state.cols + ", 1fr)";
    el.style.gridTemplateRows = "repeat(" + state.rows + ", 1fr)";

    var row;
    for (row = 0; row < state.rows; row++) {
      var col;
      for (col = 0; col < state.cols; col++) {
        var anchor = null;
        var covered = false;
        var p;
        for (p = 0; p < state.placed.length; p++) {
          var pl = state.placed[p];
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
        cell.className = "loadout-grid__cell";
        if (mini) cell.classList.add("loadout-grid__cell--mini");
        if (anchor) {
          cell.classList.add("loadout-grid__cell--item");
          cell.textContent = anchor.name.slice(0, mini ? 2 : 4);
          if (isKeycard(anchor)) {
            cell.classList.add("action-cell--keycard");
            cell.dataset.durability = String(
              anchor.durability != null ? anchor.durability : anchor.maxDurability || 10
            );
            cell.dataset.maxDurability = String(anchor.maxDurability || 10);
          } else {
            cell.title = anchor.name;
          }
          if (anchor.w > 1) cell.style.gridColumn = "span " + anchor.w;
          if (anchor.h > 1) cell.style.gridRow = "span " + anchor.h;
        }
        el.appendChild(cell);
      }
    }
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
          useActionClasses ? "action-grid__cell--item" : "loadout-grid__cell--item"
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
          ? '<span class="loadout-slot__item">' + card.name + "</span>"
          : '<span class="loadout-slot__placeholder">卡' +
            (c + 1) +
            "</span>") +
        "</button>";
    }
    html += "</div>";

    lobbyLoadoutEl.innerHTML = html;

    var rigEl = document.getElementById("lobbyRigPreview");
    var bpEl = document.getElementById("lobbyBpPreview");

    if (!loadout.rig) {
      if (rigEl) rigEl.innerHTML = '<span class="loadout-preview__hint">未装备</span>';
    } else {
      if (rigEl) {
        rigEl.style.gridTemplateColumns = "repeat(3, 1fr)";
        var n = loadout.rig.rigSlots || 6;
        rigEl.innerHTML = "";
        var i;
        for (i = 0; i < n; i++) {
          var cell = document.createElement("div");
          cell.className = "loadout-grid__cell loadout-grid__cell--mini";
          if (rigSlots[i]) {
            cell.classList.add("loadout-grid__cell--item");
            cell.textContent = rigSlots[i].name.slice(0, 2);
            cell.title = rigSlots[i].name;
          }
          rigEl.appendChild(cell);
        }
      }
    }

    if (!loadout.backpack) {
      if (bpEl) bpEl.innerHTML = '<span class="loadout-preview__hint">未装备</span>';
    } else if (bpEl) {
      bpEl.style.gridTemplateColumns =
        "repeat(" + Math.min(loadout.backpack.cols, 4) + ", 1fr)";
      renderGrid(bpEl, backpackState, "", true);
    }

    renderGrid(lobbySecureEl, secureState, "", false);

    lobbyLoadoutEl.querySelectorAll("[data-slot]").forEach(function (btn) {
      btn.addEventListener("dblclick", onSlotDblClick);
    });
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
      rigSlots = [];
      var i;
      for (i = 0; i < (item.rigSlots || 6); i++) rigSlots.push(null);
      return true;
    }
    if (slotKey === "backpack") {
      loadout.backpack = cloneItem(item);
      initContainer(backpackState, item.cols, item.rows);
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
      rigSlots = [];
    }
    if (slotKey === "backpack") {
      loadout.backpack = null;
      initContainer(backpackState, 0, 0);
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

  function equipFromStashId(stashId) {
    var item = window.ItemCatalog && window.ItemCatalog.fromStashId(stashId);
    if (!item) return false;
    if (item.type === "helmet") return equipToSlot("helmet", item);
    if (item.type === "armor") return equipToSlot("armor", item);
    if (item.type === "rig") return equipToSlot("rig", item);
    if (item.type === "backpack") return equipToSlot("backpack", item);
    if (item.id === "keycard") {
      var i;
      for (i = 0; i < CARD_SLOTS; i++) {
        if (!loadout.cards[i]) return equipToSlot("card", item, i);
      }
    }
    return false;
  }

  function tryPlaceInBackpackOrSecure(item) {
    if (!item) return false;
    var pos = { col: 0, row: 0 };
    var row;
    for (row = 0; row <= secureState.rows - item.h; row++) {
      var col;
      for (col = 0; col <= secureState.cols - item.w; col++) {
        if (isRectFree(secureState, col, row, item.w, item.h)) {
          occupy(secureState, col, row, item.w, item.h, true);
          secureState.placed.push({ item: item, col: col, row: row });
          return true;
        }
      }
    }
    if (!loadout.backpack) return false;
    for (row = 0; row <= backpackState.rows - item.h; row++) {
      for (col = 0; col <= backpackState.cols - item.w; col++) {
        if (isRectFree(backpackState, col, row, item.w, item.h)) {
          occupy(backpackState, col, row, item.w, item.h, true);
          backpackState.placed.push({ item: item, col: col, row: row });
          return true;
        }
      }
    }
    if (loadout.rig && item.w === 1 && item.h === 1) {
      var i;
      for (i = 0; i < rigSlots.length; i++) {
        if (!rigSlots[i]) {
          rigSlots[i] = cloneItem(item);
          return true;
        }
      }
    }
    return false;
  }

  initContainer(secureState, 1, 2);
  initContainer(backpackState, 0, 0);
  renderLobby();

  window.PlayerLoadout = {
    getLoadout: function () {
      return loadout;
    },
    getBackpackState: function () {
      return backpackState;
    },
    getSecureState: function () {
      return secureState;
    },
    renderLobby: renderLobby,
    equipFromStashId: equipFromStashId,
    findKeycard: findKeycard,
    consumeKeycardDurability: consumeKeycardDurability,
    ensureTutorialKeycard: ensureTutorialKeycard,
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
    renderGrid: renderGrid,
  };
})();
