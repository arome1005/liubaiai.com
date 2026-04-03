-- 可选：仅当「未跑过 supabase/schema.sql 第 3 步」时需单独执行。
-- 主脚本已包含：insert into app_user … select from auth.users。
insert into public.app_user (id, email)
select id, email from auth.users
on conflict (id) do nothing;
