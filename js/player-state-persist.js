/**
 * 大厅进度 — 本地缓存 + 登录后同步服务器（极危币 / 仓库 / 装备）
 */
(function () {
  "use strict";

  var STORAGE_KEY = "dangerous_player_state_v1";
  var DEFAULT_CREDITS = 50000;
  var saveTimer = null;
  var serverSaveTimer = null;
  var SAVE_DELAY_MS = 450;
  var SERVER_SAVE_DELAY_MS = 800;
  var serverSyncEnabled = false;

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

  function collectServerPayload() {
    var state = collectState();
    if (!state) return null;
    return {
      v: state.v,
      credits: state.credits,
      grids: state.grids,
      loadout: state.loadout,
    };
  }

  function importState(state) {
    if (!state || !hasDeps()) return false;
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
  }

  function refreshUi() {
    if (window.GridStashUI.refreshStashPanel) {
      window.GridStashUI.refreshStashPanel();
    } else if (window.GridStashUI.render) {
      window.GridStashUI.render();
      if (window.PlayerLoadout.renderLobby) {
        window.PlayerLoadout.renderLobby();
      }
    }
  }

  function saveLocal() {
    if (!hasDeps()) return false;
    var state = collectState();
    if (!state) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn("[PlayerStatePersist] 本地保存失败", e);
      return false;
    }
  }

  function saveToServer() {
    if (!serverSyncEnabled || !window.LobbyNet || !window.LobbyNet.savePlayerState) {
      return;
    }
    var payload = collectServerPayload();
    if (payload) {
      window.LobbyNet.savePlayerState(payload);
    }
  }

  function save() {
    saveLocal();
    scheduleServerSave();
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_DELAY_MS);
  }

  function scheduleServerSave() {
    if (!serverSyncEnabled) return;
    clearTimeout(serverSaveTimer);
    serverSaveTimer = setTimeout(saveToServer, SERVER_SAVE_DELAY_MS);
  }

  function hasSavedState() {
    try {
      return !!localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return false;
    }
  }

  function loadLocal() {
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
      importState(state);
      return true;
    } catch (e) {
      console.warn("[PlayerStatePersist] 本地读取失败", e);
      return false;
    }
  }

  function gridHasItems(gridData) {
    return !!(gridData && Array.isArray(gridData) && gridData.length);
  }

  function loadoutHasItems(loadout) {
    if (!loadout || typeof loadout !== "object") return false;
    var keys = [
      "primary",
      "melee",
      "secondary",
      "pistol",
      "helmet",
      "armor",
      "rig",
      "backpack",
    ];
    var i;
    for (i = 0; i < keys.length; i++) {
      if (loadout[keys[i]]) return true;
    }
    if (loadout.cards && loadout.cards.some(function (c) { return !!c; })) return true;
    if (gridHasItems(loadout.rigItems)) return true;
    if (gridHasItems(loadout.backpackItems)) return true;
    return false;
  }

  function serverHasProgress(state) {
    if (!state || state.v !== 1) return false;
    if (state.credits != null && Number(state.credits) !== DEFAULT_CREDITS) {
      return true;
    }
    if (state.grids) {
      if (gridHasItems(state.grids.stash)) return true;
      if (gridHasItems(state.grids.secure)) return true;
    }
    if (loadoutHasItems(state.loadout)) return true;
    return false;
  }

  function ensureSeededIfEmpty() {
    if (window.GridStashUI.ensureSeeded) {
      window.GridStashUI.ensureSeeded();
    }
    if (window.GridStashUI.markSeeded) {
      window.GridStashUI.markSeeded();
    }
  }

  function onAuthOk(serverState) {
    serverSyncEnabled = true;

    if (serverHasProgress(serverState)) {
      importState(serverState);
      if (window.GridStashUI.markSeeded) {
        window.GridStashUI.markSeeded();
      }
    } else if (hasSavedState()) {
      loadLocal();
      saveToServer();
    } else {
      importState(serverState || { v: 1, credits: DEFAULT_CREDITS });
      ensureSeededIfEmpty();
    }

    refreshUi();
    if (window.GridStashUI.enablePersist) {
      window.GridStashUI.enablePersist();
    }
    saveLocal();
  }

  function onAuthLogout() {
    saveLocal();
    saveToServer();
    serverSyncEnabled = false;
    clearTimeout(serverSaveTimer);
  }

  function boot() {
    if (!hasDeps()) return;

    var restored = loadLocal();
    if (!restored) {
      ensureSeededIfEmpty();
    } else if (window.GridStashUI.markSeeded) {
      window.GridStashUI.markSeeded();
    }

    refreshUi();

    if (window.GridStashUI.enablePersist) {
      window.GridStashUI.enablePersist();
    }
  }

  window.addEventListener("beforeunload", function () {
    saveLocal();
    if (serverSyncEnabled) {
      saveToServer();
    }
  });

  window.PlayerStatePersist = {
    save: save,
    scheduleSave: scheduleSave,
    load: loadLocal,
    hasSavedState: hasSavedState,
    boot: boot,
    onAuthOk: onAuthOk,
    onAuthLogout: onAuthLogout,
    collectServerPayload: collectServerPayload,
  };

  boot();
})();
