-- 合并补丁：锦囊人物「经典台词样例」+ 全局提示词库「介绍 / 使用说明」
-- 在 Supabase SQL Editor 中整段执行一次即可（幂等：列已存在则跳过）

-- 1) 锦囊人物：经典台词样例（N7，生辉声音锁注入）
alter table public.bible_character
  add column if not exists quote_samples text not null default '';

-- 2) 全局提示词库：对外介绍 + 使用说明（与 body 分离，列表仅展示 intro）
alter table public.prompt_template
  add column if not exists intro text not null default '',
  add column if not exists usage_method text not null default '';

comment on column public.prompt_template.intro is
  'Public/safe description shown in library cards; full prompt stays in body.';
comment on column public.prompt_template.usage_method is
  'Short usage hint for the author; optional.';
