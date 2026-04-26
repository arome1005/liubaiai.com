-- =============================================================================
-- 留白写作 · 已有 Supabase 项目增量对齐（2026）
--
-- 用途：在 Supabase Dashboard → SQL Editor 中整段执行，将「旧库」补齐到当前
--       应用所需的列 / 索引 / RLS 策略（与 supabase/schema.sql 一致）。
-- 特性：可重复执行（IF NOT EXISTS / DROP IF EXISTS）；执行前请自行备份。
--
-- 前提：public.app_user、public.work 已存在（本应用常规部署均满足）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 流光集合（须先于碎片上的 collection_id 外键）
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 2. 流光碎片：表若已存在则只补列（解决「schema cache 缺列」）
-- -----------------------------------------------------------------------------
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

-- 旧表可能缺列：逐列补齐（顺序无关，但外键列在集合表已存在后安全）
alter table public.inspiration_fragment
  add column if not exists work_id uuid null references public.work (id) on delete set null;
alter table public.inspiration_fragment
  add column if not exists collection_id uuid null references public.inspiration_collection (id) on delete set null;
alter table public.inspiration_fragment add column if not exists title text null;
alter table public.inspiration_fragment add column if not exists source_name text null;
alter table public.inspiration_fragment add column if not exists source_url text null;
alter table public.inspiration_fragment add column if not exists url_title text null;
alter table public.inspiration_fragment add column if not exists url_site text null;
alter table public.inspiration_fragment add column if not exists url_description text null;
alter table public.inspiration_fragment add column if not exists url_fetched_at bigint null;
alter table public.inspiration_fragment
  add column if not exists links jsonb not null default '[]'::jsonb;
alter table public.inspiration_fragment add column if not exists tags text[] not null default '{}';
alter table public.inspiration_fragment add column if not exists is_favorite boolean not null default false;
alter table public.inspiration_fragment add column if not exists is_private boolean not null default false;
alter table public.inspiration_fragment add column if not exists archived boolean not null default false;

-- 若 links 曾以可空形式存在，补齐空值（可选安全网）
update public.inspiration_fragment
set links = coalesce(links, '[]'::jsonb)
where links is null;

create index if not exists idx_insp_frag_user_created
  on public.inspiration_fragment (user_id, created_at desc);
create index if not exists idx_insp_frag_work
  on public.inspiration_fragment (work_id) where work_id is not null;
create index if not exists idx_insp_frag_collection
  on public.inspiration_fragment (collection_id) where collection_id is not null;

-- -----------------------------------------------------------------------------
-- 3. 推演（V0 推演页）状态表：新装或旧列补齐
-- -----------------------------------------------------------------------------
create table if not exists public.tuiyan_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  work_id uuid not null references public.work (id) on delete cascade,
  updated_at bigint not null,
  chat_history jsonb not null default '[]'::jsonb,
  wence jsonb not null default '[]'::jsonb,
  finalized_node_ids jsonb not null default '[]'::jsonb,
  status_by_node_id jsonb not null default '{}'::jsonb,
  linked_ref_work_ids jsonb not null default '[]'::jsonb,
  mindmap jsonb not null default '{}'::jsonb,
  scenes jsonb not null default '[]'::jsonb,
  unique (user_id, work_id)
);

alter table public.tuiyan_state
  add column if not exists linked_ref_work_ids jsonb not null default '[]'::jsonb;
alter table public.tuiyan_state
  add column if not exists mindmap jsonb not null default '{}'::jsonb;
alter table public.tuiyan_state
  add column if not exists scenes jsonb not null default '[]'::jsonb;
alter table public.tuiyan_state
  add column if not exists planning_pushed_outlines jsonb not null default '[]'::jsonb;
alter table public.tuiyan_state
  add column if not exists planning_structured_meta_by_node_id jsonb not null default '{}'::jsonb;

create index if not exists idx_tuiyan_state_user_work
  on public.tuiyan_state (user_id, work_id);

-- -----------------------------------------------------------------------------
-- 3.1 章节表：推演细纲推送字段（解决「schema cache 缺列 outline_draft」）
-- -----------------------------------------------------------------------------
-- 说明：也可改用单独补丁文件执行：
--   supabase/patch-2026-04-20-add-chapter-outline-draft-columns.sql
alter table public.chapter add column if not exists outline_draft     text   null;
alter table public.chapter add column if not exists outline_node_id   text   null;
alter table public.chapter add column if not exists outline_pushed_at bigint null;

-- -----------------------------------------------------------------------------
-- 4. RLS 与策略（与 schema.sql 一致，可重复执行）
-- -----------------------------------------------------------------------------
alter table public.inspiration_collection enable row level security;
alter table public.inspiration_fragment   enable row level security;
alter table public.tuiyan_state           enable row level security;

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

-- =============================================================================
-- 执行完成后，Supabase 会刷新 schema cache；客户端若仍报旧列，可稍候或重载页面。
-- =============================================================================
