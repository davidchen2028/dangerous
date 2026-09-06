import test from "node:test";
import assert from "node:assert/strict";

function fakeAudioEnvironment() {
  const stats = { resumes: 0, starts: 0 };
  class FakeParam {
    setValueAtTime() {}
    exponentialRampToValueAtTime() {}
    cancelScheduledValues() {}
    setTargetAtTime() {}
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
    createBuffer() {
      return { getChannelData: () => new Float32Array(32) };
    }
    createBufferSource() {
      return {
        buffer: null,
        loop: false,
        connect() {},
        disconnect() {},
        start() { stats.starts += 1; },
        stop() {},
      };
    }
    createBiquadFilter() {
      return {
        type: "lowpass",
        frequency: Object.assign(new FakeParam(), { value: 0 }),
        Q: Object.assign(new FakeParam(), { value: 0 }),
        connect() {},
      };
    }
    createStereoPanner() {
      return {
        pan: Object.assign(new FakeParam(), { value: 0 }),
        connect() {},
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

test("Level 6 ocean resumes context and its cue strengthens near the stair", async () => {
  const stats = fakeAudioEnvironment();
  const audio = await import(`./backrooms-level6-audio.js?test=${Math.random()}`);
  const far = audio.computeLevel6OceanCue(0.2, 0, 0);
  const near = audio.computeLevel6OceanCue(0.9, Math.PI * 0.5, 0);
  assert.equal(far.gain, 0);
  assert.ok(near.gain > far.gain);
  assert.ok(near.pan > 0.9);
  audio.startLevel6Audio();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(stats.resumes, 1);
  assert.equal(stats.starts, 1);
  audio.stopLevel6Audio();
});
