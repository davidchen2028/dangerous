/**
 * 联机大厅 — 打开即见背景，左上角房间栏，左下角仓库
 */
(function () {
  const MAX_PLAYERS = 3;

  const btnJoin = document.getElementById("btnJoin");
  const inputName = document.getElementById("inputNickname");
  const inputRoom = document.getElementById("inputRoom");
  const joinError = document.getElementById("joinError");
  const netStatus = document.getElementById("netStatus");
  const friendPanel = document.getElementById("friendPanel");
  const friendList = document.getElementById("friendList");
  const friendCount = document.getElementById("friendCount");
  const chatPanel = document.getElementById("chatPanel");
  const chatLog = document.getElementById("chatLog");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");

  let socket = null;
  let myId = null;
  let ready = false;
  let currentRoom = "main";

  function setOnlineUI(on) {
    chatPanel.classList.toggle("ui-hidden", !on);
    inputName.disabled = on;
    inputRoom.disabled = on;
    btnJoin.textContent = on ? "已连接" : "进入";
    btnJoin.disabled = on;
    if (window.LobbyStash && window.LobbyStash.onPanelOpen) {
      window.LobbyStash.onPanelOpen();
    }
  }

  function setStatus(text, online) {
    netStatus.textContent = text;
    netStatus.classList.toggle("net-status--on", !!online);
    netStatus.classList.toggle("net-status--off", !online);
  }

  function renderFriendList(players, maxPlayers) {
    const max = maxPlayers || MAX_PLAYERS;
    const list = players || [];
    const n = list.length;

    friendCount.textContent = n + " / " + max;
    friendList.innerHTML = "";

    list.forEach(function (p) {
      const li = document.createElement("li");
      const isMe = p.id === myId;
      li.className = "friend-list__item friend-list__item--online" +
        (isMe ? " friend-list__item--me" : "");
      li.innerHTML =
        "<span class=\"friend-list__dot\" aria-hidden=\"true\"></span>" +
        "<span class=\"friend-list__name\">" + escapeHtml(p.name) + "</span>" +
        (isMe ? "<span class=\"friend-list__tag\">你</span>" : "");
      friendList.appendChild(li);
    });

    for (let i = n; i < max; i++) {
      const li = document.createElement("li");
      li.className = "friend-list__item friend-list__item--empty";
      li.innerHTML =
        "<span class=\"friend-list__dot friend-list__dot--empty\"></span>" +
        "<span class=\"friend-list__name\">空位</span>";
      friendList.appendChild(li);
    }
  }

  function appendChat(from, text) {
    const line = document.createElement("div");
    line.className = "chat-log__line";
    line.innerHTML =
      "<span class=\"chat-log__from\">" + escapeHtml(from) + "</span>" +
      "<span class=\"chat-log__text\">" + escapeHtml(text) + "</span>";
    chatLog.appendChild(line);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function appendSystem(text) {
    const line = document.createElement("div");
    line.className = "chat-log__line chat-log__line--system";
    line.textContent = text;
    chatLog.appendChild(line);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function onRoomUpdate(data) {
    if (data.room) {
      currentRoom = data.room;
      inputRoom.value = currentRoom;
    }
    renderFriendList(data.players, data.maxPlayers);
  }

  function tryJoin() {
    if (ready) return;
    const name = inputName.value.trim();
    const room = inputRoom.value.trim() || "main";
    if (!name) {
      joinError.textContent = "请先填写昵称";
      if (window.LobbyUI) {
        window.LobbyUI.openRoom();
        window.LobbyUI.shakeRoomBtn();
      }
      inputName.focus();
      return;
    }
    connectAndJoin(name, room);
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
      return "无法连接 " + host + "。请确认：①电脑已运行 ./run.sh 且窗口未关 ②手机与电脑同一 WiFi ③地址为 http://" + host + " ④Mac 防火墙允许 Python 入站";
    }
    if (onLocalhost) {
      return "无法连接服务器。请先在终端运行 ./run.sh，浏览器打开 http://localhost:" + (window.location.port || "8080");
    }
    return "无法连接 " + host + "。请确认电脑已运行 ./run.sh，且防火墙未拦截该端口";
  }

  function connectAndJoin(nickname, room) {
    setStatus("连接中…", false);
    joinError.textContent = "";
    btnJoin.disabled = true;
    btnJoin.textContent = "连接中…";

    if (typeof io === "undefined") {
      setStatus("连接失败", false);
      joinError.textContent = "联机组件未加载，请刷新页面；若仍失败，确认地址是 http://电脑IP:端口 而非打开本地文件";
      btnJoin.disabled = false;
      btnJoin.textContent = "进入";
      return;
    }

    if (socket) {
      socket.disconnect();
      socket = null;
    }

    socket = io(window.location.origin, {
      transports: ["polling", "websocket"],
      timeout: 20000,
      reconnectionAttempts: 3,
    });

    socket.on("connect", function () {
      setStatus("正在进入房间…", false);
      socket.emit("join", { nickname: nickname, room: room || "main" });
    });

    socket.on("connect_error", function () {
      setStatus("连接失败", false);
      joinError.textContent = connectionHelpText();
      btnJoin.disabled = false;
      btnJoin.textContent = "进入";
      setOnlineUI(false);
    });

    socket.on("join_error", function (data) {
      joinError.textContent = data.message || "进入失败";
      setStatus("未连接", false);
      btnJoin.disabled = false;
      btnJoin.textContent = "进入";
      setOnlineUI(false);
    });

    socket.on("lobby_joined", function (data) {
      ready = true;
      myId = data.player.id;
      currentRoom = data.room || room;
      inputRoom.value = currentRoom;
      setStatus("已联机 · 房间 " + currentRoom, true);
      setOnlineUI(true);
      onRoomUpdate(data);
      appendSystem("你已进入房间「" + currentRoom + "」");
      if (window.LobbyStash && data.stash) {
        window.LobbyStash.applyFullStash(data.stash);
      }
      try {
        localStorage.setItem("jiwei_nick", nickname);
        localStorage.setItem("jiwei_room", currentRoom);
      } catch (e) { /* ignore */ }
    });

    socket.on("players_updated", function (data) {
      onRoomUpdate(data);
    });

    socket.on("friend_joined", function (data) {
      onRoomUpdate(data);
      if (data.name) appendSystem(data.name + " 加入了房间");
    });

    socket.on("friend_left", function (data) {
      onRoomUpdate(data);
      if (data.name) appendSystem(data.name + " 离开了房间");
    });

    socket.on("chat_message", function (data) {
      appendChat(data.from, data.text);
    });

    socket.on("disconnect", function (reason) {
      ready = false;
      const hint = reason === "io server disconnect" ? " · 服务器断开" : "";
      setStatus("已断开" + hint + " · 点进入重连", false);
      btnJoin.disabled = false;
      btnJoin.textContent = "进入";
      setOnlineUI(false);
      renderFriendList([], MAX_PLAYERS);
    });
  }

  btnJoin.addEventListener("click", tryJoin);
  inputRoom.addEventListener("keydown", function (e) {
    if (e.key === "Enter") tryJoin();
  });
  inputName.addEventListener("keydown", function (e) {
    if (e.key === "Enter") tryJoin();
  });

  chatForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!ready || !socket) return;
    const text = chatInput.value.trim();
    if (!text) return;
    socket.emit("chat", { text: text });
    appendChat("我", text);
    chatInput.value = "";
  });

  window.LobbyNet = {
    isReady: function () { return ready; },
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
    const savedNick = localStorage.getItem("jiwei_nick");
    const savedRoom = localStorage.getItem("jiwei_room");
    if (savedNick) inputName.value = savedNick;
    if (savedRoom) inputRoom.value = savedRoom;
  } catch (e) { /* ignore */ }

  setStatus("未连接 · 点进入加入房间", false);
  setOnlineUI(false);
  renderFriendList([], MAX_PLAYERS);

  if (isMobileDevice() && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)) {
    joinError.textContent =
      "当前地址是 localhost，手机无法使用。请用电脑 ./get-ip.sh 查 IP，在手机打开 http://电脑IP:端口";
  }
})();
