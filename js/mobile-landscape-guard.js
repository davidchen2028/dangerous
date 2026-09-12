/**
 * 手机横屏守卫：竖屏时阻断页面操作，并在用户点击后尝试锁定横屏。
 * 自带样式，可独立用于大厅、后室入口和所有后室关卡。
 */
import { isTouchPrimaryDevice } from "./backrooms-fps-look.js";

const STYLE_ID = "mobileLandscapeGuardStyle";
const GUARD_ID = "mobileLandscapeGuard";

export function isPortraitViewport(width, height) {
  const w = Number(width);
  const h = Number(height);
  return Number.isFinite(w) && Number.isFinite(h) && h > w;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .mobile-landscape-guard {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 12px;
      padding: max(24px, env(safe-area-inset-top, 0px))
        max(24px, env(safe-area-inset-right, 0px))
        max(24px, env(safe-area-inset-bottom, 0px))
        max(24px, env(safe-area-inset-left, 0px));
      box-sizing: border-box;
      background:
        radial-gradient(circle at 50% 38%, rgba(56, 72, 82, .3), transparent 42%),
        #06090c;
      color: #eef6fb;
      text-align: center;
      font: 500 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
      touch-action: none;
    }
    .mobile-landscape-guard[hidden] { display: none !important; }
    .mobile-landscape-guard__icon {
      font-size: 58px;
      line-height: 1;
      transform: rotate(-35deg);
    }
    .mobile-landscape-guard strong {
      font-size: 21px;
      letter-spacing: .04em;
    }
    .mobile-landscape-guard button {
      min-width: 150px;
      min-height: 46px;
      margin-top: 8px;
      border: 1px solid rgba(220, 235, 248, .55);
      border-radius: 8px;
      background: rgba(34, 49, 59, .94);
      color: inherit;
      font: 600 15px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    body.mobile-portrait-blocked { overflow: hidden !important; }
  `;
  document.head.appendChild(style);
}

function isPortraitNow() {
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(orientation: portrait)").matches;
  }
  return isPortraitViewport(window.innerWidth, window.innerHeight);
}

export function installMobileLandscapeGuard() {
  if (!isTouchPrimaryDevice() || document.getElementById(GUARD_ID)) return;
  installStyles();

  const guard = document.createElement("div");
  guard.id = GUARD_ID;
  guard.className = "mobile-landscape-guard";
  guard.hidden = true;
  guard.setAttribute("role", "dialog");
  guard.setAttribute("aria-modal", "true");
  guard.setAttribute("aria-label", "请横屏游玩");

  const icon = document.createElement("span");
  icon.className = "mobile-landscape-guard__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "↻";
  const title = document.createElement("strong");
  title.textContent = "请将手机横过来";
  const text = document.createElement("span");
  text.textContent = "本游戏仅支持横屏游玩";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "进入横屏";
  guard.append(icon, title, text, button);
  document.body.appendChild(guard);

  function syncOrientation() {
    const blocked = isPortraitNow();
    guard.hidden = !blocked;
    document.body.classList.toggle("mobile-portrait-blocked", blocked);
  }

  async function requestLandscape() {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (_err) {
      // iOS Safari 等环境不允许网页全屏，仍要求用户手动旋转。
    }
    try {
      if (screen.orientation && typeof screen.orientation.lock === "function") {
        await screen.orientation.lock("landscape");
      }
    } catch (_err) {
      // 不支持方向锁定时，竖屏遮罩仍会阻止继续操作。
    }
    syncOrientation();
  }

  button.addEventListener("click", requestLandscape);
  window.addEventListener("resize", syncOrientation);
  window.addEventListener("orientationchange", syncOrientation);
  if (screen.orientation && typeof screen.orientation.addEventListener === "function") {
    screen.orientation.addEventListener("change", syncOrientation);
  }
  syncOrientation();
}

function boot() {
  installMobileLandscapeGuard();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
}
