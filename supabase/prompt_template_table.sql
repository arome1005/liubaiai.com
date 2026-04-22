-- 全局提示词库（与「作品内」writing_prompt_template 不同）
-- 在 Supabase Dashboard → SQL → New query 中整段执行一次即可消除：
--   Could not find the table 'public.prompt_template' in the schema cache
--
-- 执行后如仍报错，可在 Project Settings → API → 等待缓存刷新，或重启本地 dev。

create table if not exists public.prompt_template (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null default '',
  type        text not null default 'continue',
  tags        text[] not null default '{}',
  body        text not null default '',
  status      text not null default 'draft',
  sort_order  integer not null default 0,
  created_at  bigint not null,
  updated_at  bigint not null,
  review_note text null,
  slots            text[] null,
  source_kind      text null,
  source_ref_work_id text null,
  source_excerpt_ids text[] null,
  source_note      text null
);

create index if not exists idx_prompt_tpl_user_type    on public.prompt_template (user_id, type);
create index if not exists idx_prompt_tpl_user_status  on public.prompt_template (user_id, status);
create index if not exists idx_prompt_tpl_user_updated on public.prompt_template (user_id, updated_at desc);
create index if not exists idx_prompt_tpl_approved     on public.prompt_template (status, updated_at desc)
  where status = 'approved';

alter table public.prompt_template enable row level security;

drop policy if exists "prompt_template_owner_all" on public.prompt_template;
create policy "prompt_template_owner_all"
  on public.prompt_template
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "prompt_template_approved_read" on public.prompt_template;
create policy "prompt_template_approved_read"
  on public.prompt_template
  for select
  to authenticated
  using (status = 'approved');
