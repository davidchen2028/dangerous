import test from "node:test";
import assert from "node:assert/strict";

function fakeAudioEnvironment() {
  const stats = { resumes: 0, starts: 0 };
  class FakeParam {
    setValueAtTime() {}
    exponentialRampToValueAtTime() {}
  }
  class FakeContext {
    constructor() {
      this.state = "suspended";
      this.currentTime = 0;
      this.destination = {};
    }
    resume() {
      stats.resumes += 1;
      this.state = "running";
      return Promise.resolve();
    }
    createOscillator() {
      return {
        type: "sine",
        frequency: new FakeParam(),
        connect() {},
        disconnect() {},
        start() { stats.starts += 1; },
        stop() {},
      };
    }
    createGain() {
      return {
        gain: Object.assign(new FakeParam(), { value: 0 }),
        connect() {},
        disconnect() {},
      };
    }
    close() {
      this.state = "closed";
      return Promise.resolve();
    }
  }
  globalThis.window = {
    AudioContext: FakeContext,
    addEventListener() {},
    removeEventListener() {},
  };
  return stats;
}

test("Level 3 SFX resumes a suspended AudioContext before playing", async () => {
  const stats = fakeAudioEnvironment();
  const audio = await import(`./backrooms-level3-audio.js?test=${Math.random()}`);
  audio.playLevel3ElevatorStart();
  await Promise.resolve();
  await Promise.resolve();
  assert.ok(stats.resumes >= 1);
  assert.ok(stats.starts >= 2);
  audio.stopLevel3Hum();
});

test("Level 4 SFX resumes a suspended AudioContext before playing", async () => {
  const stats = fakeAudioEnvironment();
  const audio = await import(`./backrooms-level4-music.js?test=${Math.random()}`);
  audio.playLevel4Sfx("water");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(stats.resumes, 1);
  assert.equal(stats.starts, 1);
  audio.stopLevel4Music();
});
