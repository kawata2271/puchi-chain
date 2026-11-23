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
    criticalThreshold: 0.65, // 臨界（白く光って連鎖可能）になる膨らみ割合
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
  const finalRankEl = document.getElementById("finalRank");
  const retryBtn = document.getElementById("retryBtn");
  const openRankingFromResultBtn = document.getElementById("openRankingFromResultBtn");
  const shareResultBtn = document.getElementById("shareResultBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const resumeBtn = document.getElementById("resumeBtn");
  const restartFromPauseBtn = document.getElementById("restartFromPauseBtn");
  const rankingBtn = document.getElementById("rankingBtn");
  const helpBtn = document.getElementById("helpBtn");
  const protoToggleBtn = document.getElementById("protoToggleBtn");
  const soundToggleBtn = document.getElementById("soundToggleBtn");
  const tuningToggleBtn = document.getElementById("tuningToggleBtn");
  const tuningPanel = document.getElementById("tuningPanel");
  const resetParamsBtn = document.getElementById("resetParamsBtn");

  // ニックネーム・順位表・動くマニュアルモーダル要素
  const nicknameModal = document.getElementById("nicknameModal");
  const nicknameForm = document.getElementById("nicknameForm");
  const nicknameInput = document.getElementById("nicknameInput");
  const rankingModal = document.getElementById("rankingModal");
  const rankingModeBadge = document.getElementById("rankingModeBadge");
  const closeRankingBtn = document.getElementById("closeRankingBtn");
  const currentPlayerNameEl = document.getElementById("currentPlayerName");
  const editNicknameBtn = document.getElementById("editNicknameBtn");
  const tabScoreBtn = document.getElementById("tabScoreBtn");
  const tabChainBtn = document.getElementById("tabChainBtn");
  const rankingListEl = document.getElementById("rankingList");
  const tutorialModal = document.getElementById("tutorialModal");

  // パラメータ調整スライダー
  const sliders = {
    press: { input: document.getElementById("pressRange"), out: document.getElementById("pressOut") },
    transfer: { input: document.getElementById("transferRange"), out: document.getElementById("transferOut") },
    threshold: { input: document.getElementById("thresholdRange"), out: document.getElementById("thresholdOut") },
    delay: { input: document.getElementById("delayRange"), out: document.getElementById("delayOut") }
  };

  // サウンドエンジン・順位表・動くマニュアル
  const sound = new window.SoundEngine();
  const leaderboard = new window.LeaderboardService();
  const tutorial = new window.TutorialPlayer({
    modal: tutorialModal,
    canvas: document.getElementById("tutorialCanvas"),
    badgeEl: document.getElementById("tutorialBadge"),
    titleEl: document.getElementById("tutorialTitle"),
    captionEl: document.getElementById("tutorialCaption"),
    dotsEl: document.getElementById("tutorialDots"),
    prevBtn: document.getElementById("tutorialPrevBtn"),
    nextBtn: document.getElementById("tutorialNextBtn"),
    skipBtn: document.getElementById("tutorialSkipBtn")
  });
  let activeRankingTab = "score"; // 'score' | 'chain'
  let wasCustomParamsUsed = false; // プレイ中にパラメータ調整を使ったか（公平性判定用）
  let reopenRankingAfterNameEdit = false;

  // 現在モーダル（ニックネーム入力・順位表・動くマニュアル）が開いているか
  function isModalOpen() {
    return (
      !nicknameModal.classList.contains("hidden") ||
      !rankingModal.classList.contains("hidden") ||
      !tutorialModal.classList.contains("hidden")
    );
  }

  // パラメータがすべて標準値かどうかを判定する
  function isDefaultParams() {
    return (
      Math.abs(params.pressSpeedScale - DEFAULT_PARAMS.pressSpeedScale) < 0.001 &&
      Math.abs(params.airTransferRate - DEFAULT_PARAMS.airTransferRate) < 0.001 &&
      Math.abs(params.criticalThreshold - DEFAULT_PARAMS.criticalThreshold) < 0.001 &&
      Math.abs(params.chainDelayMs - DEFAULT_PARAMS.chainDelayMs) < 0.001
    );
  }

  // ローカルストレージから最高到達深度を読み込む
  const STORAGE_KEY_BEST_DEPTH = "puchi_deep_best_depth_v1";
  let bestDepth = Number(localStorage.getItem(STORAGE_KEY_BEST_DEPTH) || 0);

  // ゲーム全体の状態
  const params = { ...DEFAULT_PARAMS };
  let protoMode = false;
  let soundUserEnabled = true;

  let gameState = "ready"; // 'ready' | 'playing' | 'gameover'
  let isPaused = false;
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
  // 地層内に引く自己ベスト＆オンラインライバルの到達ライン
  let cachedRivals = [];
  let depthMarkers = [];

  // 進行中の連鎖イベント管理
  let nextChainId = 1;
  let pendingPops = []; // { bubble, timeLeft, chainId, fromX, fromY }
  let activeChains = new Map();
  // 連続コンボ管理（2連鎖以上をテンポよく繋ぐと10・20・30・40連鎖と音が進化する）
  const COMBO_WINDOW = 3.8;
  let comboCount = 0;
  let comboTimer = 0;
  let comboPopScale = 1;

  // 視覚エフェクト（通常モード時のみ表示）
  let particles = [];
  let rings = [];
  let beams = [];
  let airPuffs = [];
  let likeBursts = [];
  let floatTexts = [];
  let shakeMag = 0;
  let errorShakeTime = 0;
  let errorShakeAmp = 0;
  let pressFlash = 0;    // 暴発でプレスが急降下したときの赤フラッシュ
  let comboFlash = 0;    // 10・20・30・40連鎖時の画面全体フラッシュ強度
  let comboFlashTier = 0;
  let auraPhase = 0;     // 銀・金・オーロラ・虹色の光沢流動アニメーション位相
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

  // 一時停止ボタンとオーバーレイの表示状態を同期する
  function syncPauseUI() {
    const canPause = gameState === "playing";
    if (!canPause && isPaused) {
      isPaused = false;
    }
    pauseBtn.disabled = !canPause;
    pauseBtn.textContent = isPaused ? "再開" : "一時停止";
    pauseBtn.classList.toggle("active", isPaused);
    pauseOverlay.classList.toggle("hidden", !isPaused);
  }

  // プレイを一時停止する
  function pauseGame() {
    if (gameState !== "playing" || isPaused) return;
    clearPressState();
    isPaused = true;
    syncPauseUI();
  }

  // 一時停止から再開する
  function resumeGame() {
    if (!isPaused) return;
    isPaused = false;
    lastTime = performance.now();
    syncPauseUI();
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
    const state = pressure >= params.criticalThreshold ? "critical" : "growing";
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

      // 深い層では一定間隔で丸い岩柱（障害物）を配置（コアが挟まる狭いデッドポケットを絶対に作らない）
      if (layer.rockInterval > 0 && y >= nextRockY) {
        const rockR = 20 + Math.random() * 7;
        const lane = Math.random();
        let rx = left + width * 0.5;
        if (lane < 0.34) {
          // 左壁と一体化させて張り出し岩棚にし、左側に挟まり隙間を作らない
          rx = left + rockR * 0.35;
        } else if (lane > 0.66) {
          // 右壁と一体化させて張り出し岩棚にし、右側に挟まり隙間を作らない
          rx = right - rockR * 0.35;
        } else {
          // 中央に置く場合は左右どちらにもコアが余裕で通れる広い通路を確保する
          const minMargin = rockR + 62;
          if (width >= minMargin * 2) {
            rx = left + minMargin + Math.random() * (width - minMargin * 2);
          } else {
            rx = left + rockR * 0.35;
          }
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
          // 硬い泡同士が隣り合って物理的な蓋（詰み）を作らないよう距離チェックを入れる
          let nearOtherArmor = false;
          for (let k = bubbles.length - 1; k >= Math.max(0, bubbles.length - 24); k--) {
            const prev = bubbles[k];
            if (prev.armored && Math.hypot(clampedX - prev.x, by - prev.y) < 76) {
              nearOtherArmor = true;
              break;
            }
          }
          if (!nearOtherArmor) {
            armored = true;
            pressure = 0.45 + Math.random() * 0.2;
          }
        }
        if (!armored) {
          if (roll < 0.16) {
            // 最初から臨界（連鎖の起点候補）
            pressure = Math.min(0.84, params.criticalThreshold + 0.05 + Math.random() * 0.1);
          } else if (roll < 0.42) {
            // あとひと押しで臨界になる絶好のターゲット
            pressure = Math.max(0.48, params.criticalThreshold - 0.14 + Math.random() * 0.11);
          } else {
            // 柔らかい小さい泡（空気供給源）
            pressure = 0.22 + Math.random() * 0.3;
          }
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
    isPaused = false;
    elapsed = 0;
    score = 0;
    depthMeters = 0;
    sessionMaxChain = 0;
    isNewBest = false;
    wasCustomParamsUsed = !isDefaultParams();
    finalRankEl.textContent = "";
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
      radius: 18, // スリム化して隙間をスルスル転がり落ちやすくする
      pulse: 0
    };

    bubbles = [];
    rocks = [];
    pendingPops = [];
    activeChains.clear();
    comboCount = 0;
    comboTimer = 0;
    comboPopScale = 1;
    particles = [];
    rings = [];
    beams = [];
    airPuffs = [];
    likeBursts = [];
    floatTexts = [];
    shakeMag = 0;
    errorShakeTime = 0;
    errorShakeAmp = 0;
    pressFlash = 0;
    comboFlash = 0;
    comboFlashTier = 0;
    warningTickCooldown = 0;
    updateContainerGlow(0);

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

    // 自己ベスト＆オンラインライバルの到達ラインを地層内へ配置する
    buildDepthMarkers();

    layerBannerEl.classList.add("hidden");
    gameOverOverlay.classList.add("hidden");
    hintTextEl.classList.remove("hidden-soft");
    syncPauseUI();
    updateHud(false, false);
  }

  // オンライン順位表から地層内に表示するライバル深度を取得してキャッシュする
  async function loadRivalMarkers() {
    try {
      const res = await leaderboard.fetchRanking("depth", 20);
      if (res && Array.isArray(res.rows)) {
        cachedRivals = res.rows
          .map((r, idx) => ({
            playerId: r && r.player_id,
            rank: idx + 1,
            name: (r && r.nickname) || "GUEST",
            depth: (r && r.best_depth) || 0
          }))
          .filter((r) => r.playerId !== leaderboard.playerId && r.depth >= 3);
        // まだ開始前なら取得したてのライバルラインを即座に盤面へ反映する
        if (gameState === "ready") {
          buildDepthMarkers();
        }
      }
    } catch (_) {}
  }

  // 今回のプレイで地層内に引く到達ライン（自己ベスト＋ライバル最大3本）を構築する
  function buildDepthMarkers() {
    const markers = [];
    const usedDepths = [];

    // 1. 自分の自己ベストライン
    if (bestDepth >= 3) {
      markers.push({
        kind: "self",
        name: "YOUR BEST",
        depth: bestDepth,
        y: startCoreY + bestDepth * PIXELS_PER_METER,
        label: `★ YOUR BEST ${bestDepth}m`,
        passed: false,
        passFlash: 0
      });
      usedDepths.push(bestDepth);
    }

    // 2. オンラインのライバル到達ライン（1位＋重ならない上位/直近ライバル最大3本）
    const isTooClose = (d) => usedDepths.some((u) => Math.abs(u - d) < 3);
    let addedRivals = 0;

    for (const rv of cachedRivals) {
      if (addedRivals >= 3) break;
      if (isTooClose(rv.depth)) continue;
      const isTop = rv.rank === 1;
      markers.push({
        kind: isTop ? "top" : "rival",
        name: rv.name,
        depth: rv.depth,
        y: startCoreY + rv.depth * PIXELS_PER_METER,
        label: isTop ? `👑 #1 ${rv.name} ${rv.depth}m` : `#${rv.rank} ${rv.name} ${rv.depth}m`,
        passed: false,
        passFlash: 0
      });
      usedDepths.push(rv.depth);
      addedRivals += 1;
    }

    depthMarkers = markers;
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

  // 指定した臨界泡に繋がっている塊（連結成分）を返す
  function getConnectedCriticalGroup(start) {
    const result = new Set();
    if (!start || start.dead || start.armored || start.state !== "critical") return result;

    const queue = [start];
    result.add(start);

    while (queue.length > 0) {
      const curr = queue.shift();
      for (const other of bubbles) {
        if (other.dead || other.armored || result.has(other)) continue;
        if (other.state !== "critical") continue;
        if (areBubblesTouching(curr, other, 1.26)) {
          result.add(other);
          queue.push(other);
        }
      }
    }
    return result;
  }

  // 現在の深さに応じた難易度パラメータを返す（進めば進むほど上限なく少しずつ速くなる）
  function getDifficultyMetrics() {
    const baseSpeed = 16;
    // 150mまでは10mごとにしっかり加速し、それ以降も上限で止まらず少しずつ速くなり続ける
    const linearRamp = Math.min(depthMeters, 150) * 0.28;
    const deepRamp = Math.max(0, depthMeters - 150) * 0.14;
    const rawSpeed = baseSpeed + linearRamp + deepRamp;
    const pressSpeed = rawSpeed * params.pressSpeedScale;
    const speedRatio = rawSpeed / baseSpeed;
    return { pressSpeed, speedRatio };
  }

  // 小さい泡を押し潰したときに、物理的に接している周囲の泡へどれだけ空気が逃げるか計算する
  function computeAirTransferPlan(source) {
    if (!source || source.dead || source.armored || source.state !== "growing" || source.chainQueued) {
      return [];
    }

    // 接触している泡（硬い泡とすでに空気が抜けたペチャンコ玉は空気を受け取らない）を近い順に最大5個取得
    const candidates = [];
    for (const other of bubbles) {
      if (other === source || other.dead || other.armored || other.state === "flat" || other.chainQueued) continue;
      const dist = Math.hypot(other.x - source.x, other.y - source.y);
      if (dist <= (source.radius + other.radius) * 1.32) {
        candidates.push({ bubble: other, dist });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    const targets = candidates.slice(0, 5).map((item) => item.bubble);

    if (targets.length === 0) return [];

    // 逃げ場が少ないほど一点に空気が集中して一気に膨らむ
    const totalAir = (0.16 + source.pressure * 0.78) * params.airTransferRate;
    const share = totalAir / targets.length;

    return targets.map((target) => {
      const nextP = target.pressure + share;
      let outcome = "grow";
      if (nextP >= 1.0) {
        outcome = "overload"; // 押し込みすぎ＝即時暴発でプレス天井が急降下する！
      } else if (target.state === "growing" && nextP >= params.criticalThreshold) {
        outcome = "toCritical";
      }
      return { target, share, outcome };
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

    if (isPaused) return;

    // プレイ中に光るコア自身をタップしたときは、通路の中央／空き方向へ軽く揺すって引っかかりを外す
    if (gameState === "playing" && Math.hypot(wx - core.x, wy - core.y) <= core.radius + 10) {
      const walls = getWallBounds(core.y + 24);
      const midX = (walls.left + walls.right) * 0.5;
      const dir = core.x < midX ? 1 : -1;
      core.vx += dir * 135;
      core.vy += 45;
      sound.playPressStart();
      triggerHaptic(8);
      if (!protoMode) {
        spawnRing(core.x, core.y, core.radius * 1.7, LAYERS[currentLayerIndex].accent, 2);
      }
      return;
    }

    const b = getBubbleAtWorld(wx, wy);
    if (!b || b.dead || b.chainQueued) return;

    if (b.appearDelay > 0) {
      b.appearDelay = 0;
      b.scale = 1;
    }

    // ペチャンコ玉（空気が抜けたカス）は押しても消えない（2連鎖以上の爆風でのみ粉砕可能）
    if (b.state === "flat") {
      b.scaleVel -= 3.2;
      sound.playPressCancel();
      return;
    }

    // 硬い殻の泡を直接叩いた場合は弾かれる（2連鎖以上の爆風で砕く必要がある！）
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

    if (b.state === "critical") {
      // 白く光る臨界泡は触れた瞬間に即座に連鎖爆発！
      clearPressState();
      if (gameState === "ready") {
        gameState = "playing";
        hintTextEl.classList.add("hidden-soft");
        syncPauseUI();
      }
      const groupSize = getConnectedCriticalGroup(b).size;
      const chainId = nextChainId++;
      activeChains.set(chainId, { count: 0, plannedSize: groupSize });
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
      syncPauseUI();
    }
    triggerHaptic(12);
    squeezeGrowingBubble(b);
  }

  // 未成熟な泡を押し潰して空気を隣へ移動させ、自身はペチャンコ玉として残す（連打抜け道封鎖）
  function squeezeGrowingBubble(b) {
    const plan = computeAirTransferPlan(b);
    const sx = b.x;
    const sy = b.y;

    // 押し潰された小さい泡は消滅せず、空気が抜けたペチャンコ玉（flat）として居座る
    b.state = "flat";
    b.pressure = 0;
    b.radius = 10;
    b.scale = 0.55;
    b.scaleVel = 4.5;

    sound.playAirPush(plan.length);

    if (!protoMode) {
      spawnRing(sx, sy, 24, "rgba(180, 200, 225, 0.4)", 1.5);
    }

    let promotedToCritical = false;
    let overloadCount = 0;

    for (const item of plan) {
      const target = item.target;
      if (target.dead || target.state === "flat") continue;

      if (!protoMode) {
        const layer = LAYERS[currentLayerIndex];
        const puffColor =
          item.outcome === "overload"
            ? "#ff5966"
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
      const prevState = target.state;
      const nextP = target.pressure + item.share;

      if (nextP >= 1.0) {
        // 押し込みすぎによる暴発：せっかく育てた泡がその場でペチャンコ玉に戻り、コンボも途切れる（赤いラインはワープさせない）
        overloadCount += 1;
        target.state = "flat";
        target.pressure = 0;
        target.radius = 10;
        target.scale = 0.45;
        target.scaleVel = 6;
        if (!protoMode) {
          spawnRing(target.x, target.y, 44, "#ff4d5a", 3.8);
          spawnParticles(target.x, target.y, 16, "#ff4d5a", 180);
          spawnFloatText(target.x, target.y - 8, "BURST!", "#ff5966", 15);
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

    if (overloadCount > 0) {
      // 指先で完結するリスク：コンボが途切れ、横シェイクと破裂音でミスを伝える
      comboCount = 0;
      comboTimer = 0;
      sound.playOverloadPush();
      triggerErrorShake(9);
      triggerHaptic([20, 20, 25]);
    } else if (promotedToCritical) {
      sound.playCharge();
    }
  }

  // 10連鎖ティアごとの輝きカラーを返す（銀 → 金 → クリスタルオーロラ → 虹色）
  function getComboTierColor(tier) {
    if (tier <= 0) return "#ffffff";
    if (tier === 1) return "#dce6f2"; // 10連鎖：銀（シルバー）
    if (tier === 2) return "#ffd54f"; // 20連鎖：金（ゴールド）
    if (tier === 3) {
      // 30連鎖：シアンとマゼンタがゆらめくクリスタル・オーロラ
      const hue = 195 + Math.sin(auraPhase * 2.2) * 55 + 55;
      return `hsl(${hue.toFixed(0)}, 95%, 72%)`;
    }
    // 40連鎖以降：滑らかに色相が回るレインボー（虹色）
    const speed = tier >= 5 ? 210 : 130;
    const hue = (auraPhase * speed) % 360;
    return `hsl(${hue.toFixed(0)}, 95%, 68%)`;
  }

  // 盤面コンテナの外枠ボーダー＆外周グローをコンボの輝き（銀→金→オーロラ→虹）に同期させる
  function updateContainerGlow(tier) {
    if (protoMode || tier <= 0 || gameState === "gameover") {
      canvasContainer.style.borderColor = "";
      canvasContainer.style.boxShadow = "";
      return;
    }

    if (tier === 1) {
      // 銀（シルバー）
      canvasContainer.style.borderColor = "rgba(220, 232, 245, 0.78)";
      canvasContainer.style.boxShadow = "0 0 22px rgba(210, 226, 245, 0.35), 0 18px 46px rgba(0, 0, 0, 0.36)";
    } else if (tier === 2) {
      // 金（ゴールド）
      canvasContainer.style.borderColor = "rgba(255, 213, 79, 0.9)";
      canvasContainer.style.boxShadow = "0 0 30px rgba(255, 196, 46, 0.5), 0 0 10px rgba(255, 240, 180, 0.45), 0 18px 46px rgba(0, 0, 0, 0.36)";
    } else if (tier === 3) {
      // クリスタル・オーロラ
      const c1 = getComboTierColor(3);
      canvasContainer.style.borderColor = c1;
      canvasContainer.style.boxShadow = `0 0 34px ${c1}, 0 0 14px rgba(130, 240, 255, 0.45), 0 18px 46px rgba(0, 0, 0, 0.36)`;
    } else {
      // 40連鎖〜：虹色（レインボー）
      const hue = (auraPhase * (tier >= 5 ? 210 : 130)) % 360;
      const c1 = `hsl(${hue.toFixed(0)}, 96%, 65%)`;
      const c2 = `hsl(${((hue + 120) % 360).toFixed(0)}, 96%, 62%)`;
      const spread = tier >= 5 ? 48 : 38;
      canvasContainer.style.borderColor = c1;
      canvasContainer.style.boxShadow = `0 0 ${spread}px ${c1}, 0 0 ${Math.round(spread * 0.55)}px ${c2}, 0 18px 46px rgba(0, 0, 0, 0.36)`;
    }
  }

  // 臨界泡の連鎖破裂（2連鎖以上で継続コンボが積み上がり、10連鎖ごとに音と画面の輝きが進化する）
  function executeChainPop(b, chainId, fromX, fromY) {
    if (gameState !== "playing" || b.dead) return;

    const bx = b.x;
    const by = b.y;
    const br = b.radius;
    const chainInfo = activeChains.get(chainId) || { count: 0, plannedSize: 1 };
    chainInfo.count += 1;
    const isRealChain = chainInfo.plannedSize >= 2 || chainInfo.count >= 2;
    activeChains.set(chainId, chainInfo);

    const localCombo = chainInfo.count;
    let displayCombo = 1;
    let isMilestone10 = false;

    if (isRealChain) {
      comboCount += 1;
      comboTimer = COMBO_WINDOW;
      comboPopScale = 1.38;
      displayCombo = comboCount;
      if (comboCount > sessionMaxChain) {
        sessionMaxChain = comboCount;
      }
      if (comboCount % 10 === 0) {
        isMilestone10 = true;
      }
    }

    b.dead = true;
    b.chainQueued = false;

    const tier = Math.floor(displayCombo / 10);
    const gained = isRealChain ? localCombo * 3 + tier * 5 : 1;
    score += gained;
    updateHud(false, true);

    // 10連鎖ごとに音色と和音が進化する純粋な連鎖音のみを鳴らす
    sound.playChainPop(isRealChain ? comboCount : 1, false);
    if (isMilestone10) {
      triggerHaptic([14, 24, 18]);
      // 10連鎖達成のごほうびとしてプレス天井を少し押し戻し、画面を銀→金→オーロラ→虹へ閃光させる
      pressY = Math.max(cameraY - 120, pressY - 20);
      comboFlash = 1.0;
      comboFlashTier = tier;
    } else if (isRealChain && tier >= 1) {
      // 10連鎖以上のゾーン中は、連鎖ごとに画面オーラも音に合わせて軽く脈打つ
      comboFlash = Math.max(comboFlash, Math.min(0.42, 0.16 + tier * 0.06));
      comboFlashTier = tier;
      if (localCombo > 1) triggerHaptic(10);
    } else if (localCombo > 1) {
      triggerHaptic(10);
    }

    const layer = LAYERS[currentLayerIndex];

    if (!protoMode) {
      const tierColor = getComboTierColor(tier);
      const hueColor = isRealChain ? (tier >= 1 ? tierColor : localCombo >= 5 ? layer.accent : "#ffffff") : "rgba(220, 232, 245, 0.8)";
      const ringScale = isRealChain ? (2.2 + Math.min(1.1, localCombo * 0.1 + tier * 0.14)) : 1.45;
      spawnRing(bx, by, br * ringScale, hueColor, isMilestone10 ? 4.0 : isRealChain ? 2.6 : 1.6);
      if (isRealChain) {
        spawnLikeBurst(bx, by, br * (1.8 + Math.min(0.7, localCombo * 0.08 + tier * 0.1)), hueColor, isMilestone10 ? 12 : 8);
      }
      spawnParticles(bx, by, isRealChain ? Math.min(22, 8 + localCombo * 2) : 6, hueColor, isRealChain ? 160 + localCombo * 15 : 95);

      if (fromX !== null && fromY !== null) {
        beams.push({ x1: fromX, y1: fromY, x2: bx, y2: by, life: 1 });
      }

      const label = isMilestone10
        ? `${comboCount} CHAIN!!`
        : isRealChain && displayCombo >= 3
          ? `${displayCombo} CHAIN`
          : isRealChain
            ? `+${gained}`
            : "+1";
      const textSize = isMilestone10 ? 22 : Math.min(19, 12 + Math.floor(localCombo / 2));
      spawnFloatText(bx, by - 6, label, hueColor, textSize);
      shakeMag = Math.min(9.5, Math.max(shakeMag, isMilestone10 ? 7.5 : isRealChain ? 2.0 + localCombo * 0.5 : 0.8));
    }

    // 1. 周囲の泡への爆風・ペチャンコ玉粉砕・硬い殻粉砕・連鎖伝播
    const delaySec = params.chainDelayMs / 1000;
    let brokeArmor = false;
    // 2連鎖以上なら大きな爆風でペチャンコ玉と硬い泡を根こそぎ吹っ飛ばす！単発は威力が弱い
    const flatCrushRange = isRealChain ? br + 44 + Math.min(26, localCombo * 4) : 0;
    const blastRange = isRealChain ? br + 68 + Math.min(28, localCombo * 4) : br + 24;

    for (const other of bubbles) {
      if (other === b || other.dead) continue;
      const dx = other.x - bx;
      const dy = other.y - by;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.001) continue;

      // 2連鎖以上の爆風で、周囲の邪魔なペチャンコ玉（flat）を一気に粉砕・消滅させる！
      if (isRealChain && other.state === "flat" && dist <= flatCrushRange + other.radius) {
        other.dead = true;
        score += 2;
        if (!protoMode) {
          spawnParticles(other.x, other.y, 6, layer.accent, 130);
          spawnRing(other.x, other.y, 20, "rgba(255, 255, 255, 0.4)", 1.4);
        }
        continue;
      }

      // 爆風による物理吹き飛ばし
      if (dist < blastRange + other.radius) {
        const power = (1 - dist / (blastRange + other.radius)) * (isRealChain ? 165 + Math.min(95, localCombo * 12) : 55);
        other.vx += (dx / dist) * power;
        other.vy += (dy / dist) * power;
      }

      // 2連鎖以上の爆風で、硬い殻の泡をパリンッと砕いて臨界泡にする！
      if (isRealChain && other.armored && dist <= (br + other.radius) * 1.46) {
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

      // 接触している他の臨界泡へ連鎖予約
      if (!other.armored && !other.chainQueued && other.state === "critical") {
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

    // 2. 光るコアへの爆風アシスト
    const cdx = core.x - bx;
    const cdy = core.y - by;
    const cdist = Math.hypot(cdx, cdy);
    if (cdist > 0.001 && cdist < br + core.radius + 58) {
      const f = (1 - cdist / (br + core.radius + 58)) * (isRealChain ? 95 : 35);
      core.vx += (cdx / cdist) * f;
      core.vy += Math.max(-20, (cdy / cdist) * f);
    }

    // 3. 大連鎖（4連鎖以上の節目）でプレス天井を少し押し上げるごほうび
    if (localCombo >= 4 && localCombo % 2 === 0) {
      pressY = Math.max(cameraY - 120, pressY - 16);
    }
  }

  // 新しい地層へ突入したときの演出
  function showLayerBanner(subText, titleText) {
    layerBannerSubEl.textContent = subText;
    layerBannerTitleEl.textContent = titleText;
    layerBannerEl.classList.remove("hidden");
    sound.playStageClear();
    triggerHaptic([12, 24, 18]);

    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      layerBannerEl.classList.add("hidden");
      bannerTimer = null;
    }, 1700);
  }

  // ゲームオーバー処理（プレス圧潰）
  function triggerGameOver(reason, worldX, worldY) {
    clearPressState();
    gameState = "gameover";
    isPaused = false;
    syncPauseUI();
    pendingPops = [];
    activeChains.clear();
    comboCount = 0;
    comboTimer = 0;
    comboFlash = 0;
    updateContainerGlow(0);
    gameOverLockUntil = performance.now() + 760;
    layerBannerEl.classList.add("hidden");
    pressFlash = 1.0;

    sound.playBurst();
    triggerHaptic([35, 30, 55]);

    const sx = Math.max(0, Math.min(WORLD_W, worldX));
    const sy = Math.max(0, Math.min(WORLD_H, worldY - cameraY));
    const rx = (sx / WORLD_W) * 100;
    const ry = (sy / WORLD_H) * 100;
    gameOverOverlay.style.setProperty("--reveal-x", `${rx.toFixed(1)}%`);
    gameOverOverlay.style.setProperty("--reveal-y", `${ry.toFixed(1)}%`);

    if (!protoMode) {
      spawnRing(worldX, worldY, 58, "#ff4d5a", 5);
      spawnLikeBurst(worldX, worldY, 46, "#ff4d5a", 10);
      spawnParticles(worldX, worldY, 30, "#ff4d5a", 240);
      spawnFloatText(worldX, worldY - 22, "赤いラインに接触！", "#ff5966", 16);
      triggerErrorShake(13);
    }

    gameOverReasonEl.textContent = "赤いラインに接触";
    finalDepthEl.textContent = `${depthMeters}m`;
    finalMetaEl.textContent = isNewBest
      ? `NEW BEST!  /  SCORE ${score}  /  MAX CHAIN ${sessionMaxChain}`
      : `BEST ${bestDepth}m  /  SCORE ${score}  /  MAX CHAIN ${sessionMaxChain}`;

    // 標準ルールでのプレイのみ順位表へ自動登録し、現在の順位を表示する
    if (wasCustomParamsUsed || !isDefaultParams()) {
      finalRankEl.textContent = "カスタム調整のため順位対象外";
    } else if (score > 0 || sessionMaxChain > 0) {
      finalRankEl.textContent = "記録を送信中...";
      const capturedScore = score;
      const capturedChain = sessionMaxChain;
      const capturedDepth = depthMeters;
      leaderboard.submitScore(capturedScore, capturedChain, capturedDepth).then(() => {
        loadRivalMarkers();
        return leaderboard.fetchMyRanks();
      }).then((ranks) => {
        if (gameState !== "gameover") return;
        const parts = [];
        if (ranks.scoreRank) parts.push(`得点 ${ranks.scoreRank}位`);
        if (ranks.chainRank) parts.push(`連鎖 ${ranks.chainRank}位`);
        if (parts.length > 0) {
          const suffix = ranks.mode === "online" ? "" : "（端末内）";
          finalRankEl.textContent = `${leaderboard.getNickname()}：${parts.join(" / ")}${suffix}`;
        } else {
          finalRankEl.textContent = "";
        }
      }).catch(() => {
        if (gameState === "gameover") {
          finalRankEl.textContent = "";
        }
      });
    } else {
      finalRankEl.textContent = "";
    }

    // 「赤いラインがコアへ触れた現場」をはっきり目視させてからリザルト画面へ切り替える
    setTimeout(() => {
      if (gameState === "gameover") {
        gameOverOverlay.classList.remove("hidden");
      }
    }, 640);
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
    if (!hoverBubble || hoverBubble.dead || hoverBubble.armored || hoverBubble.state === "flat") {
      hoverGroupSet.clear();
      activeTransferPlan = [];
      return;
    }
    if (hoverBubble.state === "critical") {
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
          // ペチャンコ玉はコアの重みで押し退けやすくし、1〜2個での引っかかりを防ぐ
          const coreShare = b._fixed ? 1.0 : b.state === "flat" ? 0.16 : 0.26;
          const bubbleShare = 1.0 - coreShare;
          core.x -= nx * overlap * coreShare;
          core.y -= ny * overlap * coreShare;
          b.x += nx * overlap * bubbleShare;
          b.y += ny * overlap * bubbleShare;
          if (ny > 0.3 && core.vy > 0) {
            core.vy *= 0.86;
          }
          // 泡の真上にバランス静止しそうなときは、通路中央側へわずかに転がす
          if (iter === 0 && ny > 0.82 && Math.abs(nx) < 0.25) {
            const w = getWallBounds(core.y + 20);
            const slideDir = core.x < (w.left + w.right) * 0.5 ? 1 : -1;
            core.vx += slideDir * 18 * dt;
          }
        }
      }

      // 岩柱との衝突解決（岩のてっぺんに引っかからず広い通路側へ滑らかに転がり落ちる）
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

          // コアが岩柱の上半分に乗ったら、左右の空き幅が広い側へコロッと転がり落ちる
          if (iter === 0 && cdy < 4) {
            const w = getWallBounds(rk.y);
            const leftSpace = (rk.x - rk.radius) - w.left;
            const rightSpace = w.right - (rk.x + rk.radius);
            let slideDir;
            if (Math.abs(cdx) > 10) {
              slideDir = cdx > 0 ? 1 : -1;
              // 狭い壁側へ落ちそうなときは広い側へ戻す
              if (slideDir < 0 && leftSpace < core.radius * 2.4) slideDir = 1;
              if (slideDir > 0 && rightSpace < core.radius * 2.4) slideDir = -1;
            } else {
              slideDir = rightSpace >= leftSpace ? 1 : -1;
            }
            core.vx += slideDir * 240 * dt;
          }
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
        // 壁の張り出し斜面に引っかからないよう中央側へ滑らせる
        if (core.vx < 35) core.vx = 35;
      } else if (core.x + core.radius > coreWalls.right) {
        core.x = coreWalls.right - core.radius;
        if (core.vx > -35) core.vx = -35;
      }
      if (core.y + core.radius > activeBottomLimit) {
        core.y = activeBottomLimit - core.radius;
        if (core.vy > 0) core.vy = 0;
      }
    }
  }

  // フレームごとの状態更新
  function update(dt) {
    // モーダル表示中または一時停止中は物理・タイマーを完全停止する
    if (isModalOpen() || isPaused) return;

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

      b.wobblePhase += dt * 11;
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

    if (pressFlash > 0) {
      pressFlash = Math.max(0, pressFlash - dt * 2.6);
    }

    if (comboFlash > 0) {
      comboFlash = Math.max(0, comboFlash - dt * 2.4);
    }

    auraPhase += dt;

    if (comboPopScale > 1.001) {
      comboPopScale += (1 - comboPopScale) * Math.min(1, dt * 14);
    } else {
      comboPopScale = 1;
    }

    // 継続コンボタイマーの更新（小さい泡を押し込んで仕込み中のあいだは減りを緩やかにする）
    if (gameState === "playing" && comboTimer > 0 && pendingPops.length === 0) {
      const drainRate = pressedBubble && pressInside ? 0.5 : 1.0;
      comboTimer -= dt * drainRate;
      if (comboTimer <= 0) {
        comboTimer = 0;
        comboCount = 0;
      }
    }

    // 画面外枠の輝き（銀→金→オーロラ→虹）を現在のコンボ帯域に同期させる
    updateContainerGlow(Math.floor(comboCount / 10));

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

    for (let i = floatTexts.length - 1; i >= 0; i--) {
      const ft = floatTexts[i];
      ft.y += ft.vy * dt;
      ft.vy *= Math.pow(0.18, dt);
      ft.life -= dt * 1.65;
      if (ft.life <= 0) floatTexts.splice(i, 1);
    }

    for (const m of depthMarkers) {
      if (m.passFlash > 0) {
        m.passFlash = Math.max(0, m.passFlash - dt * 1.4);
      }
    }

    if (gameState !== "playing") {
      refreshPreview();
      return;
    }

    elapsed += dt;
    const { pressSpeed } = getDifficultyMetrics();

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

    // 自己ベスト・ライバルの到達ラインをコアが突き抜けた瞬間の手応え演出
    for (const m of depthMarkers) {
      if (!m.passed && core.y >= m.y) {
        m.passed = true;
        m.passFlash = 1.0;
        sound.playCharge();
        triggerHaptic(12);
        if (!protoMode) {
          const isGold = m.kind === "top" || m.kind === "self";
          const color = isGold ? "#ffd54f" : "#53d8fb";
          const msg =
            m.kind === "top"
              ? "👑 TOP RECORD!"
              : m.kind === "self"
                ? "★ NEW BEST!"
                : `BEAT ${m.name}!`;
          spawnRing(core.x, m.y, 44, color, 2.8);
          spawnFloatText(core.x, core.y - 26, msg, color, m.kind === "top" ? 18 : 16);
        }
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

    // プレスに飲み込まれた泡の消滅と、画面内のごく緩やかな膨張を更新
    for (const b of bubbles) {
      if (b.dead || b.chainQueued) continue;

      if (b.y + b.radius * 0.4 < pressY) {
        b.dead = true;
        if (!protoMode) {
          spawnParticles(b.x, pressY, 5, "#ff4d5a", 90);
        }
        continue;
      }

      if (b.armored || b.state === "flat") continue;
      if (pressedBubble === b && pressInside) continue;

      // 通常泡は放置で勝手に暴発せず、ごく緩やかに膨らむだけ（自分で押し込む必要がある）
      if (b.y < cameraY + WORLD_H + 40 && b.pressure < 0.92) {
        b.pressure = Math.min(0.92, b.pressure + 0.005 * dt);
        b.radius = radiusForPressure(b.pressure);
        if (b.pressure >= params.criticalThreshold && b.state === "growing") {
          b.state = "critical";
          b.scaleVel += 3.0;
        }
      }
    }

    // プレスがコアに近づいているときの緊迫感を警告音に反映
    let maxUrgency = 0;
    const pressGap = (core.y - core.radius) - pressY;
    if (pressGap < 95) {
      maxUrgency = 1 - Math.max(0, pressGap) / 95;
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

    // 2.5 自己ベスト＆オンラインライバルの到達ライン（泡の後ろにさりげなく表示）
    drawDepthMarkers(layer);

    // 3. 接触している臨界泡同士を繋ぐ白いライン
    ctx.lineCap = "round";
    for (let i = 0; i < bubbles.length; i++) {
      const a = bubbles[i];
      if (a.dead || a.armored || a.appearDelay > 0 || a.state !== "critical") continue;
      if (a.y < cameraY - 60 || a.y > cameraY + WORLD_H + 60) continue;

      for (let j = i + 1; j < bubbles.length; j++) {
        const b = bubbles[j];
        if (b.dead || b.armored || b.appearDelay > 0 || b.state !== "critical") continue;
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
        const isDangerOut = item.outcome === "overload";
        const isPromoOut = item.outcome === "toCritical";
        const color = protoMode
          ? isDangerOut ? "#111111" : isPressPreview ? "#333333" : "#555555"
          : isDangerOut
            ? isPressPreview ? "rgba(255, 77, 90, 0.98)" : "rgba(255, 77, 90, 0.88)"
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
      drawBubble(b, layer, transferTargetMap.get(b));
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

    // 10. 10連鎖ごとに豪華になっていく画面発光オーラ（銀 → 金 → オーロラ → 虹色）
    drawComboAura();

    // 11. 継続コンボ表示（画面右上・2連鎖以上のときだけ浮かぶ）
    drawComboHud();

    ctx.restore(); // 画面揺れ解除
  }

  // 10連鎖（銀）→ 20連鎖（金）→ 30連鎖（オーロラ）→ 40連鎖〜（虹色）の画面発光演出
  function drawComboAura() {
    if (protoMode || gameState === "gameover") return;
    const activeTier = Math.floor(comboCount / 10);
    const tier = Math.max(activeTier, comboFlash > 0.02 ? comboFlashTier : 0);
    if (tier <= 0) return;

    const pulse = 0.5 + 0.5 * Math.sin(auraPhase * (3.5 + tier * 1.4));
    const baseStrength = activeTier > 0 ? Math.min(1, 0.38 + activeTier * 0.14 + pulse * 0.14) : 0;
    const flashBoost = comboFlash * 0.72;
    const strength = Math.min(1, baseStrength + flashBoost);
    if (strength <= 0.01) return;

    ctx.save();

    // 1. 四辺から内側へ滲む豪華な縁取りグロー（ビネット発光）
    const edgeDepth = 24 + Math.min(34, tier * 8) + comboFlash * 16;
    let cTop, cBottom, cLeft, cRight;

    if (tier === 1) {
      // 10〜19連鎖：澄んだシルバー（銀）
      cTop = cBottom = cLeft = cRight = `rgba(218, 232, 248, ${(strength * 0.34).toFixed(3)})`;
    } else if (tier === 2) {
      // 20〜29連鎖：リッチなゴールド（金）
      cTop = `rgba(255, 224, 115, ${(strength * 0.42).toFixed(3)})`;
      cBottom = `rgba(255, 184, 38, ${(strength * 0.42).toFixed(3)})`;
      cLeft = cRight = `rgba(255, 206, 72, ${(strength * 0.38).toFixed(3)})`;
    } else if (tier === 3) {
      // 30〜39連鎖：シアン×マゼンタのクリスタル・オーロラ
      const h1 = (188 + Math.sin(auraPhase * 2.0) * 28) % 360;
      const h2 = (305 + Math.cos(auraPhase * 2.0) * 28) % 360;
      cTop = `hsla(${h1.toFixed(0)}, 95%, 68%, ${(strength * 0.45).toFixed(3)})`;
      cBottom = `hsla(${h2.toFixed(0)}, 95%, 68%, ${(strength * 0.45).toFixed(3)})`;
      cLeft = `hsla(${((h1 + h2) * 0.5).toFixed(0)}, 95%, 70%, ${(strength * 0.38).toFixed(3)})`;
      cRight = `hsla(${h1.toFixed(0)}, 95%, 70%, ${(strength * 0.38).toFixed(3)})`;
    } else {
      // 40連鎖〜：四辺が滑らかに回転するフル虹色（レインボー）
      const speed = tier >= 5 ? 210 : 130;
      const baseH = (auraPhase * speed) % 360;
      const alpha = Math.min(0.62, strength * (tier >= 5 ? 0.58 : 0.48));
      cTop = `hsla(${baseH.toFixed(0)}, 98%, 64%, ${alpha.toFixed(3)})`;
      cRight = `hsla(${((baseH + 90) % 360).toFixed(0)}, 98%, 64%, ${alpha.toFixed(3)})`;
      cBottom = `hsla(${((baseH + 180) % 360).toFixed(0)}, 98%, 64%, ${alpha.toFixed(3)})`;
      cLeft = `hsla(${((baseH + 270) % 360).toFixed(0)}, 98%, 64%, ${alpha.toFixed(3)})`;
    }

    // 上辺グロー
    const gTop = ctx.createLinearGradient(0, 0, 0, edgeDepth);
    gTop.addColorStop(0, cTop);
    gTop.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gTop;
    ctx.fillRect(0, 0, WORLD_W, edgeDepth);

    // 下辺グロー
    const gBottom = ctx.createLinearGradient(0, WORLD_H, 0, WORLD_H - edgeDepth);
    gBottom.addColorStop(0, cBottom);
    gBottom.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gBottom;
    ctx.fillRect(0, WORLD_H - edgeDepth, WORLD_W, edgeDepth);

    // 左辺グロー
    const gLeft = ctx.createLinearGradient(0, 0, edgeDepth, 0);
    gLeft.addColorStop(0, cLeft);
    gLeft.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gLeft;
    ctx.fillRect(0, 0, edgeDepth, WORLD_H);

    // 右辺グロー
    const gRight = ctx.createLinearGradient(WORLD_W, 0, WORLD_W - edgeDepth, 0);
    gRight.addColorStop(0, cRight);
    gRight.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gRight;
    ctx.fillRect(WORLD_W - edgeDepth, 0, edgeDepth, WORLD_H);

    // 2. 盤面内周のメタリック／虹色フレームライン（40連鎖以上は虹色グラデーション枠が輝く！）
    if (activeTier >= 1) {
      const frameGrad = ctx.createLinearGradient(
        Math.cos(auraPhase * 1.8) * WORLD_W * 0.5 + WORLD_W * 0.5,
        0,
        Math.sin(auraPhase * 1.8) * WORLD_W * 0.5 + WORLD_W * 0.5,
        WORLD_H
      );
      if (activeTier === 1) {
        frameGrad.addColorStop(0, "rgba(255, 255, 255, 0.85)");
        frameGrad.addColorStop(0.5, "rgba(180, 198, 220, 0.35)");
        frameGrad.addColorStop(1, "rgba(255, 255, 255, 0.8)");
      } else if (activeTier === 2) {
        frameGrad.addColorStop(0, "rgba(255, 245, 190, 0.95)");
        frameGrad.addColorStop(0.5, "rgba(255, 190, 40, 0.55)");
        frameGrad.addColorStop(1, "rgba(255, 232, 130, 0.95)");
      } else if (activeTier === 3) {
        frameGrad.addColorStop(0, "rgba(85, 240, 255, 0.95)");
        frameGrad.addColorStop(0.5, "rgba(255, 115, 215, 0.85)");
        frameGrad.addColorStop(1, "rgba(175, 145, 255, 0.95)");
      } else {
        const baseH = (auraPhase * (activeTier >= 5 ? 210 : 130)) % 360;
        frameGrad.addColorStop(0, `hsl(${baseH.toFixed(0)}, 100%, 68%)`);
        frameGrad.addColorStop(0.25, `hsl(${((baseH + 90) % 360).toFixed(0)}, 100%, 68%)`);
        frameGrad.addColorStop(0.5, `hsl(${((baseH + 180) % 360).toFixed(0)}, 100%, 68%)`);
        frameGrad.addColorStop(0.75, `hsl(${((baseH + 270) % 360).toFixed(0)}, 100%, 68%)`);
        frameGrad.addColorStop(1, `hsl(${baseH.toFixed(0)}, 100%, 68%)`);
      }

      ctx.strokeStyle = frameGrad;
      ctx.lineWidth = Math.min(7, 2.5 + activeTier * 0.9 + comboFlash * 2);
      ctx.strokeRect(2, 2, WORLD_W - 4, WORLD_H - 4);
    }

    // 3. 10・20・30・40連鎖突破の瞬間の画面全体フラッシュ（銀・金・オーロラ・虹色の閃光）
    if (comboFlash > 0.01) {
      const flashAlpha = comboFlash * (tier >= 4 ? 0.28 : 0.2);
      if (tier >= 4) {
        const baseH = (auraPhase * 180) % 360;
        const rg = ctx.createLinearGradient(0, 0, WORLD_W, WORLD_H);
        rg.addColorStop(0, `hsla(${baseH.toFixed(0)}, 100%, 70%, ${flashAlpha.toFixed(3)})`);
        rg.addColorStop(0.5, `hsla(${((baseH + 120) % 360).toFixed(0)}, 100%, 70%, ${flashAlpha.toFixed(3)})`);
        rg.addColorStop(1, `hsla(${((baseH + 240) % 360).toFixed(0)}, 100%, 70%, ${flashAlpha.toFixed(3)})`);
        ctx.fillStyle = rg;
      } else if (tier === 3) {
        const ag = ctx.createLinearGradient(0, 0, WORLD_W, WORLD_H);
        ag.addColorStop(0, `rgba(90, 240, 255, ${flashAlpha.toFixed(3)})`);
        ag.addColorStop(1, `rgba(255, 115, 220, ${flashAlpha.toFixed(3)})`);
        ctx.fillStyle = ag;
      } else if (tier === 2) {
        ctx.fillStyle = `rgba(255, 218, 95, ${flashAlpha.toFixed(3)})`;
      } else {
        ctx.fillStyle = `rgba(235, 245, 255, ${flashAlpha.toFixed(3)})`;
      }
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }

    ctx.restore();
  }

  // 継続コンボ数と残り猶予バーを画面右上へ軽快に描画する
  function drawComboHud() {
    if (comboCount < 2 || gameState === "gameover") return;

    const tier = Math.floor(comboCount / 10);
    const color = protoMode ? "#111111" : getComboTierColor(tier);
    const remainRatio = Math.max(0, Math.min(1, comboTimer / COMBO_WINDOW));
    const x = WORLD_W - 14;
    const y = 24;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(comboPopScale, comboPopScale);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    // 背景をうっすら暗くしてプレス天井の上でもくっきり読めるようにする
    const badgeW = 98;
    const badgeH = 34;
    ctx.fillStyle = protoMode ? "rgba(255, 255, 255, 0.85)" : "rgba(10, 14, 22, 0.72)";
    const bx = -badgeW;
    const by = -15;
    const br = 9;
    ctx.beginPath();
    ctx.moveTo(bx + br, by);
    ctx.arcTo(bx + badgeW, by, bx + badgeW, by + badgeH, br);
    ctx.arcTo(bx + badgeW, by + badgeH, bx, by + badgeH, br);
    ctx.arcTo(bx, by + badgeH, bx, by, br);
    ctx.arcTo(bx, by, bx + badgeW, by, br);
    ctx.closePath();
    ctx.fill();

    ctx.font = "900 17px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = color;
    ctx.fillText(`${comboCount} CHAIN`, -8, -1);

    // 次の10連鎖の音進化までの残り時間バー
    const barW = badgeW - 16;
    ctx.fillStyle = protoMode ? "rgba(0, 0, 0, 0.14)" : "rgba(255, 255, 255, 0.16)";
    ctx.fillRect(-badgeW + 8, 11, barW, 3.5);
    ctx.fillStyle = color;
    ctx.fillRect(-badgeW + 8 + barW * (1 - remainRatio), 11, barW * remainRatio, 3.5);
    ctx.restore();
  }

  // 地層内に自己ベスト＆オンラインライバルの到達ラインを描画する
  function drawDepthMarkers(layer) {
    if (depthMarkers.length === 0) return;

    ctx.save();
    ctx.font = "800 10px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    for (const m of depthMarkers) {
      if (m.y < cameraY - 24 || m.y > cameraY + WORLD_H + 24) continue;
      if (m.passed && m.passFlash <= 0.01) continue;

      const { left, right } = getWallBounds(m.y);
      const alpha = m.passed ? m.passFlash : 1;
      const isTop = m.kind === "top";
      const isSelf = m.kind === "self";

      const strokeColor = protoMode
        ? `rgba(20, 20, 20, ${(0.55 * alpha).toFixed(3)})`
        : isTop
          ? `rgba(255, 213, 79, ${((m.passed ? 0.95 : 0.65) * alpha).toFixed(3)})`
          : isSelf
            ? `rgba(255, 232, 145, ${((m.passed ? 0.95 : 0.55) * alpha).toFixed(3)})`
            : `rgba(110, 224, 255, ${((m.passed ? 0.9 : 0.48) * alpha).toFixed(3)})`;

      // 左右の岩壁の内側いっぱいに点線を引く（突破直後は実線でパッと光る）
      ctx.save();
      ctx.beginPath();
      if (!m.passed) {
        ctx.setLineDash([5, 4]);
      }
      ctx.moveTo(left + 2, m.y);
      ctx.lineTo(right - 2, m.y);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = m.passed ? 2.6 : isTop ? 1.8 : 1.4;
      ctx.stroke();
      ctx.restore();

      // 左端にコンパクトな到達ラベルタグを配置（右端の10m目盛りと重ならない）
      const labelText = m.label;
      const textW = ctx.measureText(labelText).width;
      const padX = 6;
      const tagW = textW + padX * 2;
      const tagH = 16;
      const tagX = left + 6;
      const tagY = m.y - tagH - 3;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = protoMode ? "rgba(255, 255, 255, 0.85)" : "rgba(10, 14, 22, 0.72)";
      ctx.beginPath();
      ctx.moveTo(tagX + 5, tagY);
      ctx.arcTo(tagX + tagW, tagY, tagX + tagW, tagY + tagH, 5);
      ctx.arcTo(tagX + tagW, tagY + tagH, tagX, tagY + tagH, 5);
      ctx.arcTo(tagX, tagY + tagH, tagX, tagY, 5);
      ctx.arcTo(tagX, tagY, tagX + tagW, tagY, 5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = protoMode
        ? "#111111"
        : isTop
          ? "#ffd54f"
          : isSelf
            ? "#ffe999"
            : "#8be4ff";
      ctx.fillText(labelText, tagX + padX, tagY + tagH * 0.5 + 0.5);
      ctx.restore();
    }

    ctx.restore();
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
  function drawBubble(b, layer, transferPreview) {
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
    } else if (isPressPreview && transferPreview && !protoMode && transferPreview.outcome !== "grow") {
      jitterX = Math.sin(b.wobblePhase * 2.2) * 1.2;
      jitterY = Math.cos(b.wobblePhase * 2.5) * 1.2;
    }

    const cx = b.x + jitterX + b.offsetX;
    const cy = b.y + jitterY + b.offsetY;

    // 空気が抜けたペチャンコ玉（flat：押しても消えず、2連鎖以上の爆風でのみ粉砕可能）
    if (b.state === "flat") {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = protoMode ? "#c0c0c0" : "rgba(255, 255, 255, 0.12)";
      ctx.fill();
      ctx.strokeStyle = protoMode ? "#808080" : "rgba(255, 255, 255, 0.24)";
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // しわ／凹みを示す小さな横線
      ctx.beginPath();
      ctx.moveTo(cx - radius * 0.42, cy);
      ctx.lineTo(cx + radius * 0.42, cy);
      ctx.strokeStyle = protoMode ? "#666666" : "rgba(0, 0, 0, 0.45)";
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      ctx.stroke();
      return;
    }

    // 硬い殻の泡（2連鎖以上の爆風で砕くターゲット）
    if (b.armored) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = protoMode ? "#757575" : "#3a4559";
      ctx.fill();
      ctx.strokeStyle = protoMode ? "#222222" : "#9fb0ca";
      ctx.lineWidth = 3;
      ctx.stroke();

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
    }

    // 空気押し出し先の状態変化プレビュー（暴発する相手は赤実線リング＋×印で明確に警告！）
    if (transferPreview) {
      ctx.save();
      if (transferPreview.outcome === "overload") {
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = protoMode ? "#000000" : "#ff3b4a";
        ctx.lineWidth = isPressPreview ? 3.8 : 3;
        ctx.stroke();

        // 暴発の警告×印
        const xSize = 6.5;
        ctx.beginPath();
        ctx.moveTo(cx - xSize, cy - xSize);
        ctx.lineTo(cx + xSize, cy + xSize);
        ctx.moveTo(cx + xSize, cy - xSize);
        ctx.lineTo(cx - xSize, cy + xSize);
        ctx.strokeStyle = protoMode ? "#000000" : "#ff3b4a";
        ctx.lineWidth = 2.6;
        ctx.lineCap = "round";
        ctx.stroke();
      } else {
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
        if (transferPreview.outcome === "toCritical") {
          ctx.strokeStyle = protoMode ? "#333333" : "rgba(255, 255, 255, 0.96)";
          ctx.lineWidth = isPressPreview ? 3 : 2.2;
        } else {
          ctx.strokeStyle = protoMode
            ? "#666666"
            : isPressPreview ? "rgba(195, 224, 255, 0.78)" : "rgba(170, 200, 235, 0.45)";
          ctx.lineWidth = isPressPreview ? 2 : 1.4;
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // 重力で下へ落ちる光るコアを描画する（赤いラインが迫ると赤く警告点滅＋警戒線を表示）
  function drawCore(layer) {
    const cx = core.x;
    const cy = core.y;
    const r = core.radius;
    const pulse = 0.5 + 0.5 * Math.sin(core.pulse);
    const pressGap = (cy - r) - pressY;
    const isDangerNear = (gameState === "playing" && pressGap < 85) || gameState === "gameover";
    const dangerBlink = isDangerNear ? 0.5 + 0.5 * Math.sin(core.pulse * 4.5) : 0;

    // 赤いラインが迫っているときはコアと赤いラインを点線で結び、ピンチを一目で伝える
    if (isDangerNear && pressGap > -6) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, pressY + 4);
      ctx.lineTo(cx, cy - r - 2);
      ctx.strokeStyle = protoMode ? "#111111" : `rgba(255, 77, 90, ${(0.55 + dangerBlink * 0.45).toFixed(2)})`;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.restore();
    }

    if (protoMode) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = isDangerNear ? "#444444" : "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      const auraColor = isDangerNear ? "#ff4d5a" : layer.accent;
      ctx.save();
      ctx.shadowColor = auraColor;
      ctx.shadowBlur = isDangerNear ? 18 + dangerBlink * 14 : 16 + pulse * 8;
      ctx.beginPath();
      ctx.arc(cx, cy, r * (isDangerNear ? 1 + dangerBlink * 0.06 : 1), 0, Math.PI * 2);
      ctx.fillStyle = auraColor;
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.64, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      if (isDangerNear) {
        ctx.beginPath();
        ctx.arc(cx, cy, r + 5 + dangerBlink * 4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 77, 90, ${(0.5 + dangerBlink * 0.45).toFixed(2)})`;
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
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

    // 警戒ストライプの先端ライン（暴発急降下時は明るくフラッシュ）
    ctx.beginPath();
    ctx.moveTo(0, pressY);
    ctx.lineTo(WORLD_W, pressY);
    ctx.strokeStyle = protoMode ? "#111111" : pressFlash > 0.1 ? "#ffffff" : "#ff6b7a";
    ctx.lineWidth = pressFlash > 0.1 ? 5.5 : 3.5;
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

    // 進めば進むほど速くなっていることを直感的に示す極小スピード表示
    if (gameState === "playing" && pressY > cameraY + 14) {
      const { speedRatio } = getDifficultyMetrics();
      ctx.font = "800 10px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = protoMode ? "#ffffff" : "rgba(255, 240, 242, 0.9)";
      ctx.fillText(`PRESS ${speedRatio.toFixed(1)}x`, 10, pressY - 5);
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
    // 「順位を見る」「結果をシェア」ボタンが押された場合はリトライしない
    if (e.target && e.target.closest("#openRankingFromResultBtn, #shareResultBtn")) return;
    e.preventDefault();
    retryFromClientPoint(e.clientX, e.clientY);
  });

  retryBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    retryFromClientPoint(e.clientX, e.clientY);
  });

  openRankingFromResultBtn.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
  });

  openRankingFromResultBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openRankingModal();
  });

  // プレイ結果をSNSやLINEへ共有（Web Share API優先、非対応環境はクリップボードへコピー）
  function showCopiedFeedback() {
    shareResultBtn.textContent = "コピーしました ✓";
    shareResultBtn.classList.add("copied");
    setTimeout(() => {
      shareResultBtn.textContent = "結果をシェア";
      shareResultBtn.classList.remove("copied");
    }, 1800);
  }

  async function shareResult() {
    const tier = Math.floor(sessionMaxChain / 10);
    const badge = tier >= 4 ? " 🌈" : tier === 3 ? " 💎" : tier === 2 ? " 🥇" : tier === 1 ? " 🥈" : "";
    const shareUrl = "https://kawata2271.github.io/puchi-chain/";
    const summary = `PUCHI CHAIN\n深度 ${depthMeters}m / スコア ${score}pt / 最大 ${sessionMaxChain} CHAIN${badge}`;
    const text = `${summary}\n${shareUrl}`;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "PUCHI CHAIN",
          text: summary,
          url: shareUrl
        });
        return;
      } catch (err) {
        // ユーザーが共有シートを閉じた場合はコピーへフォールバックしない
        if (err && err.name === "AbortError") return;
      }
    }

    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
        showCopiedFeedback();
        return;
      }
    } catch (_) {}

    // 古いブラウザ向けフォールバックコピー
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showCopiedFeedback();
    } catch (_) {}
    document.body.removeChild(ta);
  }

  shareResultBtn.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
  });

  shareResultBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    shareResult();
  });

  // ニックネーム入力モーダルを開く
  function openNicknameModal(fromRanking = false) {
    reopenRankingAfterNameEdit = fromRanking;
    rankingModal.classList.add("hidden");
    nicknameInput.value = leaderboard.hasNickname() ? leaderboard.getNickname() : "";
    nicknameModal.classList.remove("hidden");
    setTimeout(() => {
      nicknameInput.focus();
      nicknameInput.select();
    }, 60);
  }

  // ニックネーム確定時の処理
  nicknameForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const saved = leaderboard.setNickname(nicknameInput.value);
    currentPlayerNameEl.textContent = `NAME: ${saved}`;
    nicknameModal.classList.add("hidden");
    sound.unlock();

    // すでにプレイ記録がある場合のみ、オンライン側の表示名も同期更新する（未プレイ0点登録を防ぐ）
    if (leaderboard.isOnlineConfigured() && (bestDepth > 0 || score > 0 || sessionMaxChain > 0)) {
      leaderboard.submitScore(0, 0, 0).catch(() => {});
    }

    if (reopenRankingAfterNameEdit) {
      reopenRankingAfterNameEdit = false;
      openRankingModal();
    } else if (!tutorial.hasSeen()) {
      // 初回ニックネーム登録の直後に、動く遊び方マニュアルを一度だけ見せる
      tutorial.open(0);
    }
  });

  // 順位表モーダルを開いて最新データを取得・描画する
  async function openRankingModal() {
    clearPressState();
    currentPlayerNameEl.textContent = `NAME: ${leaderboard.getNickname()}`;
    rankingModal.classList.remove("hidden");
    await refreshRankingList();
  }

  function closeRankingModal() {
    rankingModal.classList.add("hidden");
  }

  // 指定タブ（最高得点 / 最高連鎖）の順位表を描画する
  async function refreshRankingList() {
    tabScoreBtn.classList.toggle("active", activeRankingTab === "score");
    tabScoreBtn.setAttribute("aria-selected", String(activeRankingTab === "score"));
    tabChainBtn.classList.toggle("active", activeRankingTab === "chain");
    tabChainBtn.setAttribute("aria-selected", String(activeRankingTab === "chain"));

    rankingListEl.textContent = "";
    const loading = document.createElement("div");
    loading.className = "ranking-empty";
    loading.textContent = "読み込み中...";
    rankingListEl.appendChild(loading);

    const res = await leaderboard.fetchRanking(activeRankingTab, 50);
    rankingModeBadge.textContent = res.mode === "online" ? "ONLINE" : "LOCAL";
    rankingModeBadge.classList.toggle("online", res.mode === "online");

    rankingListEl.textContent = "";
    if (!res.rows || res.rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ranking-empty";
      empty.textContent = "まだ記録がありません。最初の1位を目指そう！";
      rankingListEl.appendChild(empty);
      return;
    }

    res.rows.forEach((row, idx) => {
      const rank = idx + 1;
      const item = document.createElement("div");
      item.className = "ranking-row";
      if (row.player_id === leaderboard.playerId) {
        item.classList.add("is-me");
      }

      const rankEl = document.createElement("div");
      rankEl.className = "rank-num";
      if (rank === 1) rankEl.classList.add("top1");
      else if (rank === 2) rankEl.classList.add("top2");
      else if (rank === 3) rankEl.classList.add("top3");
      rankEl.textContent = String(rank);

      const infoEl = document.createElement("div");
      infoEl.className = "rank-info";

      const nameEl = document.createElement("div");
      nameEl.className = "rank-name";
      nameEl.textContent = row.nickname || "GUEST";

      const subEl = document.createElement("div");
      subEl.className = "rank-sub";
      subEl.textContent =
        activeRankingTab === "chain"
          ? `SCORE ${row.best_score || 0} · DEPTH ${row.best_depth || 0}m`
          : `MAX CHAIN ${row.best_chain || 0} · DEPTH ${row.best_depth || 0}m`;

      infoEl.appendChild(nameEl);
      infoEl.appendChild(subEl);

      const valEl = document.createElement("div");
      valEl.className = "rank-main-val";
      valEl.textContent =
        activeRankingTab === "chain"
          ? `${row.best_chain || 0} 連鎖`
          : `${row.best_score || 0} pt`;

      item.appendChild(rankEl);
      item.appendChild(infoEl);
      item.appendChild(valEl);
      rankingListEl.appendChild(item);
    });
  }

  pauseBtn.addEventListener("click", () => {
    if (isPaused) {
      resumeGame();
    } else {
      pauseGame();
    }
  });

  pauseOverlay.addEventListener("pointerdown", (e) => {
    if (e.target && e.target.closest("#restartFromPauseBtn")) return;
    e.preventDefault();
    resumeGame();
  });

  resumeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    resumeGame();
  });

  restartFromPauseBtn.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
  });

  restartFromPauseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    isPaused = false;
    resetGame();
  });

  // プレイ中に別アプリや別タブへ切り替えたときは自動で一時停止して不意のゲームオーバーを防ぐ
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && gameState === "playing" && !isModalOpen()) {
      pauseGame();
    }
  });

  rankingBtn.addEventListener("click", () => {
    openRankingModal();
  });

  helpBtn.addEventListener("click", () => {
    clearPressState();
    tutorial.open(0);
  });

  closeRankingBtn.addEventListener("click", () => {
    closeRankingModal();
  });

  rankingModal.addEventListener("click", (e) => {
    if (e.target === rankingModal) {
      closeRankingModal();
    }
  });

  editNicknameBtn.addEventListener("click", () => {
    openNicknameModal(true);
  });

  tabScoreBtn.addEventListener("click", () => {
    if (activeRankingTab === "score") return;
    activeRankingTab = "score";
    refreshRankingList();
  });

  tabChainBtn.addEventListener("click", () => {
    if (activeRankingTab === "chain") return;
    activeRankingTab = "chain";
    refreshRankingList();
  });

  window.addEventListener("keydown", (e) => {
    if (isModalOpen()) {
      if (e.key === "Escape") {
        if (!rankingModal.classList.contains("hidden")) closeRankingModal();
        if (!tutorialModal.classList.contains("hidden")) tutorial.close();
      }
      return;
    }
    if (e.key === "p" || e.key === "P" || e.key === "Escape") {
      if (gameState === "playing") {
        e.preventDefault();
        if (isPaused) resumeGame();
        else pauseGame();
      }
      return;
    }
    if (e.code === "Space" || e.code === "Enter") {
      if (isPaused) {
        e.preventDefault();
        resumeGame();
      } else if (gameState === "gameover" && performance.now() >= gameOverLockUntil) {
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
    tuningToggleBtn.setAttribute("aria-expanded", String(!isHidden));
    tuningToggleBtn.textContent = isHidden ? "開発・調整ツール ▾" : "開発・調整ツール ▴";
  });

  function syncSlidersUI() {
    sliders.press.input.value = String(params.pressSpeedScale);
    sliders.press.out.textContent = `${params.pressSpeedScale.toFixed(2)}x`;

    sliders.transfer.input.value = String(params.airTransferRate);
    sliders.transfer.out.textContent = `${params.airTransferRate.toFixed(2)}x`;

    const threshPct = Math.round(params.criticalThreshold * 100);
    sliders.threshold.input.value = String(threshPct);
    sliders.threshold.out.textContent = `${threshPct}%`;

    sliders.delay.input.value = String(params.chainDelayMs);
    sliders.delay.out.textContent = `${params.chainDelayMs}ms`;
  }

  sliders.press.input.addEventListener("input", () => {
    params.pressSpeedScale = Number(sliders.press.input.value);
    if (!isDefaultParams()) wasCustomParamsUsed = true;
    syncSlidersUI();
  });

  sliders.transfer.input.addEventListener("input", () => {
    params.airTransferRate = Number(sliders.transfer.input.value);
    if (!isDefaultParams()) wasCustomParamsUsed = true;
    syncSlidersUI();
  });

  sliders.threshold.input.addEventListener("input", () => {
    params.criticalThreshold = Number(sliders.threshold.input.value) / 100;
    if (!isDefaultParams()) wasCustomParamsUsed = true;
    for (const b of bubbles) {
      if (b.dead || b.armored || b.state === "flat") continue;
      if (b.state === "growing" && b.pressure >= params.criticalThreshold) {
        b.state = "critical";
      } else if (b.state === "critical" && b.pressure < params.criticalThreshold) {
        b.state = "growing";
      }
    }
    syncSlidersUI();
  });

  sliders.delay.input.addEventListener("input", () => {
    params.chainDelayMs = Number(sliders.delay.input.value);
    if (!isDefaultParams()) wasCustomParamsUsed = true;
    syncSlidersUI();
  });

  resetParamsBtn.addEventListener("click", () => {
    Object.assign(params, DEFAULT_PARAMS);
    if (gameState === "ready") wasCustomParamsUsed = false;
    syncSlidersUI();
  });

  window.addEventListener("resize", resizeCanvas);

  // 初期化と開始
  syncSlidersUI();
  syncSoundEnabled();
  resizeCanvas();
  resetGame();
  loadRivalMarkers();
  if (!leaderboard.hasNickname()) {
    openNicknameModal(false);
  } else if (!tutorial.hasSeen()) {
    tutorial.open(0);
  }
  requestAnimationFrame(loop);
})();
