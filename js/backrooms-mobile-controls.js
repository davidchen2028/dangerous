/**
 * 后室移动端：左下遥感、右下跳跃、以及从提示里抽出的 E / Q。
 */
import { isTouchPrimaryDevice } from "./backrooms-fps-look.js";

const PROMPT_SELECTOR = ".backrooms-hud__prompt:not([hidden]), .br-mp-prompt:not([hidden])";
const ACTION_RE = /按(住)?\s*([EQ])\s*/gi;
const STICK_DEADZONE = 0.16;
const STICK_SPRINT = 0.55;
const STICK_CODES = ["KeyW", "KeyS", "KeyA", "KeyD", "ShiftLeft"];
const EMPTY_STICK = Object.freeze({
  KeyW: false,
  KeyS: false,
  KeyA: false,
  KeyD: false,
  ShiftLeft: false,
});
const stickKeys = {
  KeyW: false,
  KeyS: false,
  KeyA: false,
  KeyD: false,
  ShiftLeft: false,
};

export function getMobileStickMove() {
  return stickKeys;
}

export function stickToMoveKeys(x, y) {
  var nx = Number(x) || 0;
  var ny = Number(y) || 0;
  return {
    KeyW: ny > STICK_DEADZONE,
    KeyS: ny < -STICK_DEADZONE,
    KeyA: nx < -STICK_DEADZONE,
    KeyD: nx > STICK_DEADZONE,
    ShiftLeft: ny > STICK_SPRINT,
  };
}

export function isPortraitViewport(width, height) {
  const w = Number(width);
  const h = Number(height);
  return Number.isFinite(w) && Number.isFinite(h) && h > w;
}

function ensureClassicLandscapeGuard() {
  if (typeof document === "undefined") return;
  if (document.querySelector("script[data-landscape-guard]")) return;
  const script = document.createElement("script");
  script.src = new URL("./mobile-landscape-guard.js", import.meta.url).href;
  script.setAttribute("data-landscape-guard", "1");
  document.head.appendChild(script);
}

export function parseMobileActions(text) {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  const matches = Array.from(source.matchAll(ACTION_RE));
  const actions = [];
  const seen = new Set();
  for (let i = 0; i < matches.length; i++) {
    const key = matches[i][2].toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : source.length;
    let label = source
      .slice(start, end)
      .replace(/^[·/、，,\s]+|[·/、，,\s]+$/g, "")
      .trim();
    if (!label) {
      const prefixStart =
        i > 0 ? matches[i - 1].index + matches[i - 1][0].length : 0;
      const prefixParts = source
        .slice(prefixStart, matches[i].index)
        .split("·")
        .map(function (part) {
          return part.trim();
        })
        .filter(Boolean);
      label = prefixParts[prefixParts.length - 1] || "交互";
    }
    actions.push({ key, code: "Key" + key, label, hold: !!matches[i][1] });
  }
  return actions;
}

function dispatchKey(action, type) {
  window.dispatchEvent(
    new KeyboardEvent(type, {
      key: action.key.toLowerCase(),
      code: action.code,
      bubbles: true,
      cancelable: true,
    })
  );
}

function keyNameForCode(code) {
  if (code === "ShiftLeft") return "Shift";
  if (code === "Space") return " ";
  return code.replace(/^Key/, "").toLowerCase();
}

function dispatchCode(code, type) {
  var key = keyNameForCode(code);
  var ev = new KeyboardEvent(type, {
    key: key,
    code: code,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  try {
    if (ev.code !== code) {
      Object.defineProperty(ev, "code", { value: code });
      Object.defineProperty(ev, "key", { value: key });
    }
  } catch (_err) {
    /* ignore */
  }
  window.dispatchEvent(ev);
}

function isHudBlocked() {
  var b = document.body;
  return (
    b.classList.contains("backrooms-dead") ||
    b.classList.contains("backrooms-pack-open") ||
    b.classList.contains("backrooms-settings-open") ||
    b.classList.contains("backrooms-dialogue-open") ||
    b.classList.contains("backrooms-home-ending-open") ||
    b.classList.contains("backrooms-taskui-open")
  );
}

function mountMoveStick() {
  if (document.getElementById("backroomsMobileStick")) return;
  var wrap = document.createElement("div");
  wrap.id = "backroomsMobileStick";
  wrap.className = "br-mobile-stick";
  wrap.setAttribute("aria-label", "移动遥感");
  wrap.innerHTML =
    '<div class="br-mobile-stick__base">' +
    '<div class="br-mobile-stick__sprint" aria-hidden="true"></div>' +
    '<div class="br-mobile-stick__knob"></div>' +
    "</div>";
  document.body.appendChild(wrap);

  var jump = document.createElement("button");
  jump.type = "button";
  jump.id = "backroomsMobileJump";
  jump.className = "br-mobile-jump";
  jump.setAttribute("aria-label", "跳跃");
  jump.textContent = "跳";
  document.body.appendChild(jump);

  var baseEl = wrap.querySelector(".br-mobile-stick__base");
  var knobEl = wrap.querySelector(".br-mobile-stick__knob");
  var held = Object.create(null);
  var dragging = false;
  var pointerId = null;
  var radius = 48;

  function writeStickKeys(next) {
    var src = next || EMPTY_STICK;
    stickKeys.KeyW = !!src.KeyW;
    stickKeys.KeyS = !!src.KeyS;
    stickKeys.KeyA = !!src.KeyA;
    stickKeys.KeyD = !!src.KeyD;
    stickKeys.ShiftLeft = !!src.ShiftLeft;
  }

  function setHeld(next) {
    var i;
    writeStickKeys(next);
    for (i = 0; i < STICK_CODES.length; i++) {
      var code = STICK_CODES[i];
      var want = !!next[code];
      if (want === !!held[code]) continue;
      held[code] = want;
      dispatchCode(code, want ? "keydown" : "keyup");
    }
  }

  function clearStick() {
    dragging = false;
    pointerId = null;
    if (knobEl) knobEl.style.transform = "translate(0px, 0px)";
    wrap.classList.remove("br-mobile-stick--sprint");
    setHeld(EMPTY_STICK);
  }

  function applyPointer(clientX, clientY) {
    var rect = baseEl.getBoundingClientRect();
    radius = Math.max(28, rect.width * 0.5 - 8);
    var dx = clientX - (rect.left + rect.width * 0.5);
    var dy = clientY - (rect.top + rect.height * 0.5);
    var dist = Math.hypot(dx, dy) || 1;
    var clamped = dist > radius ? radius / dist : 1;
    var cdx = dx * clamped;
    var cdy = dy * clamped;
    var nx = cdx / radius;
    var ny = -cdy / radius;
    if (knobEl) knobEl.style.transform = "translate(" + cdx + "px, " + cdy + "px)";
    var keys = stickToMoveKeys(nx, ny);
    wrap.classList.toggle("br-mobile-stick--sprint", keys.ShiftLeft);
    setHeld(keys);
  }

  function blocked() {
    return isHudBlocked();
  }

  baseEl.addEventListener(
    "pointerdown",
    function (e) {
      if (blocked()) return;
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      pointerId = e.pointerId;
      if (baseEl.setPointerCapture) baseEl.setPointerCapture(e.pointerId);
      applyPointer(e.clientX, e.clientY);
    },
    { passive: false }
  );
  window.addEventListener(
    "pointermove",
    function (e) {
      if (!dragging || e.pointerId !== pointerId) return;
      e.preventDefault();
      applyPointer(e.clientX, e.clientY);
    },
    { passive: false }
  );
  function endStick(e) {
    if (!dragging || (e && e.pointerId !== pointerId)) return;
    if (baseEl.releasePointerCapture) {
      try {
        baseEl.releasePointerCapture(pointerId);
      } catch (_err) {}
    }
    clearStick();
  }
  window.addEventListener("pointerup", endStick);
  window.addEventListener("pointercancel", endStick);
  window.addEventListener("blur", clearStick);

  jump.addEventListener(
    "pointerdown",
    function (e) {
      if (blocked()) return;
      e.preventDefault();
      e.stopPropagation();
      dispatchCode("Space", "keydown");
    },
    { passive: false }
  );
  function endJump(e) {
    e.preventDefault();
    e.stopPropagation();
    dispatchCode("Space", "keyup");
  }
  jump.addEventListener("pointerup", endJump);
  jump.addEventListener("pointercancel", endJump);

  function syncBlocked() {
    var off = blocked();
    wrap.classList.toggle("br-mobile-stick--blocked", off);
    jump.classList.toggle("br-mobile-jump--blocked", off);
    if (off) clearStick();
  }
  new MutationObserver(syncBlocked).observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  syncBlocked();
}

function boot() {
  ensureClassicLandscapeGuard();
  if (!isTouchPrimaryDevice()) return;
  document.body.classList.add("backrooms-mobile-touch");
  mountMoveStick();

  const host = document.createElement("div");
  host.id = "backroomsMobileActions";
  host.className = "br-mobile-actions";
  host.hidden = true;
  host.setAttribute("aria-label", "场景操作");
  document.body.appendChild(host);

  let activeSources = new Set();
  let scheduled = false;
  let renderedSignature = "";

  function sync() {
    scheduled = false;
    const nextSources = new Set();
    const actions = [];
    const seen = new Set();
    const prompts = document.querySelectorAll(PROMPT_SELECTOR);

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      if (getComputedStyle(prompt).display === "none") continue;
      const parsed = parseMobileActions(prompt.textContent);
      if (!parsed.length) continue;
      nextSources.add(prompt);
      for (let j = 0; j < parsed.length; j++) {
        if (!seen.has(parsed[j].key)) {
          seen.add(parsed[j].key);
          actions.push(parsed[j]);
        }
      }
    }

    activeSources.forEach(function (el) {
      if (!nextSources.has(el)) el.classList.remove("br-mobile-action-source");
    });
    nextSources.forEach(function (el) {
      if (!activeSources.has(el)) el.classList.add("br-mobile-action-source");
    });
    activeSources = nextSources;

    const signature = JSON.stringify(actions);
    if (signature === renderedSignature) {
      host.hidden = actions.length === 0;
      return;
    }
    renderedSignature = signature;
    host.replaceChildren();
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "br-mobile-actions__button";
      const keycap = document.createElement("kbd");
      keycap.textContent = action.key;
      const label = document.createElement("span");
      label.textContent = action.label;
      button.append(keycap, label);
      button.setAttribute(
        "aria-label",
        (action.hold ? "按住 " : "执行 ") + action.key + "：" + action.label
      );
      button.addEventListener("pointerdown", function (event) {
        event.preventDefault();
        event.stopPropagation();
        button.setPointerCapture && button.setPointerCapture(event.pointerId);
        button.classList.add("br-mobile-actions__button--held");
        dispatchKey(action, "keydown");
      });
      function release(event) {
        event.preventDefault();
        event.stopPropagation();
        button.classList.remove("br-mobile-actions__button--held");
        dispatchKey(action, "keyup");
      }
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      host.appendChild(button);
    }
    host.hidden = actions.length === 0;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }

  new MutationObserver(schedule).observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["hidden", "class", "style"],
  });
  schedule();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.BackroomsMobileControls = {
    usesActionButtons: isTouchPrimaryDevice(),
    hasMoveStick: isTouchPrimaryDevice(),
    getMove: getMobileStickMove,
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
}
