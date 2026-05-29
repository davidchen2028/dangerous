/**
 * 联机大厅 — 账号登录、好友
 */
(function () {
  const TOKEN_KEY = "jiwei_token";
  const NICK_KEY = "jiwei_nick";

  const btnAuthSubmit = document.getElementById("btnAuthSubmit");
  const btnLogout = document.getElementById("btnLogout");
  const authTabs = document.getElementById("authTabs");
  const inputName = document.getElementById("inputNickname");
  const inputPassword = document.getElementById("inputPassword");
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
    if (window.LobbyStash) {
      window.LobbyStash.onPanelOpen();
    }
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

  function isMobileDevice() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
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
    return "无法连接 " + host + "。请确认电脑已运行 ./run.sh，且防火墙未拦截该端口";
  }

  function tryAuthSubmit() {
    if (ready) return;
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
    const payload = { nickname: nickname, password: password };
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
    socket.emit("auth_resume", { token: token });
  }

  function tryLogout() {
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
    });

    socket.on("connect_error", function () {
      socketConnected = false;
      setStatus("连接失败", false);
      joinError.textContent = connectionHelpText();
      if (btnAuthSubmit) btnAuthSubmit.disabled = false;
      setLoggedInUI(false);
    });

    socket.on("connected", function () {
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
      const msg = (data && data.message) || "登录失败";
      const clear = /过期|请登录/.test(msg);
      onAuthFail(msg, clear);
    });

    socket.on("auth_kicked", function (data) {
      saveToken("");
      const msg = (data && data.message) || "账号在其他窗口登录";
      onAuthFail(msg, true);
      showNotice(msg, true);
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
    sendStashUpdate: function (index, item) {
      if (socket && ready) {
        socket.emit("stash_update", { index: index, item: item });
      }
    },
    shakeJoin: function () {
      if (window.LobbyUI) {
        window.LobbyUI.openRoom();
        window.LobbyUI.shakeRoomBtn();
      }
    },
  };

  try {
    const savedNick = localStorage.getItem(NICK_KEY);
    if (savedNick && inputName) inputName.value = savedNick;
  } catch (e) { /* ignore */ }

  setAuthMode("login");
  setLoggedInUI(false);
  renderFriendList();
  renderIncomingRequests();
  setStatus("连接中…", false);
  connectSocket();

  if (isMobileDevice() && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)) {
    joinError.textContent =
      "当前地址是 localhost，手机无法使用。请用电脑 ./get-ip.sh 查 IP，在手机打开 http://电脑IP:端口";
  }
})();
