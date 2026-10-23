import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBackroomsRendererSize,
  backroomsCameraFar,
  installBackroomsFrameCap,
  resolveBackroomsGfxProfile,
} from "./backrooms-gfx-profile.js";

const IPAD = {
  dpr: 2,
  ua: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
  platform: "iPad",
  maxTouchPoints: 5,
};

const IPAD_AS_MAC = {
  dpr: 2,
  ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
  platform: "MacIntel",
  maxTouchPoints: 5,
};

test("iPad auto profile locks frame rate, lights, and draw size", () => {
  const profile = resolveBackroomsGfxProfile(IPAD);
  assert.equal(profile.tier, "low");
  assert.equal(profile.antialias, false);
  assert.equal(profile.shadows, false);
  assert.equal(profile.pointLightBudget, 1);
  assert.equal(profile.maxFps, 30);
  assert.equal(profile.streamRadius, 1);
  assert.equal(profile.cameraFarPad, 4);
  assert.equal(profile.stencil, false);
  assert.equal(profile.powerPreference, "default");

  const macLike = resolveBackroomsGfxProfile(IPAD_AS_MAC);
  assert.equal(macLike.maxFps, 30);
  assert.equal(macLike.pointLightBudget, 1);
});

test("explicit high quality on iPad keeps the desktop high tier", () => {
  const profile = resolveBackroomsGfxProfile({ ...IPAD, override: "high" });
  assert.equal(profile.tier, "high");
  assert.equal(profile.maxFps, 0);
  assert.equal(profile.pointLightBudget, 6);
  assert.equal(profile.antialias, true);
  assert.equal(profile.streamRadius, null);
});

test("Retina Safari that is not an iPad stays on the shared low tier", () => {
  const profile = resolveBackroomsGfxProfile({
    dpr: 2,
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
    platform: "MacIntel",
    maxTouchPoints: 0,
  });
  assert.equal(profile.tier, "low");
  assert.equal(profile.pointLightBudget, 3);
  assert.equal(profile.maxFps, 0);
  assert.equal(profile.pixelRatio, 1);
  assert.equal(profile.streamRadius, null);
});

test("camera far shrinks to the fog and leaves a tighter far plane alone", () => {
  assert.equal(backroomsCameraFar(80, 28, 4), 32);
  assert.equal(backroomsCameraFar(90, 42, 4), 46);
  assert.equal(backroomsCameraFar(46, 80, 4), 46);
  assert.equal(backroomsCameraFar(220, 95, 4), 99);
  assert.equal(backroomsCameraFar(80, 28, 0), 80);
});

test("iPad drawing buffer stays under the pixel budget", () => {
  const profile = resolveBackroomsGfxProfile(IPAD);
  const renderer = {
    pixelRatio: 1,
    setPixelRatio(value) {
      this.pixelRatio = value;
    },
    setSize() {},
    render() {},
  };
  applyBackroomsRendererSize(renderer, 1366, 1024, profile);
  assert.ok(renderer.pixelRatio < 0.9);
  assert.ok(renderer.pixelRatio * renderer.pixelRatio * 1366 * 1024 <= profile.maxDrawPixels + 1);

  const smaller = {
    pixelRatio: 1,
    setPixelRatio(value) {
      this.pixelRatio = value;
    },
    setSize() {},
    render() {},
  };
  applyBackroomsRendererSize(smaller, 1024, 768, profile);
  assert.equal(smaller.pixelRatio, 1);
});

test("frame cap spaces animation callbacks by about one thirtieth of a second", () => {
  const nativeQueue = [];
  const host = {
    requestAnimationFrame(cb) {
      nativeQueue.push(cb);
      return nativeQueue.length;
    },
    cancelAnimationFrame() {},
  };
  installBackroomsFrameCap(30, host);

  const stamps = [];
  const id = host.requestAnimationFrame((t) => {
    stamps.push(t);
    host.requestAnimationFrame((next) => stamps.push(next));
  });
  assert.equal(typeof id, "number");

  function flush(now) {
    const batch = nativeQueue.splice(0, nativeQueue.length);
    for (const cb of batch) cb(now);
  }

  flush(1000);
  assert.deepEqual(stamps, [1000]);
  flush(1016);
  assert.deepEqual(stamps, [1000]);
  flush(1032);
  assert.deepEqual(stamps, [1000, 1032]);
});

test("cancelled frame-cap callbacks do not run", () => {
  const nativeQueue = [];
  const host = {
    requestAnimationFrame(cb) {
      nativeQueue.push(cb);
      return nativeQueue.length;
    },
    cancelAnimationFrame() {},
  };
  installBackroomsFrameCap(30, host);
  const seen = [];
  const id = host.requestAnimationFrame((t) => seen.push(t));
  host.cancelAnimationFrame(id);
  const batch = nativeQueue.splice(0, nativeQueue.length);
  for (const cb of batch) cb(0);
  assert.deepEqual(seen, []);
});
