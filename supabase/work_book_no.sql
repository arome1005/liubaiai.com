-- 作品书号：用户内唯一，供短路径 /work/{book_no}/… 使用
-- 在 Supabase SQL Editor 执行；未执行时前端仍可用 UUID 访问

alter table public.work add column if not exists book_no bigint null;

create unique index if not exists idx_work_user_book_no
  on public.work (user_id, book_no)
  where book_no is not null;

comment on column public.work.book_no is '用户内唯一书号，用于 /work/{book_no}/ 路由';
