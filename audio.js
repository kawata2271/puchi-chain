// プチプチの破裂音と連鎖の心地よいフィードバックを生成するWeb Audioシンセサイザー
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.noiseBuffer = null;
    this.enabled = true;
    this.lastChargeTime = 0;
    // 連鎖で駆け上がるペンタトニック音階（C5〜E7）
    this.pentatonic = [
      523.25, 587.33, 659.25, 783.99, 880.0,
      1046.5, 1174.66, 1318.51, 1567.98, 1760.0,
      2093.0, 2349.32, 2637.02
    ];
  }

  // 最初のユーザー操作時にAudioContextを初期化・再開する
  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.noiseBuffer = this._createNoiseBuffer(this.ctx);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  // 破裂アタック用の短いホワイトノイズバッファを生成する
  _createNoiseBuffer(ctx) {
    const length = Math.floor(ctx.sampleRate * 0.25);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // 小さい泡を指で押し込んだ瞬間の柔らかな「プニッ」音
  playPressStart() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(165, now + 0.048);

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.052);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.056);
  }

  // 押し込みを指スライドでキャンセルしたときの控えめな戻り音
  playPressCancel() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(255, now + 0.036);

    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.042);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  // 未成熟の泡を押し潰して隣へ空気を逃がすときの「プニュ・シュッ」音
  playAirPush(targetCount) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // 柔らかいビニールを押して空気が抜けるピッチスウィープ
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = "sine";
    const startFreq = targetCount > 0 ? 340 : 440;
    const endFreq = targetCount > 0 ? 220 : 140;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.065);

    oscGain.gain.setValueAtTime(0.15, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);

    // 隣の気泡へ空気が移動する短い息音ノイズ
    this._playNoiseBurst(now, 1400, "bandpass", 1.5, 0.11, 0.045);
  }

  // 空気を押し込みすぎて隣の泡が危険状態（赤）に入った・加速したときの緊張音
  playOverloadPush() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(390, now + 0.08);

    gain.gain.setValueAtTime(0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  // 臨界泡を潰した・連鎖したときの「パチッ＋音階」音
  playChainPop(comboIndex, isDangerSave) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const idx = Math.min(Math.max(0, comboIndex), this.pentatonic.length - 1);
    const freq = this.pentatonic[idx];

    // 1. プチプチの物理的なアタック（低音パンチ＋鋭い破裂ノイズ）
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = "triangle";
    clickOsc.frequency.setValueAtTime(240 + idx * 14, now);
    clickOsc.frequency.exponentialRampToValueAtTime(70, now + 0.038);
    clickGain.gain.setValueAtTime(0.22, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.042);
    clickOsc.connect(clickGain);
    clickGain.connect(this.ctx.destination);
    clickOsc.start(now);
    clickOsc.stop(now + 0.046);

    this._playNoiseBurst(now, 2400 + idx * 150, "bandpass", 1.4, 0.22, 0.032);

    // 2. 連鎖で駆け上がる澄んだトーン
    const toneOsc = this.ctx.createOscillator();
    const toneGain = this.ctx.createGain();
    toneOsc.type = "triangle";
    toneOsc.frequency.setValueAtTime(freq, now);
    // わずかに上ずらせて弾けるニュアンスを足す
    toneOsc.frequency.exponentialRampToValueAtTime(freq * 1.015, now + 0.06);

    const volume = Math.min(0.24, 0.15 + idx * 0.01);
    toneGain.gain.setValueAtTime(0.001, now);
    toneGain.gain.linearRampToValueAtTime(volume, now + 0.008);
    toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

    toneOsc.connect(toneGain);
    toneGain.connect(this.ctx.destination);
    toneOsc.start(now);
    toneOsc.stop(now + 0.21);

    // 危険状態（赤）をギリギリ救出したときは明るい倍音を重ねる
    if (isDangerSave) {
      const shimmer = this.ctx.createOscillator();
      const shimmerGain = this.ctx.createGain();
      shimmer.type = "sine";
      shimmer.frequency.setValueAtTime(freq * 1.5, now);
      shimmerGain.gain.setValueAtTime(0.09, now);
      shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      shimmer.connect(shimmerGain);
      shimmerGain.connect(this.ctx.destination);
      shimmer.start(now);
      shimmer.stop(now + 0.25);
    }
  }

  // 衝撃波で隣の泡が臨界に押し上がったときの柔らかい「ポコッ」音
  playCharge() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    // 同時に大量発音して耳障りになるのを防ぐ
    if (now - this.lastChargeTime < 0.045) return;
    this.lastChargeTime = now;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(290, now);
    osc.frequency.exponentialRampToValueAtTime(470, now + 0.045);

    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  // 危険泡がある間の控えめな警告パルス音
  playWarningTick(urgency) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    const baseFreq = 160 + urgency * 120;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.72, now + 0.06);

    gain.gain.setValueAtTime(0.04 + urgency * 0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  // 硬い殻の泡を直接叩いて弾かれたときの金属的な「カンッ」音
  playArmorClink() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.055);

    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  // 爆風で硬い殻の泡が砕け散ったときの「パリンッ」音
  playArmorBreak() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const freqs = [1180, 1680];
    for (const f of freqs) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.65, now + 0.08);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.095);
    }
    this._playNoiseBurst(now, 3600, "highpass", 1.2, 0.16, 0.045);
  }

  // シートクリア時の爽快な上昇アルペジオ和音
  playStageClear() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];

    notes.forEach((freq, i) => {
      const t = now + i * 0.055;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = i === notes.length - 1 ? "sine" : "triangle";
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.16, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }

  // 自爆（ゲームオーバー）時の破裂音
  playBurst() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(170, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.36);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + 0.36);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);

    this._playNoiseBurst(now, 700, "lowpass", 1.0, 0.25, 0.22);
  }

  // フィルタ付きノイズバーストの共通ヘルパー
  _playNoiseBurst(startTime, freq, filterType, q, volume, duration) {
    if (!this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, startTime);
    filter.Q.setValueAtTime(q, startTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    src.start(startTime);
    src.stop(startTime + duration + 0.01);
  }
}

window.SoundEngine = SoundEngine;
