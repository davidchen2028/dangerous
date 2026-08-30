/**
 * 后室在线状态：复用大厅账号 token，让关卡游玩时间计入在线时长。
 * 无账号或网络不可用时静默退出，不影响单机游玩。
 */
const TOKEN_KEY = "jiwei_token";
const SOCKET_SRC = "js/socket.io.min.js?v=4";

let socket = null;
let loading = null;

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch (err) {
    return "";
  }
}

function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (err) {
    /* ignore */
  }
}

function clientDevice() {
  var ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ? "mobile" : "desktop";
}

function loadSocketClient() {
  if (typeof window.io === "function") return Promise.resolve();
  if (loading) return loading;
  loading = new Promise(function (resolve, reject) {
    var script = document.createElement("script");
    script.src = SOCKET_SRC;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return loading;
}

function stop(clearSession) {
  if (clearSession) clearToken();
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

function connect() {
  var token = readToken();
  if (!token) return;
  loadSocketClient()
    .then(function () {
      if (typeof window.io !== "function" || socket) return;
      socket = window.io(window.location.origin, {
        transports: ["polling", "websocket"],
        timeout: 25000,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 800,
        reconnectionDelayMax: 10000,
      });
      socket.on("connect", function () {
        var currentToken = readToken();
        if (!currentToken) {
          stop(false);
          return;
        }
        socket.emit("auth_resume", {
          token: currentToken,
          clientDevice: clientDevice(),
          scope: "backrooms",
          page: window.location.pathname,
        });
      });
      socket.on("auth_error", function (data) {
        var message = data && data.message ? String(data.message) : "";
        if (/过期|登录|封禁|注销/.test(message)) stop(true);
      });
      socket.on("auth_kicked", function () {
        // 同浏览器关卡跳转/新标签会共享 token；旧连接只停用，不清掉新页仍需使用的 token。
        stop(false);
      });
      socket.on("ip_banned", function () {
        stop(true);
      });
    })
    .catch(function () {
      /* 在线统计不可用不应阻断后室单机游玩。 */
    });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  connect();
  window.BackroomsPresence = {
    reconnect: connect,
    disconnect: function () {
      stop(false);
    },
  };
}
