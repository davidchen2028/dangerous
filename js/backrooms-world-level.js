/**
 * 由页面路径解析联机用的 levelKey（与通行证 id 对齐：L1 为 clip）。
 */
import { LEVEL_KEY_CATALOG } from "./backrooms-level-key-catalog.js";

const EXTRA_PAGES = {
  "backrooms-entity81.html": "e81",
  "backrooms-blue-channel.html": "blue_channel",
};

const PAGE_TO_KEY = Object.create(null);
PAGE_TO_KEY["backrooms-level1.html"] = "clip";
var i;
for (i = 0; i < LEVEL_KEY_CATALOG.length; i++) {
  var entry = LEVEL_KEY_CATALOG[i];
  if (!entry || !entry.page) continue;
  if (PAGE_TO_KEY[entry.page]) continue;
  PAGE_TO_KEY[entry.page] = entry.pass || entry.levelId;
}
var extraName;
for (extraName in EXTRA_PAGES) {
  if (Object.prototype.hasOwnProperty.call(EXTRA_PAGES, extraName)) {
    PAGE_TO_KEY[extraName] = EXTRA_PAGES[extraName];
  }
}

export function pageFileFromPath(pathname) {
  var path = String(pathname || "");
  var slash = path.lastIndexOf("/");
  var file = slash >= 0 ? path.slice(slash + 1) : path;
  return file.split("?")[0] || "";
}

export function levelKeyFromPath(pathname) {
  var file = pageFileFromPath(pathname);
  return PAGE_TO_KEY[file] || "unknown";
}

export function currentBackroomsLevelKey() {
  if (typeof window === "undefined" || !window.location) return "unknown";
  return levelKeyFromPath(window.location.pathname);
}
