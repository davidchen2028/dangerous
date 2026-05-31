/**
 * 新手教程完成进度 — 随账号存档同步服务器（撤离成功后不可再玩）
 */
(function () {
  "use strict";

  var LEGACY_STORAGE_KEY = "dangerous_tutorial_complete_v1";
  var complete = false;

  function clearLegacyStorage() {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function readLegacyStorage() {
    try {
      return localStorage.getItem(LEGACY_STORAGE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function isComplete() {
    return !!complete;
  }

  function setComplete(value) {
    complete = !!value;
  }

  function markComplete() {
    if (complete) return true;
    complete = true;
    clearLegacyStorage();
    if (window.PlayerStatePersist && window.PlayerStatePersist.scheduleSave) {
      window.PlayerStatePersist.scheduleSave();
    }
    return true;
  }

  function reset() {
    complete = false;
    clearLegacyStorage();
  }

  function consumeLegacyIfNeeded() {
    if (!readLegacyStorage()) return false;
    complete = true;
    clearLegacyStorage();
    return true;
  }

  clearLegacyStorage();

  window.TutorialProgress = {
    isComplete: isComplete,
    setComplete: setComplete,
    markComplete: markComplete,
    reset: reset,
    consumeLegacyIfNeeded: consumeLegacyIfNeeded,
  };
})();
