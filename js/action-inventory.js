/**
 * 新手教程 — B 打开已装备背包储物格 + 安全箱
 */
(function () {
  "use strict";

  var panel = document.getElementById("actionInventory");
  var storageGridEl = document.getElementById("actionStorageGrid");
  var storageTitleEl = document.getElementById("actionStorageTitle");
  var storageMetaEl = document.getElementById("actionStorageMeta");
  var cardGridEl = document.getElementById("actionCardGrid");
  var secureGridEl = document.getElementById("actionSecureGrid");
  var keycardTipEl = document.getElementById("actionKeycardTip");

  if (!panel || !storageGridEl) return;

  var open = false;
  var hoverBound = false;

  function showKeycardDurability(cell) {
    if (!keycardTipEl || !cell) return;
    keycardTipEl.textContent =
      "房卡耐久 " + cell.dataset.durability + " / " + cell.dataset.maxDurability;
    keycardTipEl.classList.remove("ui-hidden");
  }

  function hideKeycardDurability() {
    if (!keycardTipEl) return;
    keycardTipEl.classList.add("ui-hidden");
  }

  function bindKeycardHover(root) {
    if (!root || hoverBound) return;
    hoverBound = true;
    root.addEventListener("mouseover", function (e) {
      var cell = e.target.closest(".action-cell--keycard");
      if (cell) showKeycardDurability(cell);
    });
    root.addEventListener("mouseout", function (e) {
      var from = e.target.closest(".action-cell--keycard");
      if (!from) return;
      var to = e.relatedTarget;
      if (to && to.closest && to.closest(".action-cell--keycard")) return;
      hideKeycardDurability();
    });
  }

  function rebuildStorage() {
    if (!window.PlayerLoadout) return;
    var loadout = window.PlayerLoadout.getLoadout();
    var bpMgr = window.PlayerLoadout.getBackpackManager();

    if (!loadout.backpack || !bpMgr) {
      if (storageTitleEl) storageTitleEl.textContent = "背包内容";
      if (storageMetaEl) storageMetaEl.textContent = "未装备背包";
      if (window.GridStashUI) {
        window.GridStashUI.mountExternalBoard(
          storageGridEl,
          null,
          0,
          0,
          "actionBp"
        );
      } else {
        storageGridEl.innerHTML =
          '<p class="inv-grid-host__empty">请在大厅仓库左侧装备背包</p>';
      }
      return;
    }

    if (storageTitleEl) storageTitleEl.textContent = loadout.backpack.name;
    if (storageMetaEl) {
      storageMetaEl.textContent =
        loadout.backpack.cols + " × " + loadout.backpack.rows;
    }

    if (window.GridStashUI) {
      window.GridStashUI.mountExternalBoard(
        storageGridEl,
        bpMgr,
        loadout.backpack.cols,
        loadout.backpack.rows,
        "actionBp"
      );
    }
  }

  function renderCards() {
    if (!window.PlayerLoadout || !cardGridEl) return;
    window.PlayerLoadout.renderCardSlots(cardGridEl, true);
  }

  function renderSecure() {
    if (!secureGridEl) return;
    var secure = window.PlayerLoadout && window.PlayerLoadout.getSecureManager();
    if (window.GridStashUI && secure) {
      window.GridStashUI.mountExternalBoard(secureGridEl, secure, 1, 2, "actionSecure");
    }
  }

  function refreshAll() {
    rebuildStorage();
    renderCards();
    renderSecure();
  }

  function notifySceneInventory(opened) {
    if (window.ActionScene) {
      if (opened && window.ActionScene.onInventoryOpened) {
        window.ActionScene.onInventoryOpened();
      } else if (!opened && window.ActionScene.onInventoryClosed) {
        window.ActionScene.onInventoryClosed();
      }
    }
  }

  function setOpen(next) {
    open = next;
    panel.hidden = !open;
    document.body.classList.toggle("inventory-open", open);
    document.body.classList.toggle("show-cursor", open);
    if (open) {
      refreshAll();
      notifySceneInventory(true);
    } else {
      hideKeycardDurability();
      notifySceneInventory(false);
    }
  }

  bindKeycardHover(panel);

  window.ActionInventory = {
    toggle: function () {
      setOpen(!open);
      return open;
    },
    isOpen: function () {
      return open;
    },
    close: function () {
      setOpen(false);
    },
    tryAddItem: function (item) {
      if (!window.PlayerLoadout) return false;
      var ok = window.PlayerLoadout.tryPlaceLoot(item);
      if (open) refreshAll();
      return ok;
    },
    refresh: refreshAll,
  };
})();
