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
      selectedMapId:
        window.LobbyUI && window.LobbyUI.getSelectedMapId
          ? window.LobbyUI.getSelectedMapId()
          : "test",
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
      selectedMapId: state.selectedMapId,
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
    if (
      state.selectedMapId &&
      window.LobbyUI &&
      window.LobbyUI.selectMap &&
      state.tutorialComplete
    ) {
      window.LobbyUI.selectMap(state.selectedMapId);
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
    if (state.tutorialComplete) return true;
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
      selectedMapId: "test",
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

  function saveNow() {
    clearTimeout(saveTimer);
    clearTimeout(serverSaveTimer);
    saveLocal();
    saveToServer();
  }

  function readLocalStateRaw() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== 1) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  /** 登录恢复时，避免服务器旧档覆盖本地已撤离解锁的地图进度 */
  function mergeLocalMapProgress(serverState) {
    var local = readLocalStateRaw();
    if (!local) return serverState;
    var merged = Object.assign({}, serverState);
    if (local.tutorialComplete) {
      merged.tutorialComplete = true;
    }
    if (merged.tutorialComplete && local.selectedMapId === "test") {
      merged.selectedMapId = "test";
    }
    return merged;
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

    state = mergeLocalMapProgress(state);

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
    if (migratedLegacy || state.tutorialComplete) {
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

  function enableLocalPersist() {
    if (window.GridStashUI && window.GridStashUI.enablePersist) {
      window.GridStashUI.enablePersist();
    }
  }

  function flushBeforeLeave() {
    if (!hasDeps()) return;
    clearTimeout(saveTimer);
    clearTimeout(serverSaveTimer);
    saveLocal();
    if (serverSyncEnabled) {
      saveToServer();
    }
  }

  function boot() {
    if (!hasDeps()) return;

    if (hasSavedState() && loadLocal()) {
      if (window.GridStashUI.markSeeded) {
        window.GridStashUI.markSeeded();
      }
    } else {
      applyGuestState(0);
      if (window.GridStashUI.ensureSeeded) {
        window.GridStashUI.ensureSeeded();
      }
    }

    refreshUi();
    enableLocalPersist();
  }

  window.addEventListener("beforeunload", flushBeforeLeave);
  window.addEventListener("pagehide", flushBeforeLeave);

  window.PlayerStatePersist = {
    save: save,
    saveNow: saveNow,
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
