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
  const marketPanel = document.getElementById("marketPanel");
  const btnRoomClose = document.getElementById("btnRoomClose");
  const btnStashClose = document.getElementById("btnStashClose");
  const btnTutorialClose = document.getElementById("btnTutorialClose");
  const btnMarketClose = document.getElementById("btnMarketClose");
  const roomBackdrop = document.getElementById("roomBackdrop");
  const stashBackdrop = document.getElementById("stashBackdrop");
  const tutorialBackdrop = document.getElementById("tutorialBackdrop");
  const marketBackdrop = document.getElementById("marketBackdrop");

  function hideAllPanels() {
    roomPanel.hidden = true;
    stashPanel.hidden = true;
    tutorialPanel.hidden = true;
    marketPanel.hidden = true;
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
    marketPanel.hidden = false;
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

  btnRoom.addEventListener("click", openRoom);
  btnStash.addEventListener("click", openStash);
  if (btnTutorial) {
    btnTutorial.addEventListener("click", openTutorial);
  }
  if (btnMarket) {
    btnMarket.addEventListener("click", openMarket);
  }
  bindClose(btnRoomClose, roomBackdrop);
  bindClose(btnStashClose, stashBackdrop);
  bindClose(btnTutorialClose, tutorialBackdrop);
  bindClose(btnMarketClose, marketBackdrop);

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (
      !roomPanel.hidden ||
      !stashPanel.hidden ||
      !tutorialPanel.hidden ||
      !marketPanel.hidden
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
