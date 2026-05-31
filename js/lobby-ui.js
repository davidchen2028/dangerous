/**
 * 大厅界面 — 房间 / 仓库 / 教程 / 地图 / 市场，× 返回大厅
 */
(function () {
  const btnRoom = document.getElementById("btnRoom");
  const btnStash = document.getElementById("btnStash");
  const btnTutorial = document.getElementById("btnTutorial");
  const btnMap = document.getElementById("btnMap");
  const btnAction = document.getElementById("btnAction");
  const btnMarket = document.getElementById("btnMarket");
  const roomPanel = document.getElementById("roomPanel");
  const stashPanel = document.getElementById("stashPanel");
  const tutorialPanel = document.getElementById("tutorialPanel");
  const mapPanel = document.getElementById("mapPanel");
  const marketPage = document.getElementById("marketPage");
  const btnRoomClose = document.getElementById("btnRoomClose");
  const btnStashClose = document.getElementById("btnStashClose");
  const btnTutorialClose = document.getElementById("btnTutorialClose");
  const btnMapClose = document.getElementById("btnMapClose");
  const btnMarketBack = document.getElementById("btnMarketBack");
  const mapCardTest = document.getElementById("mapCardTest");
  const roomBackdrop = document.getElementById("roomBackdrop");
  const stashBackdrop = document.getElementById("stashBackdrop");
  const tutorialBackdrop = document.getElementById("tutorialBackdrop");
  const mapBackdrop = document.getElementById("mapBackdrop");

  var selectedMapId = "test";

  function isTutorialComplete() {
    return window.TutorialProgress && window.TutorialProgress.isComplete();
  }

  function hideAllPanels() {
    roomPanel.hidden = true;
    stashPanel.hidden = true;
    tutorialPanel.hidden = true;
    if (mapPanel) mapPanel.hidden = true;
    if (marketPage) marketPage.hidden = true;
  }

  function syncMapSelectionUi() {
    if (mapCardTest) {
      var selected = selectedMapId === "test";
      mapCardTest.classList.toggle("map-card--selected", selected);
      mapCardTest.setAttribute("aria-pressed", selected ? "true" : "false");
    }
  }

  function syncMapHubButton() {
    if (!btnMap) return;
    var locked = !isTutorialComplete();
    btnMap.classList.toggle("btn-hub--locked", locked);
    btnMap.setAttribute("aria-disabled", locked ? "true" : "false");
  }

  function syncActionHubButton() {
    if (!btnAction) return;
    btnAction.innerHTML = isTutorialComplete()
      ? "开始<br>行动"
      : "新手<br>教程";
    syncMapHubButton();
  }

  function getSelectedMapId() {
    return selectedMapId || "test";
  }

  function selectMap(mapId) {
    selectedMapId = mapId;
    syncMapSelectionUi();
  }

  function shakeMapBtn() {
    if (!btnMap) return;
    btnMap.classList.add("btn-hub--shake");
    setTimeout(function () {
      btnMap.classList.remove("btn-hub--shake");
    }, 400);
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
      "map-open",
      "market-open"
    );
    document.body.classList.add("hub-home");
    hideAllPanels();
  }

  function shakeRoomBtn() {
    if (!btnRoom) return;
    btnRoom.classList.add("btn-hub--shake");
    setTimeout(function () {
      btnRoom.classList.remove("btn-hub--shake");
    }, 400);
  }

  function requireLogin(message) {
    if (window.LobbyNet && window.LobbyNet.canPlay && window.LobbyNet.canPlay()) {
      return true;
    }
    var joinError = document.getElementById("joinError");
    var blockMsg =
      window.LobbyNet && window.LobbyNet.getBlockMessage
        ? window.LobbyNet.getBlockMessage()
        : "";
    if (joinError) {
      joinError.textContent = blockMsg || message || "未注册不能玩";
    }
    openRoom();
    shakeRoomBtn();
    return false;
  }

  function openRoom() {
    hideAllPanels();
    document.body.classList.remove(
      "hub-home",
      "stash-open",
      "tutorial-open",
      "map-open",
      "market-open"
    );
    document.body.classList.add("room-open");
    roomPanel.hidden = false;
  }

  function openStash() {
    hideAllPanels();
    document.body.classList.remove(
      "hub-home",
      "room-open",
      "tutorial-open",
      "map-open",
      "market-open"
    );
    document.body.classList.add("stash-open");
    stashPanel.hidden = false;
    if (window.LobbyStash && window.LobbyStash.onPanelOpen) {
      window.LobbyStash.onPanelOpen();
    }
  }

  function openTutorial() {
    if (!requireLogin("未注册不能玩")) return;
    hideAllPanels();
    document.body.classList.remove(
      "hub-home",
      "room-open",
      "stash-open",
      "map-open",
      "market-open"
    );
    document.body.classList.add("tutorial-open");
    tutorialPanel.hidden = false;
  }

  function openMap() {
    if (!requireLogin("未注册不能玩")) return;
    if (!isTutorialComplete()) {
      shakeMapBtn();
      return;
    }
    hideAllPanels();
    document.body.classList.remove(
      "hub-home",
      "room-open",
      "stash-open",
      "tutorial-open",
      "market-open"
    );
    document.body.classList.add("map-open");
    if (mapPanel) mapPanel.hidden = false;
    syncMapSelectionUi();
  }

  function openMarket() {
    hideAllPanels();
    document.body.classList.remove(
      "hub-home",
      "room-open",
      "stash-open",
      "tutorial-open",
      "map-open"
    );
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
  if (btnMap) btnMap.addEventListener("click", openMap);
  if (btnMarket) btnMarket.addEventListener("click", openMarket);
  if (mapCardTest) {
    mapCardTest.addEventListener("click", function () {
      selectMap("test");
    });
  }
  bindClose(btnRoomClose, roomBackdrop);
  bindClose(btnStashClose, stashBackdrop);
  bindClose(btnTutorialClose, tutorialBackdrop);
  bindClose(btnMapClose, mapBackdrop);
  if (btnMarketBack) {
    btnMarketBack.addEventListener("click", goHome);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (
      !roomPanel.hidden ||
      !stashPanel.hidden ||
      !tutorialPanel.hidden ||
      (mapPanel && !mapPanel.hidden) ||
      (marketPage && !marketPage.hidden)
    ) {
      goHome();
    }
  });

  syncActionHubButton();
  syncMapSelectionUi();

  window.LobbyUI = {
    goHome: goHome,
    openRoom: openRoom,
    openStash: openStash,
    openTutorial: openTutorial,
    openMap: openMap,
    openMarket: openMarket,
    requireLogin: requireLogin,
    shakeRoomBtn: shakeRoomBtn,
    syncActionHubButton: syncActionHubButton,
    getSelectedMapId: getSelectedMapId,
    selectMap: selectMap,
  };
})();
