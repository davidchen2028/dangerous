/**
 * 新手教程 — B 打开已装备背包储物格 + 安全箱
 */
(function () {
  "use strict";

  var panel = document.getElementById("actionInventory");
  var storageGridEl = document.getElementById("actionStorageGrid");
  var storageTitleEl = document.getElementById("actionStorageTitle");
  var storageMetaEl = document.getElementById("actionStorageMeta");
  var secureGridEl = document.getElementById("actionSecureGrid");

  if (!panel || !storageGridEl) return;

  var open = false;

  function rebuildStorage() {
    if (!window.PlayerLoadout) return;
    var loadout = window.PlayerLoadout.getLoadout();
    var bp = window.PlayerLoadout.getBackpackState();

    if (!loadout.backpack) {
      if (storageTitleEl) storageTitleEl.textContent = "背包内容";
      if (storageMetaEl) storageMetaEl.textContent = "未装备背包";
      window.PlayerLoadout.renderGrid(
        storageGridEl,
        { cols: 0, rows: 0, placed: [] },
        "请在大厅仓库左侧装备背包"
      );
      return;
    }
    if (storageTitleEl) storageTitleEl.textContent = loadout.backpack.name;
    if (storageMetaEl) {
      storageMetaEl.textContent =
        loadout.backpack.cols + " × " + loadout.backpack.rows;
    }
    window.PlayerLoadout.renderGrid(storageGridEl, bp, "");
  }

  function renderSecure() {
    if (!window.PlayerLoadout || !secureGridEl) return;
    window.PlayerLoadout.renderGrid(
      secureGridEl,
      window.PlayerLoadout.getSecureState(),
      ""
    );
  }

  function setOpen(next) {
    open = next;
    panel.hidden = !open;
    document.body.classList.toggle("inventory-open", open);
    document.body.classList.toggle("show-cursor", open);
    if (open) {
      rebuildStorage();
      renderSecure();
    }
  }

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
      if (open) {
        rebuildStorage();
        renderSecure();
      }
      return ok;
    },
    refresh: function () {
      rebuildStorage();
      renderSecure();
    },
  };
})();
