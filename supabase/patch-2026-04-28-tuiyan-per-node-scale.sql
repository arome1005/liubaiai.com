-- 推演：分一级大纲目标卷数、分卷章细纲条数（与客户端 TuiyanState 对齐）
alter table public.tuiyan_state
  add column if not exists planning_outline_target_volumes_by_node_id jsonb not null default '{}'::jsonb,
  add column if not exists planning_volume_target_chapters_by_node_id jsonb not null default '{}'::jsonb;
