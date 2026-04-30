-- AI 用量事件：登录用户跨设备同步（与客户端 IndexedDB 行结构对齐；id 为客户端生成，可为非 UUID 字符串）
-- 在 Supabase SQL Editor 执行一次即可。

create table if not exists public.ai_usage_event (
  id                    text primary key,
  user_id               uuid not null references public.app_user (id) on delete cascade,
  ts                    bigint not null,
  task                  text not null,
  model                 text not null,
  provider_bucket       text not null,
  provider_id           text not null,
  input_tokens          integer not null,
  output_tokens         integer not null,
  total_tokens          integer not null,
  source                text not null,
  status                text not null,
  work_id               text null,
  session_key           text not null,
  context_input_buckets jsonb null,
  updated_at            timestamptz not null default now()
);

create index if not exists idx_ai_usage_event_user_ts on public.ai_usage_event (user_id, ts desc);

alter table public.ai_usage_event enable row level security;

drop policy if exists ai_usage_event_select on public.ai_usage_event;
create policy ai_usage_event_select on public.ai_usage_event
  for select using (auth.uid() = user_id);

drop policy if exists ai_usage_event_insert on public.ai_usage_event;
create policy ai_usage_event_insert on public.ai_usage_event
  for insert with check (auth.uid() = user_id);

drop policy if exists ai_usage_event_update on public.ai_usage_event;
create policy ai_usage_event_update on public.ai_usage_event
  for update using (auth.uid() = user_id);

drop policy if exists ai_usage_event_delete on public.ai_usage_event;
create policy ai_usage_event_delete on public.ai_usage_event
  for delete using (auth.uid() = user_id);
