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

  // 臨界泡を潰した・連鎖したときの「パチッ＋音階」音（10連鎖ごとに音色と和音が進化する）
  playChainPop(comboCount, isDangerSave = false) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const count = Math.max(1, comboCount);
    const tier = Math.floor(count / 10); // 0: 1〜9, 1: 10〜19, 2: 20〜29, 3: 30〜39, 4+: 40〜
    const stepInTier = count % 10; // 各10連鎖帯域内のステップ（0は10の倍数の頂点）

    // 各10連鎖帯域の中で10段階に駆け上がるペンタトニック（10の倍数は最高到達点）
    const scaleIndex = stepInTier === 0 ? 9 : stepInTier - 1;
    const baseScale = [
      523.25, 587.33, 659.25, 783.99, 880.0,
      1046.5, 1174.66, 1318.51, 1567.98, 1760.0
    ];
    // 10連鎖増えるごとにキーが少しずつ転調して高揚感が増す（耳に痛くない範囲に収める）
    const transposeSemitones = Math.min(12, tier * 2);
    const freq = baseScale[scaleIndex] * Math.pow(2, transposeSemitones / 12);

    // 1. プチプチの物理的なアタック（低音クリック＋鋭い破裂ノイズ）
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = tier >= 2 ? "sine" : "triangle";
    clickOsc.frequency.setValueAtTime(240 + scaleIndex * 14 + tier * 22, now);
    clickOsc.frequency.exponentialRampToValueAtTime(68, now + 0.038);
    clickGain.gain.setValueAtTime(0.2, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.044);
    clickOsc.connect(clickGain);
    clickGain.connect(this.ctx.destination);
    clickOsc.start(now);
    clickOsc.stop(now + 0.048);

    this._playNoiseBurst(now, 2300 + scaleIndex * 140 + tier * 240, "bandpass", 1.4, 0.2, 0.03);

    // 2. Tier 0（1〜9連鎖）：軽快で素朴なトライアングル単音
    if (tier === 0) {
      this._playTone(now, freq, "triangle", 0.16, 0.18, 1.015);
    } else if (tier === 1) {
      // Tier 1（10〜19連鎖）：澄んだグラスベル＋完全5度の2音ハーモニー
      this._playTone(now, freq, "sine", 0.16, 0.24, 1.01);
      this._playTone(now, freq * 1.5, "triangle", 0.095, 0.22, 1.0);
    } else if (tier === 2) {
      // Tier 2（20〜29連鎖）：華やかな3和音シンセベル（根音＋長3度＋完全5度）
      this._playTone(now, freq, "triangle", 0.14, 0.26, 1.01);
      this._playTone(now, freq * 1.25, "sine", 0.09, 0.25, 1.0);
      this._playTone(now, freq * 1.5, "sine", 0.09, 0.27, 1.0);
    } else if (tier === 3) {
      // Tier 3（30〜39連鎖）：コーラス感のあるクリスタル和音＋追いかける高音シマー
      this._playTone(now, freq * 0.996, "triangle", 0.11, 0.28, 1.0);
      this._playTone(now, freq * 1.004, "sine", 0.11, 0.28, 1.0);
      this._playTone(now, freq * 1.5, "sine", 0.085, 0.28, 1.0);
      // わずかに遅れて弾ける1オクターブ上の煌めき
      this._playTone(now + 0.026, Math.min(4200, freq * 2.0), "sine", 0.07, 0.22, 1.0);
    } else {
      // Tier 4以降（40連鎖〜）：腹に響くサブベースパンチ＋豊かな4和音オーロラベル＋二重シマー
      const sub = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      sub.type = "sine";
      sub.frequency.setValueAtTime(115, now);
      sub.frequency.exponentialRampToValueAtTime(48, now + 0.11);
      subGain.gain.setValueAtTime(0.18, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      sub.connect(subGain);
      subGain.connect(this.ctx.destination);
      sub.start(now);
      sub.stop(now + 0.14);

      this._playTone(now, freq, "triangle", 0.12, 0.3, 1.0);
      this._playTone(now, freq * 1.25, "sine", 0.08, 0.3, 1.0);
      this._playTone(now, freq * 1.5, "sine", 0.08, 0.3, 1.0);
      this._playTone(now + 0.024, Math.min(4400, freq * 1.875), "sine", 0.065, 0.24, 1.0);
      if (tier >= 5) {
        // 50連鎖以降はさらに高速スパークル尾引きを重ねる
        this._playTone(now + 0.052, Math.min(4800, freq * 2.0), "sine", 0.06, 0.24, 1.0);
      }
    }

    if (isDangerSave) {
      this._playTone(now, Math.min(4400, freq * 1.5), "sine", 0.08, 0.24, 1.0);
    }
  }

  // 10連鎖・20連鎖・30連鎖・40連鎖…の節目に鳴る専用マイルストーン音
  playChainMilestone(tier) {
    if (!this.enabled || !this.ctx || tier < 1) return;
    const now = this.ctx.currentTime;
    const transpose = Math.pow(2, Math.min(12, (tier - 1) * 2) / 12);

    // 10の位が増えるごとに和音の音数と広がりが豪華になる
    const chords = [
      [523.25, 659.25, 783.99],                           // 10連鎖：澄んだ3音キラッ
      [523.25, 659.25, 783.99, 1046.5],                   // 20連鎖：明るい4音ベル
      [523.25, 659.25, 783.99, 987.77, 1318.51],          // 30連鎖：クリスタル5音アルペジオ
      [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98]  // 40連鎖〜：壮大な6音オーロラ和音
    ];
    const notes = chords[Math.min(tier - 1, chords.length - 1)];

    // 40連鎖以上は節目の瞬間に力強い低音ベースも鳴らす
    if (tier >= 4) {
      const bass = this.ctx.createOscillator();
      const bassGain = this.ctx.createGain();
      bass.type = "sine";
      bass.frequency.setValueAtTime(130.81 * transpose, now);
      bassGain.gain.setValueAtTime(0.18, now);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      bass.connect(bassGain);
      bassGain.connect(this.ctx.destination);
      bass.start(now);
      bass.stop(now + 0.38);
    }

    notes.forEach((n, idx) => {
      const f = Math.min(4600, n * transpose);
      const t = now + idx * 0.04;
      this._playTone(t, f, idx === notes.length - 1 ? "sine" : "triangle", 0.12, 0.34, 1.0);
    });
  }

  // エンベロープ付き単音再生の共通ヘルパー
  _playTone(startTime, freq, type, volume, duration, pitchMul = 1.0) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    if (pitchMul !== 1.0) {
      osc.frequency.exponentialRampToValueAtTime(freq * pitchMul, startTime + Math.min(0.06, duration * 0.4));
    }

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
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
