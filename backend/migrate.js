import { createPool } from "./db.js";

const pool = createPool();

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
  updated_at bigint not null
);

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

