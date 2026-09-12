/**
 * 后室移动端交互条。
 * 从当前可见交互提示中提取 E / Q；两项同时可用时纵向显示两个按钮。
 */
import { isTouchPrimaryDevice } from "./backrooms-fps-look.js";

const PROMPT_SELECTOR = ".backrooms-hud__prompt:not([hidden]), .br-mp-prompt:not([hidden])";
const ACTION_RE = /按(住)?\s*([EQ])\s*/gi;

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

function boot() {
  ensureClassicLandscapeGuard();
  if (!isTouchPrimaryDevice()) return;
  document.body.classList.add("backrooms-mobile-touch");

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
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
}
