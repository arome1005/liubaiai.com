-- 拆书历史（本地 + 云端持久化）
-- 可在 Supabase SQL Editor 执行；未执行时前端会自动降级为仅本地存储。

create table if not exists public.work_book_split_history (
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  work_id     uuid not null references public.work (id) on delete cascade,
  history_json jsonb not null default '[]'::jsonb,
  updated_at  bigint not null
);

create index if not exists idx_wbsh_user_work on public.work_book_split_history (user_id, work_id);

alter table public.work_book_split_history enable row level security;

drop policy if exists "wbsh_owner_all" on public.work_book_split_history;
create policy "wbsh_owner_all"
  on public.work_book_split_history
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
