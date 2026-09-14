/**
 * 手机禁止 + iPad 微信跳出 + 平板横屏守卫（普通脚本，微信可用）。
 * 手机：一律暂不支持。
 * iPad 微信：提示到 Safari 打开（iOS 不能程序化跳转）。
 * 安卓平板微信：尝试 intent 打开系统浏览器。
 * 系统浏览器里的平板：只要求横屏。
 */
(function () {
  var STYLE_ID = "mobileLandscapeGuardStyle";
  var GUARD_ID = "mobileLandscapeGuard";
  var PHONE_ID = "phoneUnsupportedGate";
  var TABLET_BROWSER_ID = "tabletBrowserGate";

  function ua() {
    return (typeof navigator !== "undefined" && navigator.userAgent) || "";
  }

  function classifyClientDevice(opts) {
    var text = String((opts && opts.ua) || "");
    var platform = String((opts && opts.platform) || "");
    var maxTouch = Number((opts && opts.maxTouchPoints) || 0);
    var minSide = Number((opts && opts.minScreenSide) || 0);
    var ipad =
      /iPad/i.test(text) ||
      (platform === "MacIntel" && maxTouch > 1 && !/iPhone|iPod/i.test(text));
    if (ipad) return "tablet";
    if (/iPhone|iPod/i.test(text)) return "mobile";
    if (/Android|HarmonyOS/i.test(text)) {
      if (minSide >= 768) return "tablet";
      if (/Mobile/i.test(text)) return "mobile";
      return "tablet";
    }
    if (/Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(text)) return "mobile";
    if (minSide > 0 && minSide < 768 && maxTouch > 0) return "mobile";
    if (minSide >= 768 && maxTouch > 1) return "tablet";
    return "desktop";
  }

  function isWeChatBrowser(text) {
    return /MicroMessenger|wxwork|miniProgram/i.test(String(text || ua()));
  }

  function deviceOpts() {
    return {
      ua: ua(),
      platform: typeof navigator !== "undefined" ? navigator.platform : "",
      maxTouchPoints: typeof navigator !== "undefined" ? navigator.maxTouchPoints || 0 : 0,
      minScreenSide: Math.min(screen.width || 0, screen.height || 0),
    };
  }

  function canAutoOpenSystemBrowser(text, opts) {
    var value = String(text || ua());
    if (!isWeChatBrowser(value) || !/Android|HarmonyOS/i.test(value)) return false;
    return classifyClientDevice(Object.assign(deviceOpts(), opts || {}, { ua: value })) === "tablet";
  }

  function systemBrowserIntentUrl(href) {
    var url;
    try {
      url = new URL(String(href || ""), location.href);
    } catch (_err) {
      return "";
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    var path = url.pathname + url.search + url.hash || "/";
    return (
      "intent://" +
      url.host +
      path +
      "#Intent;scheme=" +
      url.protocol.replace(":", "") +
      ";action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=" +
      encodeURIComponent(url.href) +
      ";end"
    );
  }

  function openInSystemBrowser() {
    if (!isTabletDevice() || !isWeChatBrowser()) return false;
    if (!canAutoOpenSystemBrowser()) return false;
    var intent = systemBrowserIntentUrl(location.href);
    if (!intent) return false;
    location.href = intent;
    return true;
  }

  function alreadyTriedBrowserJump() {
    try {
      return sessionStorage.getItem("jiwei_browser_jump") === "1";
    } catch (_err) {
      return false;
    }
  }

  function markTriedBrowserJump() {
    try {
      sessionStorage.setItem("jiwei_browser_jump", "1");
    } catch (_err) {}
  }

  function currentKind() {
    return classifyClientDevice(deviceOpts());
  }

  function isPhoneDevice() {
    return currentKind() === "mobile";
  }

  function isTabletDevice() {
    return currentKind() === "tablet";
  }

  function shouldOpenTabletBrowser() {
    return isTabletDevice() && isWeChatBrowser();
  }

  function shouldForceLandscape() {
    return isTabletDevice() && !isWeChatBrowser();
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
    var phone = isPhoneDevice();
    var openBrowser = shouldOpenTabletBrowser();
    var landscape = shouldForceLandscape();
    document.documentElement.classList.toggle("phone-unsupported", phone);
    document.documentElement.classList.toggle("tablet-open-browser", openBrowser);
    document.documentElement.classList.toggle("force-landscape", landscape);
    document.documentElement.classList.toggle("portrait-like", landscape && isPortraitNow());
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      ".mobile-device-gate,.mobile-landscape-guard{position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;padding:24px;box-sizing:border-box;background:#06090c;color:#eef6fb;text-align:center;font:500 15px/1.45 system-ui,sans-serif;touch-action:none;pointer-events:auto}" +
      ".mobile-device-gate ol{margin:0;padding:0 0 0 1.3em;text-align:left;max-width:22em}" +
      ".mobile-device-gate button,.mobile-landscape-guard button{min-width:150px;min-height:46px;margin-top:8px;border:1px solid rgba(220,235,248,.55);border-radius:8px;background:rgba(34,49,59,.94);color:inherit;font:600 15px/1 system-ui,sans-serif}" +
      "html.phone-unsupported .phone-device-gate,html.phone-unsupported .phone-device-gate[hidden]{display:flex!important}" +
      "html.tablet-open-browser .tablet-browser-gate,html.tablet-open-browser .tablet-browser-gate[hidden]{display:flex!important}" +
      "html.phone-unsupported .mobile-landscape-guard,html.phone-unsupported .mobile-landscape-guard[hidden],html.tablet-open-browser .mobile-landscape-guard,html.tablet-open-browser .mobile-landscape-guard[hidden]{display:none!important}" +
      "html.force-landscape.portrait-like .mobile-landscape-guard,html.force-landscape.portrait-like .mobile-landscape-guard[hidden]{display:flex!important}" +
      "body.mobile-portrait-blocked,body.phone-unsupported-blocked,body.tablet-browser-blocked{overflow:hidden!important}" +
      "body.tablet-browser-blocked>:not(.tablet-browser-gate){pointer-events:none!important}";
    document.head.appendChild(style);
  }

  function ensurePhoneGate() {
    var gate = document.getElementById(PHONE_ID);
    if (gate) return gate;
    gate = document.createElement("div");
    gate.id = PHONE_ID;
    gate.className = "mobile-device-gate phone-device-gate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-label", "手机暂不支持");
    gate.innerHTML =
      "<strong>暂不支持手机</strong>" +
      "<span>大厅按钮过密，屏幕键盘也会挡住昵称和密码输入。</span>" +
      "<span>请使用电脑或 iPad 横屏游玩。</span>";
    document.body.appendChild(gate);
    return gate;
  }

  function tabletBrowserGateHtml() {
    var steps =
      "<ol>" +
      "<li>点屏幕右上角 <b>···</b></li>" +
      "<li>选「在 Safari 中打开」</li>" +
      "<li>或把链接粘贴到 Chrome 等任意浏览器</li>" +
      "</ol>";
    if (canAutoOpenSystemBrowser()) {
      return (
        "<strong>请用浏览器打开</strong>" +
        "<span>微信内不能游玩。正在尝试打开系统浏览器；没跳转就按下面步骤。</span>" +
        steps +
        '<button type="button" data-copy-link="1">复制本页链接</button>' +
        '<button type="button" data-open-browser="1">打开浏览器</button>'
      );
    }
    return (
      "<strong>请用浏览器打开</strong>" +
      "<span>iPad 微信内不能游玩，必须换到 Safari、Chrome 等任意浏览器。</span>" +
      steps +
      '<button type="button" data-copy-link="1">复制本页链接</button>'
    );
  }

  function fillTabletBrowserGate(gate) {
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-label", "请用浏览器打开");
    gate.innerHTML = tabletBrowserGateHtml();
  }

  function ensureTabletBrowserGate() {
    var gate = document.getElementById(TABLET_BROWSER_ID);
    if (!gate) {
      gate = document.createElement("div");
      gate.id = TABLET_BROWSER_ID;
      gate.className = "mobile-device-gate tablet-browser-gate";
      document.body.appendChild(gate);
    }
    fillTabletBrowserGate(gate);
    return gate;
  }

  function copyPageLink() {
    var href = location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(href);
    }
    return new Promise(function (resolve, reject) {
      var input = document.createElement("input");
      input.value = href;
      document.body.appendChild(input);
      input.select();
      try {
        if (document.execCommand("copy")) resolve();
        else reject(new Error("copy failed"));
      } catch (err) {
        reject(err);
      } finally {
        document.body.removeChild(input);
      }
    });
  }

  function bindTabletBrowserGate(gate) {
    var copyBtn = gate.querySelector("[data-copy-link]");
    if (copyBtn && !copyBtn.getAttribute("data-bound")) {
      copyBtn.setAttribute("data-bound", "1");
      copyBtn.addEventListener("click", function () {
        copyPageLink().then(
          function () {
            copyBtn.textContent = "已复制，去浏览器打开";
          },
          function () {
            copyBtn.textContent = "复制失败，请用右上角 ···";
          }
        );
      });
    }
    var openBtn = gate.querySelector("[data-open-browser]");
    if (openBtn && !openBtn.getAttribute("data-bound")) {
      openBtn.setAttribute("data-bound", "1");
      openBtn.addEventListener("click", function () {
        if (!openInSystemBrowser()) {
          openBtn.textContent = "请按上面步骤打开";
        }
      });
    }
  }

  function ensureGuard() {
    var guard = document.getElementById(GUARD_ID);
    if (guard) return guard;
    guard = document.createElement("div");
    guard.id = GUARD_ID;
    guard.className = "mobile-landscape-guard";
    guard.hidden = true;
    guard.setAttribute("role", "dialog");
    guard.setAttribute("aria-modal", "true");
    guard.setAttribute("aria-label", "请横屏游玩");
    guard.innerHTML =
      '<span class="mobile-landscape-guard__icon" aria-hidden="true">↻</span>' +
      "<strong>请将平板横过来</strong>" +
      "<span>iPad 请使用横屏，以免键盘挡住输入</span>" +
      '<button type="button">我已横屏</button>';
    document.body.appendChild(guard);
    return guard;
  }

  function sync() {
    markHtml();
    var phone = isPhoneDevice();
    var openBrowser = shouldOpenTabletBrowser();
    var landscape = shouldForceLandscape();
    var phoneGate = document.getElementById(PHONE_ID);
    if (phoneGate) phoneGate.hidden = !phone;
    var tabletGate = document.getElementById(TABLET_BROWSER_ID);
    if (tabletGate) tabletGate.hidden = !openBrowser;
    document.body.classList.toggle("phone-unsupported-blocked", phone);
    document.body.classList.toggle("tablet-browser-blocked", openBrowser);
    var guard = document.getElementById(GUARD_ID);
    if (!guard) return;
    var blocked = landscape && isPortraitNow();
    guard.hidden = !blocked;
    document.body.classList.toggle("mobile-portrait-blocked", blocked);
  }

  function requestLandscape() {
    var done = function () {
      sync();
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
    if (!document.body) return;
    var kind = currentKind();
    if (kind === "desktop") return;
    ensureStyles();
    if (kind === "mobile") {
      ensurePhoneGate();
      sync();
      return;
    }
    if (shouldOpenTabletBrowser()) {
      var gate = ensureTabletBrowserGate();
      bindTabletBrowserGate(gate);
      if (canAutoOpenSystemBrowser() && !alreadyTriedBrowserJump()) {
        markTriedBrowserJump();
        openInSystemBrowser();
      }
      sync();
      return;
    }
    var guard = ensureGuard();
    var button = guard.querySelector("button");
    if (button && !button.getAttribute("data-bound")) {
      button.setAttribute("data-bound", "1");
      button.addEventListener("click", requestLandscape);
    }
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", sync);
    }
    if (screen.orientation && typeof screen.orientation.addEventListener === "function") {
      screen.orientation.addEventListener("change", sync);
    }
    sync();
  }

  var api = {
    classifyClientDevice: classifyClientDevice,
    isPortraitViewport: isPortraitViewport,
    isPhoneDevice: isPhoneDevice,
    isTabletDevice: isTabletDevice,
    isPortraitNow: isPortraitNow,
    isWeChatBrowser: isWeChatBrowser,
    canAutoOpenSystemBrowser: canAutoOpenSystemBrowser,
    systemBrowserIntentUrl: systemBrowserIntentUrl,
    openInSystemBrowser: openInSystemBrowser,
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
