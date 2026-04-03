-- 一次性：已有 auth.users 账号但 public.app_user 为空时，在 Supabase SQL Editor 执行。
-- 新库若已执行 schema.sql 中的 trigger，之后注册会自动写入 app_user；本脚本用于补历史用户。
insert into public.app_user (id, email)
select id, email from auth.users
on conflict (id) do nothing;
