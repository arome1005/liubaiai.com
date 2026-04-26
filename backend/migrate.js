import { createPool } from "./db.js";

const pool = createPool();

/**
 * 与 `supabase/schema.sql` 的关系：
 * - **Supabase 托管**：在控制台 SQL Editor 执行仓库根目录 `supabase/schema.sql`（含 RLS、`app_user` 触发器等）。
 * - **本脚本**：面向自建 VPS / 本地 Postgres 的 legacy 建表，**不含** Supabase Auth 侧策略；两套 DDL 可能长期分叉，勿假定与云端逐字一致。
 */
const SQL = `
create extension if not exists pgcrypto;

-- ========= core writing =========
-- user_id = Supabase auth.users.id（不设外键，便于本地 Postgres 开发；生产建议与 Supabase 同一库）
create table if not exists work (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  created_at bigint not null,
  updated_at bigint not null,
  progress_cursor uuid null
);
create index if not exists idx_work_user_updated on work(user_id, updated_at desc);

create table if not exists volume (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references work(id) on delete cascade,
  title text not null,
  "order" integer not null,
  created_at bigint not null
);
create index if not exists idx_volume_work_order on volume(work_id, "order");

create table if not exists chapter (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references work(id) on delete cascade,
  volume_id uuid not null references volume(id) on delete restrict,
  title text not null,
  content text not null,
  summary text null,
  "order" integer not null,
  updated_at bigint not null,
  word_count_cache integer null
);
create index if not exists idx_chapter_work_order on chapter(work_id, "order");
create index if not exists idx_chapter_volume_order on chapter(volume_id, "order");

create table if not exists chapter_snapshot (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapter(id) on delete cascade,
  content text not null,
  created_at bigint not null
);
create index if not exists idx_snapshot_chapter_created on chapter_snapshot(chapter_id, created_at desc);

create table if not exists work_style_card (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null unique references work(id) on delete cascade,
  pov text not null default '',
  tone text not null default '',
  banned_phrases text not null default '',
  style_anchor text not null default '',
  extra_rules text not null default '',
  sentence_rhythm text null,
  punctuation_style text null,
  dialogue_density text null,
  emotion_style text null,
  narrative_distance text null,
  updated_at bigint not null
);
-- migration: add style fingerprint columns to existing tables
alter table work_style_card add column if not exists sentence_rhythm text null;
alter table work_style_card add column if not exists punctuation_style text null;
alter table work_style_card add column if not exists dialogue_density text null;
alter table work_style_card add column if not exists emotion_style text null;
alter table work_style_card add column if not exists narrative_distance text null;

-- ========= bible =========
create table if not exists bible_character (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references work(id) on delete cascade,
  name text not null,
  motivation text not null default '',
  relationships text not null default '',
  voice_notes text not null default '',
  taboos text not null default '',
  sort_order integer not null default 0,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists idx_bible_character_work_sort on bible_character(work_id, sort_order);

create table if not exists bible_world_entry (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references work(id) on delete cascade,
  entry_kind text not null,
  title text not null,
  body text not null default '',
  sort_order integer not null default 0,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists idx_bible_world_work_sort on bible_world_entry(work_id, sort_order);

create table if not exists bible_foreshadow (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references work(id) on delete cascade,
  title text not null,
  planted_where text not null default '',
  planned_resolve text not null default '',
  status text not null default 'pending',
  note text not null default '',
  chapter_id uuid null references chapter(id) on delete set null,
  sort_order integer not null default 0,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists idx_foreshadow_work_sort on bible_foreshadow(work_id, sort_order);

create table if not exists bible_timeline_event (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references work(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  note text not null default '',
  chapter_id uuid null references chapter(id) on delete set null,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists idx_timeline_work_sort on bible_timeline_event(work_id, sort_order);

create table if not exists bible_chapter_template (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references work(id) on delete cascade,
  name text not null,
  goal_text text not null default '',
  forbid_text text not null default '',
  pov_text text not null default '',
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists idx_template_work_updated on bible_chapter_template(work_id, updated_at desc);

create table if not exists chapter_bible (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null unique references chapter(id) on delete cascade,
  work_id uuid not null references work(id) on delete cascade,
  goal_text text not null default '',
  forbid_text text not null default '',
  pov_text text not null default '',
  scene_stance text not null default '',
  character_state text not null default '',
  updated_at bigint not null
);
create index if not exists idx_chapter_bible_work_updated on chapter_bible(work_id, updated_at desc);

create table if not exists bible_glossary_term (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references work(id) on delete cascade,
  term text not null,
  category text not null,
  note text not null default '',
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists idx_glossary_work_term on bible_glossary_term(work_id, term);

create table if not exists writing_prompt_template (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references work(id) on delete cascade,
  category text not null default '',
  title text not null default '',
  body text not null default '',
  sort_order integer not null default 0,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists idx_wpt_work_sort on writing_prompt_template(work_id, sort_order);
create index if not exists idx_wpt_work_category on writing_prompt_template(work_id, category);

create table if not exists writing_style_sample (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references work(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  sort_order integer not null default 0,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists idx_wss_work_sort on writing_style_sample(work_id, sort_order);

create table if not exists inspiration_fragment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  work_id uuid null references work(id) on delete set null,
  collection_id uuid null references inspiration_collection(id) on delete set null,
  title text null,
  source_name text null,
  source_url text null,
  url_title text null,
  url_site text null,
  url_description text null,
  url_fetched_at bigint null,
  links jsonb not null default '[]'::jsonb,
  body text not null,
  tags text[] not null default '{}',
  is_favorite boolean not null default false,
  is_private boolean not null default false,
  archived boolean not null default false,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists idx_insp_frag_user_created on inspiration_fragment(user_id, created_at desc);

-- ========= tuiyan =========
create table if not exists tuiyan_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  work_id uuid not null references work(id) on delete cascade,
  updated_at bigint not null,
  chat_history jsonb not null default '[]'::jsonb,
  wence jsonb not null default '[]'::jsonb,
  finalized_node_ids jsonb not null default '[]'::jsonb,
  status_by_node_id jsonb not null default '{}'::jsonb,
  linked_ref_work_ids jsonb not null default '[]'::jsonb,
  mindmap jsonb not null default '{}'::jsonb,
  scenes jsonb not null default '[]'::jsonb,
  selected_prompt_template_id text null,
  planning_idea text null,
  planning_tree jsonb not null default '[]'::jsonb,
  planning_drafts_by_node_id jsonb not null default '{}'::jsonb,
  planning_meta_by_node_id jsonb not null default '{}'::jsonb,
  planning_selected_node_id text null,
  planning_structured_meta_by_node_id jsonb not null default '{}'::jsonb,
  unique(user_id, work_id)
);
alter table tuiyan_state
  add column if not exists selected_prompt_template_id text null,
  add column if not exists planning_idea text null,
  add column if not exists planning_tree jsonb not null default '[]'::jsonb,
  add column if not exists planning_drafts_by_node_id jsonb not null default '{}'::jsonb,
  add column if not exists planning_meta_by_node_id jsonb not null default '{}'::jsonb,
  add column if not exists planning_pushed_outlines jsonb not null default '[]'::jsonb,
  add column if not exists planning_selected_node_id text null,
  add column if not exists planning_structured_meta_by_node_id jsonb not null default '{}'::jsonb;
create index if not exists idx_tuiyan_state_user_work on tuiyan_state(user_id, work_id);

-- ========= reference library (minimal storage tables; search index can be added later) =========
create table if not exists reference_library_entry (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_name text null,
  category text null,
  total_chars integer not null default 0,
  chunk_count integer not null default 0,
  chapter_head_count integer not null default 0,
  created_at bigint not null,
  updated_at bigint not null
);

create table if not exists reference_chunk (
  id uuid primary key default gen_random_uuid(),
  ref_work_id uuid not null references reference_library_entry(id) on delete cascade,
  ordinal integer not null,
  content text not null,
  embeddings text null,
  is_chapter_head boolean not null default false,
  chapter_title text null
);
create unique index if not exists uq_ref_chunk_ordinal on reference_chunk(ref_work_id, ordinal);

create table if not exists reference_chapter_head (
  id uuid primary key default gen_random_uuid(),
  ref_work_id uuid not null references reference_library_entry(id) on delete cascade,
  chunk_id uuid not null references reference_chunk(id) on delete cascade,
  ordinal integer not null,
  start_offset integer not null,
  title text not null
);
create index if not exists idx_ref_head_work_ord on reference_chapter_head(ref_work_id, ordinal);

create table if not exists reference_tag (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at bigint not null
);

create table if not exists reference_excerpt (
  id uuid primary key default gen_random_uuid(),
  ref_work_id uuid not null references reference_library_entry(id) on delete cascade,
  chunk_id uuid not null references reference_chunk(id) on delete cascade,
  ordinal integer not null,
  start_offset integer not null,
  end_offset integer not null,
  text text not null,
  note text not null default '',
  created_at bigint not null,
  linked_work_id uuid null,
  linked_chapter_id uuid null
);
create index if not exists idx_excerpt_ref_created on reference_excerpt(ref_work_id, created_at desc);

create table if not exists reference_excerpt_tag (
  id uuid primary key default gen_random_uuid(),
  excerpt_id uuid not null references reference_excerpt(id) on delete cascade,
  tag_id uuid not null references reference_tag(id) on delete cascade
);
create unique index if not exists uq_excerpt_tag on reference_excerpt_tag(excerpt_id, tag_id);

-- ========= phase1: email OTP signup（建号在 Supabase Auth） =========
create table if not exists email_otp_challenge (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null check (purpose in ('signup')),
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_otp_email_created on email_otp_challenge(email, created_at desc);

-- ========= test_content（联调云端写入） =========
create table if not exists test_content (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_test_content_user_created on test_content(user_id, created_at desc);

-- §11 步 19：卷/章摘要结构（与 Supabase schema 对齐）
alter table volume add column if not exists summary text null;
alter table chapter add column if not exists summary_updated_at bigint null;
-- §11 步 22：概要流水线元数据（覆盖章节范围，闭区间）
alter table chapter add column if not exists summary_scope_from integer null;
alter table chapter add column if not exists summary_scope_to integer null;

-- §11 步 29：作品封面（data URL，宜控制体积）
alter table work add column if not exists cover_image text null;
-- §11 步 30：留白作品标签（text[]，装配器侧写）
alter table work add column if not exists tags text[] not null default '{}';
alter table work add column if not exists description text null;
alter table work add column if not exists status text not null default 'serializing';

-- §11 步 21：本章人物状态备忘（与 Dexie / 装配器一致）
alter table chapter_bible add column if not exists character_state text not null default '';

-- §G-07：流光集合（须先于 inspiration_fragment.collection_id）
create table if not exists inspiration_collection (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  name text not null default '',
  sort_order integer not null default 0,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists idx_insp_coll_user_sort on inspiration_collection(user_id, sort_order);

alter table inspiration_fragment add column if not exists collection_id uuid null references inspiration_collection(id) on delete set null;
create index if not exists idx_insp_frag_collection on inspiration_fragment(collection_id) where collection_id is not null;

-- 步 46（问策后续）：跨设备同步（云端会话表）
create table if not exists wence_chat_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  work_id uuid null references work(id) on delete set null,
  title text not null default '',
  include_setting_index boolean not null default false,
  messages jsonb not null default '[]'::jsonb,
  updated_at bigint not null
);
create index if not exists idx_wence_chat_user_updated on wence_chat_session(user_id, updated_at desc);
create index if not exists idx_wence_chat_work_updated on wence_chat_session(work_id, updated_at desc) where work_id is not null;

-- §11 步 34：推演地图 / 地点-事件（独立表）
create table if not exists logic_place_node (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references work(id) on delete cascade,
  name text not null,
  note text not null default '',
  x integer not null default 50,
  y integer not null default 50,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists idx_logic_place_node_work_updated on logic_place_node(work_id, updated_at desc);

create table if not exists logic_place_event (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references work(id) on delete cascade,
  place_id uuid not null references logic_place_node(id) on delete cascade,
  label text not null,
  note text not null default '',
  chapter_id uuid null references chapter(id) on delete set null,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists idx_logic_place_event_work_updated on logic_place_event(work_id, updated_at desc);
create index if not exists idx_logic_place_event_place_updated on logic_place_event(place_id, updated_at desc);

-- ========= 步骤3：推演构思层 =========
-- 每部作品对应一条构思记录，记录类型标签、核心矛盾、世界规则、主角动机。
-- stage: draft（草稿）| finalized（已定稿，进入卷纲阶段后锁定）
create table if not exists work_concept (
  id                       uuid primary key default gen_random_uuid(),
  work_id                  uuid not null references work(id) on delete cascade,
  user_id                  uuid not null,
  genre                    text[] not null default '{}',
  core_conflict            text not null default '',
  world_rules              text not null default '',
  protagonist_motivation   text not null default '',
  raw_text                 text not null default '',
  imported_card_ids        uuid[] not null default '{}',
  stage                    text not null default 'draft'
                             check (stage in ('draft', 'finalized')),
  created_at               bigint not null,
  updated_at               bigint not null,
  unique (work_id)
);
create index if not exists idx_work_concept_work on work_concept(work_id);
create index if not exists idx_work_concept_user_updated on work_concept(user_id, updated_at desc);

-- ========= 步骤4：推演专用提示词模板 =========
-- 与 writing_prompt_template 物理隔离，按推演阶段分类。
-- stage: concept | volume | chapter | detail_outline
-- is_default=true 的行为系统内置模板（user_id 可为空），用户行为 user_id 非空。
create table if not exists tuiyan_prompt_template (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid null,
  stage       text not null
                check (stage in ('concept', 'volume', 'chapter', 'detail_outline')),
  title       text not null default '',
  body        text not null default '',
  is_default  boolean not null default false,
  sort_order  integer not null default 0,
  created_at  bigint not null,
  updated_at  bigint not null
);
create index if not exists idx_tuiyan_pt_user_stage on tuiyan_prompt_template(user_id, stage);
create index if not exists idx_tuiyan_pt_default_stage on tuiyan_prompt_template(stage)
  where is_default = true;

-- ========= 步骤5：chapter 表新增章纲关联列 =========
-- outline_draft:      推演推送后写入的细纲快照（只读，不可被推演侧再次覆盖）
-- outline_node_id:    对应 tuiyan_state.scenes 中的节点 id（字符串，非 FK）
-- outline_pushed_at:  推送时间戳；非 null 表示已推送，API 层需拒绝重复推送（返回 409）
alter table chapter
  add column if not exists outline_draft      text    null,
  add column if not exists outline_node_id    text    null,
  add column if not exists outline_pushed_at  bigint  null;

-- ========= 步骤6：全局提示词库（Sprint 1 建表） =========
-- 与 per-work writing_prompt_template 物理隔离；user_id 为 Supabase auth.users.id
-- type 枚举：continue | outline | volume | scene | style | opening | character | worldbuilding
-- status：draft | submitted | approved | rejected
-- tags 用 text[] 存储，RLS 按 user_id + status 隔离可见性
create table if not exists prompt_template (
  id          uuid    primary key default gen_random_uuid(),
  user_id     uuid    not null,
  title       text    not null default '',
  type        text    not null default 'continue',
  tags        text[]  not null default '{}',
  body        text    not null default '',
  status      text    not null default 'draft',
  sort_order  integer not null default 0,
  created_at  bigint  not null,
  updated_at  bigint  not null
);
create index if not exists idx_prompt_tpl_user_type    on prompt_template(user_id, type);
create index if not exists idx_prompt_tpl_user_status  on prompt_template(user_id, status);
create index if not exists idx_prompt_tpl_user_updated on prompt_template(user_id, updated_at desc);
create index if not exists idx_prompt_tpl_approved     on prompt_template(status, updated_at desc)
  where status = 'approved';

-- ========= 步骤7：提示词库 Sprint 2 =========
-- 7a. 新增 review_note 列（管理员驳回原因，可为 null）
alter table prompt_template
  add column if not exists review_note text null;

-- 7c. 新增藏经元数据列（slots / source_kind / source_ref_work_id / source_excerpt_ids / source_note）
alter table prompt_template
  add column if not exists slots            text[]  null,
  add column if not exists source_kind      text    null,
  add column if not exists source_ref_work_id text  null,
  add column if not exists source_excerpt_ids text[] null,
  add column if not exists source_note      text    null;

-- 7b. RLS 策略（本地 Postgres 开发时 RLS 未启用不影响功能；Supabase 生产须运行此段）
--   draft/submitted/rejected：仅 owner 可读写
--   approved：所有已登录用户可读；owner 可提交/撤回（改回 submitted/draft）；
--             管理员（service_role）可改为 approved/rejected
--
-- 如果是 Supabase 部署，取消以下注释并执行：
-- alter table prompt_template enable row level security;
--
-- create policy "owner_all" on prompt_template
--   for all to authenticated
--   using  (user_id = auth.uid())
--   with check (user_id = auth.uid());
--
-- create policy "approved_read" on prompt_template
--   for select to authenticated
--   using (status = 'approved');
`;

async function main() {
  try {
    await pool.query("select 1 as ok");
    await pool.query(SQL);
    console.log("OK: migrated");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("MIGRATE_FAILED:", e?.message ?? e);
  process.exit(1);
});

