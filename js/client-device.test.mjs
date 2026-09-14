import assert from "node:assert/strict";
import test from "node:test";

import {
  canAutoOpenSystemBrowser,
  classifyClientDevice,
  isWeChatBrowser,
  systemBrowserIntentUrl,
} from "./client-device.js";

test("iPhone and Android phones classify as mobile", () => {
  assert.equal(
    classifyClientDevice({
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0",
      minScreenSide: 390,
    }),
    "mobile"
  );
  assert.equal(
    classifyClientDevice({
      ua: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Mobile Safari/537.36",
      minScreenSide: 412,
    }),
    "mobile"
  );
});

test("iPad and iPadOS disguised as Macintosh classify as tablet", () => {
  assert.equal(
    classifyClientDevice({
      ua: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
      minScreenSide: 768,
    }),
    "tablet"
  );
  assert.equal(
    classifyClientDevice({
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 5,
      minScreenSide: 1024,
    }),
    "tablet"
  );
});

test("Android tablets without Mobile token stay tablets", () => {
  assert.equal(
    classifyClientDevice({
      ua: "Mozilla/5.0 (Linux; Android 12; SM-T870) AppleWebKit/537.36 Safari/537.36",
      minScreenSide: 800,
    }),
    "tablet"
  );
});

test("desktop browsers stay desktop", () => {
  assert.equal(
    classifyClientDevice({
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0",
      platform: "MacIntel",
      maxTouchPoints: 0,
      minScreenSide: 1440,
    }),
    "desktop"
  );
});

test("only Android tablet WeChat can auto-open the system browser", () => {
  assert.equal(
    isWeChatBrowser("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) MicroMessenger/8.0"),
    true
  );
  assert.equal(
    canAutoOpenSystemBrowser("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) MicroMessenger/8.0"),
    false
  );
  assert.equal(
    canAutoOpenSystemBrowser(
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile Safari/537.36 MicroMessenger/8.0",
      { minScreenSide: 412 }
    ),
    false
  );
  assert.equal(
    canAutoOpenSystemBrowser(
      "Mozilla/5.0 (Linux; Android 12; SM-T870) Safari/537.36 MicroMessenger/8.0",
      { minScreenSide: 800 }
    ),
    true
  );
  assert.equal(
    systemBrowserIntentUrl("https://dangerous-production.up.railway.app/index.html?x=1"),
    "intent://dangerous-production.up.railway.app/index.html?x=1#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=https%3A%2F%2Fdangerous-production.up.railway.app%2Findex.html%3Fx%3D1;end"
  );
});
