/**
 * 手机横屏守卫（普通脚本，微信内置浏览器可用）。
 * 不用 orientation 媒体查询：微信会谎报横屏。
 */
(function () {
  var STYLE_ID = "mobileLandscapeGuardStyle";
  var GUARD_ID = "mobileLandscapeGuard";

  function ua() {
    return (typeof navigator !== "undefined" && navigator.userAgent) || "";
  }

  function isWeChatBrowser() {
    return /MicroMessenger|wxwork|miniProgram/i.test(ua());
  }

  function isHandheldContext() {
    var text = ua();
    if (isWeChatBrowser()) return true;
    if (/iPad/i.test(text)) return true;
    if (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) {
      return true;
    }
    if (/iPhone|iPod|Android|HarmonyOS|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(text)) {
      return true;
    }
    if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 1) {
      var shortest = Math.min(screen.width || 0, screen.height || 0);
      if (shortest && shortest <= 920) return true;
    }
    return false;
  }

  function isPortraitViewport(width, height) {
    var w = Number(width);
    var h = Number(height);
    return isFinite(w) && isFinite(h) && h > w;
  }

  function viewportSize() {
    var view = typeof window !== "undefined" ? window.visualViewport : null;
    var w = (view && view.width) || window.innerWidth || document.documentElement.clientWidth || 0;
    var h = (view && view.height) || window.innerHeight || document.documentElement.clientHeight || 0;
    return { w: w, h: h };
  }

  function isPortraitNow() {
    var size = viewportSize();
    if (size.w > 0 && size.h > 0) return isPortraitViewport(size.w, size.h);
    return false;
  }

  function markHtml() {
    if (!document.documentElement) return;
    document.documentElement.classList.toggle("force-landscape", isHandheldContext());
    document.documentElement.classList.toggle("portrait-like", isHandheldContext() && isPortraitNow());
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      ".mobile-landscape-guard{position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;padding:24px;box-sizing:border-box;background:#06090c;color:#eef6fb;text-align:center;font:500 15px/1.45 system-ui,sans-serif;touch-action:none}" +
      "html.force-landscape.portrait-like .mobile-landscape-guard,html.force-landscape.portrait-like .mobile-landscape-guard[hidden]{display:flex!important}" +
      "body.mobile-portrait-blocked{overflow:hidden!important}";
    document.head.appendChild(style);
  }

  function ensureGuard() {
    var guard = document.getElementById(GUARD_ID);
    if (guard) return guard;
    guard = document.createElement("div");
    guard.id = GUARD_ID;
    guard.className = "mobile-landscape-guard";
    guard.setAttribute("role", "dialog");
    guard.setAttribute("aria-modal", "true");
    guard.setAttribute("aria-label", "请横屏游玩");
    guard.innerHTML =
      '<span class="mobile-landscape-guard__icon" aria-hidden="true">↻</span>' +
      "<strong>请将手机横过来</strong>" +
      "<span>微信内请先把手机横置，再继续游戏</span>" +
      '<button type="button">我已横屏</button>';
    document.body.appendChild(guard);
    return guard;
  }

  function syncOrientation() {
    if (!isHandheldContext()) return;
    markHtml();
    var guard = document.getElementById(GUARD_ID);
    if (!guard) return;
    var blocked = isPortraitNow();
    guard.hidden = !blocked;
    document.body.classList.toggle("mobile-portrait-blocked", blocked);
  }

  function requestLandscape() {
    var done = function () {
      syncOrientation();
    };
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(function () {});
      }
    } catch (_err) {}
    try {
      if (screen.orientation && typeof screen.orientation.lock === "function") {
        screen.orientation.lock("landscape").then(done).catch(done);
        return;
      }
    } catch (_err2) {}
    done();
  }

  function installMobileLandscapeGuard() {
    if (!isHandheldContext() || !document.body) return;
    ensureStyles();
    var guard = ensureGuard();
    var button = guard.querySelector("button");
    if (button && !button.getAttribute("data-bound")) {
      button.setAttribute("data-bound", "1");
      button.addEventListener("click", requestLandscape);
    }
    window.addEventListener("resize", syncOrientation);
    window.addEventListener("orientationchange", syncOrientation);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", syncOrientation);
    }
    if (screen.orientation && typeof screen.orientation.addEventListener === "function") {
      screen.orientation.addEventListener("change", syncOrientation);
    }
    syncOrientation();
  }

  var api = {
    isPortraitViewport: isPortraitViewport,
    isWeChatBrowser: isWeChatBrowser,
    isHandheldContext: isHandheldContext,
    isPortraitNow: isPortraitNow,
    installMobileLandscapeGuard: installMobileLandscapeGuard,
  };

  if (typeof window !== "undefined") {
    window.MobileLandscapeGuard = api;
    markHtml();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", installMobileLandscapeGuard, { once: true });
    } else {
      installMobileLandscapeGuard();
    }
  }
})();
