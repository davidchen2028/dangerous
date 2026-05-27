/**
 * 大厅界面 — 房间 / 仓库 / 教程 / 市场，× 返回大厅
 */
(function () {
  const btnRoom = document.getElementById("btnRoom");
  const btnStash = document.getElementById("btnStash");
  const btnTutorial = document.getElementById("btnTutorial");
  const btnMarket = document.getElementById("btnMarket");
  const roomPanel = document.getElementById("roomPanel");
  const stashPanel = document.getElementById("stashPanel");
  const tutorialPanel = document.getElementById("tutorialPanel");
  const marketPage = document.getElementById("marketPage");
  const btnRoomClose = document.getElementById("btnRoomClose");
  const btnStashClose = document.getElementById("btnStashClose");
  const btnTutorialClose = document.getElementById("btnTutorialClose");
  const btnMarketBack = document.getElementById("btnMarketBack");
  const roomBackdrop = document.getElementById("roomBackdrop");
  const stashBackdrop = document.getElementById("stashBackdrop");
  const tutorialBackdrop = document.getElementById("tutorialBackdrop");
  function hideAllPanels() {
    roomPanel.hidden = true;
    stashPanel.hidden = true;
    tutorialPanel.hidden = true;
    if (marketPage) marketPage.hidden = true;
  }

  function goHome(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    document.body.classList.remove(
      "room-open",
      "stash-open",
      "tutorial-open",
      "market-open"
    );
    document.body.classList.add("hub-home");
    hideAllPanels();
  }

  function openRoom() {
    hideAllPanels();
    document.body.classList.remove("hub-home", "stash-open", "tutorial-open", "market-open");
    document.body.classList.add("room-open");
    roomPanel.hidden = false;
  }

  function openStash() {
    hideAllPanels();
    document.body.classList.remove("hub-home", "room-open", "tutorial-open", "market-open");
    document.body.classList.add("stash-open");
    stashPanel.hidden = false;
    if (window.LobbyStash && window.LobbyStash.onPanelOpen) {
      window.LobbyStash.onPanelOpen();
    }
  }

  function openTutorial() {
    hideAllPanels();
    document.body.classList.remove("hub-home", "room-open", "stash-open", "market-open");
    document.body.classList.add("tutorial-open");
    tutorialPanel.hidden = false;
  }

  function openMarket() {
    hideAllPanels();
    document.body.classList.remove("hub-home", "room-open", "stash-open", "tutorial-open");
    document.body.classList.add("market-open");
    if (marketPage) marketPage.hidden = false;
    if (window.LobbyMarket && window.LobbyMarket.onPanelOpen) {
      window.LobbyMarket.onPanelOpen();
    }
  }

  function bindClose(btn, backdrop) {
    if (btn) {
      btn.addEventListener("click", goHome);
      btn.addEventListener("touchend", function (e) {
        e.preventDefault();
        goHome(e);
      });
    }
    if (backdrop) {
      backdrop.addEventListener("click", goHome);
    }
  }

  if (btnRoom) btnRoom.addEventListener("click", openRoom);
  if (btnStash) btnStash.addEventListener("click", openStash);
  if (btnTutorial) btnTutorial.addEventListener("click", openTutorial);
  if (btnMarket) btnMarket.addEventListener("click", openMarket);
  bindClose(btnRoomClose, roomBackdrop);
  bindClose(btnStashClose, stashBackdrop);
  bindClose(btnTutorialClose, tutorialBackdrop);
  if (btnMarketBack) {
    btnMarketBack.addEventListener("click", goHome);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (
      !roomPanel.hidden ||
      !stashPanel.hidden ||
      !tutorialPanel.hidden ||
      (marketPage && !marketPage.hidden)
    ) {
      goHome();
    }
  });

  window.LobbyUI = {
    goHome: goHome,
    openRoom: openRoom,
    openStash: openStash,
    openTutorial: openTutorial,
    openMarket: openMarket,
    shakeRoomBtn: function () {
      btnRoom.classList.add("btn-hub--shake");
      setTimeout(function () {
        btnRoom.classList.remove("btn-hub--shake");
      }, 400);
    },
  };
})();
