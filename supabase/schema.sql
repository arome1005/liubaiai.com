-- =============================================================================
-- 留白写作 · Supabase 完整初始化（单文件，空库在 SQL Editor 中整段执行一次即可）
-- 藏经 reference_* 仅存浏览器，此处不建表。
-- 说明：面向「新库 / 未建 public 业务表」；若你已用旧版建过表，勿整段重跑，需单独做迁移。
-- 若触发器报错：把 execute procedure 改为 execute function（按实例二选一）。
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1) 用户镜像 app_user（与 auth.users 一一对应；work / test_content 等均指向本表）
-- -----------------------------------------------------------------------------
create table if not exists public.app_user (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);
create index if not exists idx_app_user_email on public.app_user (email);

-- -----------------------------------------------------------------------------
-- 2) 新用户写入 auth.users 时，自动插入 app_user（SECURITY DEFINER + search_path）
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_user (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 3) 存量账号：把已有 auth.users 补进 app_user（新库为空时无影响；有老用户时必跑）
-- -----------------------------------------------------------------------------
insert into public.app_user (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 4) 写作核心（user_id → app_user，与 Auth 镜像一致）
-- -----------------------------------------------------------------------------
create table if not exists public.work (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_user (id) on delete cascade,
  title text not null,
  created_at bigint not null,
  updated_at bigint not null,
  progress_cursor uuid null
);
create index if not exists idx_work_user_updated on public.work (user_id, updated_at desc);

create table if not exists public.volume (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.work (id) on delete cascade,
  title text not null,
  "order" integer not null,
  created_at bigint not null
);
create index if not exists idx_volume_work_order on public.volume (work_id, "order");

create table if not exists public.chapter (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.work (id) on delete cascade,
  volume_id uuid not null references public.volume (id) on delete restrict,
  title text not null,
  content text not null default '',
  summary text null,
  "order" integer not null,
  updated_at bigint not null,
  word_count_cache integer null
);
create index if not exists idx_chapter_work_order on public.chapter (work_id, "order");
create index if not exists idx_chapter_volume_order on public.chapter (volume_id, "order");

create table if not exists public.chapter_snapshot (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapter (id) on delete cascade,
  content text not null,
  created_at bigint not null
);
create index if not exists idx_snapshot_chapter_created on public.chapter_snapshot (chapter_id, created_at desc);

create table if not exists public.work_style_card (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null unique references public.work (id) on delete cascade,
  pov text not null default '',
  tone text not null default '',
  banned_phrases text not null default '',
  style_anchor text not null default '',
  extra_rules text not null default '',
  updated_at bigint not null
);

-- -----------------------------------------------------------------------------
-- 5) 圣经 / 设定
-- -----------------------------------------------------------------------------
create table if not exists public.bible_character (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.work (id) on delete cascade,
  name text not null,
  motivation text not null default '',
  relationships text not null default '',
  voice_notes text not null default '',
  taboos text not null default '',
  sort_order integer not null default 0,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists idx_bible_character_work_sort on public.bible_character (work_id, sort_order);

create table if not exists public.bible_world_entry (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.work (id) on delete cascade,
  entry_kind text not null,
  title text not null,
  body text not null default '',
  sort_order integer not null default 0,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists idx_bible_world_work_sort on public.bible_world_entry (work_id, sort_order);

create table if not exists public.bible_foreshadow (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.work (id) on delete cascade,
  title text not null,
  planted_where text not null default '',
  planned_resolve text not null default '',
  status text not null default 'pending',
  note text not null default '',
  chapter_id uuid null references public.chapter (id) on delete set null,
  sort_order integer not null default 0,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists idx_foreshadow_work_sort on public.bible_foreshadow (work_id, sort_order);

create table if not exists public.bible_timeline_event (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.work (id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  note text not null default '',
  chapter_id uuid null references public.chapter (id) on delete set null,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists idx_timeline_work_sort on public.bible_timeline_event (work_id, sort_order);

create table if not exists public.bible_chapter_template (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.work (id) on delete cascade,
  name text not null,
  goal_text text not null default '',
  forbid_text text not null default '',
  pov_text text not null default '',
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists idx_template_work_updated on public.bible_chapter_template (work_id, updated_at desc);

create table if not exists public.chapter_bible (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null unique references public.chapter (id) on delete cascade,
  work_id uuid not null references public.work (id) on delete cascade,
  goal_text text not null default '',
  forbid_text text not null default '',
  pov_text text not null default '',
  scene_stance text not null default '',
  updated_at bigint not null
);
create index if not exists idx_chapter_bible_work_updated on public.chapter_bible (work_id, updated_at desc);

create table if not exists public.bible_glossary_term (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.work (id) on delete cascade,
  term text not null,
  category text not null,
  note text not null default '',
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists idx_glossary_work_term on public.bible_glossary_term (work_id, term);

-- -----------------------------------------------------------------------------
-- 6) 注册验证码（仅后端 service_role 访问；勿对 anon 建 policy）
-- -----------------------------------------------------------------------------
create table if not exists public.email_otp_challenge (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null check (purpose in ('signup')),
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_otp_email_created on public.email_otp_challenge (email, created_at desc);

-- -----------------------------------------------------------------------------
-- 7) 联调
-- -----------------------------------------------------------------------------
create table if not exists public.test_content (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_user (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_test_content_user_created on public.test_content (user_id, created_at desc);

-- =============================================================================
-- 8) RLS：先 ENABLE，再 DROP POLICY IF EXISTS，再 CREATE（策略段可重复执行）
-- =============================================================================
alter table public.work enable row level security;
alter table public.volume enable row level security;
alter table public.chapter enable row level security;
alter table public.chapter_snapshot enable row level security;
alter table public.work_style_card enable row level security;
alter table public.bible_character enable row level security;
alter table public.bible_world_entry enable row level security;
alter table public.bible_foreshadow enable row level security;
alter table public.bible_timeline_event enable row level security;
alter table public.bible_chapter_template enable row level security;
alter table public.chapter_bible enable row level security;
alter table public.bible_glossary_term enable row level security;
alter table public.app_user enable row level security;
alter table public.test_content enable row level security;
alter table public.email_otp_challenge enable row level security;

drop policy if exists app_user_self on public.app_user;
create policy app_user_self on public.app_user for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists work_select on public.work;
drop policy if exists work_insert on public.work;
drop policy if exists work_update on public.work;
drop policy if exists work_delete on public.work;
create policy work_select on public.work for select using (auth.uid() = user_id);
create policy work_insert on public.work for insert with check (auth.uid() = user_id);
create policy work_update on public.work for update using (auth.uid() = user_id);
create policy work_delete on public.work for delete using (auth.uid() = user_id);

drop policy if exists volume_all on public.volume;
create policy volume_all on public.volume for all using (
  exists (select 1 from public.work w where w.id = volume.work_id and w.user_id = auth.uid())
);

drop policy if exists chapter_all on public.chapter;
create policy chapter_all on public.chapter for all using (
  exists (select 1 from public.work w where w.id = chapter.work_id and w.user_id = auth.uid())
);

drop policy if exists snapshot_all on public.chapter_snapshot;
create policy snapshot_all on public.chapter_snapshot for all using (
  exists (
    select 1
    from public.chapter c
    join public.work w on w.id = c.work_id
    where c.id = chapter_snapshot.chapter_id and w.user_id = auth.uid()
  )
);

drop policy if exists wsc_all on public.work_style_card;
create policy wsc_all on public.work_style_card for all using (
  exists (select 1 from public.work w where w.id = work_style_card.work_id and w.user_id = auth.uid())
);

drop policy if exists bc_all on public.bible_character;
drop policy if exists bw_all on public.bible_world_entry;
drop policy if exists bf_all on public.bible_foreshadow;
drop policy if exists bt_all on public.bible_timeline_event;
drop policy if exists bct_all on public.bible_chapter_template;
drop policy if exists cb_all on public.chapter_bible;
drop policy if exists bgt_all on public.bible_glossary_term;
create policy bc_all on public.bible_character for all using (
  exists (select 1 from public.work w where w.id = bible_character.work_id and w.user_id = auth.uid())
);
create policy bw_all on public.bible_world_entry for all using (
  exists (select 1 from public.work w where w.id = bible_world_entry.work_id and w.user_id = auth.uid())
);
create policy bf_all on public.bible_foreshadow for all using (
  exists (select 1 from public.work w where w.id = bible_foreshadow.work_id and w.user_id = auth.uid())
);
create policy bt_all on public.bible_timeline_event for all using (
  exists (select 1 from public.work w where w.id = bible_timeline_event.work_id and w.user_id = auth.uid())
);
create policy bct_all on public.bible_chapter_template for all using (
  exists (select 1 from public.work w where w.id = bible_chapter_template.work_id and w.user_id = auth.uid())
);
create policy cb_all on public.chapter_bible for all using (
  exists (select 1 from public.work w where w.id = chapter_bible.work_id and w.user_id = auth.uid())
);
create policy bgt_all on public.bible_glossary_term for all using (
  exists (select 1 from public.work w where w.id = bible_glossary_term.work_id and w.user_id = auth.uid())
);

drop policy if exists tc_all on public.test_content;
create policy tc_all on public.test_content for all using (auth.uid() = user_id);

-- email_otp_challenge：不建 policy → 仅 service_role 可访问
