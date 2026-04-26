-- =============================================================================
-- 增量补丁 2026-04-26
-- 为 tuiyan_state 表全量补齐缺失的列（针对旧版本数据库）
-- 在 Supabase SQL Editor 中执行此文件即可
-- =============================================================================

-- 1. 全量补齐所有 planning_* / 推演相关列
ALTER TABLE public.tuiyan_state
  ADD COLUMN IF NOT EXISTS chat_history             jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS wence                    jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS finalized_node_ids       jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status_by_node_id        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS linked_ref_work_ids      jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS mindmap                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS scenes                   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS selected_prompt_template_id          text  NULL,
  ADD COLUMN IF NOT EXISTS planning_idea                        text  NULL,
  ADD COLUMN IF NOT EXISTS planning_tree                        jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS planning_drafts_by_node_id           jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS planning_meta_by_node_id             jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS planning_pushed_outlines             jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS planning_selected_node_id            text  NULL,
  ADD COLUMN IF NOT EXISTS planning_structured_meta_by_node_id  jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. 确保唯一约束存在（upsert on_conflict 需要）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tuiyan_state'::regclass
      AND contype  = 'u'
      AND conname LIKE '%user_id_work_id%'
  ) THEN
    ALTER TABLE public.tuiyan_state
      ADD CONSTRAINT tuiyan_state_user_id_work_id_key UNIQUE (user_id, work_id);
  END IF;
END $$;

-- 3. 通知 PostgREST 重载 schema cache（重要！否则要等几分钟）
NOTIFY pgrst, 'reload schema';

-- 4. 验证：应该看到全部 15 列 + 至少 1 行约束
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'tuiyan_state'
ORDER BY ordinal_position;

SELECT conname
FROM pg_constraint
WHERE conrelid = 'public.tuiyan_state'::regclass
  AND contype  = 'u';
