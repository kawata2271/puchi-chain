(() => {
  "use strict";

  // 仮想ワールド寸法（どのスマホ・PC画面でも同一の物理バランスにする）
  const WORLD_W = 360;
  const WORLD_H = 560;
  const PIXELS_PER_METER = 34;

  // 深さごとに世界の色・地形・障害物が変化する地層定義
  const LAYERS = [
    {
      minDepth: 0,
      name: "SURFACE",
      bg: "#0c131c",
      surface: "#121c29",
      border: "#22344b",
      wallFill: "#0a1018",
      wallStroke: "#2b4563",
      accent: "#53d8fb",
      bubbleHue: 204,
      armorChance: 0,
      wallWaveAmp: 10,
      rockInterval: 0
    },
    {
      minDepth: 30,
      name: "EMERALD CANYON",
      bg: "#0a1714",
      surface: "#11241f",
      border: "#20443a",
      wallFill: "#08120f",
      wallStroke: "#2c6b58",
      accent: "#42f5b3",
      bubbleHue: 158,
      armorChance: 0.13,
      wallWaveAmp: 34,
      rockInterval: 0
    },
    {
      minDepth: 65,
      name: "AMBER CAVERN",
      bg: "#19130b",
      surface: "#251c10",
      border: "#46351d",
      wallFill: "#130e08",
      wallStroke: "#7a5a2b",
      accent: "#ffd166",
      bubbleHue: 38,
      armorChance: 0.22,
      wallWaveAmp: 40,
      rockInterval: 230
    },
    {
      minDepth: 105,
      name: "VIOLET ABYSS",
      bg: "#140f20",
      surface: "#1d162f",
      border: "#382a59",
      wallFill: "#0f0b18",
      wallStroke: "#614896",
      accent: "#b794ff",
      bubbleHue: 264,
      armorChance: 0.3,
      wallWaveAmp: 44,
      rockInterval: 195
    },
    {
      minDepth: 150,
      name: "CRIMSON CORE",
      bg: "#1b0e12",
      surface: "#28151b",
      border: "#4d2633",
      wallFill: "#140a0d",
      wallStroke: "#8a3c52",
      accent: "#ff8c6b",
      bubbleHue: 12,
      armorChance: 0.36,
      wallWaveAmp: 46,
      rockInterval: 175
    }
  ];

  // デフォルトの調整パラメータ（ステップ4の検証用にリアルタイム変更可能）
  const DEFAULT_PARAMS = {
    pressSpeedScale: 1.0,    // 上から迫るプレスの速さ倍率
    airTransferRate: 1.25,   // 小さい泡を潰したときに隣へ押し出される空気量倍率
    criticalThreshold: 0.68, // 臨界（白く光って連鎖可能）になる膨らみ割合
    dangerDuration: 2.0,     // 赤泡が自爆するまでの猶予秒数
    chainDelayMs: 50         // 連鎖が隣へ伝わる時間間隔（ミリ秒）
  };

  // DOM要素の参照
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const canvasContainer = document.getElementById("canvasContainer");
  const depthValueEl = document.getElementById("depthValue");
  const bestDepthValueEl = document.getElementById("bestDepthValue");
  const scoreValueEl = document.getElementById("scoreValue");
  const layerNameEl = document.getElementById("layerName");
  const layerNextEl = document.getElementById("layerNext");
  const progressFillEl = document.getElementById("progressFill");
  const layerBannerEl = document.getElementById("layerBanner");
  const layerBannerSubEl = document.getElementById("layerBannerSub");
  const layerBannerTitleEl = document.getElementById("layerBannerTitle");
  const hintTextEl = document.getElementById("hintText");
  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const gameOverReasonEl = document.getElementById("gameOverReason");
  const finalDepthEl = document.getElementById("finalDepth");
  const finalMetaEl = document.getElementById("finalMeta");
  const retryBtn = document.getElementById("retryBtn");
  const protoToggleBtn = document.getElementById("protoToggleBtn");
  const soundToggleBtn = document.getElementById("soundToggleBtn");
  const tuningToggleBtn = document.getElementById("tuningToggleBtn");
  const tuningPanel = document.getElementById("tuningPanel");
  const resetParamsBtn = document.getElementById("resetParamsBtn");

  // パラメータ調整スライダー
  const sliders = {
    press: { input: document.getElementById("pressRange"), out: document.getElementById("pressOut") },
    transfer: { input: document.getElementById("transferRange"), out: document.getElementById("transferOut") },
    threshold: { input: document.getElementById("thresholdRange"), out: document.getElementById("thresholdOut") },
    danger: { input: document.getElementById("dangerRange"), out: document.getElementById("dangerOut") },
    delay: { input: document.getElementById("delayRange"), out: document.getElementById("delayOut") }
  };

  // サウンドエンジン
  const sound = new window.SoundEngine();

  // ローカルストレージから最高到達深度を読み込む
  const STORAGE_KEY_BEST_DEPTH = "puchi_deep_best_depth_v1";
  let bestDepth = Number(localStorage.getItem(STORAGE_KEY_BEST_DEPTH) || 0);

  // ゲーム全体の状態
  const params = { ...DEFAULT_PARAMS };
  let protoMode = false;
  let soundUserEnabled = true;

  let gameState = "ready"; // 'ready' | 'playing' | 'gameover'
  let elapsed = 0;
  let score = 0;
  let depthMeters = 0;
  let maxCoreY = 140;
  let startCoreY = 140;
  let sessionMaxChain = 0;
  let isNewBest = false;
  let gameOverLockUntil = 0;
  let currentLayerIndex = 0;
  let nextMilestoneDepth = 200;
  let bannerTimer = null;

  // カメラと迫る赤いプレス天井
  let cameraY = 0;
  let pressY = 14;
  let worldSeed = 0;
  let generatedUntilY = 0;
  let nextRockY = 0;
  let nextBubbleId = 1;

  // キャンバス表示スケール
  let viewWidth = WORLD_W;
  let viewHeight = WORLD_H;
  let viewScale = 1;

  // 物理エンティティ（重力コア・泡の配列・丸い岩柱）
  let core = null;
  let bubbles = [];
  let rocks = [];

  // 進行中の連鎖イベント管理
  let nextChainId = 1;
  let pendingPops = []; // { bubble, timeLeft, chainId, fromX, fromY }
  let activeChains = new Map();

  // 視覚エフェクト（通常モード時のみ表示）
  let particles = [];
  let rings = [];
  let beams = [];
  let airPuffs = [];
  let likeBursts = [];
  let confetti = [];
  let floatTexts = [];
  let shakeMag = 0;
  let errorShakeTime = 0;
  let errorShakeAmp = 0;
  let warningTickCooldown = 0;

  // マウスホバーおよびスマホの押し込み操作状態
  let hoverBubble = null;
  let activePointerId = null;
  let pressedBubble = null;
  let pressInside = false;
  let pressDragX = 0;
  let pressDragY = 0;
  let hoverGroupSet = new Set();
  let activeTransferPlan = [];
  let isPressPreview = false;

  // 圧力に応じた物理半径を返す
  function radiusForPressure(p) {
    const clamped = Math.max(0.08, Math.min(1, p));
    return 15.5 + Math.pow(clamped, 0.85) * 13.5;
  }

  // 現在の深さ（メートル）に対応する地層インデックスを返す
  function getLayerIndexForDepth(depth) {
    let idx = 0;
    for (let i = 0; i < LAYERS.length; i++) {
      if (depth >= LAYERS[i].minDepth) idx = i;
    }
    return idx;
  }

  // ワールドY座標における左右のうねる岩壁のX座標を返す
  function getWallBounds(y) {
    const depth = Math.max(0, (y - startCoreY) / PIXELS_PER_METER);
    const layer = LAYERS[getLayerIndexForDepth(depth)];
    // 深さに合わせて緩やかにうねり幅を広げる（最小通路幅は常に十分確保する）
    const ramp = Math.min(1, Math.max(0, (depth - 8) / 28));
    const amp = (8 + (layer.wallWaveAmp - 8) * ramp);
    const waveL = Math.sin(y * 0.0085 + worldSeed) * amp * 0.65 + Math.sin(y * 0.019 + worldSeed * 1.7) * amp * 0.35;
    const waveR = Math.cos(y * 0.0078 + worldSeed * 1.3) * amp * 0.65 + Math.sin(y * 0.017 + worldSeed * 0.7) * amp * 0.35;

    let left = 14 + Math.max(0, waveL);
    let right = WORLD_W - 14 - Math.max(0, waveR);

    // 最小通路幅 168px を保証して詰みを防ぐ
    const minGap = 168;
    if (right - left < minGap) {
      const mid = (left + right) * 0.5;
      left = mid - minGap * 0.5;
      right = mid + minGap * 0.5;
    }
    return { left, right };
  }

  // 地層テーマ色をCSS変数へ適用する
  function applyLayerTheme(layer) {
    const root = document.documentElement;
    root.style.setProperty("--bg", layer.bg);
    root.style.setProperty("--surface", layer.surface);
    root.style.setProperty("--surface-border", layer.border);
    root.style.setProperty("--theme-accent", layer.accent);
  }

  // HUDの数字をスプリングでポヨンと弾ませる
  function bumpElement(el) {
    if (protoMode || !el) return;
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }

  // エラー・警告用の水平シェイクを発火させる
  function triggerErrorShake(amp = 7) {
    if (protoMode) return;
    errorShakeTime = 0.28;
    errorShakeAmp = Math.max(errorShakeAmp, amp);
  }

  // 対応スマホ端末でのみ極小バイブレーション（ハプティクス）を鳴らす
  function triggerHaptic(pattern) {
    if (protoMode) return;
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(pattern);
      } catch (_) {}
    }
  }

  // 押し込み状態をリセットする
  function clearPressState() {
    if (activePointerId !== null) {
      try {
        if (canvas.hasPointerCapture(activePointerId)) {
          canvas.releasePointerCapture(activePointerId);
        }
      } catch (_) {}
    }
    activePointerId = null;
    pressedBubble = null;
    pressInside = false;
    pressDragX = 0;
    pressDragY = 0;
  }

  // 泡オブジェクトを作成する
  function createBubble(x, y, pressure, armored = false, staggerDelay = 0) {
    const state = pressure >= 1.0 ? "danger" : pressure >= params.criticalThreshold ? "critical" : "growing";
    return {
      id: nextBubbleId++,
      x,
      y,
      vx: 0,
      vy: 0,
      pressure,
      radius: radiusForPressure(pressure),
      state,
      armored,
      dangerTimer: 0,
      chainQueued: false,
      dead: false,
      scale: staggerDelay > 0 && !protoMode ? 0.01 : 1,
      scaleVel: 0,
      offsetX: 0,
      offsetY: 0,
      offsetVx: 0,
      offsetVy: 0,
      appearDelay: protoMode ? 0 : staggerDelay,
      wobblePhase: Math.random() * Math.PI * 2
    };
  }

  // 指定のY座標まで下層の泡と岩柱を自動生成する
  function generateDownTo(targetY, useStagger = false) {
    const rowSpacing = 44;

    while (generatedUntilY < targetY) {
      const y = generatedUntilY;
      const depth = Math.max(0, (y - startCoreY) / PIXELS_PER_METER);
      const layer = LAYERS[getLayerIndexForDepth(depth)];
      const { left, right } = getWallBounds(y);
      const width = right - left;

      // 深い層では一定間隔で丸い岩柱（障害物）を配置し、ルート分岐を生む
      if (layer.rockInterval > 0 && y >= nextRockY) {
        const rockR = 22 + Math.random() * 10;
        // 中央寄り、または左右どちらかに偏らせて必ず十分な迂回ルートを空ける
        const lane = Math.random();
        let rx = left + width * 0.5;
        if (lane < 0.33) {
          rx = left + rockR + 14;
        } else if (lane > 0.67) {
          rx = right - rockR - 14;
        } else {
          rx = left + width * (0.38 + Math.random() * 0.24);
        }
        rocks.push({ x: rx, y: y + 8, radius: rockR });
        nextRockY = y + layer.rockInterval + (Math.random() - 0.5) * 35;
      }

      // 升目にならないよう交互オフセット＋ランダム揺らぎで泡をぎゅうぎゅうに並べる
      const approxStep = 47;
      const count = Math.max(3, Math.floor((width - 20) / approxStep));
      const actualStep = (width - 34) / Math.max(1, count - 1);
      const rowIndex = Math.round(y / rowSpacing);
      const jitterShift = (rowIndex % 2 === 0 ? -1 : 1) * 7;

      for (let i = 0; i < count; i++) {
        const bx = left + 17 + i * actualStep + jitterShift + (Math.random() - 0.5) * 14;
        const by = y + (Math.random() - 0.5) * 12;
        const clampedX = Math.max(left + 20, Math.min(right - 20, bx));

        // 岩柱の内部に重なる位置はスキップする
        let insideRock = false;
        for (const rk of rocks) {
          if (Math.hypot(clampedX - rk.x, by - rk.y) < rk.radius + 20) {
            insideRock = true;
            break;
          }
        }
        if (insideRock) continue;

        // 簡単すぎないよう、大半は未成熟（自分で押し込んで連鎖を作る必要がある）
        const roll = Math.random();
        let pressure;
        let armored = false;
        if (depth > 8 && Math.random() < layer.armorChance) {
          armored = true;
          pressure = 0.45 + Math.random() * 0.2;
        } else if (roll < 0.16) {
          // 最初から臨界（連鎖の起点候補）
          pressure = Math.min(0.84, params.criticalThreshold + 0.05 + Math.random() * 0.1);
        } else if (roll < 0.42) {
          // あとひと押しで臨界になる絶好のターゲット
          pressure = Math.max(0.48, params.criticalThreshold - 0.14 + Math.random() * 0.11);
        } else {
          // 柔らかい小さい泡（空気供給源）
          pressure = 0.22 + Math.random() * 0.3;
        }

        const delay = useStagger ? Math.max(0, (by - startCoreY) * 0.00055) : 0;
        bubbles.push(createBubble(clampedX, by, pressure, armored, delay));
      }

      generatedUntilY += rowSpacing;
    }
  }

  // ゲーム全体を初期状態へリセットする
  function resetGame() {
    clearPressState();
    if (bannerTimer) {
      clearTimeout(bannerTimer);
      bannerTimer = null;
    }

    gameState = "ready";
    elapsed = 0;
    score = 0;
    depthMeters = 0;
    sessionMaxChain = 0;
    isNewBest = false;
    currentLayerIndex = 0;
    nextMilestoneDepth = 200;
    worldSeed = Math.random() * Math.PI * 2;

    startCoreY = 148;
    maxCoreY = startCoreY;
    cameraY = 0;
    pressY = 16;

    core = {
      x: WORLD_W * 0.5,
      y: startCoreY,
      vx: 0,
      vy: 0,
      radius: 21,
      pulse: 0
    };

    bubbles = [];
    rocks = [];
    pendingPops = [];
    activeChains.clear();
    particles = [];
    rings = [];
    beams = [];
    airPuffs = [];
    likeBursts = [];
    confetti = [];
    floatTexts = [];
    shakeMag = 0;
    errorShakeTime = 0;
    errorShakeAmp = 0;
    warningTickCooldown = 0;

    applyLayerTheme(LAYERS[0]);

    // 開幕直後：コアの真下に「すぐ連鎖で落とせる塊」と「押し込み用の小さい泡」を配置する
    const starterBubbles = [
      { x: 148, y: 205, p: Math.min(0.84, params.criticalThreshold + 0.11) },
      { x: 194, y: 208, p: Math.min(0.84, params.criticalThreshold + 0.11) },
      { x: 170, y: 248, p: Math.min(0.84, params.criticalThreshold + 0.11) },
      { x: 108, y: 212, p: Math.max(0.5, params.criticalThreshold - 0.11) },
      { x: 238, y: 214, p: Math.max(0.5, params.criticalThreshold - 0.11) },
      { x: 64, y: 216, p: 0.44 },
      { x: 288, y: 216, p: 0.46 },
      { x: 122, y: 256, p: 0.48 },
      { x: 222, y: 258, p: 0.48 },
      { x: 74, y: 262, p: 0.36 },
      { x: 276, y: 264, p: 0.38 }
    ];

    for (let i = 0; i < starterBubbles.length; i++) {
      const s = starterBubbles[i];
      bubbles.push(createBubble(s.x, s.y, s.p, false, i * 0.018));
    }

    generatedUntilY = 304;
    nextRockY = startCoreY + LAYERS[2].minDepth * PIXELS_PER_METER;
    generateDownTo(WORLD_H + 340, true);

    // 初期配置の重なりを軽く馴染ませる
    for (let k = 0; k < 6; k++) {
      resolveStaticOverlapPass();
    }

    layerBannerEl.classList.add("hidden");
    gameOverOverlay.classList.add("hidden");
    hintTextEl.classList.remove("hidden-soft");
    updateHud(false, false);
  }

  // 初期生成直後の重なりだけを落ち着かせる軽量パス
  function resolveStaticOverlapPass() {
    for (let i = 0; i < bubbles.length; i++) {
      const a = bubbles[i];
      const { left, right } = getWallBounds(a.y);
      if (a.x - a.radius < left) a.x = left + a.radius;
      if (a.x + a.radius > right) a.x = right - a.radius;
      for (let j = i + 1; j < bubbles.length; j++) {
        const b = bubbles[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minD = a.radius + b.radius + 1;
        const distSq = dx * dx + dy * dy;
        if (distSq < minD * minD && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const overlap = (minD - dist) * 0.5;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
        }
      }
    }
  }

  // HUDと地層進捗バーを更新する
  function updateHud(bumpDepth = false, bumpScore = false) {
    depthValueEl.textContent = `${depthMeters}m`;
    bestDepthValueEl.textContent = `${bestDepth}m`;
    scoreValueEl.textContent = String(score);

    const layer = LAYERS[currentLayerIndex];
    const nextLayer = LAYERS[currentLayerIndex + 1];
    layerNameEl.textContent = `LAYER ${currentLayerIndex + 1} · ${layer.name}`;

    if (nextLayer) {
      const span = nextLayer.minDepth - layer.minDepth;
      const pct = Math.max(0, Math.min(100, ((depthMeters - layer.minDepth) / span) * 100));
      progressFillEl.style.width = `${pct.toFixed(1)}%`;
      layerNextEl.textContent = `NEXT ${nextLayer.minDepth}m`;
    } else {
      const prevMark = nextMilestoneDepth - 50;
      const pct = Math.max(0, Math.min(100, ((depthMeters - prevMark) / 50) * 100));
      progressFillEl.style.width = `${pct.toFixed(1)}%`;
      layerNextEl.textContent = `GOAL ${nextMilestoneDepth}m`;
    }

    if (bumpDepth) bumpElement(depthValueEl);
    if (bumpScore) bumpElement(scoreValueEl);
  }

  // サウンド設定の同期
  function syncSoundEnabled() {
    sound.enabled = soundUserEnabled && !protoMode;
    soundToggleBtn.textContent = soundUserEnabled ? "音 ON" : "音 OFF";
    soundToggleBtn.classList.toggle("active", !soundUserEnabled);
  }

  // キャンバスの高DPIサイズ調整
  function resizeCanvas() {
    const rect = canvasContainer.getBoundingClientRect();
    viewWidth = Math.max(220, rect.width);
    viewHeight = Math.max(340, rect.height);
    viewScale = viewWidth / WORLD_W;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewWidth * dpr);
    canvas.height = Math.floor(viewHeight * dpr);
    ctx.setTransform(dpr * viewScale, 0, 0, dpr * viewScale, 0, 0);
  }

  // クライアント座標をワールド座標へ変換する
  function clientToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = (clientX - rect.left) / viewScale;
    const sy = (clientY - rect.top) / viewScale;
    return { x: sx, y: sy + cameraY, sx, sy };
  }

  // ワールド座標にある最も近い泡を取得する（スマホの指でも押しやすいよう少し広めに判定）
  function getBubbleAtWorld(wx, wy) {
    let best = null;
    let bestDist = Infinity;
    for (const b of bubbles) {
      if (b.dead) continue;
      const dx = wx - (b.x + b.offsetX);
      const dy = wy - (b.y + b.offsetY);
      const dist = Math.hypot(dx, dy);
      if (dist <= b.radius + 7 && dist < bestDist) {
        best = b;
        bestDist = dist;
      }
    }
    return best;
  }

  // 2つの泡が物理的に接触（近接）しているか判定する
  function areBubblesTouching(a, b, factor = 1.24) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const limit = (a.radius + b.radius) * factor;
    return dx * dx + dy * dy <= limit * limit;
  }

  // 指定した臨界／危険泡に繋がっている塊（連結成分）を返す
  function getConnectedCriticalGroup(start) {
    const result = new Set();
    if (!start || start.dead || start.armored) return result;
    if (start.state !== "critical" && start.state !== "danger") return result;

    const queue = [start];
    result.add(start);

    while (queue.length > 0) {
      const curr = queue.shift();
      for (const other of bubbles) {
        if (other.dead || other.armored || result.has(other)) continue;
        if (other.state !== "critical" && other.state !== "danger") continue;
        if (areBubblesTouching(curr, other, 1.26)) {
          result.add(other);
          queue.push(other);
        }
      }
    }
    return result;
  }

  // 現在の深さに応じた難易度パラメータを返す
  function getDifficultyMetrics() {
    const progress = Math.min(1, depthMeters / 170);
    // プレス速度：序盤から油断できないスピードで迫り、深層ほど速くなる
    const pressSpeed = (18 + progress * 26) * params.pressSpeedScale;
    // 赤泡の自爆猶予
    const dangerLimit = Math.max(1.1, params.dangerDuration * (1 - progress * 0.28));
    return { pressSpeed, dangerLimit, progress };
  }

  // 小さい泡を押し潰したときに、物理的に接している周囲の泡へどれだけ空気が逃げるか計算する
  function computeAirTransferPlan(source) {
    if (!source || source.dead || source.armored || source.state !== "growing" || source.chainQueued) {
      return [];
    }

    // 接触している泡（硬い泡は空気を受け取らない）を近い順に最大5個取得
    const candidates = [];
    for (const other of bubbles) {
      if (other === source || other.dead || other.armored || other.chainQueued) continue;
      const dist = Math.hypot(other.x - source.x, other.y - source.y);
      if (dist <= (source.radius + other.radius) * 1.32) {
        candidates.push({ bubble: other, dist });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    const targets = candidates.slice(0, 5).map((item) => item.bubble);

    if (targets.length === 0) return [];

    // 逃げ場（周囲の接触泡）が少ないほど一点に空気が集中して一気に膨らむ
    const totalAir = (0.16 + source.pressure * 0.78) * params.airTransferRate;
    const share = totalAir / targets.length;
    const { dangerLimit } = getDifficultyMetrics();

    return targets.map((target) => {
      let outcome = "grow";
      let willBurst = false;

      if (target.state === "danger") {
        outcome = "dangerAccel";
        const addedTime = share * dangerLimit * 1.65;
        if (target.dangerTimer + addedTime >= dangerLimit) {
          willBurst = true;
        }
      } else {
        const nextP = target.pressure + share;
        if (nextP >= 1.0) {
          outcome = "toDanger";
        } else if (target.state === "growing" && nextP >= params.criticalThreshold) {
          outcome = "toCritical";
        }
      }
      return { target, share, outcome, willBurst };
    });
  }

  // ポインタ押下時の処理
  function handlePointerDown(wx, wy, pointerId) {
    sound.unlock();

    if (gameState === "gameover") {
      if (performance.now() >= gameOverLockUntil) {
        resetGame();
      }
      return;
    }

    const b = getBubbleAtWorld(wx, wy);
    if (!b || b.dead || b.chainQueued) return;

    if (b.appearDelay > 0) {
      b.appearDelay = 0;
      b.scale = 1;
    }

    // 硬い殻の泡を直接叩いた場合は弾かれる（隣の連鎖爆風で砕く必要がある！）
    if (b.armored) {
      b.scaleVel -= 5.5;
      sound.playArmorClink();
      triggerErrorShake(4);
      triggerHaptic(8);
      if (!protoMode) {
        spawnRing(b.x, b.y, b.radius * 1.45, "rgba(200, 210, 225, 0.55)", 2);
      }
      return;
    }

    if (b.state === "critical" || b.state === "danger") {
      // 臨界／危険泡は触れた瞬間に即座に連鎖爆発！
      clearPressState();
      if (gameState === "ready") {
        gameState = "playing";
        hintTextEl.classList.add("hidden-soft");
      }
      const chainId = nextChainId++;
      activeChains.set(chainId, { count: 0 });
      b.chainQueued = true;
      triggerHaptic(14);
      executeChainPop(b, chainId, null, null);
    } else if (b.state === "growing") {
      // 小さい泡は指を置いているあいだ凹ませて空気の逃げ先を見せ、離したときに確定する
      if (activePointerId !== null) return;
      activePointerId = pointerId;
      pressedBubble = b;
      pressInside = true;
      pressDragX = 0;
      pressDragY = 0;
      b.scaleVel -= 5.2;
      sound.playPressStart();
      triggerHaptic(8);
      try {
        canvas.setPointerCapture(pointerId);
      } catch (_) {}
    }
  }

  // 押し込んでいた小さい泡を指から離したときに確定させる
  function confirmPressedBubble() {
    const b = pressedBubble;
    const shouldExecute =
      Boolean(b) &&
      pressInside &&
      (gameState === "ready" || gameState === "playing") &&
      !b.dead &&
      !b.armored &&
      b.state === "growing" &&
      !b.chainQueued;

    clearPressState();
    if (!shouldExecute) return;

    if (gameState === "ready") {
      gameState = "playing";
      hintTextEl.classList.add("hidden-soft");
    }
    triggerHaptic(12);
    squeezeGrowingBubble(b);
  }

  // 未成熟な泡を押し潰して、物理的に接触している周囲の泡へ空気を移動させる
  function squeezeGrowingBubble(b) {
    const plan = computeAirTransferPlan(b);
    const { dangerLimit } = getDifficultyMetrics();
    const sx = b.x;
    const sy = b.y;

    b.dead = true;
    sound.playAirPush(plan.length);

    if (!protoMode) {
      spawnRing(sx, sy, b.radius * 1.35, "rgba(180, 200, 225, 0.45)", 1.6);
    }

    let promotedToCritical = false;
    let pushedToDanger = false;

    for (const item of plan) {
      const target = item.target;
      if (target.dead) continue;

      if (!protoMode) {
        const layer = LAYERS[currentLayerIndex];
        const puffColor =
          item.outcome === "toDanger" || item.outcome === "dangerAccel"
            ? "#ff7a84"
            : item.outcome === "toCritical"
              ? "#ffffff"
              : layer.accent;
        airPuffs.push({
          x1: sx,
          y1: sy,
          x2: target.x,
          y2: target.y,
          color: puffColor,
          progress: 0
        });
      }

      target.scaleVel += 6.2;

      if (target.state === "danger") {
        target.dangerTimer += item.share * dangerLimit * 1.65;
        pushedToDanger = true;
        if (target.dangerTimer >= dangerLimit) {
          triggerGameOver("OVERLOAD BURST", target.x, target.y);
          return;
        }
      } else {
        const prevState = target.state;
        const nextP = target.pressure + item.share;

        if (nextP >= 1.0) {
          const overflow = nextP - 1.0;
          target.pressure = 1.0;
          target.radius = radiusForPressure(1.0);
          target.state = "danger";
          target.dangerTimer = Math.min(dangerLimit * 0.55, overflow * dangerLimit * 1.15);
          pushedToDanger = true;
          if (!protoMode) {
            spawnRing(target.x, target.y, target.radius * 1.5, "rgba(255, 77, 90, 0.7)", 2.2);
          }
        } else if (nextP >= params.criticalThreshold) {
          target.pressure = nextP;
          target.radius = radiusForPressure(nextP);
          target.state = "critical";
          if (prevState === "growing") {
            promotedToCritical = true;
            if (!protoMode) {
              spawnRing(target.x, target.y, target.radius * 1.45, "rgba(255, 255, 255, 0.55)", 1.8);
              spawnLikeBurst(target.x, target.y, target.radius * 1.5, "#ffffff", 6);
            }
          }
        } else {
          target.pressure = nextP;
          target.radius = radiusForPressure(nextP);
        }
      }
    }

    if (pushedToDanger) {
      sound.playOverloadPush();
      triggerErrorShake(6.5);
    } else if (promotedToCritical) {
      sound.playCharge();
    }
  }

  // 臨界／危険泡の連鎖破裂・爆風インパルス・硬い泡の粉砕処理
  function executeChainPop(b, chainId, fromX, fromY) {
    if (gameState !== "playing" || b.dead) return;

    const bx = b.x;
    const by = b.y;
    const br = b.radius;
    const wasDanger = b.state === "danger";
    const chainInfo = activeChains.get(chainId) || { count: 0 };
    chainInfo.count += 1;
    activeChains.set(chainId, chainInfo);

    const comboNum = chainInfo.count;
    if (comboNum > sessionMaxChain) {
      sessionMaxChain = comboNum;
    }

    b.dead = true;
    b.chainQueued = false;

    const gained = comboNum * 2 + (wasDanger ? 10 : 0);
    score += gained;
    updateHud(false, true);

    sound.playChainPop(comboNum - 1, wasDanger);
    if (comboNum > 1) {
      triggerHaptic(10);
    }

    const layer = LAYERS[currentLayerIndex];

    if (!protoMode) {
      const hueColor = wasDanger ? "#ff7a84" : comboNum >= 5 ? layer.accent : "#ffffff";
      spawnRing(bx, by, br * (2.1 + Math.min(0.9, comboNum * 0.1)), hueColor, wasDanger ? 3.5 : 2.5);
      spawnLikeBurst(bx, by, br * (1.8 + Math.min(0.6, comboNum * 0.08)), hueColor, 8);
      spawnParticles(bx, by, Math.min(18, 7 + comboNum * 2), hueColor, 155 + comboNum * 15);

      if (comboNum >= 6 && comboNum % 2 === 0) {
        spawnConfetti(bx, by, 14, 190);
      }

      if (fromX !== null && fromY !== null) {
        beams.push({ x1: fromX, y1: fromY, x2: bx, y2: by, life: 1 });
      }

      const label = wasDanger ? `+${gained} SAVE` : comboNum >= 3 ? `${comboNum} CHAIN!` : `+${gained}`;
      spawnFloatText(bx, by - 6, label, hueColor, Math.min(20, 12 + Math.floor(comboNum / 2)));
      shakeMag = Math.min(8.5, Math.max(shakeMag, 1.8 + comboNum * 0.5));
    }

    // 1. 周囲の泡へ爆風インパルス＆硬い殻の粉砕＆連鎖伝播
    const delaySec = params.chainDelayMs / 1000;
    let brokeArmor = false;

    for (const other of bubbles) {
      if (other === b || other.dead) continue;
      const dx = other.x - bx;
      const dy = other.y - by;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.001) continue;

      // 爆風による物理吹き飛ばし（雪崩と地形変化を生む！）
      const blastRange = br + other.radius + 54;
      if (dist < blastRange) {
        const power = (1 - dist / blastRange) * (155 + Math.min(90, comboNum * 12));
        other.vx += (dx / dist) * power;
        other.vy += (dy / dist) * power;
      }

      // 近接している硬い殻の泡は爆風で殻が砕け、臨界状態へ変わる！
      if (other.armored && dist <= (br + other.radius) * 1.42) {
        other.armored = false;
        other.pressure = Math.max(other.pressure, params.criticalThreshold + 0.06);
        other.radius = radiusForPressure(other.pressure);
        other.state = "critical";
        other.scaleVel += 7;
        brokeArmor = true;
        if (!protoMode) {
          spawnParticles(other.x, other.y, 10, "#d8e2f0", 170);
          spawnRing(other.x, other.y, other.radius * 1.6, "#ffffff", 2.4);
        }
        continue;
      }

      // 接触している他の臨界／危険泡へ連鎖予約
      if (!other.armored && !other.chainQueued && (other.state === "critical" || other.state === "danger")) {
        if (dist <= (br + other.radius) * 1.28) {
          other.chainQueued = true;
          other.scaleVel += 6.2;
          pendingPops.push({
            bubble: other,
            timeLeft: delaySec,
            fromX: bx,
            fromY: by,
            chainId
          });
        }
      }
    }

    if (brokeArmor) {
      sound.playArmorBreak();
    }

    // 2. 光るコアにも下向きの気持ちよい爆風アシスト（上への押し戻しは弱めて落ちやすくする）
    const cdx = core.x - bx;
    const cdy = core.y - by;
    const cdist = Math.hypot(cdx, cdy);
    if (cdist > 0.001 && cdist < br + core.radius + 58) {
      const f = (1 - cdist / (br + core.radius + 58)) * 90;
      core.vx += (cdx / cdist) * f;
      core.vy += Math.max(-25, (cdy / cdist) * f);
    }

    // 3. 大連鎖（5連鎖以上の節目）でプレスラインをわずかに押し上げるごほうび
    if (comboNum >= 5 && comboNum % 2 === 1) {
      pressY = Math.max(cameraY - 120, pressY - 14);
    }
  }

  // 新しい地層へ突入したときのお祝い演出
  function showLayerBanner(subText, titleText) {
    layerBannerSubEl.textContent = subText;
    layerBannerTitleEl.textContent = titleText;
    layerBannerEl.classList.remove("hidden");
    sound.playStageClear();
    triggerHaptic([12, 24, 18]);

    if (!protoMode) {
      spawnConfetti(WORLD_W * 0.5, cameraY + WORLD_H * 0.25, 26, 230);
    }

    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      layerBannerEl.classList.add("hidden");
      bannerTimer = null;
    }, 1700);
  }

  // ゲームオーバー処理（プレス圧潰または赤泡自爆）
  function triggerGameOver(reason, worldX, worldY) {
    clearPressState();
    gameState = "gameover";
    pendingPops = [];
    activeChains.clear();
    gameOverLockUntil = performance.now() + 300;
    layerBannerEl.classList.add("hidden");

    sound.playBurst();
    triggerHaptic([35, 30, 55]);

    const sx = Math.max(0, Math.min(WORLD_W, worldX));
    const sy = Math.max(0, Math.min(WORLD_H, worldY - cameraY));
    const rx = (sx / WORLD_W) * 100;
    const ry = (sy / WORLD_H) * 100;
    gameOverOverlay.style.setProperty("--reveal-x", `${rx.toFixed(1)}%`);
    gameOverOverlay.style.setProperty("--reveal-y", `${ry.toFixed(1)}%`);

    if (!protoMode) {
      spawnRing(worldX, worldY, 54, "#ff4d5a", 5);
      spawnLikeBurst(worldX, worldY, 44, "#ff4d5a", 10);
      spawnParticles(worldX, worldY, 30, "#ff4d5a", 240);
      triggerErrorShake(13);
    }

    gameOverReasonEl.textContent = reason;
    finalDepthEl.textContent = `${depthMeters}m`;
    finalMetaEl.textContent = isNewBest
      ? `NEW BEST!  /  SCORE ${score}  /  MAX CHAIN ${sessionMaxChain}`
      : `BEST ${bestDepth}m  /  SCORE ${score}  /  MAX CHAIN ${sessionMaxChain}`;

    setTimeout(() => {
      if (gameState === "gameover") {
        gameOverOverlay.classList.remove("hidden");
        if (isNewBest && !protoMode) {
          spawnConfetti(WORLD_W * 0.5, cameraY + WORLD_H * 0.42, 38, 270);
        }
      }
    }, 190);
  }

  // エフェクト生成ヘルパー群
  function spawnLikeBurst(x, y, maxRadius, color, count) {
    likeBursts.push({
      x,
      y,
      maxRadius,
      color,
      count,
      rotation: Math.random() * Math.PI * 2,
      life: 1
    });
  }

  function spawnConfetti(x, y, count, speed) {
    const layer = LAYERS[currentLayerIndex];
    const palette = ["#ffffff", layer.accent, "#ffd166", "#ff6b81", "#a3f7bf", "#c4b5fd"];
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.7;
      const spd = speed * (0.45 + Math.random() * 0.85);
      confetti.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 45,
        w: 4.5 + Math.random() * 3.5,
        h: 2.5 + Math.random() * 2.2,
        angle: Math.random() * Math.PI * 2,
        vAngle: (Math.random() - 0.5) * 14,
        flip: Math.random() * Math.PI * 2,
        flipSpeed: 7 + Math.random() * 8,
        color: palette[i % palette.length],
        life: 1,
        decay: 0.65 + Math.random() * 0.4
      });
    }
  }

  function spawnParticles(x, y, count, color, speed) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45;
      const spd = speed * (0.45 + Math.random() * 0.75);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        radius: 1.8 + Math.random() * 2.5,
        color,
        life: 1,
        decay: 2.2 + Math.random() * 1.2
      });
    }
  }

  function spawnRing(x, y, maxRadius, color, lineWidth) {
    rings.push({
      x,
      y,
      radius: 8,
      maxRadius,
      color,
      lineWidth,
      life: 1
    });
  }

  function spawnFloatText(x, y, text, color, size) {
    floatTexts.push({
      x,
      y,
      vy: -38,
      text,
      color,
      size,
      life: 1
    });
  }

  // 押し込み中／ホバー中の予測状態を最新化する
  function refreshPreview() {
    if (gameState === "gameover") {
      hoverGroupSet.clear();
      activeTransferPlan = [];
      isPressPreview = false;
      return;
    }

    if (pressedBubble) {
      hoverGroupSet.clear();
      if (pressInside && !pressedBubble.dead && !pressedBubble.armored && pressedBubble.state === "growing" && !pressedBubble.chainQueued) {
        activeTransferPlan = computeAirTransferPlan(pressedBubble);
        isPressPreview = true;
      } else {
        activeTransferPlan = [];
        isPressPreview = false;
      }
      return;
    }

    isPressPreview = false;
    if (!hoverBubble || hoverBubble.dead || hoverBubble.armored) {
      hoverGroupSet.clear();
      activeTransferPlan = [];
      return;
    }
    if (hoverBubble.state === "critical" || hoverBubble.state === "danger") {
      hoverGroupSet = getConnectedCriticalGroup(hoverBubble);
      activeTransferPlan = [];
    } else if (hoverBubble.state === "growing") {
      hoverGroupSet.clear();
      activeTransferPlan = computeAirTransferPlan(hoverBubble);
    } else {
      hoverGroupSet.clear();
      activeTransferPlan = [];
    }
  }

  // 2D円物理ステップ（重力・衝突解決・壁・岩柱・爆風雪崩）
  function stepPhysics(dt) {
    const activeBottomLimit = generatedUntilY - 12;
    const sleepThresholdY = cameraY + WORLD_H + 140;

    // 1. 重力と減衰を適用（画面よりずっと下の未到達地層は固定支えとしてスリープさせる）
    const simBubbles = [];
    for (const b of bubbles) {
      if (b.dead) continue;
      if (b.y > cameraY + WORLD_H + 260) continue;
      const isSleeping = b.y > sleepThresholdY;
      b._fixed = isSleeping || (pressedBubble === b && pressInside);
      simBubbles.push(b);

      if (b._fixed) {
        b.vx *= 0.5;
        b.vy *= 0.5;
        continue;
      }

      b.vy += 290 * dt;
      const damp = Math.pow(0.14, dt);
      b.vx *= damp;
      b.vy *= damp;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    // 重い光るコアはしっかり下へ落ちる
    core.vy += 520 * dt;
    const coreDamp = Math.pow(0.28, dt);
    core.vx *= coreDamp;
    core.vy *= coreDamp;
    core.x += core.vx * dt;
    core.y += core.vy * dt;

    // 2. 反復位置補正（円同士・コア・岩柱・左右の壁・最下端の支え）
    const iterations = 4;
    for (let iter = 0; iter < iterations; iter++) {
      // 泡同士の衝突解決（下層スリープ泡がどっしり支えになるためすり抜けゼロ）
      for (let i = 0; i < simBubbles.length; i++) {
        const a = simBubbles[i];
        const aFixed = a._fixed;
        for (let j = i + 1; j < simBubbles.length; j++) {
          const b = simBubbles[j];
          const bFixed = b._fixed;
          if (aFixed && bFixed) continue;

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const minD = a.radius + b.radius;
          const distSq = dx * dx + dy * dy;
          if (distSq < minD * minD && distSq > 0.0001) {
            const dist = Math.sqrt(distSq);
            const overlap = minD - dist;
            const nx = dx / dist;
            const ny = dy / dist;
            if (aFixed && !bFixed) {
              b.x += nx * overlap;
              b.y += ny * overlap;
            } else if (!aFixed && bFixed) {
              a.x -= nx * overlap;
              a.y -= ny * overlap;
            } else {
              const half = overlap * 0.5;
              a.x -= nx * half;
              a.y -= ny * half;
              b.x += nx * half;
              b.y += ny * half;
            }
          }
        }
      }

      // 光るコアと泡の衝突解決（コアの方が重いので泡を押し分けながら落ちる）
      for (const b of simBubbles) {
        const dx = b.x - core.x;
        const dy = b.y - core.y;
        const minD = core.radius + b.radius;
        const distSq = dx * dx + dy * dy;
        if (distSq < minD * minD && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const overlap = minD - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          const coreShare = b._fixed ? 1.0 : 0.28;
          const bubbleShare = 1.0 - coreShare;
          core.x -= nx * overlap * coreShare;
          core.y -= ny * overlap * coreShare;
          b.x += nx * overlap * bubbleShare;
          b.y += ny * overlap * bubbleShare;
          if (ny > 0.3 && core.vy > 0) {
            core.vy *= 0.86;
          }
        }
      }

      // 岩柱との衝突解決
      for (const rk of rocks) {
        if (rk.y < cameraY - 120 || rk.y > cameraY + WORLD_H + 220) continue;

        const cdx = core.x - rk.x;
        const cdy = core.y - rk.y;
        const cMin = core.radius + rk.radius;
        const cSq = cdx * cdx + cdy * cdy;
        if (cSq < cMin * cMin && cSq > 0.0001) {
          const d = Math.sqrt(cSq);
          const ov = cMin - d;
          core.x += (cdx / d) * ov;
          core.y += (cdy / d) * ov;
        }

        for (const b of simBubbles) {
          if (b._fixed) continue;
          const dx = b.x - rk.x;
          const dy = b.y - rk.y;
          const minD = b.radius + rk.radius;
          const sq = dx * dx + dy * dy;
          if (sq < minD * minD && sq > 0.0001) {
            const d = Math.sqrt(sq);
            const ov = minD - d;
            b.x += (dx / d) * ov;
            b.y += (dy / d) * ov;
          }
        }
      }

      // 左右のうねる岩壁と最下端の支え
      for (const b of simBubbles) {
        if (b._fixed) continue;
        const { left, right } = getWallBounds(b.y);
        if (b.x - b.radius < left) {
          b.x = left + b.radius;
          if (b.vx < 0) b.vx *= -0.25;
        } else if (b.x + b.radius > right) {
          b.x = right - b.radius;
          if (b.vx > 0) b.vx *= -0.25;
        }
        if (b.y + b.radius > activeBottomLimit) {
          b.y = activeBottomLimit - b.radius;
          if (b.vy > 0) b.vy = 0;
        }
      }

      const coreWalls = getWallBounds(core.y);
      if (core.x - core.radius < coreWalls.left) {
        core.x = coreWalls.left + core.radius;
        if (core.vx < 0) core.vx *= -0.3;
      } else if (core.x + core.radius > coreWalls.right) {
        core.x = coreWalls.right - core.radius;
        if (core.vx > 0) core.vx *= -0.3;
      }
      if (core.y + core.radius > activeBottomLimit) {
        core.y = activeBottomLimit - core.radius;
        if (core.vy > 0) core.vy = 0;
      }
    }
  }

  // フレームごとの状態更新
  function update(dt) {
    if (pressedBubble && (pressedBubble.dead || pressedBubble.armored || pressedBubble.state !== "growing" || pressedBubble.chainQueued)) {
      clearPressState();
    }

    core.pulse += dt * 4.5;

    // 死んだ泡や遠く上へ通り過ぎた泡・岩柱を掃除する
    const pruneY = cameraY - 220;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      if (bubbles[i].dead || bubbles[i].y < pruneY) {
        bubbles.splice(i, 1);
      }
    }
    for (let i = rocks.length - 1; i >= 0; i--) {
      if (rocks[i].y < pruneY) {
        rocks.splice(i, 1);
      }
    }

    // バネ物理（スタッガー・押し込み凹み・ラバーバンド）
    const rubberLimit = 36;
    for (const b of bubbles) {
      if (b.appearDelay > 0) {
        b.appearDelay -= dt;
        if (b.appearDelay <= 0) {
          b.appearDelay = 0;
          b.scale = 0.05;
          b.scaleVel = 13.5;
        }
        continue;
      }

      const isActivelyPressed = pressedBubble === b && pressInside;
      const targetScale = isActivelyPressed ? 0.64 : 1;
      const stiffness = isActivelyPressed ? 240 : 185;
      const damping = 13.5;
      b.scaleVel += (targetScale - b.scale) * stiffness * dt;
      b.scaleVel *= Math.max(0, 1 - damping * dt);
      b.scale += b.scaleVel * dt;

      let targetOx = 0;
      let targetOy = 0;
      if (isActivelyPressed && !protoMode) {
        targetOx = (pressDragX * 0.44) / (1 + Math.abs(pressDragX) / rubberLimit);
        targetOy = (pressDragY * 0.44) / (1 + Math.abs(pressDragY) / rubberLimit);
      }
      const oStiff = isActivelyPressed ? 260 : 320;
      const oDamp = isActivelyPressed ? 20 : 11.5;
      b.offsetVx += (targetOx - b.offsetX) * oStiff * dt;
      b.offsetVy += (targetOy - b.offsetY) * oStiff * dt;
      b.offsetVx *= Math.max(0, 1 - oDamp * dt);
      b.offsetVy *= Math.max(0, 1 - oDamp * dt);
      b.offsetX += b.offsetVx * dt;
      b.offsetY += b.offsetVy * dt;

      b.wobblePhase += dt * (b.state === "danger" ? 26 : 11);
    }

    // エフェクト更新
    if (shakeMag > 0.05) {
      shakeMag *= Math.pow(0.001, dt);
    } else {
      shakeMag = 0;
    }

    if (errorShakeTime > 0) {
      errorShakeTime = Math.max(0, errorShakeTime - dt);
      if (errorShakeTime === 0) errorShakeAmp = 0;
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.06, dt);
      p.vy *= Math.pow(0.06, dt);
      p.life -= p.decay * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      const rg = rings[i];
      rg.life -= dt * 3.4;
      const t = 1 - Math.max(0, rg.life);
      rg.radius = 8 + (rg.maxRadius - 8) * (1 - Math.pow(1 - t, 3));
      if (rg.life <= 0) rings.splice(i, 1);
    }

    for (let i = beams.length - 1; i >= 0; i--) {
      beams[i].life -= dt * 5.2;
      if (beams[i].life <= 0) beams.splice(i, 1);
    }

    for (let i = airPuffs.length - 1; i >= 0; i--) {
      airPuffs[i].progress += dt * 7.2;
      if (airPuffs[i].progress >= 1) airPuffs.splice(i, 1);
    }

    for (let i = likeBursts.length - 1; i >= 0; i--) {
      likeBursts[i].life -= dt * 3.1;
      if (likeBursts[i].life <= 0) likeBursts.splice(i, 1);
    }

    for (let i = confetti.length - 1; i >= 0; i--) {
      const cf = confetti[i];
      cf.vy += 420 * dt;
      cf.vx *= Math.pow(0.28, dt);
      cf.vy *= Math.pow(0.55, dt);
      cf.x += cf.vx * dt;
      cf.y += cf.vy * dt;
      cf.angle += cf.vAngle * dt;
      cf.flip += cf.flipSpeed * dt;
      cf.life -= cf.decay * dt;
      if (cf.life <= 0) confetti.splice(i, 1);
    }

    for (let i = floatTexts.length - 1; i >= 0; i--) {
      const ft = floatTexts[i];
      ft.y += ft.vy * dt;
      ft.vy *= Math.pow(0.18, dt);
      ft.life -= dt * 1.65;
      if (ft.life <= 0) floatTexts.splice(i, 1);
    }

    if (gameState !== "playing") {
      refreshPreview();
      return;
    }

    elapsed += dt;
    const { pressSpeed, dangerLimit } = getDifficultyMetrics();

    // 予約済みの連鎖ポップを進める
    for (let i = pendingPops.length - 1; i >= 0; i--) {
      const item = pendingPops[i];
      item.timeLeft -= dt;
      if (item.timeLeft <= 0) {
        pendingPops.splice(i, 1);
        executeChainPop(item.bubble, item.chainId, item.fromX, item.fromY);
        if (gameState !== "playing") return;
      }
    }

    if (pendingPops.length === 0 && activeChains.size > 0) {
      activeChains.clear();
    }

    // 2D物理ステップを実行（泡の雪崩＆コア落下）
    stepPhysics(dt);

    // 深度の更新と新地層の自動生成・テーマ切替
    if (core.y > maxCoreY) {
      maxCoreY = core.y;
      const newDepth = Math.floor((maxCoreY - startCoreY) / PIXELS_PER_METER);
      if (newDepth > depthMeters) {
        const diff = newDepth - depthMeters;
        depthMeters = newDepth;
        score += diff * 5;
        if (depthMeters > bestDepth) {
          bestDepth = depthMeters;
          isNewBest = true;
          localStorage.setItem(STORAGE_KEY_BEST_DEPTH, String(bestDepth));
        }

        const nextLayerIdx = getLayerIndexForDepth(depthMeters);
        if (nextLayerIdx > currentLayerIndex) {
          currentLayerIndex = nextLayerIdx;
          const layer = LAYERS[currentLayerIndex];
          applyLayerTheme(layer);
          showLayerBanner(`DEPTH ${layer.minDepth}m`, layer.name);
        } else if (currentLayerIndex === LAYERS.length - 1 && depthMeters >= nextMilestoneDepth) {
          showLayerBanner(`DEPTH ${nextMilestoneDepth}m`, "DEEP ABYSS");
          nextMilestoneDepth += 50;
        }
        updateHud(true, false);
      }
    }

    // カメラがコアを滑らかに下へ追いかける（上には戻さない）
    const targetCamY = Math.max(cameraY, core.y - WORLD_H * 0.34);
    cameraY += (targetCamY - cameraY) * Math.min(1, dt * 6.5);

    // 下の未開拓地層をシームレスに先読み生成する
    generateDownTo(cameraY + WORLD_H + 340, false);

    // 上から迫る赤いプレス天井を進行させる
    pressY += pressSpeed * dt;
    // コアが大きく落下して引き離しても、画面上端のすぐ上までプレスが追随して緊張感を維持する
    const minPressY = cameraY - 96;
    if (pressY < minPressY) {
      pressY = minPressY;
    }

    // プレスがコアに到達したら即ゲームオーバー！
    if (core.y - core.radius <= pressY + 3) {
      triggerGameOver("CRUSHED BY PRESS", core.x, core.y);
      return;
    }

    // 各泡の危険カウントダウン・プレス圧迫・ごく緩やかな膨張を更新
    let maxUrgency = 0;
    for (const b of bubbles) {
      if (b.dead || b.chainQueued) continue;

      // プレス天井に完全に飲み込まれた泡は弾けて消える
      if (b.y + b.radius * 0.4 < pressY) {
        b.dead = true;
        if (!protoMode) {
          spawnParticles(b.x, pressY, 5, "#ff4d5a", 90);
        }
        continue;
      }

      if (b.armored) continue;
      if (pressedBubble === b && pressInside) continue;

      // 画面内の上部でプレスに圧迫されている泡は急速に危険化する
      const distFromPress = (b.y - b.radius) - pressY;
      if (distFromPress < 22 && distFromPress > -20) {
        b.pressure = Math.min(1.0, b.pressure + 0.25 * dt);
        b.radius = radiusForPressure(b.pressure);
      } else if (b.y < cameraY + WORLD_H + 40) {
        // 通常時はごくわずかにしか膨らまない（自分で押し込んで連鎖を作る必要がある！）
        b.pressure = Math.min(1.0, b.pressure + 0.007 * dt);
        b.radius = radiusForPressure(b.pressure);
      }

      if (b.pressure >= 1.0 && b.state !== "danger") {
        b.state = "danger";
        b.dangerTimer = 0;
        b.scaleVel += 4.0;
      } else if (b.pressure >= params.criticalThreshold && b.state === "growing") {
        b.state = "critical";
        b.scaleVel += 3.0;
      }

      if (b.state === "danger") {
        b.dangerTimer += dt;
        const urgency = Math.min(1, b.dangerTimer / dangerLimit);
        if (urgency > maxUrgency) maxUrgency = urgency;
        if (b.dangerTimer >= dangerLimit) {
          triggerGameOver("OVERLOAD BURST", b.x, b.y);
          return;
        }
      }
    }

    // プレスがコアに近づいているときの緊迫感も警告音に反映
    const pressGap = (core.y - core.radius) - pressY;
    if (pressGap < 85) {
      maxUrgency = Math.max(maxUrgency, 1 - Math.max(0, pressGap) / 85);
    }

    if (maxUrgency > 0) {
      warningTickCooldown -= dt;
      if (warningTickCooldown <= 0) {
        sound.playWarningTick(maxUrgency);
        warningTickCooldown = Math.max(0.18, 0.58 - maxUrgency * 0.36);
      }
    } else {
      warningTickCooldown = 0;
    }

    refreshPreview();
  }

  // ワールド全体を描画する
  function draw() {
    ctx.clearRect(0, 0, WORLD_W, WORLD_H);
    const { dangerLimit } = getDifficultyMetrics();
    const layer = LAYERS[currentLayerIndex];

    ctx.save();
    if (!protoMode) {
      let sx = 0;
      let sy = 0;
      if (shakeMag > 0.1) {
        sx += (Math.random() - 0.5) * 2 * shakeMag;
        sy += (Math.random() - 0.5) * 2 * shakeMag;
      }
      if (errorShakeTime > 0) {
        const ratio = errorShakeTime / 0.28;
        sx += Math.sin(errorShakeTime * 72) * errorShakeAmp * ratio;
      }
      if (sx !== 0 || sy !== 0) {
        ctx.translate(sx, sy);
      }
    }

    // 1. 背景の深度目盛り線（スクロール感とスピード感を強調する）
    drawDepthGridLines(layer);

    // ワールド座標系へ移動
    ctx.save();
    ctx.translate(0, -cameraY);

    // 2. 左右のうねる岩壁と、丸い岩柱（障害物）
    drawWallsAndRocks(layer);

    // 3. 接触している臨界／危険泡同士を繋ぐ白いライン
    ctx.lineCap = "round";
    for (let i = 0; i < bubbles.length; i++) {
      const a = bubbles[i];
      if (a.dead || a.armored || a.appearDelay > 0) continue;
      if (a.y < cameraY - 60 || a.y > cameraY + WORLD_H + 60) continue;
      if (a.state !== "critical" && a.state !== "danger") continue;

      for (let j = i + 1; j < bubbles.length; j++) {
        const b = bubbles[j];
        if (b.dead || b.armored || b.appearDelay > 0) continue;
        if (b.state !== "critical" && b.state !== "danger") continue;
        if (!areBubblesTouching(a, b, 1.26)) continue;

        const inHoverGroup = hoverGroupSet.has(a) && hoverGroupSet.has(b);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (protoMode) {
          ctx.strokeStyle = inHoverGroup ? "#222222" : "#888888";
          ctx.lineWidth = inHoverGroup ? 3 : 1.5;
        } else {
          ctx.strokeStyle = inHoverGroup ? "rgba(255, 255, 255, 0.85)" : "rgba(255, 255, 255, 0.3)";
          ctx.lineWidth = inHoverGroup ? 4.2 : 2.4;
        }
        ctx.stroke();
      }
    }

    // 4. 小さい泡の押し込み中またはホバー時：空気の逃げ先ガイド矢印
    const transferSource = isPressPreview ? pressedBubble : hoverBubble;
    if (transferSource && !transferSource.dead && activeTransferPlan.length > 0 && gameState !== "gameover") {
      for (const item of activeTransferPlan) {
        const t = item.target;
        if (t.dead) continue;
        const isDangerOut = item.outcome === "toDanger" || item.outcome === "dangerAccel";
        const isPromoOut = item.outcome === "toCritical";
        const color = protoMode
          ? isDangerOut ? "#111111" : isPressPreview ? "#333333" : "#555555"
          : isDangerOut
            ? isPressPreview ? "rgba(255, 92, 106, 0.98)" : "rgba(255, 92, 106, 0.85)"
            : isPromoOut
              ? isPressPreview ? "rgba(255, 255, 255, 0.98)" : "rgba(255, 255, 255, 0.8)"
              : isPressPreview ? "rgba(195, 224, 255, 0.85)" : "rgba(170, 200, 235, 0.5)";

        const lw = isPressPreview ? (isDangerOut || isPromoOut ? 3.2 : 2.3) : (isDangerOut || isPromoOut ? 2.1 : 1.5);
        drawAirArrow(transferSource.x + transferSource.offsetX, transferSource.y + transferSource.offsetY, t.x, t.y, color, lw, isPressPreview ? 6.5 : 5);
      }
    }

    // 5. 連鎖伝播の閃光ラインと空気の玉
    if (!protoMode) {
      for (const bm of beams) {
        ctx.beginPath();
        ctx.moveTo(bm.x1, bm.y1);
        ctx.lineTo(bm.x2, bm.y2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${bm.life * 0.9})`;
        ctx.lineWidth = 3.8 * bm.life;
        ctx.stroke();
      }

      for (const puff of airPuffs) {
        const t = Math.min(1, puff.progress);
        const ease = 1 - Math.pow(1 - t, 2);
        const px = puff.x1 + (puff.x2 - puff.x1) * ease;
        const py = puff.y1 + (puff.y2 - puff.y1) * ease;
        ctx.save();
        ctx.globalAlpha = 1 - t * 0.6;
        ctx.beginPath();
        ctx.arc(px, py, 4.8 * (1 - t * 0.3), 0, Math.PI * 2);
        ctx.fillStyle = puff.color;
        ctx.fill();
        ctx.restore();
      }
    }

    // 6. すべての泡を描画する
    const transferTargetMap = new Map();
    for (const item of activeTransferPlan) {
      transferTargetMap.set(item.target, item);
    }

    for (const b of bubbles) {
      if (b.dead || b.appearDelay > 0) continue;
      if (b.y < cameraY - 50 || b.y > cameraY + WORLD_H + 55) continue;
      drawBubble(b, layer, dangerLimit, transferTargetMap.get(b));
    }

    // 7. 光る重力コアを描画する
    drawCore(layer);

    // 8. 拡散リング・いいねのはじけ・パーティクル・紙吹雪・ポップアップ文字
    if (!protoMode) {
      for (const rg of rings) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, rg.life);
        ctx.beginPath();
        ctx.arc(rg.x, rg.y, rg.radius, 0, Math.PI * 2);
        ctx.strokeStyle = rg.color;
        ctx.lineWidth = rg.lineWidth * rg.life;
        ctx.stroke();
        ctx.restore();
      }

      for (const lb of likeBursts) {
        const t = 1 - Math.max(0, lb.life);
        const ease = 1 - Math.pow(1 - t, 3);
        const innerR = lb.maxRadius * (0.32 + ease * 0.52);
        const outerR = lb.maxRadius * (0.48 + ease * 0.65);
        const dotR = lb.maxRadius * (0.28 + ease * 0.84);

        ctx.save();
        ctx.globalAlpha = Math.max(0, lb.life);
        ctx.strokeStyle = lb.color;
        ctx.fillStyle = lb.color;
        ctx.lineWidth = 2 * lb.life;
        ctx.lineCap = "round";

        for (let i = 0; i < lb.count; i++) {
          const angle = lb.rotation + (Math.PI * 2 * i) / lb.count;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          ctx.beginPath();
          ctx.moveTo(lb.x + cos * innerR, lb.y + sin * innerR);
          ctx.lineTo(lb.x + cos * outerR, lb.y + sin * outerR);
          ctx.stroke();

          const dotAngle = angle + Math.PI / lb.count;
          ctx.beginPath();
          ctx.arc(lb.x + Math.cos(dotAngle) * dotR, lb.y + Math.sin(dotAngle) * dotR, 2.2 * lb.life, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      for (const p of particles) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.restore();
      }

      for (const cf of confetti) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, cf.life * 1.4));
        ctx.translate(cf.x, cf.y);
        ctx.rotate(cf.angle);
        ctx.scale(1, Math.cos(cf.flip));
        ctx.fillStyle = cf.color;
        ctx.fillRect(-cf.w / 2, -cf.h / 2, cf.w, cf.h);
        ctx.restore();
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const ft of floatTexts) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, ft.life);
        ctx.font = `800 ${ft.size}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }
    }

    // 9. 上から迫る赤いプレス天井を描画する
    drawPressCeiling();

    ctx.restore(); // ワールド座標解除
    ctx.restore(); // 画面揺れ解除
  }

  // 深度目盛り線（スクロールのスピード感を視覚化）
  function drawDepthGridLines(layer) {
    const stepM = 10;
    const firstM = Math.max(0, Math.floor((cameraY - startCoreY) / (PIXELS_PER_METER * stepM)) * stepM);
    const lastM = firstM + 30;

    ctx.save();
    ctx.font = "700 10px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";

    for (let m = firstM; m <= lastM; m += stepM) {
      const wy = startCoreY + m * PIXELS_PER_METER;
      const sy = wy - cameraY;
      if (sy < -10 || sy > WORLD_H + 10) continue;

      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(WORLD_W, sy);
      ctx.strokeStyle = protoMode ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = protoMode ? "rgba(0, 0, 0, 0.35)" : "rgba(255, 255, 255, 0.18)";
      ctx.fillText(`${m}m`, WORLD_W - 10, sy - 3);
    }
    ctx.restore();
  }

  // 左右のうねる岩壁と丸い岩柱を描画する
  function drawWallsAndRocks(layer) {
    const startY = Math.floor(cameraY / 16) * 16 - 16;
    const endY = cameraY + WORLD_H + 32;

    // 左の岩壁
    ctx.beginPath();
    ctx.moveTo(0, startY);
    for (let y = startY; y <= endY; y += 16) {
      const { left } = getWallBounds(y);
      ctx.lineTo(left, y);
    }
    ctx.lineTo(0, endY);
    ctx.closePath();
    ctx.fillStyle = protoMode ? "#c8c8c8" : layer.wallFill;
    ctx.fill();
    ctx.strokeStyle = protoMode ? "#9a9a9a" : layer.wallStroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 右の岩壁
    ctx.beginPath();
    ctx.moveTo(WORLD_W, startY);
    for (let y = startY; y <= endY; y += 16) {
      const { right } = getWallBounds(y);
      ctx.lineTo(right, y);
    }
    ctx.lineTo(WORLD_W, endY);
    ctx.closePath();
    ctx.fillStyle = protoMode ? "#c8c8c8" : layer.wallFill;
    ctx.fill();
    ctx.strokeStyle = protoMode ? "#9a9a9a" : layer.wallStroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 丸い岩柱（障害物）
    for (const rk of rocks) {
      if (rk.y < cameraY - 50 || rk.y > cameraY + WORLD_H + 50) continue;
      ctx.beginPath();
      ctx.arc(rk.x, rk.y, rk.radius, 0, Math.PI * 2);
      ctx.fillStyle = protoMode ? "#aaaaaa" : layer.wallFill;
      ctx.fill();
      ctx.strokeStyle = protoMode ? "#777777" : layer.wallStroke;
      ctx.lineWidth = 2.4;
      ctx.stroke();

      // 岩柱と泡を区別するための内側の斜線マーク
      ctx.beginPath();
      ctx.arc(rk.x, rk.y, rk.radius * 0.45, 0, Math.PI * 2);
      ctx.strokeStyle = protoMode ? "#888888" : "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  // 個別の泡を描画する
  function drawBubble(b, layer, dangerLimit, transferPreview) {
    const isPressedHere = pressedBubble === b && pressInside && gameState !== "gameover";
    const inHoverGroup = hoverGroupSet.has(b);

    let radius = b.radius * Math.max(0.2, b.scale);
    if (isPressPreview && transferPreview) {
      radius *= 1.07;
    }

    let jitterX = 0;
    let jitterY = 0;
    if (b.state === "critical" && !b.armored && !protoMode) {
      jitterX = Math.sin(b.wobblePhase) * 0.8;
      jitterY = Math.cos(b.wobblePhase * 1.3) * 0.8;
    } else if (b.state === "danger") {
      const urgency = Math.min(1, b.dangerTimer / dangerLimit);
      const amp = protoMode ? 1.2 : 1.4 + urgency * 2.2;
      jitterX = Math.sin(b.wobblePhase * 1.7) * amp;
      jitterY = Math.cos(b.wobblePhase * 2.1) * amp;
    } else if (isPressPreview && transferPreview && !protoMode && transferPreview.outcome !== "grow") {
      jitterX = Math.sin(b.wobblePhase * 2.2) * 1.0;
      jitterY = Math.cos(b.wobblePhase * 2.5) * 1.0;
    }

    const cx = b.x + jitterX + b.offsetX;
    const cy = b.y + jitterY + b.offsetY;

    // 硬い殻の泡（爆風で砕くターゲット）
    if (b.armored) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = protoMode ? "#757575" : "#3a4559";
      ctx.fill();
      ctx.strokeStyle = protoMode ? "#222222" : "#9fb0ca";
      ctx.lineWidth = 3;
      ctx.stroke();

      // 六角形リングで「硬い殻」を直感的に示す
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = cx + Math.cos(a) * (radius * 0.58);
        const py = cy + Math.sin(a) * (radius * 0.58);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = protoMode ? "#dcdcdc" : "rgba(255, 255, 255, 0.45)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      return;
    }

    if (protoMode) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      if (b.state === "growing") {
        ctx.fillStyle = isPressedHere ? "#606060" : "#999999";
        ctx.fill();
      } else if (b.state === "critical") {
        ctx.fillStyle = inHoverGroup ? "#222222" : "#444444";
        ctx.fill();
      } else if (b.state === "danger") {
        ctx.fillStyle = "#111111";
        ctx.fill();
        const remain = Math.max(0, 1 - b.dangerTimer / dangerLimit);
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 3 + remain * 8, 0, Math.PI * 2);
        ctx.strokeStyle = "#111111";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else if (b.state === "growing") {
      const ratio = b.pressure / params.criticalThreshold;
      const lightness = Math.round((isPressedHere ? 28 : 37) + ratio * 17);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${layer.bubbleHue}, 32%, ${lightness}%)`;
      ctx.fill();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      if (isPressedHere) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.54, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(8, 12, 18, 0.38)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.78)";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(cx - radius * 0.28, cy - radius * 0.28, radius * 0.24, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
        ctx.fill();
      }
    } else if (b.state === "critical") {
      ctx.save();
      if (inHoverGroup) {
        ctx.shadowColor = "rgba(255, 255, 255, 0.55)";
        ctx.shadowBlur = 14;
      }
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = inHoverGroup ? "#ffffff" : "#eef4fc";
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx - radius * 0.27, cy - radius * 0.27, radius * 0.26, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, radius + 2.2, 0, Math.PI * 2);
      ctx.strokeStyle = inHoverGroup ? "#ffffff" : layer.accent;
      ctx.lineWidth = inHoverGroup ? 2.4 : 1.7;
      ctx.stroke();
    } else if (b.state === "danger") {
      const urgency = Math.min(1, b.dangerTimer / dangerLimit);
      const remain = Math.max(0, 1 - urgency);
      const pulse = 0.5 + 0.5 * Math.sin(b.wobblePhase * 1.4);

      ctx.save();
      ctx.shadowColor = "rgba(255, 77, 90, 0.7)";
      ctx.shadowBlur = 12 + urgency * 10;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * (1 + pulse * 0.04), 0, Math.PI * 2);
      ctx.fillStyle = "#ff4d5a";
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx - radius * 0.26, cy - radius * 0.26, radius * 0.24, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 230, 232, 0.6)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, radius + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remain);
      ctx.strokeStyle = "#ff9aa3";
      ctx.lineWidth = 2.8;
      ctx.stroke();
    }

    // 空気押し出し先の状態変化プレビューリング
    if (transferPreview) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);

      if (transferPreview.willBurst) {
        ctx.strokeStyle = protoMode ? "#000000" : "#ff3b4a";
        ctx.lineWidth = isPressPreview ? 3.8 : 3;
        ctx.setLineDash([]);
      } else if (transferPreview.outcome === "toDanger" || transferPreview.outcome === "dangerAccel") {
        ctx.strokeStyle = protoMode ? "#222222" : "rgba(255, 92, 106, 0.96)";
        ctx.lineWidth = isPressPreview ? 3 : 2.2;
      } else if (transferPreview.outcome === "toCritical") {
        ctx.strokeStyle = protoMode ? "#333333" : "rgba(255, 255, 255, 0.96)";
        ctx.lineWidth = isPressPreview ? 3 : 2.2;
      } else {
        ctx.strokeStyle = protoMode
          ? "#666666"
          : isPressPreview ? "rgba(195, 224, 255, 0.78)" : "rgba(170, 200, 235, 0.45)";
        ctx.lineWidth = isPressPreview ? 2 : 1.4;
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // 重力で下へ落ちる光るコアを描画する
  function drawCore(layer) {
    const cx = core.x;
    const cy = core.y;
    const r = core.radius;
    const pulse = 0.5 + 0.5 * Math.sin(core.pulse);

    if (protoMode) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      ctx.save();
      ctx.shadowColor = layer.accent;
      ctx.shadowBlur = 16 + pulse * 8;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = layer.accent;
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.64, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }

    // 下へ落ちたがっていることを直感的に示す極小の下向き矢印
    ctx.save();
    ctx.strokeStyle = protoMode ? "#111111" : layer.bg;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy - 1);
    ctx.lineTo(cx, cy + 5);
    ctx.lineTo(cx + 5, cy - 1);
    ctx.stroke();
    ctx.restore();
  }

  // 上から迫る赤いプレス天井を描画する
  function drawPressCeiling() {
    const topY = cameraY - 120;
    if (pressY < topY) return;

    ctx.save();
    // 危険エリアの塗り
    const grad = ctx.createLinearGradient(0, pressY - 64, 0, pressY);
    if (protoMode) {
      grad.addColorStop(0, "rgba(20, 20, 20, 0.78)");
      grad.addColorStop(1, "rgba(20, 20, 20, 0.92)");
    } else {
      grad.addColorStop(0, "rgba(255, 45, 68, 0.28)");
      grad.addColorStop(1, "rgba(255, 58, 82, 0.85)");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, topY, WORLD_W, pressY - topY);

    // 警戒ストライプの先端ライン
    ctx.beginPath();
    ctx.moveTo(0, pressY);
    ctx.lineTo(WORLD_W, pressY);
    ctx.strokeStyle = protoMode ? "#111111" : "#ff6b7a";
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // 下向きの小さな鋸歯（押し潰すプレスの視覚記号）
    ctx.fillStyle = protoMode ? "#111111" : "#ff4d5a";
    for (let x = 0; x < WORLD_W; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, pressY);
      ctx.lineTo(x + 9, pressY + 6);
      ctx.lineTo(x + 18, pressY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // 空気の押し出し方向を示す小さな矢印を描くヘルパー
  function drawAirArrow(x1, y1, x2, y2, color, lineWidth, head = 5.5) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const ux = dx / dist;
    const uy = dy / dist;

    const sx = x1 + ux * (dist * 0.28);
    const sy = y1 + uy * (dist * 0.28);
    const ex = x1 + ux * (dist * 0.66);
    const ey = y1 + uy * (dist * 0.66);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex - ux * head - uy * (head * 0.65), ey - uy * head + ux * (head * 0.65));
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - ux * head + uy * (head * 0.65), ey - uy * head - ux * (head * 0.65));
    ctx.stroke();
    ctx.restore();
  }

  // メインループ
  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;

    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ポインターイベント（押し込み＆ラバーバンド＆スライドキャンセル）
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const pos = clientToWorld(e.clientX, e.clientY);
    hoverBubble = e.pointerType === "mouse" ? getBubbleAtWorld(pos.x, pos.y) : null;
    handlePointerDown(pos.x, pos.y, e.pointerId);
    refreshPreview();
  });

  canvas.addEventListener("pointermove", (e) => {
    const pos = clientToWorld(e.clientX, e.clientY);

    if (activePointerId === e.pointerId && pressedBubble) {
      pressDragX = pos.x - pressedBubble.x;
      pressDragY = pos.y - pressedBubble.y;
      const dist = Math.hypot(pressDragX, pressDragY);
      const cancelRadius = Math.max(46, pressedBubble.radius * 2.1);
      const nowInside = dist <= cancelRadius;

      if (nowInside !== pressInside) {
        pressInside = nowInside;
        if (!nowInside) {
          pressedBubble.scaleVel += 4.5;
          sound.playPressCancel();
        } else {
          pressedBubble.scaleVel -= 4.0;
          sound.playPressStart();
        }
      }
      refreshPreview();
      return;
    }

    if (e.pointerType === "mouse") {
      hoverBubble = getBubbleAtWorld(pos.x, pos.y);
      refreshPreview();
    }
  });

  canvas.addEventListener("pointerup", (e) => {
    if (activePointerId !== e.pointerId) return;
    e.preventDefault();
    const pos = clientToWorld(e.clientX, e.clientY);
    if (pressedBubble) {
      const dist = Math.hypot(pos.x - pressedBubble.x, pos.y - pressedBubble.y);
      const cancelRadius = Math.max(46, pressedBubble.radius * 2.1);
      pressInside = dist <= cancelRadius;
    }
    confirmPressedBubble();
    hoverBubble = e.pointerType === "mouse" ? getBubbleAtWorld(pos.x, pos.y) : null;
    refreshPreview();
  });

  canvas.addEventListener("pointercancel", (e) => {
    if (activePointerId !== e.pointerId) return;
    if (pressedBubble && pressInside) {
      pressedBubble.scaleVel += 4.0;
    }
    clearPressState();
    hoverBubble = null;
    refreshPreview();
  });

  canvas.addEventListener("lostpointercapture", (e) => {
    if (activePointerId !== e.pointerId) return;
    clearPressState();
    refreshPreview();
  });

  canvas.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse" && !pressedBubble) {
      hoverBubble = null;
      refreshPreview();
    }
  });

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // ゲームオーバー画面のどこを押しても丸く閉じて即リトライ
  function retryFromClientPoint(clientX, clientY) {
    if (gameState !== "gameover" || performance.now() < gameOverLockUntil) return;
    sound.unlock();
    const rect = canvas.getBoundingClientRect();
    const hasPoint = Number.isFinite(clientX) && Number.isFinite(clientY) && (clientX !== 0 || clientY !== 0);
    const rx = hasPoint ? Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)) : 50;
    const ry = hasPoint ? Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)) : 50;
    gameOverOverlay.style.setProperty("--reveal-x", `${rx.toFixed(1)}%`);
    gameOverOverlay.style.setProperty("--reveal-y", `${ry.toFixed(1)}%`);
    resetGame();
  }

  gameOverOverlay.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    retryFromClientPoint(e.clientX, e.clientY);
  });

  retryBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    retryFromClientPoint(e.clientX, e.clientY);
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "Enter") {
      if (gameState === "gameover" && performance.now() >= gameOverLockUntil) {
        e.preventDefault();
        sound.unlock();
        resetGame();
      }
    } else if (e.key === "r" || e.key === "R") {
      resetGame();
    }
  });

  protoToggleBtn.addEventListener("click", () => {
    protoMode = !protoMode;
    document.body.classList.toggle("proto-mode", protoMode);
    protoToggleBtn.classList.toggle("active", protoMode);
    syncSoundEnabled();
  });

  soundToggleBtn.addEventListener("click", () => {
    soundUserEnabled = !soundUserEnabled;
    if (soundUserEnabled) sound.unlock();
    syncSoundEnabled();
  });

  tuningToggleBtn.addEventListener("click", () => {
    const isHidden = tuningPanel.classList.toggle("hidden");
    tuningToggleBtn.classList.toggle("active", !isHidden);
  });

  function syncSlidersUI() {
    sliders.press.input.value = String(params.pressSpeedScale);
    sliders.press.out.textContent = `${params.pressSpeedScale.toFixed(2)}x`;

    sliders.transfer.input.value = String(params.airTransferRate);
    sliders.transfer.out.textContent = `${params.airTransferRate.toFixed(2)}x`;

    const threshPct = Math.round(params.criticalThreshold * 100);
    sliders.threshold.input.value = String(threshPct);
    sliders.threshold.out.textContent = `${threshPct}%`;

    sliders.danger.input.value = String(params.dangerDuration);
    sliders.danger.out.textContent = `${params.dangerDuration.toFixed(1)}s`;

    sliders.delay.input.value = String(params.chainDelayMs);
    sliders.delay.out.textContent = `${params.chainDelayMs}ms`;
  }

  sliders.press.input.addEventListener("input", () => {
    params.pressSpeedScale = Number(sliders.press.input.value);
    syncSlidersUI();
  });

  sliders.transfer.input.addEventListener("input", () => {
    params.airTransferRate = Number(sliders.transfer.input.value);
    syncSlidersUI();
  });

  sliders.threshold.input.addEventListener("input", () => {
    params.criticalThreshold = Number(sliders.threshold.input.value) / 100;
    for (const b of bubbles) {
      if (b.dead || b.armored) continue;
      if (b.state === "growing" && b.pressure >= params.criticalThreshold) {
        b.state = "critical";
      } else if (b.state === "critical" && b.pressure < params.criticalThreshold) {
        b.state = "growing";
      }
    }
    syncSlidersUI();
  });

  sliders.danger.input.addEventListener("input", () => {
    params.dangerDuration = Number(sliders.danger.input.value);
    syncSlidersUI();
  });

  sliders.delay.input.addEventListener("input", () => {
    params.chainDelayMs = Number(sliders.delay.input.value);
    syncSlidersUI();
  });

  resetParamsBtn.addEventListener("click", () => {
    Object.assign(params, DEFAULT_PARAMS);
    syncSlidersUI();
  });

  window.addEventListener("resize", resizeCanvas);

  // 初期化と開始
  syncSlidersUI();
  syncSoundEnabled();
  resizeCanvas();
  resetGame();
  requestAnimationFrame(loop);
})();
