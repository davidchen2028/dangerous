/**
 * 联机大厅 — 账号登录、好友
 */
(function () {
  const TOKEN_KEY = "jiwei_token";
  const NICK_KEY = "jiwei_nick";
  const SESSION_BLOCK_KEY = "jiwei_session_block";

  const btnAuthSubmit = document.getElementById("btnAuthSubmit");
  const btnLogout = document.getElementById("btnLogout");
  const authTabs = document.getElementById("authTabs");
  const inputName = document.getElementById("inputNickname");
  const inputPassword = document.getElementById("inputPassword");
  const nicknameDeviceMark = document.getElementById("nicknameDeviceMark");
  const joinError = document.getElementById("joinError");
  const netStatus = document.getElementById("netStatus");
  const accountMeta = document.getElementById("accountMeta");
  const friendPanel = document.getElementById("friendPanel");
  const friendList = document.getElementById("friendList");
  const friendCount = document.getElementById("friendCount");
  const friendRequests = document.getElementById("friendRequests");
  const friendAddSection = document.getElementById("friendAddSection");
  const friendNotice = document.getElementById("friendNotice");
  const inputFriendSearch = document.getElementById("inputFriendSearch");
  const btnFriendSearch = document.getElementById("btnFriendSearch");
  const btnFriendSend = document.getElementById("btnFriendSend");
  const friendSearchResult = document.getElementById("friendSearchResult");

  let socket = null;
  let ready = false;
  let socketConnected = false;
  let authMode = "login";
  let myUserId = null;
  let myNickname = "";
  let friends = [];
  let incomingRequests = [];
  let lastSearchFound = null;
  let noticeTimer = null;
  let pendingAuth = null;
  let authWaitTimer = null;
  let ipBanActive = false;
  let sessionRevokedHandled = false;
  let sessionBlocked = false;
  let sessionBlockMessage = "";
  let sessionProbeTimer = null;
  let playCheckCallback = null;
  let playCheckTimer = null;
  const SESSION_PROBE_MS = 5000;

  const sessionRevokedEl = document.getElementById("sessionRevoked");
  const sessionRevokedMsg = document.getElementById("sessionRevokedMsg");
  const sessionRevokedBtn = document.getElementById("sessionRevokedBtn");

  function hideSessionRevokedOverlay() {
    if (sessionRevokedEl) sessionRevokedEl.hidden = true;
    document.body.classList.remove("session-revoked-open");
  }

  function showSessionRevokedOverlay(message) {
    if (sessionRevokedMsg) {
      sessionRevokedMsg.textContent = message || "会话已失效";
    }
    if (sessionRevokedEl) sessionRevokedEl.hidden = false;
    document.body.classList.add("session-revoked-open");
    if (document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  function saveSessionBlock(message) {
    sessionBlocked = true;
    sessionBlockMessage = message || "会话已失效";
    try {
      localStorage.setItem(SESSION_BLOCK_KEY, sessionBlockMessage);
    } catch (e) { /* ignore */ }
  }

  function clearSessionBlock() {
    sessionBlocked = false;
    sessionBlockMessage = "";
    try {
      localStorage.removeItem(SESSION_BLOCK_KEY);
    } catch (e) { /* ignore */ }
  }

  function loadSessionBlockFromStorage() {
    var msg = "";
    try {
      msg = localStorage.getItem(SESSION_BLOCK_KEY) || "";
    } catch (e) { /* ignore */ }
    if (!msg) return;
    sessionBlocked = true;
    sessionBlockMessage = msg;
    if (isIpBanMessage(msg)) {
      ipBanActive = true;
    }
    saveToken("");
    setLoggedInUI(false);
    if (joinError) joinError.textContent = msg;
    setStatus(ipBanActive ? "IP 已被封禁" : "已连接 · 请登录", false);
  }

  function canPlay() {
    if (ipBanActive || sessionBlocked) return false;
    if (!ready || !getToken()) return false;
    return true;
  }

  function getBlockMessage() {
    if (ipBanActive) return "IP 已被封禁，无法连接服务器";
    if (sessionBlocked && sessionBlockMessage) return sessionBlockMessage;
    if (!ready || !getToken()) return "未注册不能玩";
    return "";
  }

  function finishPlayCheck(ok, msg) {
    if (playCheckTimer) {
      clearTimeout(playCheckTimer);
      playCheckTimer = null;
    }
    if (!playCheckCallback) return;
    var cb = playCheckCallback;
    playCheckCallback = null;
    cb(ok, msg || "");
  }

  function verifySessionHttp(callback) {
    var token = getToken();
    if (!token) {
      callback(false, "未注册不能玩");
      return;
    }
    fetch(
      "/api/session/verify?token=" + encodeURIComponent(token),
      { method: "GET", cache: "no-store", credentials: "same-origin" }
    )
      .then(function (r) {
        return r
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (r.ok && data && data.ok) {
              callback(true, "");
            } else {
              callback(false, (data && data.message) || "登录已失效");
            }
          });
      })
      .catch(function () {
        callback(false, "无法连接服务器");
      });
  }

  function onSessionVerifyFailed(msg) {
    if (isIpBanMessage(msg)) {
      showIpBan(msg);
      return;
    }
    forceSessionRevoked(msg || "登录已失效", {
      clearToken: true,
      showOverlay: !sessionRevokedHandled,
    });
  }

  function assertCanPlay(callback) {
    if (sessionBlocked || ipBanActive) {
      callback(false, getBlockMessage());
      return;
    }
    if (!ready || !getToken()) {
      callback(false, getBlockMessage() || "未注册不能玩");
      return;
    }
    if (playCheckCallback) {
      callback(false, "正在验证账号…");
      return;
    }
    playCheckCallback = callback;
    playCheckTimer = setTimeout(function () {
      finishPlayCheck(false, "服务器无响应，请稍后再试");
    }, 8000);
    verifySessionHttp(function (ok, msg) {
      finishPlayCheck(ok, msg);
      if (!ok) {
        onSessionVerifyFailed(msg);
      }
    });
  }

  function handlePlayBlocked(message) {
    var msg = message || getBlockMessage() || "未注册不能玩";
    if (joinError) joinError.textContent = msg;
    if (isIpBanMessage(msg)) {
      showIpBan(msg);
      return;
    }
    if (isSessionRevokedMessage(msg)) {
      forceSessionRevoked(msg, {
        clearToken: true,
        showOverlay: !sessionRevokedHandled,
      });
      return;
    }
    if (window.LobbyUI) {
      window.LobbyUI.openRoom();
      if (window.LobbyUI.shakeRoomBtn) window.LobbyUI.shakeRoomBtn();
    }
  }

  function isSessionRevokedMessage(msg) {
    return !!(msg && /封禁|踢下线|注销|登录已过期|请登录|请重新登录/i.test(msg));
  }

  function blockSession(message, opts) {
    opts = opts || {};
    saveSessionBlock(message || "会话已失效");
    if (opts.clearToken !== false) saveToken("");
    myUserId = null;
    myNickname = "";
    setLoggedInUI(false);
    stopSessionProbe();
  }

  function shouldRunSessionProbe() {
    if (sessionBlocked || ipBanActive) return false;
    if (!getToken()) return false;
    if (ready) return true;
    if (
      window.ActionScene &&
      window.ActionScene.isActive &&
      window.ActionScene.isActive()
    ) {
      return true;
    }
    return false;
  }

  function exitTutorialIfActive() {
    if (
      window.ActionScene &&
      window.ActionScene.isActive &&
      window.ActionScene.isActive()
    ) {
      window.ActionScene.exit();
    }
    if (window.ActionInventory && window.ActionInventory.close) {
      window.ActionInventory.close();
    }
    if (window.LockpickingQTE && window.LockpickingQTE.close) {
      window.LockpickingQTE.close();
    }
    if (window.WorldLootBox && window.WorldLootBox.closeChestPanel) {
      window.WorldLootBox.closeChestPanel();
    }
  }

  function forceSessionRevoked(message, opts) {
    opts = opts || {};
    const showOverlay =
      opts.showOverlay !== false && !sessionRevokedHandled;
    sessionRevokedHandled = true;

    if (opts.ipBan) {
      ipBanActive = true;
    }

    blockSession(message, opts);

    if (socket && socket.io) {
      socket.io.opts.reconnection = false;
    }
    if (opts.ipBan || opts.disconnect !== false) {
      if (socket) {
        socket.disconnect();
      }
      socketConnected = false;
    }

    onAuthFail(message, opts.clearToken !== false);
    showNotice(message, true);

    if (opts.ipBan) {
      setStatus("IP 已被封禁", false);
    }

    exitTutorialIfActive();
    if (showOverlay) {
      showSessionRevokedOverlay(message);
      if (window.LobbyUI && window.LobbyUI.openRoom) {
        window.LobbyUI.openRoom();
      }
    }
  }

  function probeSession() {
    if (!shouldRunSessionProbe()) {
      stopSessionProbe();
      return;
    }
    verifySessionHttp(function (ok, msg) {
      if (!ok) {
        onSessionVerifyFailed(msg);
      }
    });
  }

  function startSessionProbe() {
    stopSessionProbe();
    probeSession();
    sessionProbeTimer = setInterval(probeSession, SESSION_PROBE_MS);
  }

  function stopSessionProbe() {
    if (sessionProbeTimer) {
      clearInterval(sessionProbeTimer);
      sessionProbeTimer = null;
    }
  }

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function saveToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* ignore */ }
  }

  function saveNick(nickname) {
    try {
      if (nickname) localStorage.setItem(NICK_KEY, nickname);
    } catch (e) { /* ignore */ }
  }

  function setStatus(text, online) {
    netStatus.textContent = text;
    netStatus.classList.toggle("net-status--on", !!online);
    netStatus.classList.toggle("net-status--off", !online);
  }

  function showNotice(text, isError) {
    if (!friendNotice) return;
    friendNotice.hidden = !text;
    friendNotice.textContent = text || "";
    friendNotice.classList.toggle("friend-notice--error", !!isError);
    if (noticeTimer) clearTimeout(noticeTimer);
    if (text) {
      noticeTimer = setTimeout(function () {
        friendNotice.hidden = true;
      }, 4000);
    }
  }

  function setAuthMode(mode) {
    authMode = mode === "register" ? "register" : "login";
    if (authTabs) {
      authTabs.querySelectorAll(".auth-tabs__btn").forEach(function (btn) {
        btn.classList.toggle(
          "auth-tabs__btn--active",
          btn.getAttribute("data-auth-mode") === authMode
        );
      });
    }
    if (btnAuthSubmit) {
      btnAuthSubmit.textContent = authMode === "register" ? "注册" : "登录";
    }
    if (inputPassword) {
      inputPassword.autocomplete =
        authMode === "register" ? "new-password" : "current-password";
    }
  }

  function setLoggedInUI(on) {
    ready = on;
    if (inputName) inputName.disabled = on;
    if (inputPassword) inputPassword.disabled = on;
    if (btnAuthSubmit) {
      btnAuthSubmit.disabled = on;
      btnAuthSubmit.hidden = on;
    }
    if (btnLogout) btnLogout.hidden = !on;
    if (authTabs) authTabs.hidden = on;
    if (friendAddSection) friendAddSection.hidden = !on;
    if (friendPanel) friendPanel.hidden = false;
    if (accountMeta) {
      accountMeta.textContent = on ? "已登录 · " + myNickname : "未登录";
    }
    if (window.LobbyStash && window.LobbyStash.onPanelOpen) {
      window.LobbyStash.onPanelOpen();
    }
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function renderIncomingRequests() {
    if (!friendRequests) return;
    friendRequests.innerHTML = "";
    if (!incomingRequests.length) {
      const li = document.createElement("li");
      li.className = "friend-requests__empty";
      li.textContent = "暂无待处理申请";
      friendRequests.appendChild(li);
      return;
    }
    incomingRequests.forEach(function (req) {
      const li = document.createElement("li");
      li.className = "friend-requests__item";
      li.innerHTML =
        "<span class=\"friend-requests__name\">" +
        escapeHtml(req.nickname) +
        "</span>" +
        "<span class=\"friend-requests__actions\">" +
        "<button type=\"button\" class=\"friend-requests__btn friend-requests__btn--accept\" data-request-id=\"" +
        req.id +
        "\">同意</button>" +
        "<button type=\"button\" class=\"friend-requests__btn friend-requests__btn--decline\" data-request-id=\"" +
        req.id +
        "\">拒绝</button>" +
        "</span>";
      friendRequests.appendChild(li);
    });
  }

  function renderFriendList() {
    const n = friends.length;
    friendCount.textContent = n + " 位好友";
    friendList.innerHTML = "";

    if (!n) {
      const li = document.createElement("li");
      li.className = "friend-list__item friend-list__item--empty";
      li.innerHTML =
        "<span class=\"friend-list__dot friend-list__dot--empty\"></span>" +
        "<span class=\"friend-list__name\">搜索昵称添加好友</span>";
      friendList.appendChild(li);
      return;
    }

    friends.forEach(function (f) {
      const li = document.createElement("li");
      const isMe = f.id === myUserId;
      const online = !!f.online;
      li.className =
        "friend-list__item" +
        (online ? " friend-list__item--online" : " friend-list__item--offline");
      li.dataset.userId = String(f.id);
      li.innerHTML =
        "<span class=\"friend-list__dot" +
        (online ? "" : " friend-list__dot--empty") +
        "\" aria-hidden=\"true\"></span>" +
        "<span class=\"friend-list__name\">" +
        escapeHtml(f.nickname) +
        "</span>" +
        "<span class=\"friend-list__status\">" +
        (online ? "在线" : "离线") +
        "</span>" +
        (isMe ? "<span class=\"friend-list__tag\">你</span>" : "");
      friendList.appendChild(li);
    });
  }

  function applyFriendsPayload(data) {
    friends = data.friends || [];
    incomingRequests = data.incomingRequests || [];
    renderFriendList();
    renderIncomingRequests();
  }

  function updateFriendPresence(userId, online) {
    friends = friends.map(function (f) {
      if (f.id === userId) return Object.assign({}, f, { online: online });
      return f;
    });
    renderFriendList();
  }

  function onAuthOk(data) {
    sessionRevokedHandled = false;
    clearSessionBlock();
    ipBanActive = false;
    hideSessionRevokedOverlay();
    myUserId = data.user && data.user.id;
    myNickname = (data.user && data.user.nickname) || "";
    if (data.token) saveToken(data.token);
    if (myNickname) {
      saveNick(myNickname);
      if (inputName) inputName.value = myNickname;
    }
    setLoggedInUI(true);
    setStatus("已登录 · " + myNickname, true);
    joinError.textContent = "";
    applyFriendsPayload(data);
    if (data.message) {
      showNotice(data.message, false);
    }
    if (window.PlayerStatePersist && window.PlayerStatePersist.onAuthOk) {
      var isRegister = !!(data.message && data.message.indexOf("注册成功") !== -1);
      window.PlayerStatePersist.onAuthOk(data.playerState, { isRegister: isRegister });
    } else if (window.LobbyStash) {
      window.LobbyStash.onPanelOpen();
    }
    startSessionProbe();
  }

  function onAuthFail(message, clearToken) {
    if (clearToken) saveToken("");
    setLoggedInUI(false);
    joinError.textContent = message || "登录失败";
    setStatus(socketConnected ? "已连接 · 请登录" : "未连接服务器", false);
    friends = [];
    incomingRequests = [];
    renderFriendList();
    renderIncomingRequests();
  }

  function getClientDevice() {
    var ua = navigator.userAgent || "";
    if (
      /iPad/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    ) {
      return "tablet";
    }
    if (/iPhone|iPod/i.test(ua)) return "mobile";
    if (/Android|HarmonyOS|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
      return "mobile";
    }
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: none) and (pointer: coarse)").matches
    ) {
      var minSide = Math.min(window.screen.width || 0, window.screen.height || 0);
      return minSide >= 768 ? "tablet" : "mobile";
    }
    if (
      (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
      "ontouchstart" in window
    ) {
      var side = Math.min(window.screen.width || 0, window.screen.height || 0);
      if (side > 0 && side <= 1024) {
        return side >= 768 ? "tablet" : "mobile";
      }
    }
    return "desktop";
  }

  function isTouchClientDevice(device) {
    return device === "mobile" || device === "tablet";
  }

  function updateNicknameDeviceMark() {
    if (!nicknameDeviceMark) return;
    var device = getClientDevice();
    var show = isTouchClientDevice(device);
    nicknameDeviceMark.hidden = !show;
    nicknameDeviceMark.title =
      device === "tablet" ? "iPad / 平板客户端" : "手机客户端";
  }

  function isMobileDevice() {
    return isTouchClientDevice(getClientDevice());
  }

  function isIpBanMessage(msg) {
    return !!(msg && /IP.*封禁|封禁.*IP/i.test(msg));
  }

  function ipBanUserMessage(msg) {
    if (isIpBanMessage(msg)) {
      return "IP 已被封禁，无法连接服务器";
    }
    return msg;
  }

  function showIpBan(msg) {
    forceSessionRevoked(ipBanUserMessage(msg), {
      ipBan: true,
      clearToken: true,
    });
  }

  function connectionHelpText() {
    const host = window.location.host || "电脑IP:端口";
    const onLocalhost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);

    if (isMobileDevice()) {
      if (onLocalhost) {
        return "手机不能用 localhost。请在手机浏览器输入：http://电脑IP:端口（电脑先运行 ./run.sh，执行 ./get-ip.sh 查 IP，手机和电脑须同一 WiFi）";
      }
      return "无法连接 " + host + "。请确认：①电脑已运行 ./run.sh 且窗口未关 ②手机与电脑同一 WiFi ③地址为 http://" + host;
    }
    if (onLocalhost) {
      return "无法连接服务器。请先在终端运行 ./run.sh，浏览器打开 http://localhost:" + (window.location.port || "8080");
    }
    return "无法连接 " + host + "。请确认服务器已启动且网络正常";
  }

  function tryAuthSubmit() {
    if (ready) return;
    if (window.PlayerStatePersist && window.PlayerStatePersist.save) {
      window.PlayerStatePersist.save();
    }
    const nickname = inputName.value.trim();
    const password = inputPassword.value;
    if (!nickname) {
      joinError.textContent = "请先填写昵称";
      if (window.LobbyUI) {
        window.LobbyUI.openRoom();
        window.LobbyUI.shakeRoomBtn();
      }
      inputName.focus();
      return;
    }
    if (!password) {
      joinError.textContent = "请填写密码";
      inputPassword.focus();
      return;
    }
    joinError.textContent = "";
    btnAuthSubmit.disabled = true;
    const event = authMode === "register" ? "auth_register" : "auth_login";
    const payload = {
      nickname: nickname,
      password: password,
      clientDevice: getClientDevice(),
    };
    if (authWaitTimer) clearTimeout(authWaitTimer);
    authWaitTimer = setTimeout(function () {
      if (!ready && btnAuthSubmit && btnAuthSubmit.disabled) {
        btnAuthSubmit.disabled = false;
        joinError.textContent =
          "服务器无响应。请在终端关掉旧进程后重新运行 ./run.sh，再强制刷新页面（Cmd+Shift+R）";
        setStatus("已连接 · 服务器版本过旧？", false);
      }
    }, 12000);
    if (!socket || !socketConnected) {
      pendingAuth = { event: event, payload: payload };
      connectSocket();
      joinError.textContent = "正在连接服务器…";
      return;
    }
    socket.emit(event, payload);
  }

  function tryResume() {
    const token = getToken();
    if (!token || !socket || !socketConnected || ready) return;
    socket.emit("auth_resume", {
      token: token,
      clientDevice: getClientDevice(),
    });
  }

  function tryLogout() {
    stopSessionProbe();
    if (window.PlayerStatePersist && window.PlayerStatePersist.onAuthLogout) {
      window.PlayerStatePersist.onAuthLogout();
    }
    if (socket && socketConnected) {
      socket.emit("auth_logout");
    }
    saveToken("");
    myUserId = null;
    myNickname = "";
    onAuthFail("", false);
    setStatus(socketConnected ? "已连接 · 请登录" : "未连接服务器", false);
    showNotice("已退出登录", false);
  }

  function renderSearchResult(found) {
    lastSearchFound = found;
    if (!friendSearchResult) return;
    if (!found) {
      friendSearchResult.textContent = "未找到该昵称";
      friendSearchResult.className = "friend-search-result friend-search-result--miss";
      return;
    }
    if (found.isSelf) {
      friendSearchResult.textContent = "这是你自己的昵称";
      friendSearchResult.className = "friend-search-result friend-search-result--miss";
      return;
    }
    if (found.isFriend) {
      friendSearchResult.textContent =
        found.nickname + "（已是好友 · " + (found.online ? "在线" : "离线") + "）";
      friendSearchResult.className = "friend-search-result friend-search-result--ok";
      return;
    }
    friendSearchResult.textContent =
      "找到 " + found.nickname + "（" + (found.online ? "在线" : "离线") + "）";
    friendSearchResult.className = "friend-search-result friend-search-result--ok";
  }

  function tryFriendSearch() {
    if (!ready || !socket) return;
    const query = inputFriendSearch.value.trim();
    if (!query) {
      friendSearchResult.textContent = "";
      return;
    }
    socket.emit("friend_search", { query: query });
  }

  function tryFriendSend() {
    if (!ready || !socket) return;
    const nickname =
      (lastSearchFound && lastSearchFound.nickname) ||
      inputFriendSearch.value.trim();
    if (!nickname) {
      showNotice("请先搜索并选择要添加的昵称", true);
      return;
    }
    socket.emit("friend_request_send", { nickname: nickname });
  }

  function connectSocket() {
    if (typeof io === "undefined") {
      setStatus("连接失败", false);
      joinError.textContent =
        "联机组件未加载，请刷新页面；若仍失败，确认地址是 http://电脑IP:端口 而非打开本地文件";
      return;
    }

    if (socket) return;

    socket = io(window.location.origin, {
      transports: ["polling", "websocket"],
      timeout: 20000,
      reconnectionAttempts: 5,
    });

    socket.on("connect", function () {
      if (ipBanActive) return;
      socketConnected = true;
      if (pendingAuth) {
        const p = pendingAuth;
        pendingAuth = null;
        socket.emit(p.event, p.payload);
        setStatus("已连接 · 登录中…", false);
        return;
      }
      if (ready) {
        setStatus("已登录 · " + myNickname, true);
      } else {
        setStatus("已连接 · 登录中…", false);
        tryResume();
        if (!getToken()) {
          setStatus("已连接 · 请登录或注册", false);
        }
      }
      if (
        window.ActionScene &&
        window.ActionScene.isActive &&
        window.ActionScene.isActive()
      ) {
        startSessionProbe();
      } else if (ready) {
        startSessionProbe();
      }
    });

    socket.on("connect_error", function () {
      if (ipBanActive) return;
      socketConnected = false;
      setStatus("连接失败", false);
      joinError.textContent = connectionHelpText();
      if (btnAuthSubmit) btnAuthSubmit.disabled = false;
      setLoggedInUI(false);
    });

    socket.on("ip_banned", function (data) {
      if (authWaitTimer) clearTimeout(authWaitTimer);
      showIpBan((data && data.message) || "IP 已被封禁");
    });

    socket.on("connected", function () {
      if (ipBanActive) return;
      tryResume();
    });

    socket.on("auth_ok", function (data) {
      if (authWaitTimer) clearTimeout(authWaitTimer);
      if (btnAuthSubmit) btnAuthSubmit.disabled = false;
      onAuthOk(data);
    });

    socket.on("auth_error", function (data) {
      if (authWaitTimer) clearTimeout(authWaitTimer);
      if (btnAuthSubmit) btnAuthSubmit.disabled = false;
      const raw = (data && data.message) || "登录失败";
      if (isIpBanMessage(raw)) {
        if (playCheckCallback) finishPlayCheck(false, ipBanUserMessage(raw));
        showIpBan(raw);
        return;
      }
      if (isSessionRevokedMessage(raw) && (ready || getToken() || sessionBlocked)) {
        if (playCheckCallback) finishPlayCheck(false, raw);
        forceSessionRevoked(raw, { clearToken: true });
        return;
      }
      const msg = raw;
      const clear = /过期|请登录|请重新登录/.test(msg);
      onAuthFail(msg, clear);
    });

    socket.on("auth_kicked", function (data) {
      const msg = (data && data.message) || "账号在其他窗口登录";
      forceSessionRevoked(msg, { clearToken: true });
    });

    socket.on("session_ok", function () {
      finishPlayCheck(true, "");
    });

    socket.on("session_invalid", function (data) {
      const msg = (data && data.message) || "登录已失效";
      if (isIpBanMessage(msg)) {
        if (playCheckCallback) finishPlayCheck(false, ipBanUserMessage(msg));
        showIpBan(msg);
        return;
      }
      if (playCheckCallback) finishPlayCheck(false, msg);
      if (
        ready ||
        getToken() ||
        sessionBlocked ||
        (window.ActionScene &&
          window.ActionScene.isActive &&
          window.ActionScene.isActive())
      ) {
        forceSessionRevoked(msg, {
          clearToken: true,
          showOverlay: !sessionRevokedHandled,
        });
      } else {
        blockSession(msg, { clearToken: true });
        onAuthFail(msg, true);
      }
    });

    socket.on("friends_updated", function (data) {
      applyFriendsPayload(data);
    });

    socket.on("friend_presence", function (data) {
      if (!data) return;
      updateFriendPresence(data.userId, !!data.online);
    });

    socket.on("friend_search_result", function (data) {
      renderSearchResult(data && data.found);
    });

    socket.on("friend_notice", function (data) {
      const msg = (data && data.message) || "";
      showNotice(msg, false);
    });

    socket.on("friend_error", function (data) {
      const msg = (data && data.message) || "操作失败";
      showNotice(msg, true);
      joinError.textContent = msg;
    });

    socket.on("player_state_saved", function () {
      /* 云端存档成功，无需提示 */
    });

    socket.on("player_state_error", function (data) {
      var msg = (data && data.message) || "云端存档失败";
      console.warn("[LobbyNet]", msg);
    });

    socket.on("disconnect", function (reason) {
      socketConnected = false;
      const wasReady = ready;
      ready = false;
      if (btnAuthSubmit) btnAuthSubmit.disabled = false;
      const hint = reason === "io server disconnect" ? " · 服务器断开" : "";
      if (wasReady) {
        setStatus("连接断开" + hint + " · 重连中…", false);
      } else {
        setStatus("未连接" + hint, false);
      }
    });
  }

  if (authTabs) {
    authTabs.addEventListener("click", function (e) {
      const btn = e.target.closest(".auth-tabs__btn");
      if (!btn || ready) return;
      setAuthMode(btn.getAttribute("data-auth-mode"));
    });
  }

  if (btnAuthSubmit) {
    btnAuthSubmit.addEventListener("click", tryAuthSubmit);
  }
  if (btnLogout) {
    btnLogout.addEventListener("click", tryLogout);
  }
  if (inputPassword) {
    inputPassword.addEventListener("keydown", function (e) {
      if (e.key === "Enter") tryAuthSubmit();
    });
  }
  if (inputName) {
    inputName.addEventListener("keydown", function (e) {
      if (e.key === "Enter") tryAuthSubmit();
    });
  }
  if (btnFriendSearch) {
    btnFriendSearch.addEventListener("click", tryFriendSearch);
  }
  if (btnFriendSend) {
    btnFriendSend.addEventListener("click", tryFriendSend);
  }
  if (inputFriendSearch) {
    inputFriendSearch.addEventListener("keydown", function (e) {
      if (e.key === "Enter") tryFriendSearch();
    });
    inputFriendSearch.addEventListener("input", function () {
      lastSearchFound = null;
      if (friendSearchResult) friendSearchResult.textContent = "";
    });
  }

  if (friendRequests) {
    friendRequests.addEventListener("click", function (e) {
      const btn = e.target.closest(".friend-requests__btn");
      if (!btn || !socket || !ready) return;
      const id = parseInt(btn.getAttribute("data-request-id"), 10);
      if (!id) return;
      if (btn.classList.contains("friend-requests__btn--accept")) {
        socket.emit("friend_request_accept", { requestId: id });
      } else {
        socket.emit("friend_request_decline", { requestId: id });
      }
    });
  }

  window.LobbyNet = {
    isReady: function () {
      return ready;
    },
    canPlay: canPlay,
    getBlockMessage: getBlockMessage,
    assertCanPlay: assertCanPlay,
    handlePlayBlocked: handlePlayBlocked,
    savePlayerState: function (state) {
      if (socket && ready && state) {
        socket.emit("player_state_save", { state: state });
      }
    },
    sendStashUpdate: function () {
      /* 旧版逐格同步已弃用，改用 player_state_save */
    },
    shakeJoin: function () {
      if (window.LobbyUI) {
        window.LobbyUI.openRoom();
        window.LobbyUI.shakeRoomBtn();
      }
    },
    startSessionProbe: startSessionProbe,
    stopSessionProbe: stopSessionProbe,
    getClientDevice: getClientDevice,
    isMobileDevice: isMobileDevice,
  };

  if (sessionRevokedBtn) {
    sessionRevokedBtn.addEventListener("click", function () {
      hideSessionRevokedOverlay();
      if (window.LobbyUI) {
        window.LobbyUI.goHome();
        window.LobbyUI.openRoom();
      }
    });
  }

  try {
    const savedNick = localStorage.getItem(NICK_KEY);
    if (savedNick && inputName) inputName.value = savedNick;
  } catch (e) { /* ignore */ }

  loadSessionBlockFromStorage();
  setAuthMode("login");
  setLoggedInUI(false);
  updateNicknameDeviceMark();
  renderFriendList();
  renderIncomingRequests();
  setStatus("连接中…", false);
  connectSocket();

  if (isMobileDevice() && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)) {
    joinError.textContent =
      "当前地址是 localhost，手机无法使用。请用电脑 ./get-ip.sh 查 IP，在手机打开 http://电脑IP:端口";
  }
})();
