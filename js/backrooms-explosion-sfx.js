/**
 * 巨响爆炸音效 — 纯 Web Audio 合成，无需音频文件。
 * 分四层叠加：起爆脆响、爆轰主体、次低频冲击波、碎石余震。
 */

var _noiseCache = null;

function noiseBuffer(ctx, seconds) {
  if (_noiseCache && _noiseCache.ctx === ctx && _noiseCache.seconds >= seconds) {
    return _noiseCache.buffer;
  }
  var length = Math.floor(ctx.sampleRate * seconds);
  var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  var data = buffer.getChannelData(0);
  for (var i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  _noiseCache = { ctx: ctx, seconds: seconds, buffer: buffer };
  return buffer;
}

function noiseSource(ctx, seconds) {
  var src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, seconds);
  return src;
}

/**
 * @param {BaseAudioContext} ctx
 * @param {{ volume?: number, when?: number, destination?: AudioNode }} [opts]
 *   volume 1 已经非常响，可上调到 2
 * @returns {number} 音效总时长（秒）
 */
export function playHugeExplosion(ctx, opts) {
  opts = opts || {};
  var volume = opts.volume == null ? 1 : opts.volume;
  var t0 = opts.when == null ? ctx.currentTime : opts.when;
  var out = opts.destination || ctx.destination;

  // 压缩器兜住峰值，这样可以把响度推到很高又不会削顶失真
  var comp = ctx.createDynamicsCompressor();
  comp.threshold.setValueAtTime(-20, t0);
  comp.knee.setValueAtTime(14, t0);
  comp.ratio.setValueAtTime(8, t0);
  comp.attack.setValueAtTime(0.002, t0);
  comp.release.setValueAtTime(0.4, t0);

  var master = ctx.createGain();
  master.gain.setValueAtTime(volume * 1.6, t0);
  master.connect(comp);
  comp.connect(out);

  // 1) 起爆脆响：极短的高频炸裂，负责「炸」的锐度
  var crack = noiseSource(ctx, 5);
  var crackHp = ctx.createBiquadFilter();
  crackHp.type = "highpass";
  crackHp.frequency.setValueAtTime(2600, t0);
  var crackGain = ctx.createGain();
  crackGain.gain.setValueAtTime(1.1, t0);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
  crack.connect(crackHp).connect(crackGain).connect(master);
  crack.start(t0);
  crack.stop(t0 + 0.15);

  // 2) 爆轰主体：宽频噪声，低通从明亮扫到闷响，形成火球滚动感
  var body = noiseSource(ctx, 5);
  var bodyLp = ctx.createBiquadFilter();
  bodyLp.type = "lowpass";
  bodyLp.frequency.setValueAtTime(5200, t0);
  bodyLp.frequency.exponentialRampToValueAtTime(140, t0 + 2.6);
  bodyLp.Q.setValueAtTime(1.4, t0);
  var bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.0001, t0);
  bodyGain.gain.linearRampToValueAtTime(1.5, t0 + 0.02);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.1);
  body.connect(bodyLp).connect(bodyGain).connect(master);
  body.start(t0);
  body.stop(t0 + 3.2);

  // 3) 次低频冲击波：两下，模拟胸口被撞两次
  [
    { at: 0, from: 130, to: 21, peak: 1.9, dur: 2.4 },
    { at: 0.085, from: 78, to: 17, peak: 1.35, dur: 3.1 },
  ].forEach(function (spec) {
    var start = t0 + spec.at;
    var sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(spec.from, start);
    sub.frequency.exponentialRampToValueAtTime(spec.to, start + spec.dur * 0.55);
    var subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, start);
    subGain.gain.linearRampToValueAtTime(spec.peak, start + 0.012);
    subGain.gain.exponentialRampToValueAtTime(0.0001, start + spec.dur);
    sub.connect(subGain).connect(master);
    sub.start(start);
    sub.stop(start + spec.dur + 0.05);
  });

  // 4) 余震：低频噪声长尾，像碎石回落和远处回声
  var tail = noiseSource(ctx, 5);
  var tailLp = ctx.createBiquadFilter();
  tailLp.type = "lowpass";
  tailLp.frequency.setValueAtTime(320, t0);
  tailLp.frequency.exponentialRampToValueAtTime(70, t0 + 4);
  var tailGain = ctx.createGain();
  tailGain.gain.setValueAtTime(0.0001, t0);
  tailGain.gain.linearRampToValueAtTime(0.55, t0 + 0.25);
  tailGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.4);
  tail.connect(tailLp).connect(tailGain).connect(master);
  tail.start(t0);
  tail.stop(t0 + 4.5);

  return 4.5;
}
