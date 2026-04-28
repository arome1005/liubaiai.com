-- =============================================================================
-- 推演参考仿写策略：reference_bindings + reference_policy
-- 在 Supabase SQL Editor 中执行；执行后 NOTIFY 刷新 PostgREST schema cache
-- =============================================================================

ALTER TABLE public.tuiyan_state
  ADD COLUMN IF NOT EXISTS reference_bindings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reference_policy jsonb NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';

