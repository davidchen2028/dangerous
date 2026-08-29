import { enforceLevelEntry } from "./backrooms-level-pass.js";
import { showEnterLevelBannerIfQueued } from "./backrooms-level-enter.js";
import { markLevelEntered } from "./backrooms-tasks.js";

if (!enforceLevelEntry("c102")) {
  window.location.replace("backrooms-level0.html");
} else {
  showEnterLevelBannerIfQueued();
  markLevelEntered("c102");
}
