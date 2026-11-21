(() => {
  "use strict";

  const DIRS = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
  ];

  // ステージごとに画面全体のムードを切り替えるカラーテーマ（全6種）
  const THEMES = [
    {
      bg: "#0e141d",
      surface: "#151e2c",
      border: "#25344a",
      accent: "#53d8fb",
      tileFill: "#1b334b",
      tileStroke: "#44aed1",
      clearedFill: "#111822",
      clearedStroke: "#1f2a3a",
      bubbleHue: 204
    },
    {
      bg: "#0c1714",
      surface: "#12231e",
      border: "#223f35",
      accent: "#42f5b3",
      tileFill: "#163b2f",
      tileStroke: "#32bc8b",
      clearedFill: "#0f1b17",
      clearedStroke: "#1c2e28",
      bubbleHue: 158
    },
    {
      bg: "#1a1114",
      surface: "#26181d",
      border: "#442933",
      accent: "#ff8c6b",
      tileFill: "#402329",
      tileStroke: "#da7257",
      clearedFill: "#1c1316",
      clearedStroke: "#301f26",
      bubbleHue: 16
    },
    {
      bg: "#14101f",
      surface: "#1d172e",
      border: "#362954",
      accent: "#b794ff",
      tileFill: "#2f224f",
      tileStroke: "#8e6ad9",
      clearedFill: "#161124",
      clearedStroke: "#271e3d",
      bubbleHue: 262
    },
    {
      bg: "#19150d",
      surface: "#251e12",
      border: "#44371f",
      accent: "#ffd166",
      tileFill: "#3f3117",
      tileStroke: "#cca13d",
      clearedFill: "#1c170e",
      clearedStroke: "#312716",
      bubbleHue: 42
    },
    {
      bg: "#1a1019",
      surface: "#271725",
      border: "#462742",
      accent: "#ff75c3",
      tileFill: "#43203d",
      tileStroke: "#d15ba0",
      clearedFill: "#1d121c",
      clearedStroke: "#331d30",
      bubbleHue: 325
    }
  ];

  // ステージごとに形が変わるプチプチシート地形（全10種）
  const SHEETS = [
    {
      name: "MINI SHEET",
      mask: [
        "####",
        "####",
        "####",
        "####"
      ]
    },
    {
      name: "DONUT",
      mask: [
        ".###.",
        "#####",
        "##.##",
        "#####",
        ".###."
      ]
    },
    {
      name: "TWIN ISLANDS",
      mask: [
        "##.##",
        "##.##",
        "#####",
        "##.##",
        "##.##"
      ]
    },
    {
      name: "CROSS",
      mask: [
        ".###.",
        ".###.",
        "#####",
        ".###.",
        ".###."
      ]
    },
    {
      name: "DIAMOND",
      mask: [
        "..#..",
        ".###.",
        "#####",
        ".###.",
        "..#.."
      ]
    },
    {
      name: "S-CORRIDOR",
      mask: [
        "#####",
        "....#",
        "#####",
        "#....",
        "#####"
      ]
    },
    {
      name: "FOUR ROOMS",
      mask: [
        "##.##",
        "#####",
        ".#.#.",
        "#####",
        "##.##"
      ]
    },
    {
      name: "HOURGLASS",
      mask: [
        "#####",
        ".###.",
        "..#..",
        ".###.",
        "#####"
      ]
    },
    {
      name: "CHECKER HOLES",
      mask: [
        ".####.",
        "#.##.#",
        "######",
        "######",
        "#.##.#",
        ".####."
      ]
    },
    {
      name: "GRAND RING",
      mask: [
        ".####.",
        "######",
        "##..##",
        "##..##",
        "######",
        ".####."
      ]
    }
  ];

  // デフォルトの調整パラメータ（ステップ4の検証用にリアルタイム変更可能）
  const DEFAULT_PARAMS = {
    speedScale: 1.0,         // 膨張スピード倍率
    airTransferRate: 1.25,   // 小さい泡を潰したときに隣へ押し出される空気量倍率
    criticalThreshold: 0.68, // 臨界（連鎖可能）になる圧力割合
    dangerDuration: 2.6,     // 圧力100%到達から自爆までの猶予秒数
    chainDelayMs: 55         // 連鎖が隣へ伝わる時間間隔（ミリ秒）
  };

  // DOM要素の参照
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const canvasContainer = document.getElementById("canvasContainer");
  const stageValueEl = document.getElementById("stageValue");
  const scoreValueEl = document.getElementById("scoreValue");
  const bestValueEl = document.getElementById("bestValue");
  const sheetNameEl = document.getElementById("sheetName");
  const sheetRemainEl = document.getElementById("sheetRemain");
  const progressFillEl = document.getElementById("progressFill");
  const stageBannerEl = document.getElementById("stageBanner");
  const stageBannerSubEl = document.getElementById("stageBannerSub");
  const stageBannerTitleEl = document.getElementById("stageBannerTitle");
  const sheetWipeEl = document.getElementById("sheetWipe");
  const hintTextEl = document.getElementById("hintText");
  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const finalScoreEl = document.getElementById("finalScore");
  const finalMetaEl = document.getElementById("finalMeta");
  const retryBtn = document.getElementById("retryBtn");
  const protoToggleBtn = document.getElementById("protoToggleBtn");
  const soundToggleBtn = document.getElementById("soundToggleBtn");
  const tuningToggleBtn = document.getElementById("tuningToggleBtn");
  const tuningPanel = document.getElementById("tuningPanel");
  const resetParamsBtn = document.getElementById("resetParamsBtn");

  // パラメータ調整スライダー
  const sliders = {
    speed: { input: document.getElementById("speedRange"), out: document.getElementById("speedOut") },
    transfer: { input: document.getElementById("transferRange"), out: document.getElementById("transferOut") },
    threshold: { input: document.getElementById("thresholdRange"), out: document.getElementById("thresholdOut") },
    danger: { input: document.getElementById("dangerRange"), out: document.getElementById("dangerOut") },
    delay: { input: document.getElementById("delayRange"), out: document.getElementById("delayOut") }
  };

  // サウンドエンジン
  const sound = new window.SoundEngine();

  // ローカルストレージから記録を読み込む
  const STORAGE_KEY_BEST = "puchi_chain_best_v3";
  const STORAGE_KEY_MAX_STAGE = "puchi_chain_max_stage_v3";

  let bestScore = Number(localStorage.getItem(STORAGE_KEY_BEST) || 0);
  let bestStage = Number(localStorage.getItem(STORAGE_KEY_MAX_STAGE) || 1);

  // ゲーム全体の状態
  const params = { ...DEFAULT_PARAMS };
  let protoMode = false;
  let soundUserEnabled = true;

  let gameState = "ready"; // 'ready' | 'playing' | 'stageclear' | 'gameover'
  let stageNum = 1;
  let currentTheme = THEMES[0];
  let currentSheetName = SHEETS[0].name;
  let stageGraceTimer = 0; // 新シート開始直後の見渡し猶予
  let elapsed = 0;
  let score = 0;
  let sessionMaxChain = 0;
  let totalPopped = 0;
  let isNewBest = false;
  let gameOverLockUntil = 0;
  let burstCell = null;
  let transitionTimers = [];

  // 盤面ジオメトリ（ステージの行数・列数に合わせて自動センタリング）
  let boardSize = 480;
  let gridRows = 4;
  let gridCols = 4;
  let cellSize = 100;
  let boardOffsetX = 20;
  let boardOffsetY = 20;

  // 盤面データ（grid[r][c] はセルオブジェクトまたは穴を示す null）
  let grid = [];
  let totalActiveCells = 0;
  let clearedCellCount = 0;

  // 進行中の連鎖・クリアフィナーレ管理
  let nextChainId = 1;
  let pendingPops = []; // { cell, timeLeft, chainId, step, fromCell }
  let activeChains = new Map();
  let finalePops = []; // シートクリア時に残りの泡を一斉に弾けさせるキュー

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
  let hoverCell = null;
  let activePointerId = null;
  let pressedCell = null;
  let pressInside = false;
  let pressDragX = 0;
  let pressDragY = 0;
  let hoverGroupSet = new Set();
  let activeTransferPlan = [];
  let isPressPreview = false;

  // 膨張の塊を生むための緩やかなホットスポット（盤面比率 0〜1 座標で管理）
  const hotspots = [
    { nx: 0.28, ny: 0.28, vx: 0.09, vy: 0.07 },
    { nx: 0.72, ny: 0.7, vx: -0.08, vy: 0.1 }
  ];

  // 予約中のステージ遷移タイマーをすべて解除する
  function clearTransitionTimers() {
    for (const id of transitionTimers) {
      clearTimeout(id);
    }
    transitionTimers = [];
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
    pressedCell = null;
    pressInside = false;
    pressDragX = 0;
    pressDragY = 0;
  }

  // テーマ色をCSS変数へ適用する
  function applyTheme(theme) {
    currentTheme = theme;
    const root = document.documentElement;
    root.style.setProperty("--bg", theme.bg);
    root.style.setProperty("--surface", theme.surface);
    root.style.setProperty("--surface-border", theme.border);
    root.style.setProperty("--theme-accent", theme.accent);
  }

  // 地形マスクを90度単位で回転・反転する（2周目以降のバリエーション用）
  function transformMask(mask, rotationSteps) {
    let rows = mask.map((line) => line.split(""));
    const steps = ((rotationSteps % 4) + 4) % 4;
    for (let s = 0; s < steps; s++) {
      const h = rows.length;
      const w = rows[0].length;
      const next = [];
      for (let c = 0; c < w; c++) {
        const newRow = [];
        for (let r = h - 1; r >= 0; r--) {
          newRow.push(rows[r][c]);
        }
        next.push(newRow);
      }
      rows = next;
    }
    return rows.map((r) => r.join(""));
  }

  // セルオブジェクトを作成する
  function createCell(r, c, initialPressure = 0.08) {
    return {
      r,
      c,
      pressure: initialPressure,
      state: initialPressure >= params.criticalThreshold ? "critical" : "growing",
      cleared: false, // 臨界破裂でシートのこのマスを破ったかどうか
      dangerTimer: 0,
      cooldown: 0,
      growthBias: 0.78 + Math.random() * 0.48,
      chainQueued: false,
      scale: 1,
      scaleVel: 0,
      offsetX: 0,
      offsetY: 0,
      offsetVx: 0,
      offsetVy: 0,
      appearDelay: 0,
      wobblePhase: Math.random() * Math.PI * 2
    };
  }

  // 盤面のサイズとセンタリング余白を再計算する
  function computeBoardGeometry() {
    const pad = Math.round(boardSize * 0.045);
    const usable = boardSize - pad * 2;
    const maxDim = Math.max(gridRows, gridCols);
    cellSize = usable / maxDim;
    boardOffsetX = (boardSize - gridCols * cellSize) * 0.5;
    boardOffsetY = (boardSize - gridRows * cellSize) * 0.5;
  }

  // 指定ステージの地形シートとカラーテーマを読み込む
  function loadStage(nextStageNum, autoStartPlaying, originR = null, originC = null) {
    clearPressState();
    pendingPops = [];
    activeChains.clear();
    finalePops = [];
    beams = [];
    airPuffs = [];
    burstCell = null;
    warningTickCooldown = 0;

    stageNum = nextStageNum;
    if (stageNum > bestStage) {
      bestStage = stageNum;
      localStorage.setItem(STORAGE_KEY_MAX_STAGE, String(bestStage));
    }

    const sheetIndex = (stageNum - 1) % SHEETS.length;
    const loopCount = Math.floor((stageNum - 1) / SHEETS.length);
    const sheetDef = SHEETS[sheetIndex];
    const mask = loopCount > 0 ? transformMask(sheetDef.mask, loopCount) : sheetDef.mask;
    const theme = THEMES[(stageNum - 1) % THEMES.length];

    currentSheetName = sheetDef.name;
    applyTheme(theme);

    gridRows = mask.length;
    gridCols = mask[0].length;
    computeBoardGeometry();

    const centerR = originR !== null ? originR : (gridRows - 1) * 0.5;
    const centerC = originC !== null ? originC : (gridCols - 1) * 0.5;

    grid = [];
    const activeCells = [];
    for (let r = 0; r < gridRows; r++) {
      const row = [];
      for (let c = 0; c < gridCols; c++) {
        if (mask[r][c] === "#") {
          const p = 0.14 + Math.random() * 0.32;
          const cell = createCell(r, c, p);
          if (!protoMode) {
            const dist = Math.hypot(r - centerR, c - centerC);
            cell.appearDelay = dist * 0.04;
            cell.scale = 0.01;
          }
          row.push(cell);
          activeCells.push(cell);
        } else {
          row.push(null);
        }
      }
      grid.push(row);
    }

    totalActiveCells = activeCells.length;
    clearedCellCount = 0;

    // どの地形でも最初の一手が気持ちよく見つかるよう、隣接する臨界塊と橋候補を自動配置する
    seedStarterCluster(activeCells);

    stageGraceTimer = autoStartPlaying ? 1.45 : 0;
    gameState = autoStartPlaying ? "playing" : "ready";
    stageBannerEl.classList.add("hidden");
    gameOverOverlay.classList.add("hidden");

    if (!autoStartPlaying) {
      hintTextEl.classList.remove("hidden-soft");
    } else {
      hintTextEl.classList.add("hidden-soft");
    }

    updateHud(false, stageNum > 1);
  }

  // 有効な地形セルの中から、開始直後に気持ちよい連鎖や押し出しができる初期塊を配置する
  function seedStarterCluster(activeCells) {
    if (activeCells.length === 0) return;

    // 隣接マスが多い中央付近のセルを起点に選ぶ
    const midR = (gridRows - 1) * 0.5;
    const midC = (gridCols - 1) * 0.5;
    const sorted = [...activeCells].sort((a, b) => {
      const da = Math.hypot(a.r - midR, a.c - midC);
      const db = Math.hypot(b.r - midR, b.c - midC);
      return da - db;
    });

    const start = sorted[0];
    const cluster = [start];
    const visited = new Set([start]);

    // 隣接する有効セルを2〜3個集めて臨界塊にする
    for (let i = 0; i < cluster.length && cluster.length < 3; i++) {
      const curr = cluster[i];
      for (const [dr, dc] of DIRS) {
        const nr = curr.r + dr;
        const nc = curr.c + dc;
        const next = getCell(nr, nc);
        if (next && !visited.has(next)) {
          visited.add(next);
          cluster.push(next);
          if (cluster.length >= 3) break;
        }
      }
    }

    for (const cell of cluster) {
      cell.pressure = Math.min(0.84, params.criticalThreshold + 0.11);
      cell.state = "critical";
    }

    // 塊のすぐ隣にある未成熟泡を少し育てておき、押し込みで繋ぎやすくする
    let boosted = 0;
    for (const cell of cluster) {
      for (const [dr, dc] of DIRS) {
        const next = getCell(cell.r + dr, cell.c + dc);
        if (next && !visited.has(next) && boosted < 3) {
          visited.add(next);
          next.pressure = Math.max(0.46, params.criticalThreshold - 0.13);
          next.state = "growing";
          boosted += 1;
        }
      }
    }
  }

  // ゲーム全体をStage 1からやり直す
  function resetGame(originR = null, originC = null) {
    clearTransitionTimers();
    sheetWipeEl.classList.remove("expanding", "fading");
    particles = [];
    rings = [];
    likeBursts = [];
    confetti = [];
    floatTexts = [];
    shakeMag = 0;
    errorShakeTime = 0;
    errorShakeAmp = 0;
    elapsed = 0;
    score = 0;
    sessionMaxChain = 0;
    totalPopped = 0;
    isNewBest = false;

    loadStage(1, false, originR, originC);
  }

  // 安全にセルを取得する（範囲外・穴は null）
  function getCell(r, c) {
    if (r < 0 || r >= gridRows || c < 0 || c >= gridCols) return null;
    return grid[r][c];
  }

  // HUDとシート進捗バーを更新する
  function updateHud(bumpScore = false, bumpStage = false) {
    stageValueEl.textContent = String(stageNum);
    scoreValueEl.textContent = String(score);
    bestValueEl.textContent = String(bestScore);
    sheetNameEl.textContent = `STAGE ${stageNum} · ${currentSheetName}`;
    sheetRemainEl.textContent = `${clearedCellCount} / ${totalActiveCells}`;
    const pct = totalActiveCells > 0 ? Math.min(100, (clearedCellCount / totalActiveCells) * 100) : 0;
    progressFillEl.style.width = `${pct.toFixed(1)}%`;

    if (bumpScore) bumpElement(scoreValueEl);
    if (bumpStage) bumpElement(stageValueEl);
  }

  // サウンドの有効状態（ユーザー設定かつ非プロトタイプモード）を同期する
  function syncSoundEnabled() {
    sound.enabled = soundUserEnabled && !protoMode;
    soundToggleBtn.textContent = soundUserEnabled ? "音 ON" : "音 OFF";
    soundToggleBtn.classList.toggle("active", !soundUserEnabled);
  }

  // キャンバスの解像度をコンテナサイズとDPRに合わせる
  function resizeCanvas() {
    const rect = canvasContainer.getBoundingClientRect();
    const size = Math.max(240, Math.floor(rect.width));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    boardSize = size;
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    computeBoardGeometry();
  }

  // セル中心のキャンバス座標を返す
  function cellCenter(r, c) {
    return {
      x: boardOffsetX + (c + 0.5) * cellSize,
      y: boardOffsetY + (r + 0.5) * cellSize
    };
  }

  // ポインタ座標から該当セルを取得する（穴の上は null）
  function getCellAtPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const c = Math.floor((x - boardOffsetX) / cellSize);
    const r = Math.floor((y - boardOffsetY) / cellSize);
    return getCell(r, c);
  }

  // 指定した臨界／危険セルに繋がっている塊（連結成分）を返す
  function getConnectedCriticalGroup(startCell) {
    const result = new Set();
    if (!startCell) return result;
    if (startCell.state !== "critical" && startCell.state !== "danger") return result;

    const queue = [startCell];
    result.add(startCell);

    while (queue.length > 0) {
      const curr = queue.shift();
      for (const [dr, dc] of DIRS) {
        const next = getCell(curr.r + dr, curr.c + dc);
        if (next && !result.has(next) && (next.state === "critical" || next.state === "danger")) {
          result.add(next);
          queue.push(next);
        }
      }
    }
    return result;
  }

  // 現在のステージと経過に応じたベース膨張速度と自爆猶予時間を計算する
  function getDifficultyMetrics() {
    const stageFactor = Math.min(1, (stageNum - 1) / 10);
    const timeFactor = Math.min(1, elapsed / 120);
    const progress = Math.min(1, stageFactor * 0.72 + timeFactor * 0.28);

    // ベース膨張速度（新シート直後の見渡し猶予中はゆるやかにする）
    const graceScale = stageGraceTimer > 0 ? 0.35 : 1.0;
    const baseGrowth = (0.06 + progress * 0.088) * params.speedScale * graceScale;
    const dangerLimit = Math.max(1.2, params.dangerDuration * (1 - progress * 0.34));

    return { baseGrowth, dangerLimit, progress };
  }

  // 未成熟の泡を潰したときに、周囲のどの泡へどれだけ空気が逃げるかを計算する（穴や空マスには逃げない）
  function computeAirTransferPlan(sourceCell) {
    if (!sourceCell || sourceCell.state !== "growing" || sourceCell.chainQueued) {
      return [];
    }

    const targets = [];
    for (const [dr, dc] of DIRS) {
      const neighbor = getCell(sourceCell.r + dr, sourceCell.c + dc);
      if (neighbor && neighbor.state !== "popped" && !neighbor.chainQueued) {
        targets.push(neighbor);
      }
    }

    if (targets.length === 0) return [];

    // 潰した泡が大きいほど多くの空気が逃げ、穴や壁で逃げ先が少ないほど一点に集中する
    const totalAir = (0.14 + sourceCell.pressure * 0.72) * params.airTransferRate;
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

  // ポインタ押下時の処理（パンパン泡は即時破裂、小さい泡は押し込み開始）
  function handlePointerDownOnCell(cell, pointerId) {
    if (!cell) return;
    sound.unlock();

    if (gameState === "gameover") {
      if (performance.now() >= gameOverLockUntil) {
        resetGame();
      }
      return;
    }

    if (gameState === "stageclear") return;
    if (cell.state === "popped" || cell.chainQueued) return;

    // スタッガー出現中でも押されたら即座に反応させる
    if (cell.appearDelay > 0) {
      cell.appearDelay = 0;
      cell.scale = 1;
    }

    if (cell.state === "critical" || cell.state === "danger") {
      clearPressState();
      if (gameState === "ready") {
        gameState = "playing";
        hintTextEl.classList.add("hidden-soft");
      }
      const chainId = nextChainId++;
      activeChains.set(chainId, { count: 0 });
      cell.chainQueued = true;
      triggerHaptic(14);
      executeChainPop(cell, chainId, 0, null);
    } else if (cell.state === "growing") {
      if (activePointerId !== null) return;
      activePointerId = pointerId;
      pressedCell = cell;
      pressInside = true;
      pressDragX = 0;
      pressDragY = 0;
      cell.scaleVel -= 5.0;
      sound.playPressStart();
      triggerHaptic(8);
      try {
        canvas.setPointerCapture(pointerId);
      } catch (_) {}
    }
  }

  // 押し込んでいた小さい泡を指から離したときに確定させる
  function confirmPressedCell() {
    const cell = pressedCell;
    const shouldExecute =
      Boolean(cell) &&
      pressInside &&
      (gameState === "ready" || gameState === "playing") &&
      cell.state === "growing" &&
      !cell.chainQueued;

    clearPressState();
    if (!shouldExecute) return;

    if (gameState === "ready") {
      gameState = "playing";
      hintTextEl.classList.add("hidden-soft");
    }
    triggerHaptic(12);
    squeezeGrowingCell(cell);
  }

  // 未成熟な泡を押し潰して、中の空気を上下左右の隣接泡へ移動させる処理
  function squeezeGrowingCell(cell) {
    const plan = computeAirTransferPlan(cell);
    const srcPos = cellCenter(cell.r, cell.c);
    const { dangerLimit } = getDifficultyMetrics();

    cell.state = "popped";
    cell.pressure = 0;
    cell.dangerTimer = 0;
    cell.cooldown = 0.88;
    cell.scale = 0.22;
    cell.scaleVel = 0;

    sound.playAirPush(plan.length);

    if (!protoMode) {
      spawnRing(srcPos.x, srcPos.y, cellSize * 0.3, "rgba(180, 200, 225, 0.45)", 1.6);
    }

    let promotedToCritical = false;
    let pushedToDanger = false;

    for (const item of plan) {
      const target = item.target;
      const dstPos = cellCenter(target.r, target.c);

      if (!protoMode) {
        const puffColor =
          item.outcome === "toDanger" || item.outcome === "dangerAccel"
            ? "#ff7a84"
            : item.outcome === "toCritical"
              ? "#ffffff"
              : currentTheme.accent;
        airPuffs.push({
          x1: srcPos.x,
          y1: srcPos.y,
          x2: dstPos.x,
          y2: dstPos.y,
          color: puffColor,
          progress: 0
        });
      }

      target.scaleVel += 6.2;

      if (target.state === "danger") {
        target.dangerTimer += item.share * dangerLimit * 1.65;
        pushedToDanger = true;
        if (target.dangerTimer >= dangerLimit) {
          triggerGameOver(target);
          return;
        }
      } else {
        const prevState = target.state;
        const nextP = target.pressure + item.share;

        if (nextP >= 1.0) {
          const overflow = nextP - 1.0;
          target.pressure = 1.0;
          target.state = "danger";
          target.dangerTimer = Math.min(dangerLimit * 0.55, overflow * dangerLimit * 1.15);
          pushedToDanger = true;
          if (!protoMode) {
            spawnRing(dstPos.x, dstPos.y, cellSize * 0.46, "rgba(255, 77, 90, 0.65)", 2.2);
          }
        } else if (nextP >= params.criticalThreshold) {
          target.pressure = nextP;
          target.state = "critical";
          if (prevState === "growing") {
            promotedToCritical = true;
            if (!protoMode) {
              spawnRing(dstPos.x, dstPos.y, cellSize * 0.44, "rgba(255, 255, 255, 0.5)", 1.8);
              spawnLikeBurst(dstPos.x, dstPos.y, cellSize * 0.46, "#ffffff", 6);
            }
          }
        } else {
          target.pressure = nextP;
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

  // 臨界／危険泡の膜を破って連鎖破裂させる処理
  function executeChainPop(cell, chainId, step, fromCell) {
    if (gameState !== "playing") return;

    const pos = cellCenter(cell.r, cell.c);
    const wasDanger = cell.state === "danger";
    const wasUnclear = !cell.cleared;
    const chainInfo = activeChains.get(chainId) || { count: 0 };
    chainInfo.count += 1;
    activeChains.set(chainId, chainInfo);

    const comboNum = chainInfo.count;
    if (comboNum > sessionMaxChain) {
      sessionMaxChain = comboNum;
    }

    // セルを破裂状態にし、未破マスだった場合はクリア済みへ切り替える
    cell.state = "popped";
    cell.pressure = 0;
    cell.dangerTimer = 0;
    cell.cooldown = 0.85;
    cell.chainQueued = false;
    cell.scale = 0.15;
    cell.scaleVel = 0;

    if (wasUnclear) {
      cell.cleared = true;
      clearedCellCount += 1;
    }

    // 連鎖数＋未破マス初破壊ボーナス＋危険救出ボーナス
    const gained = comboNum + (wasUnclear ? 2 : 0) + (wasDanger ? 5 : 0);
    score += gained;
    totalPopped += 1;
    checkBestScore();
    updateHud(true, false);

    sound.playChainPop(comboNum - 1, wasDanger);
    if (comboNum > 1) {
      triggerHaptic(10);
    }

    if (!protoMode) {
      const hueColor = wasDanger ? "#ff7a84" : wasUnclear ? currentTheme.accent : "#ffffff";
      spawnRing(pos.x, pos.y, cellSize * (0.54 + Math.min(0.28, comboNum * 0.03)), hueColor, wasDanger ? 3.5 : 2.6);
      spawnLikeBurst(pos.x, pos.y, cellSize * (0.5 + Math.min(0.2, comboNum * 0.025)), hueColor, 8);
      spawnParticles(pos.x, pos.y, Math.min(18, 7 + comboNum * 2), hueColor, 150 + comboNum * 16);

      if (comboNum >= 6 && comboNum % 2 === 0) {
        spawnConfetti(pos.x, pos.y, 14, 190);
      }

      if (fromCell) {
        const prevPos = cellCenter(fromCell.r, fromCell.c);
        beams.push({ x1: prevPos.x, y1: prevPos.y, x2: pos.x, y2: pos.y, life: 1 });
      }

      const label = wasDanger ? `+${gained} SAVE` : comboNum >= 3 ? `+${gained} (${comboNum})` : `+${gained}`;
      spawnFloatText(pos.x, pos.y - 6, label, hueColor, Math.min(21, 13 + Math.floor(comboNum / 2)));
      shakeMag = Math.min(9, Math.max(shakeMag, 1.8 + comboNum * 0.55));
    }

    // 全マスを破り終えたら、シートクリア＆全泡一斉破裂フィナーレを発動！
    if (clearedCellCount >= totalActiveCells) {
      triggerStageClear(cell);
      return;
    }

    // 4連鎖以上の節目で盤面の他の危険泡の猶予をわずかに回復
    if (comboNum >= 4 && comboNum % 2 === 0) {
      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          const other = grid[r][c];
          if (other && other.state === "danger" && !other.chainQueued) {
            other.dangerTimer = Math.max(0, other.dangerTimer - 0.3);
          }
        }
      }
    }

    // 上下左右の隣接する臨界／危険泡へ連鎖を伝播させる
    const delaySec = params.chainDelayMs / 1000;
    for (const [dr, dc] of DIRS) {
      const neighbor = getCell(cell.r + dr, cell.c + dc);
      if (!neighbor || neighbor.state === "popped" || neighbor.chainQueued) continue;

      if (neighbor.state === "critical" || neighbor.state === "danger") {
        neighbor.chainQueued = true;
        neighbor.scaleVel += 6.5;
        pendingPops.push({
          cell: neighbor,
          timeLeft: delaySec,
          chainId,
          step: step + 1,
          fromCell: cell
        });
      }
    }
  }

  // シートクリア時の全泡一斉破裂フィナーレと次の地形シートへの丸い切り替え
  function triggerStageClear(lastCell) {
    clearPressState();
    gameState = "stageclear";
    pendingPops = [];
    activeChains.clear();

    const stageBonus = stageNum * 25;
    score += stageBonus;
    checkBestScore();
    updateHud(true, false);

    sound.playStageClear();
    triggerHaptic([15, 30, 25]);

    const originPos = cellCenter(lastCell.r, lastCell.c);

    // 盤面に残っているすべての泡を、最後のマスから波紋のように一斉破裂させる
    finalePops = [];
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const cell = grid[r][c];
        if (cell && cell.state !== "popped") {
          const dist = Math.hypot(r - lastCell.r, c - lastCell.c);
          finalePops.push({
            cell,
            timeLeft: 0.04 + dist * 0.045
          });
        }
      }
    }

    if (!protoMode) {
      spawnConfetti(originPos.x, originPos.y, 28, 250);
      spawnFloatText(originPos.x, originPos.y - 18, `CLEAR +${stageBonus}`, currentTheme.accent, 22);
    }

    // クリアバナーをスプリング表示
    const nextStageNum = stageNum + 1;
    const nextSheet = SHEETS[(nextStageNum - 1) % SHEETS.length];
    const nextTheme = THEMES[(nextStageNum - 1) % THEMES.length];

    stageBannerSubEl.textContent = `STAGE ${stageNum} CLEAR  +${stageBonus}`;
    stageBannerTitleEl.textContent = `NEXT · ${nextSheet.name}`;
    stageBannerEl.classList.remove("hidden");

    if (protoMode) {
      const t1 = setTimeout(() => {
        if (gameState === "stageclear") {
          loadStage(nextStageNum, true);
        }
      }, 480);
      transitionTimers.push(t1);
      return;
    }

    // 丸く広がる切り替えワイプ（Circular Reveal）で次のカラーテーマのシートへ遷移する
    const wx = Math.max(0, Math.min(100, (originPos.x / boardSize) * 100));
    const wy = Math.max(0, Math.min(100, (originPos.y / boardSize) * 100));
    sheetWipeEl.style.setProperty("--wipe-x", `${wx.toFixed(1)}%`);
    sheetWipeEl.style.setProperty("--wipe-y", `${wy.toFixed(1)}%`);
    sheetWipeEl.style.setProperty("--wipe-color", nextTheme.surface);

    const tExpand = setTimeout(() => {
      if (gameState !== "stageclear") return;
      sheetWipeEl.classList.remove("fading");
      sheetWipeEl.classList.add("expanding");
    }, 760);

    const tSwap = setTimeout(() => {
      if (gameState !== "stageclear") return;
      loadStage(nextStageNum, true);
      sheetWipeEl.classList.remove("expanding");
      sheetWipeEl.classList.add("fading");
    }, 1140);

    const tClean = setTimeout(() => {
      sheetWipeEl.classList.remove("fading");
    }, 1420);

    transitionTimers.push(tExpand, tSwap, tClean);
  }

  // ベストスコアの更新チェック
  function checkBestScore() {
    if (score > bestScore) {
      bestScore = score;
      isNewBest = true;
      localStorage.setItem(STORAGE_KEY_BEST, String(bestScore));
    }
  }

  // 自爆によるゲームオーバー処理
  function triggerGameOver(cell) {
    clearTransitionTimers();
    clearPressState();
    gameState = "gameover";
    burstCell = cell;
    pendingPops = [];
    finalePops = [];
    activeChains.clear();
    gameOverLockUntil = performance.now() + 300;
    stageBannerEl.classList.add("hidden");

    sound.playBurst();
    triggerHaptic([30, 30, 50]);

    const pos = cellCenter(cell.r, cell.c);
    const rx = Math.max(0, Math.min(100, (pos.x / boardSize) * 100));
    const ry = Math.max(0, Math.min(100, (pos.y / boardSize) * 100));
    gameOverOverlay.style.setProperty("--reveal-x", `${rx.toFixed(1)}%`);
    gameOverOverlay.style.setProperty("--reveal-y", `${ry.toFixed(1)}%`);

    if (!protoMode) {
      spawnRing(pos.x, pos.y, cellSize * 1.4, "#ff4d5a", 5);
      spawnLikeBurst(pos.x, pos.y, cellSize * 0.95, "#ff4d5a", 10);
      spawnParticles(pos.x, pos.y, 28, "#ff4d5a", 240);
      triggerErrorShake(13);
    }

    finalScoreEl.textContent = String(score);
    finalMetaEl.textContent = isNewBest
      ? `STAGE ${stageNum}  /  MAX CHAIN ${sessionMaxChain}  /  NEW BEST`
      : `STAGE ${stageNum}  /  MAX CHAIN ${sessionMaxChain}  /  BEST ${bestScore}`;

    const tOverlay = setTimeout(() => {
      if (gameState === "gameover") {
        gameOverOverlay.classList.remove("hidden");
        if (isNewBest && !protoMode) {
          spawnConfetti(boardSize * 0.5, boardSize * 0.42, 38, 280);
        }
      }
    }, 190);
    transitionTimers.push(tOverlay);
  }

  // 「いいねのはじけ」風の放射スパーク＆ドット生成ヘルパー
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

  // 祝福のコンフェッティ（紙吹雪）生成ヘルパー
  function spawnConfetti(x, y, count, speed) {
    const palette = ["#ffffff", currentTheme.accent, "#ffd166", "#ff6b81", "#a3f7bf", "#c4b5fd"];
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.7;
      const spd = speed * (0.45 + Math.random() * 0.85);
      confetti.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 45,
        w: 5 + Math.random() * 4,
        h: 3 + Math.random() * 2.5,
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

  // パーティクル生成ヘルパー
  function spawnParticles(x, y, count, color, speed) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45;
      const spd = speed * (0.45 + Math.random() * 0.75);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        radius: 2 + Math.random() * 2.8,
        color,
        life: 1,
        decay: 2.2 + Math.random() * 1.2
      });
    }
  }

  // 拡散リング生成ヘルパー
  function spawnRing(x, y, maxRadius, color, lineWidth) {
    rings.push({
      x,
      y,
      radius: cellSize * 0.16,
      maxRadius,
      color,
      lineWidth,
      life: 1
    });
  }

  // スコア・連鎖のポップアップ文字生成ヘルパー
  function spawnFloatText(x, y, text, color, size) {
    floatTexts.push({
      x,
      y,
      vy: -42,
      text,
      color,
      size,
      life: 1
    });
  }

  // 押し込み中またはホバー中の予測状態を最新化する
  function refreshPreview() {
    if (gameState === "gameover" || gameState === "stageclear") {
      hoverGroupSet.clear();
      activeTransferPlan = [];
      isPressPreview = false;
      return;
    }

    if (pressedCell) {
      hoverGroupSet.clear();
      if (pressInside && pressedCell.state === "growing" && !pressedCell.chainQueued) {
        activeTransferPlan = computeAirTransferPlan(pressedCell);
        isPressPreview = true;
      } else {
        activeTransferPlan = [];
        isPressPreview = false;
      }
      return;
    }

    isPressPreview = false;
    if (!hoverCell) {
      hoverGroupSet.clear();
      activeTransferPlan = [];
      return;
    }
    if (hoverCell.state === "critical" || hoverCell.state === "danger") {
      hoverGroupSet = getConnectedCriticalGroup(hoverCell);
      activeTransferPlan = [];
    } else if (hoverCell.state === "growing") {
      hoverGroupSet.clear();
      activeTransferPlan = computeAirTransferPlan(hoverCell);
    } else {
      hoverGroupSet.clear();
      activeTransferPlan = [];
    }
  }

  // フレームごとの状態更新
  function update(dt) {
    if (pressedCell && (pressedCell.state !== "growing" || pressedCell.chainQueued)) {
      clearPressState();
    }

    // バネ物理（スタッガー出現・押し込み凹み・ラバーバンド）
    const rubberLimit = cellSize * 0.65;
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const cell = grid[r][c];
        if (!cell) continue;

        if (cell.appearDelay > 0) {
          cell.appearDelay -= dt;
          if (cell.appearDelay <= 0) {
            cell.appearDelay = 0;
            cell.scale = 0.05;
            cell.scaleVel = 13.5;
          }
          continue;
        }

        const isActivelyPressed = pressedCell === cell && pressInside;
        const targetScale = cell.state === "popped" ? 0.18 : isActivelyPressed ? 0.62 : 1;
        const stiffness = isActivelyPressed ? 240 : 185;
        const damping = 13.5;
        const force = (targetScale - cell.scale) * stiffness;
        cell.scaleVel += force * dt;
        cell.scaleVel *= Math.max(0, 1 - damping * dt);
        cell.scale += cell.scaleVel * dt;

        let targetOx = 0;
        let targetOy = 0;
        if (isActivelyPressed && !protoMode) {
          targetOx = (pressDragX * 0.45) / (1 + Math.abs(pressDragX) / rubberLimit);
          targetOy = (pressDragY * 0.45) / (1 + Math.abs(pressDragY) / rubberLimit);
        }
        const oStiff = isActivelyPressed ? 260 : 320;
        const oDamp = isActivelyPressed ? 20 : 11.5;
        cell.offsetVx += (targetOx - cell.offsetX) * oStiff * dt;
        cell.offsetVy += (targetOy - cell.offsetY) * oStiff * dt;
        cell.offsetVx *= Math.max(0, 1 - oDamp * dt);
        cell.offsetVy *= Math.max(0, 1 - oDamp * dt);
        cell.offsetX += cell.offsetVx * dt;
        cell.offsetY += cell.offsetVy * dt;

        cell.wobblePhase += dt * (cell.state === "danger" ? 26 : 11);
      }
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
      rg.radius = cellSize * 0.16 + (rg.maxRadius - cellSize * 0.16) * (1 - Math.pow(1 - t, 3));
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

    // シートクリア中：残りの泡を波紋のように一斉破裂させるフィナーレ処理
    if (gameState === "stageclear") {
      for (let i = finalePops.length - 1; i >= 0; i--) {
        const item = finalePops[i];
        item.timeLeft -= dt;
        if (item.timeLeft <= 0) {
          finalePops.splice(i, 1);
          const cell = item.cell;
          if (cell.state !== "popped") {
            const pos = cellCenter(cell.r, cell.c);
            cell.state = "popped";
            cell.pressure = 0;
            cell.scale = 0.15;
            if (!protoMode) {
              spawnRing(pos.x, pos.y, cellSize * 0.56, currentTheme.accent, 2.4);
              spawnLikeBurst(pos.x, pos.y, cellSize * 0.5, "#ffffff", 6);
              spawnParticles(pos.x, pos.y, 8, currentTheme.accent, 140);
            }
          }
        }
      }
      refreshPreview();
      return;
    }

    if (gameState !== "playing") {
      refreshPreview();
      return;
    }

    elapsed += dt;
    if (stageGraceTimer > 0) {
      stageGraceTimer = Math.max(0, stageGraceTimer - dt);
    }

    const { baseGrowth, dangerLimit } = getDifficultyMetrics();

    // ホットスポットを盤面比率内で緩やかに回遊させる
    for (const hs of hotspots) {
      hs.nx += hs.vx * dt;
      hs.ny += hs.vy * dt;
      if (hs.nx < 0.12 || hs.nx > 0.88) hs.vx *= -1;
      if (hs.ny < 0.12 || hs.ny > 0.88) hs.vy *= -1;
    }

    // 予約済みの連鎖ポップを進める
    for (let i = pendingPops.length - 1; i >= 0; i--) {
      const item = pendingPops[i];
      item.timeLeft -= dt;
      if (item.timeLeft <= 0) {
        pendingPops.splice(i, 1);
        executeChainPop(item.cell, item.chainId, item.step, item.fromCell);
        if (gameState !== "playing") return;
      }
    }

    if (pendingPops.length === 0 && activeChains.size > 0) {
      activeChains.clear();
    }

    // 全有効セルの膨張・冷却・自爆タイマーを更新する
    let maxUrgency = 0;

    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const cell = grid[r][c];
        if (!cell) continue;

        if (cell.state === "popped") {
          cell.cooldown -= dt;
          if (cell.cooldown <= 0) {
            cell.state = "growing";
            cell.pressure = 0.06;
            cell.growthBias = 0.78 + Math.random() * 0.48;
            cell.scale = 0.25;
            cell.scaleVel = 5.5;
          }
          continue;
        }

        if (cell.chainQueued || (pressedCell === cell && pressInside)) continue;

        const normC = gridCols > 1 ? c / (gridCols - 1) : 0.5;
        const normR = gridRows > 1 ? r / (gridRows - 1) : 0.5;
        let spotBoost = 0.78;
        for (const hs of hotspots) {
          const dist = Math.hypot(normC - hs.nx, normR - hs.ny);
          if (dist < 0.45) {
            spotBoost = Math.max(spotBoost, 0.78 + (1 - dist / 0.45) * 0.72);
          }
        }

        // クリア済みマスは少しだけ落ち着かせて未破マス攻略と空気供給に集中しやすくする
        const clearedScale = cell.cleared ? 0.76 : 1.0;

        if (cell.state === "growing" || cell.state === "critical") {
          const prevState = cell.state;
          cell.pressure += baseGrowth * cell.growthBias * spotBoost * clearedScale * dt;

          if (cell.pressure >= 1.0) {
            cell.pressure = 1.0;
            cell.state = "danger";
            cell.dangerTimer = 0;
            cell.scaleVel += 4.0;
          } else if (cell.pressure >= params.criticalThreshold) {
            cell.state = "critical";
            if (prevState === "growing") {
              cell.scaleVel += 3.2;
            }
          }
        } else if (cell.state === "danger") {
          cell.dangerTimer += dt;
          const urgency = Math.min(1, cell.dangerTimer / dangerLimit);
          if (urgency > maxUrgency) maxUrgency = urgency;

          if (cell.dangerTimer >= dangerLimit) {
            triggerGameOver(cell);
            return;
          }
        }
      }
    }

    if (maxUrgency > 0) {
      warningTickCooldown -= dt;
      if (warningTickCooldown <= 0) {
        sound.playWarningTick(maxUrgency);
        warningTickCooldown = Math.max(0.2, 0.62 - maxUrgency * 0.4);
      }
    } else {
      warningTickCooldown = 0;
    }

    refreshPreview();
  }

  // 盤面と泡を描画する
  function draw() {
    ctx.clearRect(0, 0, boardSize, boardSize);
    const { dangerLimit } = getDifficultyMetrics();

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

    // 1. 地形シートの土台（穴は描画せず、未破マス＝テーマ色／クリア済みマス＝暗く抜ける）
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const cell = grid[r][c];
        if (!cell) continue;

        const x = boardOffsetX + c * cellSize;
        const y = boardOffsetY + r * cellSize;
        const inset = cellSize * 0.075;
        const w = cellSize - inset * 2;
        const isPressedHere = pressedCell === cell && pressInside && gameState !== "gameover";
        const isHovered = !pressedCell && hoverCell === cell && gameState !== "gameover";

        if (protoMode) {
          ctx.fillStyle = cell.cleared
            ? "#dcdcdc"
            : isPressedHere ? "#a8a8a8" : isHovered ? "#b8b8b8" : "#c4c4c4";
          ctx.strokeStyle = isPressedHere ? "#222222" : cell.cleared ? "#c4c4c4" : "#888888";
          ctx.lineWidth = isPressedHere ? 2 : 1;
          ctx.fillRect(x + inset, y + inset, w, w);
          ctx.strokeRect(x + inset, y + inset, w, w);
        } else {
          const radius = Math.max(8, Math.round(cellSize * 0.14));
          if (!cell.cleared) {
            // 未破マス：シートのテーマ色で彩られたツヤのあるターゲットパネル
            ctx.fillStyle = currentTheme.tileFill;
            ctx.strokeStyle = isPressedHere ? "#ffffff" : currentTheme.tileStroke;
            ctx.lineWidth = isPressedHere ? 2.2 : isHovered ? 2 : 1.5;
            roundRect(ctx, x + inset, y + inset, w, w, radius);
            ctx.fill();
            ctx.stroke();

            // 未破マスの四隅に小さなアクセント光沢を入れてクリア済みと一目で区別する
            ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
            roundRect(ctx, x + inset + 3, y + inset + 3, w - 6, (w - 6) * 0.36, Math.max(4, radius - 3));
            ctx.fill();
          } else {
            // クリア済みマス：破れて抜けた落ち着いた土台
            ctx.fillStyle = isPressedHere ? "#263042" : isHovered ? "#1f2634" : currentTheme.clearedFill;
            ctx.strokeStyle = isPressedHere ? currentTheme.accent : currentTheme.clearedStroke;
            ctx.lineWidth = isPressedHere ? 1.8 : 1;
            roundRect(ctx, x + inset, y + inset, w, w, radius);
            ctx.fill();
            ctx.stroke();
          }
        }
      }
    }

    // 2. 隣接する臨界／危険泡同士を繋ぐライン
    ctx.lineCap = "round";
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const cell = grid[r][c];
        if (!cell || cell.appearDelay > 0) continue;
        if (cell.state !== "critical" && cell.state !== "danger") continue;
        const p1 = cellCenter(r, c);

        const neighbors = [
          [r, c + 1],
          [r + 1, c]
        ];
        for (const [nr, nc] of neighbors) {
          const other = getCell(nr, nc);
          if (!other || other.appearDelay > 0) continue;
          if (other.state !== "critical" && other.state !== "danger") continue;

          const p2 = cellCenter(nr, nc);
          const inHoverGroup = hoverGroupSet.has(cell) && hoverGroupSet.has(other);

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);

          if (protoMode) {
            ctx.strokeStyle = inHoverGroup ? "#222222" : "#888888";
            ctx.lineWidth = inHoverGroup ? 3 : 1.5;
          } else {
            ctx.strokeStyle = inHoverGroup
              ? "rgba(255, 255, 255, 0.8)"
              : "rgba(255, 255, 255, 0.28)";
            ctx.lineWidth = inHoverGroup ? 4.5 : 2.6;
          }
          ctx.stroke();
        }
      }
    }

    // 3. 小さい泡の押し込み中またはホバー時：空気の逃げ先ガイド矢印
    const transferSource = isPressPreview ? pressedCell : hoverCell;
    if (transferSource && activeTransferPlan.length > 0 && gameState !== "gameover" && gameState !== "stageclear") {
      const fromPos = cellCenter(transferSource.r, transferSource.c);
      for (const item of activeTransferPlan) {
        const toPos = cellCenter(item.target.r, item.target.c);
        const isDangerOut = item.outcome === "toDanger" || item.outcome === "dangerAccel";
        const isPromoOut = item.outcome === "toCritical";

        const color = protoMode
          ? isDangerOut ? "#111111" : isPressPreview ? "#333333" : "#555555"
          : isDangerOut
            ? isPressPreview ? "rgba(255, 92, 106, 0.98)" : "rgba(255, 92, 106, 0.85)"
            : isPromoOut
              ? isPressPreview ? "rgba(255, 255, 255, 0.96)" : "rgba(255, 255, 255, 0.8)"
              : isPressPreview ? "rgba(200, 224, 255, 0.82)" : "rgba(180, 205, 235, 0.5)";

        const arrowWidth = isPressPreview
          ? isDangerOut || isPromoOut ? 3.2 : 2.4
          : isDangerOut || isPromoOut ? 2.2 : 1.5;

        drawAirArrow(fromPos.x, fromPos.y, toPos.x, toPos.y, color, arrowWidth, isPressPreview ? 7 : 5.5);
      }
    }

    // 4. 連鎖伝播の閃光ラインと、移動中の空気の玉
    if (!protoMode) {
      for (const b of beams) {
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        ctx.lineTo(b.x2, b.y2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${b.life * 0.9})`;
        ctx.lineWidth = 4 * b.life;
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
        ctx.arc(px, py, cellSize * 0.08 * (1 - t * 0.3), 0, Math.PI * 2);
        ctx.fillStyle = puff.color;
        ctx.fill();
        ctx.restore();
      }
    }

    // 5. 各セルの泡を描画する
    const maxBubbleRadius = cellSize * 0.36;
    const minBubbleRadius = cellSize * 0.11;

    const transferTargetMap = new Map();
    for (const item of activeTransferPlan) {
      transferTargetMap.set(item.target, item);
    }

    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const cell = grid[r][c];
        if (!cell || cell.appearDelay > 0) continue;
        const pos = cellCenter(r, c);

        if (cell.state === "popped") {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, cellSize * 0.075, 0, Math.PI * 2);
          ctx.fillStyle = protoMode ? "#b5b5b5" : "rgba(255, 255, 255, 0.07)";
          ctx.fill();
          continue;
        }

        const isPressedHere = pressedCell === cell && pressInside && gameState !== "gameover";
        const transferPreview = transferTargetMap.get(cell);

        const normP = Math.min(1, Math.max(0, cell.pressure));
        let radius = minBubbleRadius + (maxBubbleRadius - minBubbleRadius) * Math.pow(normP, 0.85);
        radius *= Math.max(0.2, cell.scale);
        if (isPressPreview && transferPreview) {
          radius *= 1.07;
        }

        let jitterX = 0;
        let jitterY = 0;
        if (cell.state === "critical" && !protoMode) {
          const amp = 0.85;
          jitterX = Math.sin(cell.wobblePhase) * amp;
          jitterY = Math.cos(cell.wobblePhase * 1.3) * amp;
        } else if (cell.state === "danger") {
          const urgency = Math.min(1, cell.dangerTimer / dangerLimit);
          const amp = protoMode ? 1.2 : 1.5 + urgency * 2.4;
          jitterX = Math.sin(cell.wobblePhase * 1.7) * amp;
          jitterY = Math.cos(cell.wobblePhase * 2.1) * amp;
        } else if (isPressPreview && transferPreview && !protoMode && transferPreview.outcome !== "grow") {
          jitterX = Math.sin(cell.wobblePhase * 2.2) * 1.1;
          jitterY = Math.cos(cell.wobblePhase * 2.5) * 1.1;
        }

        const cx = pos.x + jitterX + cell.offsetX;
        const cy = pos.y + jitterY + cell.offsetY;
        const inHoverGroup = hoverGroupSet.has(cell);

        if (protoMode) {
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          if (cell.state === "growing") {
            ctx.fillStyle = isPressedHere ? "#606060" : "#8e8e8e";
            ctx.fill();
          } else if (cell.state === "critical") {
            ctx.fillStyle = inHoverGroup ? "#2e2e2e" : "#4f4f4f";
            ctx.fill();
          } else if (cell.state === "danger") {
            ctx.fillStyle = "#161616";
            ctx.fill();
            const remain = Math.max(0, 1 - cell.dangerTimer / dangerLimit);
            ctx.beginPath();
            ctx.arc(cx, cy, radius + 3 + remain * (cellSize * 0.14), 0, Math.PI * 2);
            ctx.strokeStyle = "#111111";
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        } else if (cell.state === "growing") {
          const ratio = normP / params.criticalThreshold;
          const sat = cell.cleared ? 16 : 34;
          const lightness = Math.round((isPressedHere ? 30 : cell.cleared ? 34 : 42) + ratio * 18);
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fillStyle = `hsl(${currentTheme.bubbleHue}, ${sat}%, ${lightness}%)`;
          ctx.fill();

          if (isPressedHere) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(10, 14, 22, 0.35)";
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
            ctx.lineWidth = 2;
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.arc(cx - radius * 0.28, cy - radius * 0.28, radius * 0.24, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
            ctx.fill();
          }
        } else if (cell.state === "critical") {
          ctx.save();
          if (inHoverGroup) {
            ctx.shadowColor = "rgba(255, 255, 255, 0.5)";
            ctx.shadowBlur = 14;
          }
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fillStyle = inHoverGroup ? "#ffffff" : "#eef4fc";
          ctx.fill();
          ctx.restore();

          ctx.beginPath();
          ctx.arc(cx - radius * 0.27, cy - radius * 0.27, radius * 0.26, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
          ctx.fill();

          ctx.beginPath();
          ctx.arc(cx, cy, radius + 2.5, 0, Math.PI * 2);
          ctx.strokeStyle = inHoverGroup
            ? "#ffffff"
            : cell.cleared ? "rgba(255, 255, 255, 0.36)" : currentTheme.accent;
          ctx.lineWidth = inHoverGroup ? 2.4 : 1.7;
          ctx.stroke();
        } else if (cell.state === "danger") {
          const urgency = Math.min(1, cell.dangerTimer / dangerLimit);
          const remain = Math.max(0, 1 - urgency);
          const pulse = 0.5 + 0.5 * Math.sin(cell.wobblePhase * 1.4);

          ctx.save();
          ctx.shadowColor = "rgba(255, 77, 90, 0.65)";
          ctx.shadowBlur = 12 + urgency * 10;
          ctx.beginPath();
          ctx.arc(cx, cy, radius * (1 + pulse * 0.04), 0, Math.PI * 2);
          ctx.fillStyle = burstCell === cell ? "#ffffff" : "#ff4d5a";
          ctx.fill();
          ctx.restore();

          ctx.beginPath();
          ctx.arc(cx - radius * 0.26, cy - radius * 0.26, radius * 0.24, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 230, 232, 0.6)";
          ctx.fill();

          ctx.beginPath();
          ctx.arc(
            cx,
            cy,
            radius + 4.5,
            -Math.PI / 2,
            -Math.PI / 2 + Math.PI * 2 * remain
          );
          ctx.strokeStyle = "#ff8f98";
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // 空気押し出し先の状態変化プレビュー
        if (transferPreview) {
          ctx.save();
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(radius + 5, cellSize * 0.34), 0, Math.PI * 2);

          if (transferPreview.willBurst) {
            ctx.strokeStyle = protoMode ? "#000000" : "#ff3b4a";
            ctx.lineWidth = isPressPreview ? 3.8 : 3;
            ctx.setLineDash([]);
          } else if (transferPreview.outcome === "toDanger" || transferPreview.outcome === "dangerAccel") {
            ctx.strokeStyle = protoMode ? "#222222" : "rgba(255, 92, 106, 0.95)";
            ctx.lineWidth = isPressPreview ? 3 : 2.2;
          } else if (transferPreview.outcome === "toCritical") {
            ctx.strokeStyle = protoMode ? "#333333" : "rgba(255, 255, 255, 0.95)";
            ctx.lineWidth = isPressPreview ? 3 : 2.2;
          } else {
            ctx.strokeStyle = protoMode
              ? "#666666"
              : isPressPreview ? "rgba(185, 212, 245, 0.72)" : "rgba(170, 195, 225, 0.45)";
            ctx.lineWidth = isPressPreview ? 2 : 1.4;
          }
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // 6. 拡散リング・いいねのはじけ・パーティクル・紙吹雪・ポップアップ文字（通常モード時のみ）
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
        ctx.lineWidth = 2.2 * lb.life;
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
          ctx.arc(
            lb.x + Math.cos(dotAngle) * dotR,
            lb.y + Math.sin(dotAngle) * dotR,
            2.4 * lb.life,
            0,
            Math.PI * 2
          );
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

    const sx = x1 + ux * (dist * 0.3);
    const sy = y1 + uy * (dist * 0.3);
    const ex = x1 + ux * (dist * 0.64);
    const ey = y1 + uy * (dist * 0.64);

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

  // 角丸四角形のパスを描くヘルパー
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // メインループ
  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // イベント登録：スマホの押し込み＆スライドキャンセルとPCホバーの両立
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const cell = getCellAtPoint(e.clientX, e.clientY);
    hoverCell = e.pointerType === "mouse" ? cell : null;
    handlePointerDownOnCell(cell, e.pointerId);
    refreshPreview();
  });

  canvas.addEventListener("pointermove", (e) => {
    const cell = getCellAtPoint(e.clientX, e.clientY);

    if (activePointerId === e.pointerId && pressedCell) {
      const rect = canvas.getBoundingClientRect();
      const center = cellCenter(pressedCell.r, pressedCell.c);
      pressDragX = (e.clientX - rect.left) - center.x;
      pressDragY = (e.clientY - rect.top) - center.y;

      const nowInside = cell === pressedCell;
      if (nowInside !== pressInside) {
        pressInside = nowInside;
        if (!nowInside) {
          pressedCell.scaleVel += 4.5;
          sound.playPressCancel();
        } else {
          pressedCell.scaleVel -= 4.0;
          sound.playPressStart();
        }
      }
      refreshPreview();
      return;
    }

    if (e.pointerType === "mouse") {
      hoverCell = cell;
      refreshPreview();
    }
  });

  canvas.addEventListener("pointerup", (e) => {
    if (activePointerId !== e.pointerId) return;
    e.preventDefault();
    const cell = getCellAtPoint(e.clientX, e.clientY);
    pressInside = cell === pressedCell;
    confirmPressedCell();
    hoverCell = e.pointerType === "mouse" ? cell : null;
    refreshPreview();
  });

  canvas.addEventListener("pointercancel", (e) => {
    if (activePointerId !== e.pointerId) return;
    if (pressedCell && pressInside) {
      pressedCell.scaleVel += 4.0;
    }
    clearPressState();
    hoverCell = null;
    refreshPreview();
  });

  canvas.addEventListener("lostpointercapture", (e) => {
    if (activePointerId !== e.pointerId) return;
    clearPressState();
    refreshPreview();
  });

  canvas.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse" && !pressedCell) {
      hoverCell = null;
      refreshPreview();
    }
  });

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // リザルト画面タップ時：押した位置から丸く閉じて波紋スタッガーでStage 1を再開する
  function retryFromClientPoint(clientX, clientY) {
    if (gameState !== "gameover" || performance.now() < gameOverLockUntil) return;
    sound.unlock();
    const rect = canvas.getBoundingClientRect();
    const hasPoint = Number.isFinite(clientX) && Number.isFinite(clientY) && (clientX !== 0 || clientY !== 0);
    const x = hasPoint ? clientX - rect.left : boardSize * 0.5;
    const y = hasPoint ? clientY - rect.top : boardSize * 0.5;
    const rx = Math.max(0, Math.min(100, (x / boardSize) * 100));
    const ry = Math.max(0, Math.min(100, (y / boardSize) * 100));
    gameOverOverlay.style.setProperty("--reveal-x", `${rx.toFixed(1)}%`);
    gameOverOverlay.style.setProperty("--reveal-y", `${ry.toFixed(1)}%`);
    const originC = Math.max(0, Math.min(3, (x - boardOffsetX) / cellSize - 0.5));
    const originR = Math.max(0, Math.min(3, (y - boardOffsetY) / cellSize - 0.5));
    resetGame(originR, originC);
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
    sliders.speed.input.value = String(params.speedScale);
    sliders.speed.out.textContent = `${params.speedScale.toFixed(2)}x`;

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

  sliders.speed.input.addEventListener("input", () => {
    params.speedScale = Number(sliders.speed.input.value);
    syncSlidersUI();
  });

  sliders.transfer.input.addEventListener("input", () => {
    params.airTransferRate = Number(sliders.transfer.input.value);
    syncSlidersUI();
  });

  sliders.threshold.input.addEventListener("input", () => {
    params.criticalThreshold = Number(sliders.threshold.input.value) / 100;
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const cell = grid[r][c];
        if (!cell) continue;
        if (cell.state === "growing" && cell.pressure >= params.criticalThreshold) {
          cell.state = "critical";
        } else if (cell.state === "critical" && cell.pressure < params.criticalThreshold) {
          cell.state = "growing";
        }
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
