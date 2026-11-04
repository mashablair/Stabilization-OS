-- Separate vision content from actionable tasks. Existing records are untouched.
create table if not exists public.north_star (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'card' check (kind in ('vision', 'card')),
  title text not null,
  vision text not null default '',
  why text not null default '',
  ideas text not null default '',
  domain text not null default 'BUSINESS' check (domain in ('BUSINESS', 'LIFE_ADMIN')),
  source_task_id text,
  sort_order integer not null default 0,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, source_task_id)
);
create index if not exists north_star_user_idx on public.north_star(user_id);
create unique index if not exists north_star_one_vision on public.north_star(user_id) where kind = 'vision';
alter table public.north_star enable row level security;
drop policy if exists "Users own north star" on public.north_star;
create policy "Users own north star" on public.north_star for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.north_star to authenticated;
notify pgrst, 'reload schema';
