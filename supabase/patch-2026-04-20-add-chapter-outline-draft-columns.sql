-- =============================================================================
-- 留白写作 · Supabase 增量补丁
-- 主题：chapter 表补齐「推演细纲推送」字段（outline_draft / outline_node_id / outline_pushed_at）
-- 日期：2026-04-20
--
-- 用途：
-- - 修复 PostgREST 报错：
--   "Could not find the 'outline_draft' column of 'chapter' in the schema cache"
-- - 为「章纲」Tab / 推演推送细纲功能提供持久化字段
--
-- 执行位置：
-- - Supabase Dashboard → SQL Editor
--
-- 特性：
-- - 可重复执行（IF NOT EXISTS）
-- =============================================================================

alter table public.chapter add column if not exists outline_draft     text   null;
alter table public.chapter add column if not exists outline_node_id   text   null;
alter table public.chapter add column if not exists outline_pushed_at bigint null;

