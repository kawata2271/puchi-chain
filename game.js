(() => {
  "use strict";

  // 盤面サイズ（6×6のプチプチグリッド）
  const GRID_SIZE = 6;
  const DIRS = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
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
  const scoreValueEl = document.getElementById("scoreValue");
  const bestValueEl = document.getElementById("bestValue");
  const maxChainValueEl = document.getElementById("maxChainValue");
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
  const STORAGE_KEY_BEST = "puchi_chain_best_v2";
  const STORAGE_KEY_MAX_CHAIN = "puchi_chain_max_chain_v2";

  let bestScore = Number(localStorage.getItem(STORAGE_KEY_BEST) || 0);
  let bestMaxChain = Number(localStorage.getItem(STORAGE_KEY_MAX_CHAIN) || 0);

  // ゲーム全体の状態
  const params = { ...DEFAULT_PARAMS };
  let protoMode = false; // 灰色プロトタイプモード（演出OFF）
  let soundUserEnabled = true;

  let gameState = "ready"; // 'ready' | 'playing' | 'gameover'
  let elapsed = 0;
  let score = 0;
  let sessionMaxChain = 0;
  let totalPopped = 0;
  let isNewBest = false;
  let gameOverLockUntil = 0;
  let burstCell = null;

  // キャンバス描画サイズ
  let boardSize = 480;
  let cellSize = 80;
  let pad = 16;

  // 盤面データ（6×6のセル配列）
  let grid = [];

  // 進行中の連鎖イベント管理
  let nextChainId = 1;
  let pendingPops = []; // { cell, timeLeft, chainId, step, fromCell }
  let activeChains = new Map(); // chainId -> { count }

  // 視覚エフェクト（通常モード時のみ表示）
  let particles = [];
  let rings = [];
  let beams = [];
  let airPuffs = [];    // 小さい泡から隣へ移動する空気の玉
  let likeBursts = [];  // 「いいねのはじけ」風の放射スパーク＆ドット
  let confetti = [];    // 大連鎖や自己ベスト更新を祝う紙吹雪
  let floatTexts = [];
  let shakeMag = 0;
  let errorShakeTime = 0; // エラー・押し込みすぎ時の水平シェイク経過時間
  let errorShakeAmp = 0;  // 水平シェイクの振幅
  let warningTickCooldown = 0;

  // マウスホバーおよびスマホの押し込み操作状態
  let hoverCell = null;
  let activePointerId = null;
  let pressedCell = null;
  let pressInside = false;
  let pressDragX = 0; // 押し込み中の指とセル中心のX方向ズレ（ラバーバンド用）
  let pressDragY = 0; // 押し込み中の指とセル中心のY方向ズレ（ラバーバンド用）
  let hoverGroupSet = new Set();
  let activeTransferPlan = [];
  let isPressPreview = false;

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

  // 膨張の塊を生むための緩やかなホットスポット
  const hotspots = [
    { x: 1.5, y: 1.5, vx: 0.42, vy: 0.31 },
    { x: 4.2, y: 4.0, vx: -0.35, vy: 0.47 }
  ];

  // セルオブジェクトを作成する
  function createCell(r, c, initialPressure = 0.08) {
    return {
      r,
      c,
      pressure: initialPressure,
      state: initialPressure >= params.criticalThreshold ? "critical" : "growing",
      dangerTimer: 0,
      cooldown: 0,
      growthBias: 0.78 + Math.random() * 0.48,
      chainQueued: false,
      // バネ物理（サイズとラバーバンド用の2Dオフセット）
      scale: 1,
      scaleVel: 0,
      offsetX: 0,
      offsetY: 0,
      offsetVx: 0,
      offsetVy: 0,
      // スタッガー出現用の遅延時間（秒）
      appearDelay: 0,
      wobblePhase: Math.random() * Math.PI * 2
    };
  }

  // 盤面を初期化する（スタッガー出現で波紋のように揃う）
  function resetBoard(originR = 2.5, originC = 2.5) {
    clearPressState();
    grid = [];
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
    burstCell = null;
    warningTickCooldown = 0;
    elapsed = 0;
    score = 0;
    sessionMaxChain = 0;
    totalPopped = 0;
    isNewBest = false;
    gameState = "ready";

    for (let r = 0; r < GRID_SIZE; r++) {
      const row = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        const p = 0.12 + Math.random() * 0.34;
        const cell = createCell(r, c, p);
        if (!protoMode) {
          // 起点からの距離に応じて少しずつ時間をずらしてスプリング出現させる（スタッガー）
          const dist = Math.hypot(r - originR, c - originC);
          cell.appearDelay = dist * 0.042;
          cell.scale = 0.01;
          cell.scaleVel = 0;
        }
        row.push(cell);
      }
      grid.push(row);
    }

    // 中央に「あと1個繋げれば5連鎖になる」臨界の塊と、空気を送り込める小さい泡を配置する
    const criticalCoords = [
      [2, 1],
      [2, 2],
      [2, 4],
      [3, 4]
    ];
    for (const [r, c] of criticalCoords) {
      const cell = grid[r][c];
      cell.pressure = Math.min(0.86, params.criticalThreshold + 0.12);
      cell.state = "critical";
    }

    // 間の橋になる泡（あと少し空気が入れば臨界に届く）
    const bridgeCell = grid[2][3];
    bridgeCell.pressure = Math.max(0.5, params.criticalThreshold - 0.11);
    bridgeCell.state = "growing";

    // 真下の押し出し用泡（これを潰すと上の橋へ空気が逃げて5連鎖が繋がる）
    const feederCell = grid[3][3];
    feederCell.pressure = Math.max(0.46, params.criticalThreshold - 0.15);
    feederCell.state = "growing";

    gameOverOverlay.classList.add("hidden");
    hintTextEl.classList.remove("hidden-soft");
    updateHud(false, false);
  }

  // HUDの数値を反映し、増加時はスプリング弾みを鳴らす
  function updateHud(bumpScore = false, bumpChain = false) {
    scoreValueEl.textContent = String(score);
    bestValueEl.textContent = String(bestScore);
    maxChainValueEl.textContent = String(Math.max(sessionMaxChain, bestMaxChain));
    if (bumpScore) bumpElement(scoreValueEl);
    if (bumpChain) bumpElement(maxChainValueEl);
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

    pad = Math.round(size * 0.038);
    cellSize = (boardSize - pad * 2) / GRID_SIZE;
  }

  // セル中心のキャンバス座標を返す
  function cellCenter(r, c) {
    return {
      x: pad + (c + 0.5) * cellSize,
      y: pad + (r + 0.5) * cellSize
    };
  }

  // ポインタ座標から該当セルを取得する
  function getCellAtPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const c = Math.floor((x - pad) / cellSize);
    const r = Math.floor((y - pad) / cellSize);
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return null;
    return grid[r][c];
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
        const nr = curr.r + dr;
        const nc = curr.c + dc;
        if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
        const next = grid[nr][nc];
        if (!result.has(next) && (next.state === "critical" || next.state === "danger")) {
          result.add(next);
          queue.push(next);
        }
      }
    }
    return result;
  }

  // 現在の難易度に応じたベース膨張速度と自爆猶予時間を計算する
  function getDifficultyMetrics() {
    const timeFactor = Math.min(1, elapsed / 80);
    const popFactor = Math.min(1, totalPopped / 180);
    const progress = Math.min(1, timeFactor * 0.65 + popFactor * 0.35);

    // ベース膨張速度（1秒あたりの圧力増加量）
    const baseGrowth = (0.062 + progress * 0.085) * params.speedScale;
    // 自爆猶予時間は難易度上昇とともに緩やかに短くなる
    const dangerLimit = Math.max(1.15, params.dangerDuration * (1 - progress * 0.35));

    return { baseGrowth, dangerLimit, progress };
  }

  // 未成熟の泡を潰したときに、周囲のどの泡へどれだけ空気が逃げるかを計算する
  function computeAirTransferPlan(sourceCell) {
    if (!sourceCell || sourceCell.state !== "growing" || sourceCell.chainQueued) {
      return [];
    }

    const targets = [];
    for (const [dr, dc] of DIRS) {
      const nr = sourceCell.r + dr;
      const nc = sourceCell.c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      const neighbor = grid[nr][nc];
      // すでに潰れて窪んでいるマスや連鎖予約済みのマスには空気は逃げない
      if (neighbor.state !== "popped" && !neighbor.chainQueued) {
        targets.push(neighbor);
      }
    }

    if (targets.length === 0) return [];

    // 潰した泡が大きいほど多くの空気が逃げ、逃げ先が少ないほど一点に集中する
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
        resetBoard();
      }
      return;
    }

    if (cell.state === "popped" || cell.chainQueued) return;
    // スタッガー出現中のセルをタップされたら即座に表示完了させる
    if (cell.appearDelay > 0) {
      cell.appearDelay = 0;
      cell.scale = 1;
    }

    if (cell.state === "critical" || cell.state === "danger") {
      // 臨界／危険泡は限界まで張っているため、触れた瞬間に遅延ゼロで連鎖破裂させる
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
      // 小さい泡は指を置いているあいだ凹ませて空気の逃げ先を見せ、離したときに確定する
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
      gameState !== "gameover" &&
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

    // 押し潰された泡自体はペチャンコになり、しばらく窪みとして残る
    cell.state = "popped";
    cell.pressure = 0;
    cell.dangerTimer = 0;
    cell.cooldown = 0.88;
    cell.scale = 0.22;
    cell.scaleVel = 0;

    sound.playAirPush(plan.length);

    if (!protoMode) {
      spawnRing(srcPos.x, srcPos.y, cellSize * 0.3, "rgba(155, 175, 205, 0.45)", 1.6);
    }

    let promotedToCritical = false;
    let pushedToDanger = false;

    for (const item of plan) {
      const target = item.target;
      const dstPos = cellCenter(target.r, target.c);

      // 隣の泡へ空気が移動する視覚演出
      if (!protoMode) {
        const puffColor =
          item.outcome === "toDanger" || item.outcome === "dangerAccel"
            ? "#ff7a84"
            : item.outcome === "toCritical"
              ? "#ffffff"
              : "#a9bfd9";
        airPuffs.push({
          x1: srcPos.x,
          y1: srcPos.y,
          x2: dstPos.x,
          y2: dstPos.y,
          color: puffColor,
          progress: 0
        });
      }

      // 空気が流れ込んでぷくっと膨らむバネ反応
      target.scaleVel += 6.2;

      if (target.state === "danger") {
        // すでに赤い危険泡に空気を追い込むと猶予が一気に削られ、限界を超えれば即自爆
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
          // 押し込みすぎて臨界突破：即座に危険（赤）状態へ入り、余剰分だけ猶予が縮む
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
      // 押し込みすぎて危険状態にした合図の水平シェイク
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
    const chainInfo = activeChains.get(chainId) || { count: 0 };
    chainInfo.count += 1;
    activeChains.set(chainId, chainInfo);

    const comboNum = chainInfo.count;
    let chainRecordUpdated = false;
    if (comboNum > sessionMaxChain) {
      sessionMaxChain = comboNum;
      chainRecordUpdated = true;
      if (sessionMaxChain > bestMaxChain) {
        bestMaxChain = sessionMaxChain;
        localStorage.setItem(STORAGE_KEY_MAX_CHAIN, String(bestMaxChain));
      }
    }

    // セルを破裂して空になった状態にする
    cell.state = "popped";
    cell.pressure = 0;
    cell.dangerTimer = 0;
    cell.cooldown = 0.82;
    cell.chainQueued = false;
    cell.scale = 0.15;
    cell.scaleVel = 0;

    // 連鎖数に応じたスコア加算＋危険救出ボーナス
    const gained = comboNum + (wasDanger ? 5 : 0);
    score += gained;
    totalPopped += 1;
    checkBestScore();
    updateHud(true, chainRecordUpdated);

    // 効果音（連鎖数に応じて音階が上昇）と極小バイブレーション
    sound.playChainPop(comboNum - 1, wasDanger);
    if (comboNum > 1) {
      triggerHaptic(10);
    }

    // 視覚エフェクト（通常モード時）
    if (!protoMode) {
      const hueColor = wasDanger ? "#ff7a84" : comboNum >= 5 ? "#8cf4ff" : "#ffffff";
      spawnRing(pos.x, pos.y, cellSize * (0.56 + Math.min(0.28, comboNum * 0.03)), hueColor, wasDanger ? 3.5 : 2.6);
      // 「いいねのはじけ」風の放射スパーク＆ドット
      spawnLikeBurst(pos.x, pos.y, cellSize * (0.52 + Math.min(0.2, comboNum * 0.025)), hueColor, 8);
      spawnParticles(pos.x, pos.y, Math.min(18, 7 + comboNum * 2), hueColor, 150 + comboNum * 16);

      // 大連鎖（6連鎖以上の節目）で小さな紙吹雪を舞わせる
      if (comboNum >= 6 && comboNum % 2 === 0) {
        spawnConfetti(pos.x, pos.y, 14, 190);
      }

      if (fromCell) {
        const prevPos = cellCenter(fromCell.r, fromCell.c);
        beams.push({ x1: prevPos.x, y1: prevPos.y, x2: pos.x, y2: pos.y, life: 1 });
      }

      const label = wasDanger ? `+${gained} SAVE` : comboNum >= 3 ? `+${gained} (${comboNum})` : `+${gained}`;
      spawnFloatText(pos.x, pos.y - 6, label, hueColor, Math.min(22, 14 + Math.floor(comboNum / 2)));

      // 連鎖が伸びるほど心地よいマイクロ画面揺れ
      shakeMag = Math.min(9, Math.max(shakeMag, 1.8 + comboNum * 0.55));
    }

    // 4連鎖以上の節目で、盤面の他にある危険泡の猶予をわずかに回復する（大連鎖が防御にもなる）
    if (comboNum >= 4 && comboNum % 2 === 0) {
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const other = grid[r][c];
          if (other.state === "danger" && !other.chainQueued) {
            other.dangerTimer = Math.max(0, other.dangerTimer - 0.3);
          }
        }
      }
    }

    // 上下左右の隣接する臨界／危険泡へ連鎖を伝播させる（未成熟の泡は育てず、仕込みは小さい泡の押し出しに集約する）
    const delaySec = params.chainDelayMs / 1000;
    for (const [dr, dc] of DIRS) {
      const nr = cell.r + dr;
      const nc = cell.c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;

      const neighbor = grid[nr][nc];
      if (neighbor.state === "popped" || neighbor.chainQueued) continue;

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
    clearPressState();
    gameState = "gameover";
    burstCell = cell;
    pendingPops = [];
    activeChains.clear();
    gameOverLockUntil = performance.now() + 300;

    sound.playBurst();
    triggerHaptic([30, 30, 50]);

    const pos = cellCenter(cell.r, cell.c);
    // 丸く広がる切り替え（Circular Reveal）の起点を自爆した泡の位置に合わせる
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
      ? `MAX CHAIN ${sessionMaxChain}  /  NEW BEST`
      : `MAX CHAIN ${sessionMaxChain}  /  BEST ${bestScore}`;

    setTimeout(() => {
      if (gameState === "gameover") {
        gameOverOverlay.classList.remove("hidden");
        // 自己ベスト更新時は祝福のコンフェッティを舞わせる
        if (isNewBest && !protoMode) {
          spawnConfetti(boardSize * 0.5, boardSize * 0.42, 38, 280);
        }
      }
    }, 190);
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
    const palette = ["#ffffff", "#8cf4ff", "#ffd166", "#ff6b81", "#a3f7bf", "#c4b5fd"];
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
    if (gameState === "gameover") {
      hoverGroupSet.clear();
      activeTransferPlan = [];
      isPressPreview = false;
      return;
    }

    // スマホ・PC問わず、小さい泡を押し込んでいる最中を最優先でプレビュー表示する
    if (pressedCell) {
      hoverGroupSet.clear();
      if (pressInside && pressedCell.state === "growing" && !pressedCell.chainQueued) {
        activeTransferPlan = computeAirTransferPlan(pressedCell);
        isPressPreview = true;
      } else {
        // 別マスへ指がずれてキャンセル状態のときはプレビューを消す
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
    // 押し込み中の泡が何らかの理由でgrowing以外になった場合は安全に解除する
    if (pressedCell && (pressedCell.state !== "growing" || pressedCell.chainQueued)) {
      clearPressState();
    }

    // バネ物理（スタッガー出現・押し込み凹み・ラバーバンドの引っ張り＆戻り）
    const rubberLimit = cellSize * 0.65;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = grid[r][c];
        // スタッガー出現の遅延カウントダウン
        if (cell.appearDelay > 0) {
          cell.appearDelay -= dt;
          if (cell.appearDelay <= 0) {
            cell.appearDelay = 0;
            cell.scale = 0.05;
            cell.scaleVel = 13.5; // 行きすぎて戻るスプリング出現
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

        // ラバーバンド：押し込み中に指をずらすとゴムのように伸び、キャンセル時にビヨンと戻る
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

    // エフェクト更新（マイクロ揺れ・水平エラーシェイク）
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

    // 「いいねのはじけ」更新
    for (let i = likeBursts.length - 1; i >= 0; i--) {
      likeBursts[i].life -= dt * 3.1;
      if (likeBursts[i].life <= 0) likeBursts.splice(i, 1);
    }

    // コンフェッティ（紙吹雪）の重力・空気抵抗・回転更新
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
    const { baseGrowth, dangerLimit } = getDifficultyMetrics();

    // ホットスポットを盤面内で緩やかに回遊させ、自然な塊を生む
    for (const hs of hotspots) {
      hs.x += hs.vx * dt;
      hs.y += hs.vy * dt;
      if (hs.x < 0.4 || hs.x > GRID_SIZE - 1.4) hs.vx *= -1;
      if (hs.y < 0.4 || hs.y > GRID_SIZE - 1.4) hs.vy *= -1;
    }

    // 予約済みの連鎖ポップを進める
    for (let i = pendingPops.length - 1; i >= 0; i--) {
      const item = pendingPops[i];
      item.timeLeft -= dt;
      if (item.timeLeft <= 0) {
        pendingPops.splice(i, 1);
        executeChainPop(item.cell, item.chainId, item.step, item.fromCell);
      }
    }

    if (pendingPops.length === 0 && activeChains.size > 0) {
      activeChains.clear();
    }

    // 全セルの膨張・冷却・自爆タイマーを更新する
    let maxUrgency = 0;

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = grid[r][c];

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

        // 連鎖予約済み、または指で押さえつけられている最中の泡は膨張を一時停止する
        if (cell.chainQueued || (pressedCell === cell && pressInside)) continue;

        let spotBoost = 0.78;
        for (const hs of hotspots) {
          const dist = Math.hypot(c - hs.x, r - hs.y);
          if (dist < 2.3) {
            spotBoost = Math.max(spotBoost, 0.78 + (1 - dist / 2.3) * 0.72);
          }
        }

        if (cell.state === "growing" || cell.state === "critical") {
          const prevState = cell.state;
          cell.pressure += baseGrowth * cell.growthBias * spotBoost * dt;

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
      // エラー・押し込みすぎ時の水平シェイク（左右に鋭く震えて止まる）
      if (errorShakeTime > 0) {
        const ratio = errorShakeTime / 0.28;
        sx += Math.sin(errorShakeTime * 72) * errorShakeAmp * ratio;
      }
      if (sx !== 0 || sy !== 0) {
        ctx.translate(sx, sy);
      }
    }

    // 1. グリッドの土台（プチプチシートの窪み）
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const x = pad + c * cellSize;
        const y = pad + r * cellSize;
        const inset = cellSize * 0.08;
        const w = cellSize - inset * 2;
        const cell = grid[r][c];
        const isPressedHere = pressedCell === cell && pressInside && gameState !== "gameover";
        const isHovered = !pressedCell && hoverCell === cell && gameState !== "gameover";

        if (protoMode) {
          ctx.fillStyle = isPressedHere ? "#bebebe" : isHovered ? "#cfcfcf" : "#d9d9d9";
          ctx.strokeStyle = isPressedHere ? "#333333" : "#b0b0b0";
          ctx.lineWidth = isPressedHere ? 2 : 1;
          ctx.fillRect(x + inset, y + inset, w, w);
          ctx.strokeRect(x + inset, y + inset, w, w);
        } else {
          ctx.fillStyle = isPressedHere ? "#283142" : isHovered ? "#252b38" : "#171b23";
          ctx.strokeStyle = isPressedHere ? "#6680ad" : isHovered ? "#394256" : "#242a36";
          ctx.lineWidth = isPressedHere ? 2 : 1.2;
          roundRect(ctx, x + inset, y + inset, w, w, 10);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    // 2. 隣接する臨界／危険泡同士を繋ぐライン（どこまで連鎖するか一目で分かる）
    ctx.lineCap = "round";
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = grid[r][c];
        if (cell.appearDelay > 0) continue;
        if (cell.state !== "critical" && cell.state !== "danger") continue;
        const p1 = cellCenter(r, c);

        const neighbors = [
          [r, c + 1],
          [r + 1, c]
        ];
        for (const [nr, nc] of neighbors) {
          if (nr >= GRID_SIZE || nc >= GRID_SIZE) continue;
          const other = grid[nr][nc];
          if (other.appearDelay > 0) continue;
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
              ? "rgba(255, 255, 255, 0.72)"
              : "rgba(255, 255, 255, 0.22)";
            ctx.lineWidth = inHoverGroup ? 4.5 : 2.5;
          }
          ctx.stroke();
        }
      }
    }

    // 3. 小さい泡の押し込み中またはホバー時：どこへ空気が押し出されるかの方向ガイド
    const transferSource = isPressPreview ? pressedCell : hoverCell;
    if (transferSource && activeTransferPlan.length > 0 && gameState !== "gameover") {
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
              : isPressPreview ? "rgba(185, 212, 245, 0.8)" : "rgba(170, 195, 225, 0.45)";

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
    const maxBubbleRadius = cellSize * 0.37;
    const minBubbleRadius = cellSize * 0.11;

    // 押し込み中／ホバー中の空気押し出し先を高速参照できるようマップ化
    const transferTargetMap = new Map();
    for (const item of activeTransferPlan) {
      transferTargetMap.set(item.target, item);
    }

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = grid[r][c];
        const pos = cellCenter(r, c);

        if (cell.appearDelay > 0) continue;

        if (cell.state === "popped") {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, cellSize * 0.08, 0, Math.PI * 2);
          ctx.fillStyle = protoMode ? "#c0c0c0" : "rgba(255, 255, 255, 0.06)";
          ctx.fill();
          continue;
        }

        const isPressedHere = pressedCell === cell && pressInside && gameState !== "gameover";
        const transferPreview = transferTargetMap.get(cell);

        const normP = Math.min(1, Math.max(0, cell.pressure));
        let radius = minBubbleRadius + (maxBubbleRadius - minBubbleRadius) * Math.pow(normP, 0.85);
        radius *= Math.max(0.2, cell.scale);
        // 押し込みプレビューを受けている隣の泡は、空気が流れ込みかけてわずかに膨らむ
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
        } else if (isPressPreview && transferPreview && !protoMode) {
          // 押し出し先が臨界や危険に届く予兆のときは、わずかに震えて注意を引く
          if (transferPreview.outcome !== "grow") {
            jitterX = Math.sin(cell.wobblePhase * 2.2) * 1.1;
            jitterY = Math.cos(cell.wobblePhase * 2.5) * 1.1;
          }
        }

        const cx = pos.x + jitterX + cell.offsetX;
        const cy = pos.y + jitterY + cell.offsetY;
        const inHoverGroup = hoverGroupSet.has(cell);

        if (protoMode) {
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          if (cell.state === "growing") {
            ctx.fillStyle = isPressedHere ? "#666666" : "#9c9c9c";
            ctx.fill();
          } else if (cell.state === "critical") {
            ctx.fillStyle = inHoverGroup ? "#333333" : "#555555";
            ctx.fill();
          } else if (cell.state === "danger") {
            ctx.fillStyle = "#181818";
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
          const lightness = Math.round((isPressedHere ? 28 : 36) + ratio * 18);
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fillStyle = `hsl(216, 20%, ${lightness}%)`;
          ctx.fill();

          if (isPressedHere) {
            // 指でぐっと押し込まれて中央が凹んだリング表現
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(10, 14, 22, 0.35)";
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(180, 210, 250, 0.7)";
            ctx.lineWidth = 2;
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.arc(cx - radius * 0.28, cy - radius * 0.28, radius * 0.24, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
            ctx.fill();
          }
        } else if (cell.state === "critical") {
          ctx.save();
          if (inHoverGroup) {
            ctx.shadowColor = "rgba(255, 255, 255, 0.45)";
            ctx.shadowBlur = 14;
          }
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fillStyle = inHoverGroup ? "#ffffff" : "#e8eef7";
          ctx.fill();
          ctx.restore();

          ctx.beginPath();
          ctx.arc(cx - radius * 0.27, cy - radius * 0.27, radius * 0.26, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
          ctx.fill();

          ctx.beginPath();
          ctx.arc(cx, cy, radius + 2.5, 0, Math.PI * 2);
          ctx.strokeStyle = inHoverGroup
            ? "rgba(255, 255, 255, 0.9)"
            : "rgba(255, 255, 255, 0.35)";
          ctx.lineWidth = inHoverGroup ? 2.2 : 1.4;
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

        // 空気押し出し先の状態変化プレビュー（押し込み中はさらにくっきり表示）
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

      // 「いいねのはじけ」風の放射スパーク線＆外周ドット
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

          // 放射線の間に小さなドットを弾けさせる
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

      // 祝福のコンフェッティ（ひらひら回転しながら落ちる紙吹雪）
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

    // セル境界をまたぐ中央部分だけに簡潔な矢印を描く
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

  // イベント登録：スマホの「押し込み→離して確定（ずらすとキャンセル）」とPCホバーの両立
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
      // ラバーバンド用にセル中心からの指のズレ量を記録する
      const rect = canvas.getBoundingClientRect();
      const center = cellCenter(pressedCell.r, pressedCell.c);
      pressDragX = (e.clientX - rect.left) - center.x;
      pressDragY = (e.clientY - rect.top) - center.y;

      // 指が押し込んだマスから別マス／外へずれたか監視してキャンセル切替する
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
    if (e.pointerType !== "mouse") {
      hoverCell = null;
    } else {
      hoverCell = cell;
    }
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

  // スマホ長押し時のコンテキストメニュー表示を抑止する
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // リザルト画面タップ時：押した位置から丸く閉じて波紋スタッガーで次盤面を展開する
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
    const originC = Math.max(0, Math.min(GRID_SIZE - 1, (x - pad) / cellSize - 0.5));
    const originR = Math.max(0, Math.min(GRID_SIZE - 1, (y - pad) / cellSize - 0.5));
    resetBoard(originR, originC);
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
        resetBoard();
      }
    } else if (e.key === "r" || e.key === "R") {
      resetBoard();
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
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = grid[r][c];
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
  resetBoard();
  requestAnimationFrame(loop);
})();
