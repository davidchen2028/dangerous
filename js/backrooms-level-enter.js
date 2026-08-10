/**
 * 进入新层级时在 HUD 顶部显示一行提示（sessionStorage 单次消费）
 */
export const ENTER_BANNER_KEY = "backrooms_enter_banner";

/** @param {number | string} level 层级编号，如 1、283 */
export function queueEnterLevelNumber(level) {
  queueEnterLevelBanner("Level " + level);
}

export function queueEnterLevelBanner(label) {
  if (!label) return;
  try {
    sessionStorage.setItem(ENTER_BANNER_KEY, String(label));
  } catch (err) {
    /* ignore */
  }
}

/** 自定义进入提示，如「红室」→ 你进入了红室 */
export function queueEnterPlaceBanner(placeName) {
  queueEnterLevelBanner(placeName);
}

export function showEnterLevelBannerIfQueued() {
  var label = null;
  try {
    label = sessionStorage.getItem(ENTER_BANNER_KEY);
    if (label) sessionStorage.removeItem(ENTER_BANNER_KEY);
  } catch (err) {
    return;
  }
  if (!label) return;
  renderEnterLevelBanner(label);
}

/** 直接显示进入提示（不依赖 sessionStorage 读写时序） */
export function showEnterLevelBanner(label) {
  if (!label) return;
  renderEnterLevelBanner(String(label));
}

function renderEnterLevelBanner(label) {
  var el = document.getElementById("backroomsEnterBanner");
  if (!el) {
    el = document.createElement("p");
    el.id = "backroomsEnterBanner";
    el.className = "backrooms-enter-banner";
    el.setAttribute("role", "status");
    var hud = document.querySelector(".backrooms-hud");
    if (hud) hud.insertBefore(el, hud.firstChild);
    else document.body.appendChild(el);
  }

  el.textContent = "你进入了 " + label;
  el.hidden = false;
  el.classList.remove("backrooms-enter-banner--hide");

  if (el._hideTimer) clearTimeout(el._hideTimer);
  if (el._removeTimer) clearTimeout(el._removeTimer);

  el._hideTimer = setTimeout(function () {
    el.classList.add("backrooms-enter-banner--hide");
    el._removeTimer = setTimeout(function () {
      el.hidden = true;
      el.classList.remove("backrooms-enter-banner--hide");
    }, 650);
  }, 4200);
}
