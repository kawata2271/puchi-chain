-- PUCHI CHAIN オンライン順位表用 Supabase セットアップSQL
-- Supabase ダッシュボードの「SQL Editor」にこのまま貼り付けて「Run」を押してください。

-- 1. ランキングテーブルを作成
create table if not exists public.puchi_leaderboard (
  player_id text primary key,
  nickname text not null check (char_length(nickname) between 1 and 12),
  best_score integer not null default 0 check (best_score >= 0 and best_score <= 9999999),
  best_chain integer not null default 0 check (best_chain >= 0 and best_chain <= 9999),
  best_depth integer not null default 0 check (best_depth >= 0 and best_depth <= 99999),
  updated_at timestamptz not null default now()
);

-- 2. 最高得点・最高連鎖の高速取得用インデックス
create index if not exists idx_puchi_leaderboard_score
  on public.puchi_leaderboard (best_score desc, updated_at asc);

create index if not exists idx_puchi_leaderboard_chain
  on public.puchi_leaderboard (best_chain desc, best_score desc, updated_at asc);

-- 3. Row Level Security（閲覧のみ公開し、直接の改ざん・削除を禁止する）
alter table public.puchi_leaderboard enable row level security;

drop policy if exists "誰でもランキングを閲覧できる" on public.puchi_leaderboard;
create policy "誰でもランキングを閲覧できる"
  on public.puchi_leaderboard
  for select
  to anon, authenticated
  using (true);

-- 4. 安全に自己ベストのみを更新する登録用RPC関数
create or replace function public.submit_puchi_score(
  p_player_id text,
  p_nickname text,
  p_score integer,
  p_chain integer,
  p_depth integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  -- IDとニックネームの基本検証
  if p_player_id is null or char_length(p_player_id) < 8 or char_length(p_player_id) > 64 then
    raise exception 'invalid player_id';
  end if;

  v_name := left(btrim(coalesce(p_nickname, '')), 12);
  if char_length(v_name) = 0 then
    v_name := 'GUEST';
  end if;

  if p_score < 0 or p_score > 9999999 or p_chain < 0 or p_chain > 9999 or p_depth < 0 or p_depth > 99999 then
    raise exception 'score out of range';
  end if;

  -- 既存記録より高い項目だけを上書きして保存する
  insert into public.puchi_leaderboard (player_id, nickname, best_score, best_chain, best_depth, updated_at)
  values (p_player_id, v_name, p_score, p_chain, p_depth, now())
  on conflict (player_id) do update
  set
    nickname = excluded.nickname,
    best_score = greatest(public.puchi_leaderboard.best_score, excluded.best_score),
    best_chain = greatest(public.puchi_leaderboard.best_chain, excluded.best_chain),
    best_depth = greatest(public.puchi_leaderboard.best_depth, excluded.best_depth),
    updated_at = now();
end;
$$;

-- 5. 匿名クライアント（anon）からランキング閲覧とRPC関数を実行できるよう許可
grant usage on schema public to anon, authenticated;
grant select on table public.puchi_leaderboard to anon, authenticated;
grant execute on function public.submit_puchi_score(text, text, integer, integer, integer) to anon, authenticated;
