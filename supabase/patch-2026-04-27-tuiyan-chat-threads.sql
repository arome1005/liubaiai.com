-- =============================================================================
-- 推演多会话对话：chat_threads + active_chat_thread_id
-- 在 Supabase SQL Editor 中执行；执行后 NOTIFY 刷新 PostgREST schema cache
-- =============================================================================

ALTER TABLE public.tuiyan_state
  ADD COLUMN IF NOT EXISTS chat_threads jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS active_chat_thread_id text NULL;

NOTIFY pgrst, 'reload schema';
