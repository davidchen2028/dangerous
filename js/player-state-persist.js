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
      tutorialComplete: !!(
        window.TutorialProgress && window.TutorialProgress.isComplete()
      ),
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
      tutorialComplete: state.tutorialComplete,
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
    if (window.TutorialProgress && window.TutorialProgress.setComplete) {
      window.TutorialProgress.setComplete(!!state.tutorialComplete);
    }
    if (window.LobbyUI && window.LobbyUI.syncActionHubButton) {
      window.LobbyUI.syncActionHubButton();
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

  function makeEmptyState(credits) {
    return {
      v: 1,
      credits: credits,
      tutorialComplete: false,
      grids: { stash: [], secure: [] },
      loadout: {
        primary: null,
        melee: null,
        secondary: null,
        pistol: null,
        helmet: null,
        armor: null,
        rig: null,
        backpack: null,
        cards: [null, null, null, null],
        rigItems: [],
        backpackItems: [],
      },
    };
  }

  function applyGuestState(credits) {
    if (!hasDeps()) return;
    importState(makeEmptyState(credits));
    if (window.GridStashUI.markSeeded) {
      window.GridStashUI.markSeeded();
    }
  }

  function clearLocalStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function flushSaveToServer() {
    clearTimeout(serverSaveTimer);
    saveToServer();
  }

  function onAuthOk(serverState, options) {
    options = options || {};
    serverSyncEnabled = true;
    var state = serverState || makeEmptyState(DEFAULT_CREDITS);
    var migratedLegacy = false;

    if (
      !state.tutorialComplete &&
      window.TutorialProgress &&
      window.TutorialProgress.consumeLegacyIfNeeded &&
      window.TutorialProgress.consumeLegacyIfNeeded()
    ) {
      state = Object.assign({}, state, { tutorialComplete: true });
      migratedLegacy = true;
    }

    if (options.isRegister) {
      applyGuestState(DEFAULT_CREDITS);
      flushSaveToServer();
    } else if (serverHasProgress(state)) {
      importState(state);
      if (window.GridStashUI.markSeeded) {
        window.GridStashUI.markSeeded();
      }
    } else {
      importState(state);
      if (window.GridStashUI.markSeeded) {
        window.GridStashUI.markSeeded();
      }
    }

    refreshUi();
    if (window.GridStashUI.enablePersist) {
      window.GridStashUI.enablePersist();
    }
    saveLocal();
    if (migratedLegacy) {
      flushSaveToServer();
    }
  }

  function onAuthLogout() {
    if (serverSyncEnabled) {
      flushSaveToServer();
    }
    serverSyncEnabled = false;
    clearTimeout(saveTimer);
    clearTimeout(serverSaveTimer);
    if (window.GridStashUI.disablePersist) {
      window.GridStashUI.disablePersist();
    }
    applyGuestState(0);
    if (window.TutorialProgress && window.TutorialProgress.reset) {
      window.TutorialProgress.reset();
    }
    if (window.LobbyUI && window.LobbyUI.syncActionHubButton) {
      window.LobbyUI.syncActionHubButton();
    }
    clearLocalStorage();
    refreshUi();
  }

  function boot() {
    if (!hasDeps()) return;
    applyGuestState(0);
    refreshUi();
  }

  window.addEventListener("beforeunload", function () {
    if (!serverSyncEnabled) return;
    saveLocal();
    saveToServer();
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
