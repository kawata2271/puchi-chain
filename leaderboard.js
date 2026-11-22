// Supabase を用いたオンライン順位表＆ニックネーム管理モジュール
(() => {
  "use strict";

  // =========================================================================
  // Supabase 接続設定（作成後に Project URL と anon public key をここへ設定）
  // 未設定のあいだは端末内ローカル順位表として動作します
  // =========================================================================
  const SUPABASE_URL = "https://ohrsjiarkuflimhbjazc.supabase.co/rest/v1/";
  const SUPABASE_ANON_KEY = "sb_publishable_BlS6GZA4tVFzGc17jCP54A_csCVU-VT";

  const STORAGE_KEY_PLAYER_ID = "puchi_player_id_v1";
  const STORAGE_KEY_NICKNAME = "puchi_nickname_v1";
  const STORAGE_KEY_LOCAL_BOARD = "puchi_local_leaderboard_v1";

  // プレイヤー固有のIDを取得（未生成なら自動発行して保存）
  function getOrCreatePlayerId() {
    let id = localStorage.getItem(STORAGE_KEY_PLAYER_ID);
    if (!id || id.length < 8) {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        id = crypto.randomUUID();
      } else {
        id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
      }
      localStorage.setItem(STORAGE_KEY_PLAYER_ID, id);
    }
    return id;
  }

  // ニックネームを12文字以内に整える
  function sanitizeNickname(raw) {
    const trimmed = String(raw || "").trim().slice(0, 12);
    return trimmed;
  }

  class LeaderboardService {
    constructor() {
      this.playerId = getOrCreatePlayerId();
      this.nickname = sanitizeNickname(localStorage.getItem(STORAGE_KEY_NICKNAME) || "");
    }

    // Supabase が設定済みかどうか
    isOnlineConfigured() {
      return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
    }

    // ニックネームが設定済みかどうか
    hasNickname() {
      return this.nickname.length > 0;
    }

    // 現在のニックネームを取得（未設定時はGUEST）
    getNickname() {
      return this.nickname || "GUEST";
    }

    // ニックネームを保存する
    setNickname(rawName) {
      const clean = sanitizeNickname(rawName) || "GUEST";
      this.nickname = clean;
      localStorage.setItem(STORAGE_KEY_NICKNAME, clean);
      return clean;
    }

    // 共通のSupabaseリクエストヘッダー（新Publishableキーと旧anon JWTキーの両方に対応）
    _headers() {
      const headers = {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY
      };
      // 旧anonキー（JWT形式）の場合のみ Authorization ヘッダーを付与する
      if (SUPABASE_ANON_KEY.split(".").length === 3) {
        headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
      }
      return headers;
    }

    // プレイ結果を送信する（オンライン時はSupabase RPC、未設定時はローカル保存）
    async submitScore(score, maxChain, depth) {
      const cleanScore = Math.max(0, Math.floor(score || 0));
      const cleanChain = Math.max(0, Math.floor(maxChain || 0));
      const cleanDepth = Math.max(0, Math.floor(depth || 0));
      const name = this.getNickname();

      // 常にローカルの履歴にも自己ベストを保存しておく
      this._saveLocal(name, cleanScore, cleanChain, cleanDepth);

      if (!this.isOnlineConfigured()) {
        return { ok: true, mode: "local" };
      }

      try {
        const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/submit_puchi_score`, {
          method: "POST",
          headers: this._headers(),
          body: JSON.stringify({
            p_player_id: this.playerId,
            p_nickname: name,
            p_score: cleanScore,
            p_chain: cleanChain,
            p_depth: cleanDepth
          })
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return { ok: true, mode: "online" };
      } catch (err) {
        return { ok: false, mode: "local", error: String(err) };
      }
    }

    // ランキング上位を取得する（type: 'score' | 'chain' | 'depth'）
    async fetchRanking(type = "score", limit = 50) {
      if (!this.isOnlineConfigured()) {
        return {
          mode: "local",
          rows: this._getLocalRows(type, limit)
        };
      }

      const order =
        type === "chain"
          ? "best_chain.desc,best_score.desc,updated_at.asc"
          : type === "depth"
            ? "best_depth.desc,best_score.desc,updated_at.asc"
            : "best_score.desc,best_chain.desc,updated_at.asc";

      try {
        const url = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/puchi_leaderboard?select=player_id,nickname,best_score,best_chain,best_depth&order=${encodeURIComponent(order)}&limit=${limit}`;
        const res = await fetch(url, {
          method: "GET",
          headers: this._headers()
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const rows = await res.json();
        return { mode: "online", rows: Array.isArray(rows) ? rows : [] };
      } catch (err) {
        return {
          mode: "local",
          error: String(err),
          rows: this._getLocalRows(type, limit)
        };
      }
    }

    // 現在のプレイヤーの得点順位と連鎖順位をまとめて取得する
    async fetchMyRanks() {
      const [scoreRes, chainRes] = await Promise.all([
        this.fetchRanking("score", 100),
        this.fetchRanking("chain", 100)
      ]);
      const scoreIdx = scoreRes.rows.findIndex((r) => r.player_id === this.playerId);
      const chainIdx = chainRes.rows.findIndex((r) => r.player_id === this.playerId);
      return {
        mode: scoreRes.mode,
        scoreRank: scoreIdx >= 0 ? scoreIdx + 1 : null,
        chainRank: chainIdx >= 0 ? chainIdx + 1 : null
      };
    }

    // ローカル順位表への保存（Supabase未設定時のフォールバック）
    _saveLocal(nickname, score, chain, depth) {
      const rows = this._readLocalRaw();
      const existing = rows.find((r) => r.player_id === this.playerId);
      if (existing) {
        existing.nickname = nickname;
        existing.best_score = Math.max(existing.best_score || 0, score);
        existing.best_chain = Math.max(existing.best_chain || 0, chain);
        existing.best_depth = Math.max(existing.best_depth || 0, depth);
        existing.updated_at = Date.now();
      } else {
        rows.push({
          player_id: this.playerId,
          nickname,
          best_score: score,
          best_chain: chain,
          best_depth: depth,
          updated_at: Date.now()
        });
      }
      localStorage.setItem(STORAGE_KEY_LOCAL_BOARD, JSON.stringify(rows));
    }

    _readLocalRaw() {
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY_LOCAL_BOARD) || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }

    _getLocalRows(type, limit) {
      const rows = this._readLocalRaw();
      rows.sort((a, b) => {
        if (type === "chain") {
          return (b.best_chain - a.best_chain) || (b.best_score - a.best_score);
        }
        if (type === "depth") {
          return (b.best_depth - a.best_depth) || (b.best_score - a.best_score);
        }
        return (b.best_score - a.best_score) || (b.best_chain - a.best_chain);
      });
      return rows.slice(0, limit);
    }
  }

  window.LeaderboardService = LeaderboardService;
})();
