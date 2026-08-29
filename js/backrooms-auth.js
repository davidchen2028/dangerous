(function (global) {
  "use strict";

  var TOKEN_KEY = "jiwei_token";
  var NICK_KEY = "jiwei_nick";

  function readLocal(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch (err) {
      return "";
    }
  }

  function writeSession(token, nickname) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(NICK_KEY, nickname);
      localStorage.removeItem("jiwei_session_block");
    } catch (err) {
      /* 页面仍可用本次登录结果继续进入 */
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (err) {
      /* ignore */
    }
  }

  function verifyToken() {
    var token = readLocal(TOKEN_KEY);
    if (!token) return Promise.resolve(false);
    return fetch("/api/session/verify?token=" + encodeURIComponent(token), {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(function (response) {
        if (!response.ok) clearSession();
        return response.ok;
      })
      .catch(function () {
        return false;
      });
  }

  function submit(mode, nickname, password) {
    return fetch("/api/backrooms/auth", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: mode,
        nickname: nickname,
        password: password,
      }),
    }).then(function (response) {
      return response
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          if (!response.ok || !data.ok) {
            throw new Error(data.message || "登录失败，请稍后重试");
          }
          writeSession(data.token, data.user.nickname);
          return data;
        });
    });
  }

  function mount(options) {
    options = options || {};
    var start = document.getElementById(options.startId || "brHomeStart");
    var dialog = document.getElementById("brAuthDialog");
    var form = document.getElementById("brAuthForm");
    var nickname = document.getElementById("brAuthNickname");
    var password = document.getElementById("brAuthPassword");
    var error = document.getElementById("brAuthError");
    var submitButton = document.getElementById("brAuthSubmit");
    var tabs = dialog ? dialog.querySelectorAll("[data-auth-mode]") : [];
    var mode = "login";
    var onAuthorized = options.onAuthorized || function () {};

    if (!start || !dialog || !form) return null;

    function setError(message) {
      if (error) error.textContent = message || "";
    }

    function setMode(nextMode) {
      mode = nextMode === "register" ? "register" : "login";
      Array.prototype.forEach.call(tabs, function (tab) {
        var active = tab.getAttribute("data-auth-mode") === mode;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
      });
      if (submitButton) {
        submitButton.textContent = mode === "register" ? "注册并进入" : "登录并进入";
      }
      setError("");
    }

    function open() {
      if (nickname) nickname.value = readLocal(NICK_KEY);
      if (password) password.value = "";
      dialog.hidden = false;
      document.body.classList.add("br-auth-open");
      setError("");
      global.setTimeout(function () {
        if (nickname && !nickname.value) nickname.focus();
        else if (password) password.focus();
      }, 0);
    }

    function close() {
      dialog.hidden = true;
      document.body.classList.remove("br-auth-open");
      setError("");
    }

    Array.prototype.forEach.call(tabs, function (tab) {
      tab.addEventListener("click", function () {
        setMode(tab.getAttribute("data-auth-mode"));
      });
    });

    dialog.addEventListener("click", function (event) {
      if (event.target.closest("[data-auth-close]")) close();
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var nameValue = nickname ? nickname.value.trim() : "";
      var passwordValue = password ? password.value : "";
      if (!nameValue) {
        setError("请填写昵称");
        if (nickname) nickname.focus();
        return;
      }
      if (!passwordValue) {
        setError("请填写密码");
        if (password) password.focus();
        return;
      }
      if (submitButton) submitButton.disabled = true;
      setError("正在连接服务器…");
      submit(mode, nameValue, passwordValue)
        .then(function () {
          close();
          onAuthorized();
        })
        .catch(function (err) {
          setError(err && err.message ? err.message : "登录失败");
        })
        .then(function () {
          if (submitButton) submitButton.disabled = false;
        });
    });

    setMode("login");
    return {
      authorize: function () {
        return verifyToken().then(function (valid) {
          if (valid) {
            onAuthorized();
            return true;
          }
          open();
          return false;
        });
      },
      open: open,
      close: close,
    };
  }

  global.BackroomsAuth = {
    mount: mount,
    verifyToken: verifyToken,
  };
})(window);
