/**
 * 大厅进度本地存档 — 仓库 / 身上装备 / 胸挂·背包格 / 极危币
 * 进入教程前强制保存；整理仓库与市场购买后自动防抖写入。
 */
(function () {
  "use strict";

  var STORAGE_KEY = "dangerous_player_state_v1";
  var saveTimer = null;
  var SAVE_DELAY_MS = 450;

  function hasDeps() {
    return (
      window.GridStashUI &&
      window.PlayerLoadout &&
      window.LobbyMarket
    );
  }

  function collectState() {
    if (!hasDeps()) return null;
    return {
      v: 1,
      savedAt: Date.now(),
      grids: window.GridStashUI.exportPersistState(),
      loadout: window.PlayerLoadout.exportPersistState(),
      credits: window.LobbyMarket.getCredits(),
    };
  }

  function save() {
    if (!hasDeps()) return false;
    var state = collectState();
    if (!state) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn("[PlayerStatePersist] 保存失败", e);
      return false;
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_DELAY_MS);
  }

  function hasSavedState() {
    try {
      return !!localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return false;
    }
  }

  function load() {
    if (!hasDeps()) return false;
    var raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return false;
    }
    if (!raw) return false;

    try {
      var state = JSON.parse(raw);
      if (!state || state.v !== 1) return false;

      if (state.grids) {
        window.GridStashUI.importPersistState(state.grids);
      }
      if (state.loadout) {
        window.PlayerLoadout.importPersistState(state.loadout);
      }
      if (state.credits != null && window.LobbyMarket.setCredits) {
        window.LobbyMarket.setCredits(state.credits);
      }
      return true;
    } catch (e) {
      console.warn("[PlayerStatePersist] 读取失败", e);
      return false;
    }
  }

  function boot() {
    if (!hasDeps()) return;

    var restored = load();
    if (!restored) {
      if (window.GridStashUI.ensureSeeded) {
        window.GridStashUI.ensureSeeded();
      }
    } else if (window.GridStashUI.markSeeded) {
      window.GridStashUI.markSeeded();
    }

    if (window.GridStashUI.refreshStashPanel) {
      window.GridStashUI.refreshStashPanel();
    } else {
      window.GridStashUI.render();
      window.PlayerLoadout.renderLobby();
    }

    if (window.GridStashUI.enablePersist) {
      window.GridStashUI.enablePersist();
    }
  }

  window.addEventListener("beforeunload", function () {
    save();
  });

  window.PlayerStatePersist = {
    save: save,
    scheduleSave: scheduleSave,
    load: load,
    hasSavedState: hasSavedState,
    boot: boot,
  };

  boot();
})();
