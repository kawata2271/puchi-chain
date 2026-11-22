// 初見プレイヤー向けに「押し込み・キャンセル・連鎖・プレス回避」を動きで伝えるCanvasチュートリアル
(() => {
  "use strict";

  const STORAGE_KEY_SEEN = "puchi_tutorial_seen_v1";

  const STEPS = [
    {
      badge: "STEP 1 / 3",
      title: "押して育て、赤×はキャンセル",
      caption: "小さい泡を押すと隣が膨らむ。赤い×が出たら指をずらしてキャンセルし、別の泡から白く繋げよう。"
    },
    {
      badge: "STEP 2 / 3",
      title: "2連鎖以上でゴミごとぶち抜く",
      caption: "押し潰した跡はペチャンコ玉で残る。白い泡を2個以上繋げて割ると、ペチャンコ玉ごと吹き飛びコアが落ちる。"
    },
    {
      badge: "STEP 3 / 3",
      title: "赤いラインから逃げ続けろ",
      caption: "上から迫る赤いラインに光るコアが触れると終了。4連鎖以上の大連鎖を決めると赤いラインを押し戻せる。"
    }
  ];

  // 線形補間＆イージングヘルパー
  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function easeOutCubic(t) {
    const u = 1 - clamp01(t);
    return 1 - u * u * u;
  }
  function easeInOut(t) {
    const x = clamp01(t);
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  }

  class TutorialPlayer {
    constructor(opts) {
      this.modal = opts.modal;
      this.canvas = opts.canvas;
      this.ctx = this.canvas.getContext("2d");
      this.badgeEl = opts.badgeEl;
      this.titleEl = opts.titleEl;
      this.captionEl = opts.captionEl;
      this.dotsEl = opts.dotsEl;
      this.prevBtn = opts.prevBtn;
      this.nextBtn = opts.nextBtn;
      this.skipBtn = opts.skipBtn;
      this.onClose = opts.onClose || (() => {});

      this.stepIndex = 0;
      this.isOpen = false;
      this.rafId = null;
      this.stepStart = 0;
      this.w = 320;
      this.h = 220;

      this._buildDots();
      this._bindEvents();
    }

    hasSeen() {
      return localStorage.getItem(STORAGE_KEY_SEEN) === "1";
    }

    markSeen() {
      localStorage.setItem(STORAGE_KEY_SEEN, "1");
    }

    _buildDots() {
      this.dotsEl.textContent = "";
      this.dotButtons = STEPS.map((_, idx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tutorial-dot";
        btn.setAttribute("aria-label", `ステップ ${idx + 1}`);
        btn.addEventListener("click", () => this.goToStep(idx));
        this.dotsEl.appendChild(btn);
        return btn;
      });
    }

    _bindEvents() {
      this.prevBtn.addEventListener("click", () => {
        if (this.stepIndex > 0) this.goToStep(this.stepIndex - 1);
      });

      this.nextBtn.addEventListener("click", () => {
        if (this.stepIndex < STEPS.length - 1) {
          this.goToStep(this.stepIndex + 1);
        } else {
          this.close();
        }
      });

      this.skipBtn.addEventListener("click", () => {
        this.close();
      });

      this.modal.addEventListener("click", (e) => {
        if (e.target === this.modal) {
          this.close();
        }
      });
    }

    open(startStep = 0) {
      this.isOpen = true;
      this.modal.classList.remove("hidden");
      this._resizeCanvas();
      this.goToStep(startStep);
      this._startLoop();
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.markSeen();
      this.modal.classList.add("hidden");
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      this.onClose();
    }

    goToStep(idx) {
      this.stepIndex = Math.max(0, Math.min(STEPS.length - 1, idx));
      this.stepStart = performance.now();
      const s = STEPS[this.stepIndex];
      this.badgeEl.textContent = s.badge;
      this.titleEl.textContent = s.title;
      this.captionEl.textContent = s.caption;

      this.dotButtons.forEach((btn, i) => {
        btn.classList.toggle("active", i === this.stepIndex);
      });

      this.prevBtn.disabled = this.stepIndex === 0;
      this.nextBtn.textContent = this.stepIndex === STEPS.length - 1 ? "あそぶ！" : "つぎへ →";
    }

    _resizeCanvas() {
      const rect = this.canvas.getBoundingClientRect();
      const cssW = Math.max(240, rect.width || 320);
      const cssH = Math.max(165, rect.height || 210);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.floor(cssW * dpr);
      this.canvas.height = Math.floor(cssH * dpr);
      this.ctx.setTransform((dpr * cssW) / this.w, 0, 0, (dpr * cssH) / this.h, 0, 0);
    }

    _startLoop() {
      if (this.rafId !== null) cancelAnimationFrame(this.rafId);
      const tick = (now) => {
        if (!this.isOpen) return;
        const elapsed = (now - this.stepStart) / 1000;
        this._draw(elapsed);
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    }

    // ステップごとの動く図解を描画する
    _draw(elapsed) {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);

      // 背景のダークネイビーと薄い深度目盛り
      ctx.fillStyle = "#101926";
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      for (let y = 36; y < this.h; y += 38) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.w, y);
        ctx.stroke();
      }

      if (this.stepIndex === 0) {
        this._drawStep1(elapsed % 5.6);
      } else if (this.stepIndex === 1) {
        this._drawStep2(elapsed % 4.0);
      } else {
        this._drawStep3(elapsed % 4.2);
      }
    }

    // STEP 1：赤×が出たら指をずらしてキャンセル → 別の泡を押して白く繋げるデモ
    _drawStep1(t) {
      const ctx = this.ctx;
      // 泡の配置：左(すでに白い)、中央左(押し込むと左が暴発する泡)、中央右(あとひと押しで白くなる泡)、右(安全な押し出し泡)
      const bWhite = { x: 76, y: 112, r: 27 };
      const bBad = { x: 132, y: 112, r: 21 };
      const bMid = { x: 188, y: 112, r: 22 };
      const bSafe = { x: 244, y: 112, r: 20 };

      // タイムライン：
      // 0.0〜0.5: 指がbBadへ移動
      // 0.5〜1.5: bBadを押し込み → bWhiteに赤リング＆赤×表示
      // 1.5〜2.1: 指を下にずらしてキャンセル（ビヨンと戻る）
      // 2.1〜2.7: 指がbSafeへ移動
      // 2.7〜3.6: bSafeを押し込み → bMidに白点線リング表示
      // 3.6〜5.6: 指を離す → bSafeがペチャンコ玉になり、空気がbMidへ飛んで白く光り接続！

      let fingerX = 132;
      let fingerY = 178;
      let fingerPress = false;
      let badPress = 0;
      let badDragY = 0;
      let safePress = 0;
      let safeReleased = false;
      let midCritical = false;
      let showBadWarn = false;
      let showSafePreview = false;
      let statusTag = "";
      let statusColor = "#ffffff";

      if (t < 0.5) {
        const p = easeInOut(t / 0.5);
        fingerX = 132;
        fingerY = lerp(182, 118, p);
      } else if (t < 1.5) {
        fingerX = 132;
        fingerY = 118;
        fingerPress = true;
        badPress = 1;
        showBadWarn = true;
        statusTag = "赤い×＝押し込みすぎ！";
        statusColor = "#ff5966";
      } else if (t < 2.2) {
        const p = easeOutCubic((t - 1.5) / 0.7);
        fingerX = 132;
        fingerY = lerp(118, 178, p);
        fingerPress = p < 0.85;
        badPress = p < 0.45 ? 1 : 0;
        badDragY = p < 0.45 ? lerp(0, 14, p / 0.45) : lerp(14, 0, (p - 0.45) / 0.55);
        statusTag = "指をずらしてキャンセル！";
        statusColor = "#9ad8ff";
      } else if (t < 2.8) {
        const p = easeInOut((t - 2.2) / 0.6);
        fingerX = lerp(132, 244, p);
        fingerY = lerp(178, 118, p);
      } else if (t < 3.7) {
        fingerX = 244;
        fingerY = 118;
        fingerPress = true;
        safePress = 1;
        showSafePreview = true;
        statusTag = "白リング＝臨界に届く！";
        statusColor = "#ffffff";
      } else {
        const p = clamp01((t - 3.7) / 0.5);
        fingerX = 244;
        fingerY = lerp(118, 168, easeOutCubic(p));
        safeReleased = true;
        midCritical = t >= 3.9;
        statusTag = "離して白く育てた！";
        statusColor = "#53d8fb";
      }

      // すでに白く育った bWhite と bMid（育った後）や仮の連鎖イメージ
      if (midCritical) {
        // 右上にさらに白泡を1個置いて2連鎖が繋がる気持ちよさを見せる
        this._drawLink(bMid.x, bMid.y, 188, 56);
      }
      // 上に待機している白い仲間泡
      this._drawBubble(188, 56, 25, "critical");

      // 4つの泡を描画
      this._drawBubble(bWhite.x, bWhite.y, bWhite.r, "critical");
      this._drawBubble(bBad.x, bBad.y + badDragY, bBad.r * (badPress ? 0.68 : 1), "growing", badPress > 0);
      this._drawBubble(bMid.x, bMid.y, midCritical ? 26 : bMid.r * (showSafePreview ? 1.07 : 1), midCritical ? "critical" : "growing");
      if (safeReleased) {
        this._drawFlat(bSafe.x, bSafe.y, 10);
      } else {
        this._drawBubble(bSafe.x, bSafe.y, bSafe.r * (safePress ? 0.68 : 1), "growing", safePress > 0);
      }

      // 押し込み時の矢印＆予兆リング
      if (showBadWarn) {
        this._drawArrow(bBad.x, bBad.y, bWhite.x, bWhite.y, "#ff4d5a");
        this._drawOverloadMark(bWhite.x, bWhite.y, bWhite.r + 5);
      }
      if (showSafePreview) {
        this._drawArrow(bSafe.x, bSafe.y, bMid.x, bMid.y, "#ffffff");
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(bMid.x, bMid.y, bMid.r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.6;
        ctx.stroke();
        ctx.restore();
      }

      // 離した瞬間の空気玉＆昇格リング
      if (t >= 3.7 && t < 4.0) {
        const p = (t - 3.7) / 0.3;
        const ax = lerp(bSafe.x, bMid.x, easeOutCubic(p));
        ctx.beginPath();
        ctx.arc(ax, bSafe.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
      if (t >= 3.9 && t < 4.5) {
        const p = (t - 3.9) / 0.6;
        this._drawPopRing(bMid.x, bMid.y, 20 + p * 26, "#ffffff", 1 - p);
      }

      this._drawFinger(fingerX, fingerY, fingerPress);
      if (statusTag) this._drawBannerTag(statusTag, statusColor);
    }

    // STEP 2：2連鎖以上でペチャンコ玉ごと吹っ飛び、コアが落ちるデモ
    _drawStep2(t) {
      const chainNodes = [
        { x: 112, y: 122, r: 24, popAt: 1.0 },
        { x: 162, y: 128, r: 25, popAt: 1.18 },
        { x: 212, y: 120, r: 24, popAt: 1.36 }
      ];
      const flats = [
        { x: 136, y: 158, popAt: 1.24 },
        { x: 186, y: 162, popAt: 1.4 },
        { x: 160, y: 92, popAt: 1.16 }
      ];

      // コアの落下アニメーション
      let coreY = 64;
      if (t > 1.25) {
        const fallT = clamp01((t - 1.25) / 0.9);
        coreY = lerp(64, 174, easeOutCubic(fallT));
      }

      // 連鎖前の白い接続線
      if (t < chainNodes[0].popAt) this._drawLink(chainNodes[0].x, chainNodes[0].y, chainNodes[1].x, chainNodes[1].y);
      if (t < chainNodes[1].popAt) this._drawLink(chainNodes[1].x, chainNodes[1].y, chainNodes[2].x, chainNodes[2].y);

      // ペチャンコ玉の描画＆粉砕演出
      for (const fl of flats) {
        if (t < fl.popAt) {
          this._drawFlat(fl.x, fl.y, 10);
        } else if (t < fl.popAt + 0.45) {
          const p = (t - fl.popAt) / 0.45;
          this._drawPopRing(fl.x, fl.y, 10 + p * 18, "#53d8fb", 1 - p);
        }
      }

      // 連鎖泡の描画＆破裂リング＆いいねスパーク
      for (const n of chainNodes) {
        if (t < n.popAt) {
          this._drawBubble(n.x, n.y, n.r, "critical");
        } else if (t < n.popAt + 0.55) {
          const p = (t - n.popAt) / 0.55;
          this._drawPopRing(n.x, n.y, n.r + p * 28, "#ffffff", 1 - p);
          this._drawSparks(n.x, n.y, n.r * 0.7 + p * 24, "#ffffff", 1 - p);
        }
      }

      // 光るコア
      this._drawCore(162, coreY, 17, false);

      // 指のタップ動き
      if (t < 1.35) {
        const p = clamp01(t / 0.75);
        const fy = t < 0.75 ? lerp(190, 128, easeInOut(p)) : lerp(128, 165, clamp01((t - 1.0) / 0.35));
        this._drawFinger(112, fy, t >= 0.75 && t <= 1.05);
      }

      if (t < 1.0) {
        this._drawBannerTag("白い塊をタップ！", "#ffffff");
      } else if (t < 2.2) {
        this._drawBannerTag("3 CHAIN! ペチャンコ玉ごと一掃！", "#53d8fb");
      } else {
        this._drawBannerTag("コアが下の空洞へ一気に落下！", "#ffd54f");
      }
    }

    // STEP 3：迫る赤いプレスラインから逃げ、4連鎖で押し戻すデモ
    _drawStep3(t) {
      const ctx = this.ctx;
      const chain4 = [
        { x: 96, y: 146, popAt: 1.45 },
        { x: 140, y: 152, popAt: 1.58 },
        { x: 184, y: 150, popAt: 1.71 },
        { x: 228, y: 144, popAt: 1.84 }
      ];

      // 赤いプレスライン：じわじわ迫り、4連鎖の瞬間に上へ押し戻される！
      let pressY = 26;
      if (t < 1.84) {
        pressY = lerp(24, 82, t / 1.84);
      } else if (t < 2.45) {
        pressY = lerp(82, 34, easeOutCubic((t - 1.84) / 0.61));
      } else {
        pressY = lerp(34, 48, (t - 2.45) / 1.75);
      }

      // コアの位置と危険点滅
      let coreY = 104;
      if (t > 1.65) {
        coreY = lerp(104, 178, easeOutCubic(clamp01((t - 1.65) / 0.85)));
      }
      const isCoreDanger = t < 1.75 && (coreY - 17) - pressY < 42;

      // 連鎖ライン
      for (let i = 0; i < chain4.length - 1; i++) {
        if (t < chain4[i].popAt) {
          this._drawLink(chain4[i].x, chain4[i].y, chain4[i + 1].x, chain4[i + 1].y);
        }
      }

      for (const n of chain4) {
        if (t < n.popAt) {
          this._drawBubble(n.x, n.y, 21, "critical");
        } else if (t < n.popAt + 0.55) {
          const p = (t - n.popAt) / 0.55;
          this._drawPopRing(n.x, n.y, 18 + p * 26, "#53d8fb", 1 - p);
          this._drawSparks(n.x, n.y, 14 + p * 22, "#ffffff", 1 - p);
        }
      }

      // コアと危険接近の警告線
      if (isCoreDanger) {
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(162, pressY + 4);
        ctx.lineTo(162, coreY - 18);
        ctx.strokeStyle = "#ff4d5a";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
      this._drawCore(162, coreY, 17, isCoreDanger);

      // 赤いプレス天井
      const grad = ctx.createLinearGradient(0, pressY - 40, 0, pressY);
      grad.addColorStop(0, "rgba(255, 45, 68, 0.25)");
      grad.addColorStop(1, "rgba(255, 58, 82, 0.86)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.w, pressY);
      ctx.beginPath();
      ctx.moveTo(0, pressY);
      ctx.lineTo(this.w, pressY);
      ctx.strokeStyle = "#ff6b7a";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = "#ff4d5a";
      for (let x = 0; x < this.w; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, pressY);
        ctx.lineTo(x + 8, pressY + 5);
        ctx.lineTo(x + 16, pressY);
        ctx.closePath();
        ctx.fill();
      }

      if (t > 0.7 && t < 1.8) {
        const fy = t < 1.2 ? lerp(200, 152, easeInOut((t - 0.7) / 0.5)) : lerp(152, 185, clamp01((t - 1.45) / 0.35));
        this._drawFinger(96, fy, t >= 1.2 && t <= 1.5);
      }

      if (t < 1.45) {
        this._drawBannerTag("赤いラインがコアに迫るとピンチ！", "#ff7a84");
      } else if (t < 2.6) {
        this._drawBannerTag("4 CHAIN! 赤いラインを押し戻した！", "#53d8fb");
      } else {
        this._drawBannerTag("深く潜るほどラインは速くなる", "#ffd54f");
      }
    }

    // 共通の描画パーツ群
    _drawBubble(x, y, r, state, pressed = false) {
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (state === "critical") {
        ctx.fillStyle = "#eef4fc";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, r + 2, 0, Math.PI * 2);
        ctx.strokeStyle = "#53d8fb";
        ctx.lineWidth = 1.8;
        ctx.stroke();
      } else {
        ctx.fillStyle = pressed ? "#294666" : "#3a5f85";
        ctx.fill();
        ctx.strokeStyle = pressed ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.18)";
        ctx.lineWidth = pressed ? 2 : 1.2;
        ctx.stroke();
        if (pressed) {
          ctx.beginPath();
          ctx.arc(x, y, r * 0.52, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(8, 12, 18, 0.38)";
          ctx.fill();
        }
      }
    }

    _drawFlat(x, y, r) {
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - r * 0.42, y);
      ctx.lineTo(x + r * 0.42, y);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    _drawCore(x, y, r, danger) {
      const ctx = this.ctx;
      ctx.save();
      ctx.shadowColor = danger ? "#ff4d5a" : "#53d8fb";
      ctx.shadowBlur = danger ? 18 : 14;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = danger ? "#ff4d5a" : "#53d8fb";
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(x - 4, y - 1);
      ctx.lineTo(x, y + 4);
      ctx.lineTo(x + 4, y - 1);
      ctx.strokeStyle = "#0c131c";
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    _drawLink(x1, y1, x2, y2) {
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
      ctx.lineWidth = 2.6;
      ctx.stroke();
    }

    _drawArrow(x1, y1, x2, y2, color) {
      const ctx = this.ctx;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const d = Math.hypot(dx, dy);
      if (d < 1) return;
      const ux = dx / d;
      const uy = dy / d;
      const sx = x1 + ux * 16;
      const sy = y1 + uy * 16;
      const ex = x2 - ux * 18;
      const ey = y2 - uy * 18;
      const h = 6;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.lineTo(ex - ux * h - uy * 4, ey - uy * h + ux * 4);
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - ux * h + uy * 4, ey - uy * h - ux * 4);
      ctx.stroke();
      ctx.restore();
    }

    _drawOverloadMark(x, y, r) {
      const ctx = this.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = "#ff3b4a";
      ctx.lineWidth = 3.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 7, y - 7);
      ctx.lineTo(x + 7, y + 7);
      ctx.moveTo(x + 7, y - 7);
      ctx.lineTo(x - 7, y + 7);
      ctx.strokeStyle = "#ff3b4a";
      ctx.lineWidth = 2.8;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
    }

    _drawPopRing(x, y, r, color, alpha) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = clamp01(alpha);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5 * clamp01(alpha);
      ctx.stroke();
      ctx.restore();
    }

    _drawSparks(x, y, r, color, alpha) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = clamp01(alpha);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * clamp01(alpha);
      ctx.lineCap = "round";
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * (r * 0.72), y + Math.sin(a) * (r * 0.72));
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        ctx.stroke();
      }
      ctx.restore();
    }

    // タッチ操作を直感的に表すシンプルな丸い指ポインタ
    _drawFinger(x, y, pressing) {
      const ctx = this.ctx;
      ctx.save();
      if (pressing) {
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(83, 216, 251, 0.28)";
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, pressing ? 9 : 11, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      ctx.fill();
      ctx.strokeStyle = "rgba(12, 19, 28, 0.6)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // キャンバス下部に短く表示するライブ字幕チップ
    _drawBannerTag(text, color) {
      const ctx = this.ctx;
      ctx.save();
      ctx.font = "800 11px -apple-system, BlinkMacSystemFont, sans-serif";
      const tw = ctx.measureText(text).width;
      const bw = tw + 18;
      const bh = 22;
      const bx = (this.w - bw) * 0.5;
      const by = this.h - 30;
      ctx.fillStyle = "rgba(8, 12, 18, 0.82)";
      ctx.beginPath();
      ctx.moveTo(bx + 11, by);
      ctx.arcTo(bx + bw, by, bx + bw, by + bh, 11);
      ctx.arcTo(bx + bw, by + bh, bx, by + bh, 11);
      ctx.arcTo(bx, by + bh, bx, by, 11);
      ctx.arcTo(bx, by, bx + bw, by, 11);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, this.w * 0.5, by + bh * 0.5 + 0.5);
      ctx.restore();
    }
  }

  window.TutorialPlayer = TutorialPlayer;
})();
