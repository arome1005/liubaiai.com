-- =============================================================================
-- 远程 Supabase 与当前客户端对齐：tuiyan_state 列 + 唯一约束、bible_character.quote_samples
-- 在 Dashboard → SQL Editor 中整段执行一次（可重复执行，已用 IF NOT EXISTS / DO 块防重复）
-- 执行后如仍偶发 400，等 1～2 分钟或再执行一次末尾的 NOTIFY
-- =============================================================================

-- --- bible_character：生辉 / 书斋人物经典台词样例 ---
ALTER TABLE public.bible_character
  ADD COLUMN IF NOT EXISTS quote_samples text NOT NULL DEFAULT '';

-- --- tuiyan_state：与 src/storage/writing-store-supabase.ts upsertTuiyanState 载荷一致 ---
ALTER TABLE public.tuiyan_state
  ADD COLUMN IF NOT EXISTS chat_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS wence jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS finalized_node_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status_by_node_id jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS linked_ref_work_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS mindmap jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS scenes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS selected_prompt_template_id text NULL,
  ADD COLUMN IF NOT EXISTS planning_idea text NULL,
  ADD COLUMN IF NOT EXISTS planning_tree jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS planning_drafts_by_node_id jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS planning_meta_by_node_id jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS planning_pushed_outlines jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS planning_selected_node_id text NULL,
  ADD COLUMN IF NOT EXISTS planning_structured_meta_by_node_id jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS chat_threads jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS active_chat_thread_id text NULL,
  ADD COLUMN IF NOT EXISTS reference_bindings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reference_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS planning_outline_target_volumes_by_node_id jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS planning_volume_target_chapters_by_node_id jsonb NOT NULL DEFAULT '{}'::jsonb;

-- upsert(..., onConflict: user_id,work_id) 依赖 (user_id, work_id) 上唯一约束
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tuiyan_state'::regclass
      AND contype = 'u'
      AND conname LIKE '%user_id%work_id%'
  ) THEN
    ALTER TABLE public.tuiyan_state
      ADD CONSTRAINT tuiyan_state_user_id_work_id_key UNIQUE (user_id, work_id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
