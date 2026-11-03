-- 拾词易记 · 云同步建表脚本
--
-- 用法：Supabase 控制台 → SQL Editor → 粘贴全文 → Run
-- 可重复执行，不会破坏已有数据。

-- 键值表：一行对应应用里的一个存储键，结构与本地 IndexedDB 完全一致，
-- 因此同步层不需要做任何字段映射。
create table if not exists public.user_kv (
  user_id    uuid        not null default auth.uid()
                         references auth.users (id) on delete cascade,
  key        text        not null,
  value      jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

comment on table public.user_kv is '拾词易记的账号数据（设置、单词状态、自建词书、学习日志）';

-- 行级安全：每个用户只能读写自己的行。
-- 这一条是账号隔离的根本保障，务必保留。
alter table public.user_kv enable row level security;

drop policy if exists "own_kv_rows" on public.user_kv;
create policy "own_kv_rows" on public.user_kv
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 按前缀拉取时走索引
create index if not exists user_kv_key_prefix_idx
  on public.user_kv (user_id, key text_pattern_ops);
