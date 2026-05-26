/**
 * 仓库面板 — 6×10 二维网格（路线 B）+ 左侧装备栏
 */
(function () {
  const stashHint = document.getElementById("stashHint");
  const grid = document.getElementById("stashGrid");

  function updateStashHint() {
    const online = window.LobbyNet && window.LobbyNet.isReady();
    if (stashHint) stashHint.classList.toggle("ui-hidden", !!online);
    if (grid) {
      grid.style.pointerEvents = "";
      grid.style.opacity = online ? "1" : "1";
    }
  }

  function tryAddMarketItem(stashId) {
    if (window.GridStashUI && window.GridStashUI.tryAddMarketItem) {
      return window.GridStashUI.tryAddMarketItem(stashId);
    }
    return false;
  }

  window.LobbyStash = {
    applyFullStash: function () {
      if (window.GridStashUI) window.GridStashUI.render();
    },
    setCell: function () {
      /* 旧版逐格 API 已弃用，保留空实现兼容 */
    },
    tryAddMarketItem: tryAddMarketItem,
    onPanelOpen: function () {
      updateStashHint();
      if (window.GridStashUI) {
        window.GridStashUI.render();
      }
      if (window.PlayerLoadout) window.PlayerLoadout.renderLobby();
    },
    close: function () {},
  };

  updateStashHint();
})();
