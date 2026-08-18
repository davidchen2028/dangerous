/**
 * 大厅界面 — 房间 / 仓库 / 教程 / 地图 / 市场 / 小游戏，× 返回大厅
 */
(function () {
  const btnRoom = document.getElementById("btnRoom");
  const btnStash = document.getElementById("btnStash");
  const btnTutorial = document.getElementById("btnTutorial");
  const btnMap = document.getElementById("btnMap");
  const btnAction = document.getElementById("btnAction");
  const btnMarket = document.getElementById("btnMarket");
  const btnMinigame = document.getElementById("btnMinigame");
  const roomPanel = document.getElementById("roomPanel");
  const stashPanel = document.getElementById("stashPanel");
  const tutorialPanel = document.getElementById("tutorialPanel");
  const mapPanel = document.getElementById("mapPanel");
  const marketPage = document.getElementById("marketPage");
  const minigamePanel = document.getElementById("minigamePanel");
  const btnRoomClose = document.getElementById("btnRoomClose");
  const btnStashClose = document.getElementById("btnStashClose");
  const btnTutorialClose = document.getElementById("btnTutorialClose");
  const btnMapClose = document.getElementById("btnMapClose");
  const btnMarketBack = document.getElementById("btnMarketBack");
  const btnMinigameClose = document.getElementById("btnMinigameClose");
  const mapCardTest = document.getElementById("mapCardTest");
  const roomBackdrop = document.getElementById("roomBackdrop");
  const stashBackdrop = document.getElementById("stashBackdrop");
  const tutorialBackdrop = document.getElementById("tutorialBackdrop");
  const mapBackdrop = document.getElementById("mapBackdrop");
  const minigameBackdrop = document.getElementById("minigameBackdrop");

  var selectedMapId = "test";
  var hubModeBadge = document.getElementById("hubModeBadge");
  var OFFLINE_ONLY_MSG = "单机模式仅可游玩新手教程，请先登录账号";

  function isLoggedIn() {
    return !!(window.LobbyNet && window.LobbyNet.isLoggedIn && window.LobbyNet.isLoggedIn());
  }

  function isTutorialComplete() {
    return window.TutorialProgress && window.TutorialProgress.isComplete();
  }

  function syncHubMode() {
    var loggedIn = isLoggedIn();
    document.body.classList.toggle("hub-logged-in", loggedIn);
    if (hubModeBadge) hubModeBadge.hidden = loggedIn;
    syncActionHubButton();
    syncMapHubButton();
  }

  function hideAllPanels() {
    roomPanel.hidden = true;
    stashPanel.hidden = true;
    tutorialPanel.hidden = true;
    if (mapPanel) mapPanel.hidden = true;
    if (marketPage) marketPage.hidden = true;
    if (minigamePanel) minigamePanel.hidden = true;
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
    var locked = !isLoggedIn() || !isTutorialComplete();
    btnMap.classList.toggle("btn-hub--locked", locked);
    btnMap.setAttribute("aria-disabled", locked ? "true" : "false");
  }

  function syncActionHubButton() {
    if (!btnAction) return;
    if (!isLoggedIn()) {
      btnAction.innerHTML = "新手<br>教程";
    } else {
      btnAction.innerHTML = isTutorialComplete()
        ? "开始<br>行动"
        : "新手<br>教程";
    }
    syncMapHubButton();
  }

  function getSelectedMapId() {
    return selectedMapId || "test";
  }

  function selectMap(mapId) {
    if (mapId !== "test") return;
    selectedMapId = mapId;
    syncMapSelectionUi();
    if (window.PlayerStatePersist && window.PlayerStatePersist.scheduleSave) {
      window.PlayerStatePersist.scheduleSave();
    }
  }

  function shakeMapBtn() {
    if (!btnMap) return;
    btnMap.classList.add("btn-hub--shake");
    setTimeout(function () {
      btnMap.classList.remove("btn-hub--shake");
    }, 400);
  }

  function shakeActionBtn() {
    if (!btnAction) return;
    btnAction.classList.add("btn-hub--shake");
    setTimeout(function () {
      btnAction.classList.remove("btn-hub--shake");
    }, 400);
  }

  function handleActionClick(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (mapPanel && !mapPanel.hidden) {
      goHome();
    }
    tryEnterAction(0);
  }

  function tryEnterAction(attempt) {
    if (window.ActionScene && typeof window.ActionScene.enter === "function") {
      window.ActionScene.enter();
      return;
    }
    if (attempt < 40) {
      setTimeout(function () {
        tryEnterAction(attempt + 1);
      }, 100);
      return;
    }
    shakeActionBtn();
    var joinError = document.getElementById("joinError");
    if (joinError) {
      joinError.textContent =
        "3D 场景未加载成功。请用 ./run.sh 打开 http://127.0.0.1:8080，Ctrl+F5 强刷；F12 Console 若有红色报错请截图。";
    }
    openRoom();
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
      "market-open",
      "minigame-open"
    );
    document.body.classList.add("hub-home");
    if (window.PlatformMinigame && window.PlatformMinigame.stop) {
      window.PlatformMinigame.stop();
    }
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
    if (isLoggedIn()) return true;
    var joinError = document.getElementById("joinError");
    var blockMsg =
      window.LobbyNet && window.LobbyNet.getBlockMessage
        ? window.LobbyNet.getBlockMessage()
        : "";
    if (joinError) {
      joinError.textContent = message || blockMsg || OFFLINE_ONLY_MSG;
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
      "market-open",
      "minigame-open"
    );
    document.body.classList.add("room-open");
    roomPanel.hidden = false;
  }

  function openStash() {
    if (!requireLogin(OFFLINE_ONLY_MSG)) return;
    hideAllPanels();
    document.body.classList.remove(
      "hub-home",
      "room-open",
      "tutorial-open",
      "map-open",
      "market-open",
      "minigame-open"
    );
    document.body.classList.add("stash-open");
    stashPanel.hidden = false;
    if (window.LobbyStash && window.LobbyStash.onPanelOpen) {
      window.LobbyStash.onPanelOpen();
    }
  }

  function openTutorial() {
    hideAllPanels();
    document.body.classList.remove(
      "hub-home",
      "room-open",
      "stash-open",
      "map-open",
      "market-open",
      "minigame-open"
    );
    document.body.classList.add("tutorial-open");
    tutorialPanel.hidden = false;
  }

  function openMap() {
    if (!requireLogin(OFFLINE_ONLY_MSG)) return;
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
      "market-open",
      "minigame-open"
    );
    document.body.classList.add("map-open");
    if (mapPanel) mapPanel.hidden = false;
    syncMapSelectionUi();
  }

  function openMarket() {
    if (!requireLogin(OFFLINE_ONLY_MSG)) return;
    hideAllPanels();
    document.body.classList.remove(
      "hub-home",
      "room-open",
      "stash-open",
      "tutorial-open",
      "map-open",
      "minigame-open"
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

  if (btnAction) {
    btnAction.addEventListener("click", handleActionClick);
    btnAction.addEventListener("touchend", function (e) {
      e.preventDefault();
      handleActionClick(e);
    });
  }
  if (btnRoom) btnRoom.addEventListener("click", openRoom);
  if (btnStash) btnStash.addEventListener("click", openStash);
  if (btnTutorial) btnTutorial.addEventListener("click", openTutorial);
  if (btnMap) btnMap.addEventListener("click", openMap);
  function openMinigame() {
    hideAllPanels();
    document.body.classList.remove(
      "hub-home",
      "room-open",
      "stash-open",
      "tutorial-open",
      "map-open",
      "market-open"
    );
    document.body.classList.add("minigame-open");
    if (minigamePanel) minigamePanel.hidden = false;
    if (window.PasswordMinigame && window.PasswordMinigame.isDone && window.PasswordMinigame.isDone()) {
      if (window.PlatformMinigame && window.PlatformMinigame.start) {
        window.PlatformMinigame.start();
      }
      return;
    }
    if (window.PlatformMinigame && window.PlatformMinigame.hide) {
      window.PlatformMinigame.hide();
    }
    if (window.PasswordMinigame && window.PasswordMinigame.reset) {
      window.PasswordMinigame.reset();
    }
  }

  if (btnMarket) btnMarket.addEventListener("click", openMarket);
  if (btnMinigame) btnMinigame.addEventListener("click", openMinigame);
  if (mapCardTest) {
    mapCardTest.addEventListener("click", function () {
      selectMap("test");
    });
  }
  bindClose(btnRoomClose, roomBackdrop);
  bindClose(btnStashClose, stashBackdrop);
  bindClose(btnTutorialClose, tutorialBackdrop);
  bindClose(btnMapClose, mapBackdrop);
  bindClose(btnMinigameClose, null);
  if (btnMarketBack) {
    btnMarketBack.addEventListener("click", goHome);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (window.ActionScene && window.ActionScene.isActive && window.ActionScene.isActive()) {
      return;
    }
    if (
      !roomPanel.hidden ||
      !stashPanel.hidden ||
      !tutorialPanel.hidden ||
      (mapPanel && !mapPanel.hidden) ||
      (marketPage && !marketPage.hidden) ||
      (minigamePanel && !minigamePanel.hidden)
    ) {
      goHome();
    }
  });

  syncHubMode();
  syncMapSelectionUi();

  function hidePanelsForAction() {
    if (window.PlatformMinigame && window.PlatformMinigame.stop) {
      window.PlatformMinigame.stop();
    }
    hideAllPanels();
    document.body.classList.remove(
      "room-open",
      "stash-open",
      "tutorial-open",
      "map-open",
      "market-open",
      "minigame-open"
    );
  }

  window.LobbyUI = {
    goHome: goHome,
    hidePanelsForAction: hidePanelsForAction,
    openRoom: openRoom,
    openStash: openStash,
    openTutorial: openTutorial,
    openMap: openMap,
    openMarket: openMarket,
    openMinigame: openMinigame,
    requireLogin: requireLogin,
    shakeRoomBtn: shakeRoomBtn,
    syncHubMode: syncHubMode,
    syncActionHubButton: syncActionHubButton,
    isLoggedIn: isLoggedIn,
    getSelectedMapId: getSelectedMapId,
    selectMap: selectMap,
  };
})();
