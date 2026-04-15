-- =============================================================================
-- 留白写作 · Supabase 完整初始化 DDL
-- 版本：2026-04-08（与 docs/产品说明书.md §14 数据模型对齐）
--
-- 适用场景：
--   空库 / 新项目 → 在 Supabase SQL Editor 中整段执行一次即可。
--   已有库 → 对照各节的 ALTER TABLE 增量语句手动执行缺失部分。
--
-- 注意事项：
--   · 藏经（reference_*）仅存浏览器 IndexedDB，此处不建表。
--   · email_otp_challenge 仅后端 service_role 访问，不建 anon policy。
--   · 若触发器报错 execute procedure → 改为 execute function。
--   · 自建 Postgres（非 Supabase）legacy 建表见 backend/migrate.js。
-- =============================================================================

create extension if not exists pgcrypto;

-- =============================================================================
-- 1. 用户镜像（与 auth.users 一一对应）
-- =============================================================================

create table if not exists public.app_user (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);
create index if not exists idx_app_user_email on public.app_user (email);

-- 触发器：auth.users 新增行时自动同步到 app_user
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

-- 存量补齐
insert into public.app_user (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- =============================================================================
-- 2. 作品核心：work / volume / chapter / chapter_snapshot
--    对应产品模块：留白（作品库）+ 落笔（写作编辑）
-- =============================================================================

-- ---- 2.1 作品 ----
create table if not exists public.work (
  id              uuid    primary key default gen_random_uuid(),
  user_id         uuid    not null references public.app_user (id) on delete cascade,
  title           text    not null,
  description     text    null,                             -- 作品简介
  status          text    not null default 'serializing',   -- serializing | completed | archived
  tags            text[]  not null default '{}',            -- 留白标签（平台定位/题材/自定义）
  cover_image     text    null,                             -- 封面 data URL（≤400KB）
  created_at      bigint  not null,
  updated_at      bigint  not null,
  progress_cursor uuid    null                              -- 写作进度游标（章节 id）
);
create index if not exists idx_work_user_updated on public.work (user_id, updated_at desc);

-- 增量兼容（旧库可能缺列）
alter table public.work add column if not exists description   text    null;
alter table public.work add column if not exists status        text    not null default 'serializing';
alter table public.work add column if not exists tags          text[]  not null default '{}';
alter table public.work add column if not exists cover_image   text    null;

-- ---- 2.2 卷 ----
create table if not exists public.volume (
  id         uuid    primary key default gen_random_uuid(),
  work_id    uuid    not null references public.work (id) on delete cascade,
  title      text    not null,
  "order"    integer not null,
  created_at bigint  not null,
  summary    text    null                                    -- 卷级概要
);
create index if not exists idx_volume_work_order on public.volume (work_id, "order");

alter table public.volume add column if not exists summary text null;

-- ---- 2.3 章节 ----
create table if not exists public.chapter (
  id                  uuid    primary key default gen_random_uuid(),
  work_id             uuid    not null references public.work (id) on delete cascade,
  volume_id           uuid    not null references public.volume (id) on delete restrict,
  title               text    not null,
  content             text    not null default '',
  summary             text    null,                          -- 章节概要
  summary_updated_at  bigint  null,                          -- 概要最后生成/编辑时间
  summary_scope_from  integer null,                          -- 概要覆盖范围 [from, to] 章序号闭区间
  summary_scope_to    integer null,
  "order"             integer not null,
  updated_at          bigint  not null,
  word_count_cache    integer null                           -- 字数缓存
);
create index if not exists idx_chapter_work_order   on public.chapter (work_id, "order");
create index if not exists idx_chapter_volume_order on public.chapter (volume_id, "order");

alter table public.chapter add column if not exists summary_updated_at bigint  null;
alter table public.chapter add column if not exists summary_scope_from integer null;
alter table public.chapter add column if not exists summary_scope_to   integer null;
alter table public.chapter add column if not exists word_count_cache   integer null;

-- ---- 2.4 章节快照 ----
create table if not exists public.chapter_snapshot (
  id         uuid   primary key default gen_random_uuid(),
  chapter_id uuid   not null references public.chapter (id) on delete cascade,
  content    text   not null,
  created_at bigint not null
);
create index if not exists idx_snapshot_chapter_created
  on public.chapter_snapshot (chapter_id, created_at desc);

-- =============================================================================
-- 3. 本书锦囊 / 设定护栏
--    对应产品模块：本书锦囊（/work/:id/bible）
-- =============================================================================

-- ---- 3.1 风格卡（每作品一份）----
create table if not exists public.work_style_card (
  id             uuid   primary key default gen_random_uuid(),
  work_id        uuid   not null unique references public.work (id) on delete cascade,
  pov            text   not null default '',    -- 人称/叙述视角
  tone           text   not null default '',    -- 调性
  banned_phrases text   not null default '',    -- 禁用套话（换行分隔）
  style_anchor   text   not null default '',    -- 文风锚点
  extra_rules    text   not null default '',    -- 其他硬约束
  updated_at     bigint not null
);

-- ---- 3.2 人物 ----
create table if not exists public.bible_character (
  id            uuid    primary key default gen_random_uuid(),
  work_id       uuid    not null references public.work (id) on delete cascade,
  name          text    not null,
  motivation    text    not null default '',
  relationships text    not null default '',
  voice_notes   text    not null default '',
  taboos        text    not null default '',
  sort_order    integer not null default 0,
  created_at    bigint  not null,
  updated_at    bigint  not null
);
create index if not exists idx_bible_character_work_sort
  on public.bible_character (work_id, sort_order);

-- ---- 3.3 世界观 ----
create table if not exists public.bible_world_entry (
  id         uuid    primary key default gen_random_uuid(),
  work_id    uuid    not null references public.work (id) on delete cascade,
  entry_kind text    not null,       -- 势力 / 规则 / 地理 / 力量体系 …
  title      text    not null,
  body       text    not null default '',
  sort_order integer not null default 0,
  created_at bigint  not null,
  updated_at bigint  not null
);
create index if not exists idx_bible_world_work_sort
  on public.bible_world_entry (work_id, sort_order);

-- ---- 3.4 伏笔 ----
create table if not exists public.bible_foreshadow (
  id              uuid    primary key default gen_random_uuid(),
  work_id         uuid    not null references public.work (id) on delete cascade,
  title           text    not null,
  planted_where   text    not null default '',
  planned_resolve text    not null default '',
  status          text    not null default 'pending',  -- pending | resolved | abandoned
  note            text    not null default '',
  chapter_id      uuid    null references public.chapter (id) on delete set null,
  sort_order      integer not null default 0,
  created_at      bigint  not null,
  updated_at      bigint  not null
);
create index if not exists idx_foreshadow_work_sort
  on public.bible_foreshadow (work_id, sort_order);

-- ---- 3.5 时间线 ----
create table if not exists public.bible_timeline_event (
  id         uuid    primary key default gen_random_uuid(),
  work_id    uuid    not null references public.work (id) on delete cascade,
  label      text    not null,
  sort_order integer not null default 0,
  note       text    not null default '',
  chapter_id uuid    null references public.chapter (id) on delete set null,
  created_at bigint  not null,
  updated_at bigint  not null
);
create index if not exists idx_timeline_work_sort
  on public.bible_timeline_event (work_id, sort_order);

-- ---- 3.6 术语表 ----
create table if not exists public.bible_glossary_term (
  id         uuid   primary key default gen_random_uuid(),
  work_id    uuid   not null references public.work (id) on delete cascade,
  term       text   not null,
  category   text   not null,           -- name | term | dead
  note       text   not null default '',
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists idx_glossary_work_term
  on public.bible_glossary_term (work_id, term);

-- ---- 3.7 章头/章尾模板 ----
create table if not exists public.bible_chapter_template (
  id          uuid   primary key default gen_random_uuid(),
  work_id     uuid   not null references public.work (id) on delete cascade,
  name        text   not null,
  goal_text   text   not null default '',
  forbid_text text   not null default '',
  pov_text    text   not null default '',
  created_at  bigint not null,
  updated_at  bigint not null
);
create index if not exists idx_template_work_updated
  on public.bible_chapter_template (work_id, updated_at desc);

-- ---- 3.8 本章约束（每章一份）----
create table if not exists public.chapter_bible (
  id              uuid   primary key default gen_random_uuid(),
  chapter_id      uuid   not null unique references public.chapter (id) on delete cascade,
  work_id         uuid   not null references public.work (id) on delete cascade,
  goal_text       text   not null default '',
  forbid_text     text   not null default '',
  pov_text        text   not null default '',
  scene_stance    text   not null default '',    -- 站位/持物/出口
  character_state text   not null default '',    -- 本章末人物状态备忘
  updated_at      bigint not null
);
create index if not exists idx_chapter_bible_work_updated
  on public.chapter_bible (work_id, updated_at desc);

alter table public.chapter_bible
  add column if not exists character_state text not null default '';

-- ---- 3.9 提示词模板 ----
create table if not exists public.writing_prompt_template (
  id         uuid    primary key default gen_random_uuid(),
  work_id    uuid    not null references public.work (id) on delete cascade,
  category   text    not null default '',   -- 扩写 / 润色 / 对话 …
  title      text    not null default '',
  body       text    not null default '',
  sort_order integer not null default 0,
  created_at bigint  not null,
  updated_at bigint  not null
);
create index if not exists idx_wpt_work_sort     on public.writing_prompt_template (work_id, sort_order);
create index if not exists idx_wpt_work_category on public.writing_prompt_template (work_id, category);

-- ---- 3.10 笔感样本 ----
create table if not exists public.writing_style_sample (
  id         uuid    primary key default gen_random_uuid(),
  work_id    uuid    not null references public.work (id) on delete cascade,
  title      text    not null default '',
  body       text    not null default '',
  sort_order integer not null default 0,
  created_at bigint  not null,
  updated_at bigint  not null
);
create index if not exists idx_wss_work_sort
  on public.writing_style_sample (work_id, sort_order);

-- =============================================================================
-- 4. 推演（大纲与逻辑规划）
--    对应产品模块：推演（/logic）
-- =============================================================================

-- ---- 4.1 推演地点 ----
create table if not exists public.logic_place_node (
  id         uuid    primary key default gen_random_uuid(),
  work_id    uuid    not null references public.work (id) on delete cascade,
  name       text    not null,
  note       text    not null default '',
  x          integer not null default 50,   -- 地图 SVG 百分比坐标 0~100
  y          integer not null default 50,
  created_at bigint  not null,
  updated_at bigint  not null
);
create index if not exists idx_logic_place_node_work_updated
  on public.logic_place_node (work_id, updated_at desc);

-- ---- 4.2 推演地点事件 ----
create table if not exists public.logic_place_event (
  id         uuid   primary key default gen_random_uuid(),
  work_id    uuid   not null references public.work (id) on delete cascade,
  place_id   uuid   not null references public.logic_place_node (id) on delete cascade,
  label      text   not null,
  note       text   not null default '',
  chapter_id uuid   null references public.chapter (id) on delete set null,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists idx_logic_place_event_work_updated
  on public.logic_place_event (work_id, updated_at desc);
create index if not exists idx_logic_place_event_place_updated
  on public.logic_place_event (place_id, updated_at desc);

-- =============================================================================
-- 5. 流光（灵感碎片管理）
--    对应产品模块：流光（/inspiration）
-- =============================================================================

-- ---- 5.1 流光集合 ----
create table if not exists public.inspiration_collection (
  id         uuid    primary key default gen_random_uuid(),
  user_id    uuid    not null references public.app_user (id) on delete cascade,
  name       text    not null default '',
  sort_order integer not null default 0,
  created_at bigint  not null,
  updated_at bigint  not null
);
create index if not exists idx_insp_coll_user_sort
  on public.inspiration_collection (user_id, sort_order);

-- ---- 5.2 流光碎片 ----
create table if not exists public.inspiration_fragment (
  id            uuid   primary key default gen_random_uuid(),
  user_id       uuid   not null references public.app_user (id) on delete cascade,
  work_id       uuid   null references public.work (id) on delete set null,
  collection_id uuid   null references public.inspiration_collection (id) on delete set null,
  title         text   null,
  source_name   text   null,
  source_url    text   null,
  url_title     text   null,
  url_site      text   null,
  url_description text null,
  url_fetched_at bigint null,
  links         jsonb  not null default '[]'::jsonb,
  body          text   not null,
  tags          text[] not null default '{}',
  is_favorite   boolean not null default false,
  is_private    boolean not null default false,
  archived      boolean not null default false,
  created_at    bigint not null,
  updated_at    bigint not null
);
create index if not exists idx_insp_frag_user_created
  on public.inspiration_fragment (user_id, created_at desc);
create index if not exists idx_insp_frag_work
  on public.inspiration_fragment (work_id) where work_id is not null;
create index if not exists idx_insp_frag_collection
  on public.inspiration_fragment (collection_id) where collection_id is not null;

-- =============================================================================
-- 6. 问策（策略对话咨询）
--    对应产品模块：问策（/chat）
-- =============================================================================

create table if not exists public.wence_chat_session (
  id                    uuid    primary key default gen_random_uuid(),
  user_id               uuid    not null references public.app_user (id) on delete cascade,
  work_id               uuid    null references public.work (id) on delete set null,
  title                 text    not null default '',
  include_setting_index boolean not null default false,
  messages              jsonb   not null default '[]'::jsonb,
  updated_at            bigint  not null
);
create index if not exists idx_wence_chat_user_updated
  on public.wence_chat_session (user_id, updated_at desc);
create index if not exists idx_wence_chat_work_updated
  on public.wence_chat_session (work_id, updated_at desc)
  where work_id is not null;

-- =============================================================================
-- 7. 系统辅助表
-- =============================================================================

-- ---- 7.1 注册验证码（仅 service_role）----
create table if not exists public.email_otp_challenge (
  id            uuid        primary key default gen_random_uuid(),
  email         text        not null,
  purpose       text        not null check (purpose in ('signup')),
  code_hash     text        not null,
  expires_at    timestamptz not null,
  consumed_at   timestamptz null,
  attempt_count integer     not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_otp_email_created
  on public.email_otp_challenge (email, created_at desc);

-- ---- 7.2 联调测试 ----
create table if not exists public.test_content (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.app_user (id) on delete cascade,
  content    text        not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_test_content_user_created
  on public.test_content (user_id, created_at desc);

-- =============================================================================
-- 8. 行级安全策略（RLS）
-- =============================================================================

-- ---- 8.1 启用 RLS ----
alter table public.app_user               enable row level security;
alter table public.work                   enable row level security;
alter table public.volume                 enable row level security;
alter table public.chapter                enable row level security;
alter table public.chapter_snapshot       enable row level security;
alter table public.work_style_card        enable row level security;
alter table public.bible_character        enable row level security;
alter table public.bible_world_entry      enable row level security;
alter table public.bible_foreshadow       enable row level security;
alter table public.bible_timeline_event   enable row level security;
alter table public.bible_glossary_term    enable row level security;
alter table public.bible_chapter_template enable row level security;
alter table public.chapter_bible          enable row level security;
alter table public.writing_prompt_template enable row level security;
alter table public.writing_style_sample   enable row level security;
alter table public.logic_place_node       enable row level security;
alter table public.logic_place_event      enable row level security;
alter table public.inspiration_collection enable row level security;
alter table public.inspiration_fragment   enable row level security;

-- ========= tuiyan =========
create table if not exists public.tuiyan_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  work_id uuid not null references public.work(id) on delete cascade,
  updated_at bigint not null,
  chat_history jsonb not null default '[]'::jsonb,
  wence jsonb not null default '[]'::jsonb,
  finalized_node_ids jsonb not null default '[]'::jsonb,
  status_by_node_id jsonb not null default '{}'::jsonb,
  linked_ref_work_ids jsonb not null default '[]'::jsonb,
  mindmap jsonb not null default '{}'::jsonb,
  scenes jsonb not null default '[]'::jsonb,
  unique(user_id, work_id)
);
create index if not exists idx_tuiyan_state_user_work on public.tuiyan_state (user_id, work_id);
alter table public.tuiyan_state            enable row level security;
alter table public.wence_chat_session     enable row level security;
alter table public.test_content           enable row level security;
alter table public.email_otp_challenge    enable row level security;

-- ---- 8.2 用户自身 ----
drop policy if exists app_user_self on public.app_user;
create policy app_user_self on public.app_user for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---- 8.3 作品主表（四操作分拆）----
drop policy if exists work_select on public.work;
drop policy if exists work_insert on public.work;
drop policy if exists work_update on public.work;
drop policy if exists work_delete on public.work;
create policy work_select on public.work for select using (auth.uid() = user_id);
create policy work_insert on public.work for insert with check (auth.uid() = user_id);
create policy work_update on public.work for update using (auth.uid() = user_id);
create policy work_delete on public.work for delete using (auth.uid() = user_id);

-- ---- 8.4 作品子表统一策略（通过 work.user_id 校验）----

-- 宏：EXISTS (select 1 from public.work w where w.id = <fk> and w.user_id = auth.uid())
-- 下面对每张表应用相同模式：

drop policy if exists volume_all   on public.volume;
create policy volume_all on public.volume for all using (
  exists (select 1 from public.work w where w.id = volume.work_id and w.user_id = auth.uid())
);

drop policy if exists chapter_all  on public.chapter;
create policy chapter_all on public.chapter for all using (
  exists (select 1 from public.work w where w.id = chapter.work_id and w.user_id = auth.uid())
);

drop policy if exists snapshot_all on public.chapter_snapshot;
create policy snapshot_all on public.chapter_snapshot for all using (
  exists (
    select 1 from public.chapter c
    join public.work w on w.id = c.work_id
    where c.id = chapter_snapshot.chapter_id and w.user_id = auth.uid()
  )
);

drop policy if exists wsc_all on public.work_style_card;
create policy wsc_all on public.work_style_card for all using (
  exists (select 1 from public.work w where w.id = work_style_card.work_id and w.user_id = auth.uid())
);

drop policy if exists bc_all  on public.bible_character;
drop policy if exists bw_all  on public.bible_world_entry;
drop policy if exists bf_all  on public.bible_foreshadow;
drop policy if exists bt_all  on public.bible_timeline_event;
drop policy if exists bgt_all on public.bible_glossary_term;
drop policy if exists bct_all on public.bible_chapter_template;
drop policy if exists cb_all  on public.chapter_bible;
drop policy if exists wpt_all on public.writing_prompt_template;
drop policy if exists wss_all on public.writing_style_sample;
drop policy if exists lpn_all on public.logic_place_node;
drop policy if exists lpe_all on public.logic_place_event;

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
create policy bgt_all on public.bible_glossary_term for all using (
  exists (select 1 from public.work w where w.id = bible_glossary_term.work_id and w.user_id = auth.uid())
);
create policy bct_all on public.bible_chapter_template for all using (
  exists (select 1 from public.work w where w.id = bible_chapter_template.work_id and w.user_id = auth.uid())
);
create policy cb_all on public.chapter_bible for all using (
  exists (select 1 from public.work w where w.id = chapter_bible.work_id and w.user_id = auth.uid())
);
create policy wpt_all on public.writing_prompt_template for all using (
  exists (select 1 from public.work w where w.id = writing_prompt_template.work_id and w.user_id = auth.uid())
);
create policy wss_all on public.writing_style_sample for all using (
  exists (select 1 from public.work w where w.id = writing_style_sample.work_id and w.user_id = auth.uid())
);
create policy lpn_all on public.logic_place_node for all using (
  exists (select 1 from public.work w where w.id = logic_place_node.work_id and w.user_id = auth.uid())
);
create policy lpe_all on public.logic_place_event for all using (
  exists (select 1 from public.work w where w.id = logic_place_event.work_id and w.user_id = auth.uid())
);

-- ---- 8.5 用户级表 ----

drop policy if exists icoll_all on public.inspiration_collection;
create policy icoll_all on public.inspiration_collection for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists ifr_all on public.inspiration_fragment;
create policy ifr_all on public.inspiration_fragment for all using (
  auth.uid() = user_id
  and (
    inspiration_fragment.collection_id is null
    or exists (
      select 1 from public.inspiration_collection c
      where c.id = inspiration_fragment.collection_id and c.user_id = auth.uid()
    )
  )
  and (
    inspiration_fragment.work_id is null
    or exists (
      select 1 from public.work w
      where w.id = inspiration_fragment.work_id and w.user_id = auth.uid()
    )
  )
)
with check (
  auth.uid() = user_id
  and (
    inspiration_fragment.collection_id is null
    or exists (
      select 1 from public.inspiration_collection c
      where c.id = inspiration_fragment.collection_id and c.user_id = auth.uid()
    )
  )
  and (
    inspiration_fragment.work_id is null
    or exists (
      select 1 from public.work w
      where w.id = inspiration_fragment.work_id and w.user_id = auth.uid()
    )
  )
);

drop policy if exists tuiyan_state_all on public.tuiyan_state;
create policy tuiyan_state_all on public.tuiyan_state for all using (
  exists (
    select 1 from public.work w
    where w.id = tuiyan_state.work_id and w.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.work w
    where w.id = tuiyan_state.work_id and w.user_id = auth.uid()
  )
);

drop policy if exists wcs_all on public.wence_chat_session;
create policy wcs_all on public.wence_chat_session for all
  using (wence_chat_session.user_id = auth.uid());

-- ---- 8.6 其他 ----
drop policy if exists tc_all on public.test_content;
create policy tc_all on public.test_content for all using (auth.uid() = user_id);

-- email_otp_challenge：不建 policy → 仅 service_role 可访问

-- =============================================================================
-- 完成。
-- =============================================================================
