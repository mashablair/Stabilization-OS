-- Balance OS: initial schema
-- All tables include user_id for row-level security

create table categories (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null,
  domain text not null,
  context_card jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id text not null references categories(id) on delete cascade,
  domain text not null,
  title text not null,
  notes text,
  status text not null default 'BACKLOG',
  priority integer not null default 2,
  due_date text,
  soft_deadline text,
  blocked_by_task_ids text[],
  estimate_minutes numeric,
  actual_seconds_total numeric not null default 0,
  money_impact numeric,
  friction_note text,
  next_action_at text,
  pending_reason text,
  context_card jsonb not null default '{}',
  subtasks jsonb not null default '[]',
  time_tracking_mode text default 'TASK',
  created_at text not null,
  updated_at text not null,
  completed_at text
);

create table time_entries (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null references tasks(id) on delete cascade,
  subtask_id text,
  start_at text not null,
  end_at text,
  seconds numeric not null default 0,
  pause_reason text
);

create table weekly_reviews (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start text not null,
  answers jsonb not null default '{}',
  created_at text not null
);

create table timer_state (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null,
  subtask_id text,
  time_entry_id text not null,
  started_at text not null,
  paused_at text,
  accumulated_seconds numeric not null default 0
);

create table app_settings (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (user_id, id),
  role text not null default 'Life',
  available_minutes numeric not null default 120,
  builder_available_minutes numeric not null default 120,
  dark_mode boolean not null default false,
  hidden_category_ids text[]
);

create table daily_capacity (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  domain text not null,
  minutes numeric not null
);

create table wins (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  date text not null,
  tags text[] not null default '{}',
  created_at text not null
);

create table habits (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null,
  schedule_type text not null,
  weekdays integer[],
  every_n_days integer,
  times_per_week integer,
  goal_target numeric,
  unit text,
  start_date text not null,
  time_of_day text not null default 'ANYTIME',
  show_in_today boolean not null default true,
  allow_partial boolean not null default false,
  allow_skip boolean not null default true,
  color text,
  icon text,
  archived_at text,
  sort_order integer not null default 0,
  created_at text not null,
  updated_at text not null
);

create table habit_logs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id text not null references habits(id) on delete cascade,
  date text not null,
  status text not null default 'NONE',
  value numeric,
  note text,
  created_at text not null,
  updated_at text not null
);

-- Indexes
create index idx_categories_user on categories(user_id);
create index idx_tasks_user on tasks(user_id);
create index idx_tasks_category on tasks(category_id);
create index idx_tasks_status on tasks(status);
create index idx_time_entries_user on time_entries(user_id);
create index idx_time_entries_task on time_entries(task_id);
create index idx_weekly_reviews_user on weekly_reviews(user_id);
create index idx_timer_state_user on timer_state(user_id);
create index idx_app_settings_user on app_settings(user_id);
create index idx_daily_capacity_user on daily_capacity(user_id);
create index idx_daily_capacity_date_domain on daily_capacity(date, domain);
create index idx_wins_user on wins(user_id);
create index idx_wins_date on wins(date);
create index idx_habits_user on habits(user_id);
create index idx_habit_logs_user on habit_logs(user_id);
create index idx_habit_logs_habit on habit_logs(habit_id);
create index idx_habit_logs_habit_date on habit_logs(habit_id, date);

-- Row Level Security
alter table categories enable row level security;
alter table tasks enable row level security;
alter table time_entries enable row level security;
alter table weekly_reviews enable row level security;
alter table timer_state enable row level security;
alter table app_settings enable row level security;
alter table daily_capacity enable row level security;
alter table wins enable row level security;
alter table habits enable row level security;
alter table habit_logs enable row level security;

-- RLS policies: each user can only access their own rows
create policy "Users own categories" on categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own tasks" on tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own time_entries" on time_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own weekly_reviews" on weekly_reviews for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own timer_state" on timer_state for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own app_settings" on app_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own daily_capacity" on daily_capacity for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own wins" on wins for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own habits" on habits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own habit_logs" on habit_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
