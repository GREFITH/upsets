-- Harvest integration bootstrap schema for UpSpring dashboard
create extension if not exists pgcrypto;

create table if not exists public.harvest_sync_state (
  resource text primary key,
  last_success_at timestamptz,
  last_error text,
  updated_since_pointer timestamptz,
  cursor_page integer,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.harvest_clients (
  id bigint primary key,
  name text not null,
  is_active boolean not null default true,
  status text not null default 'active',
  address text,
  currency text,
  statement_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.harvest_projects (
  id bigint primary key,
  client_id bigint references public.harvest_clients (id) on delete set null,
  name text not null,
  code text,
  is_active boolean not null default true,
  status text not null default 'active',
  starts_on date,
  ends_on date,
  notes text,
  budget numeric,
  budget_by text,
  hourly_rate numeric,
  fee numeric,
  is_billable boolean not null default true,
  is_fixed_fee boolean not null default false,
  bill_by text,
  budget_is_monthly boolean not null default false,
  notify_when_over_budget boolean not null default true,
  over_budget_notification_percentage numeric,
  show_budget_to_all boolean not null default false,
  over_budget_notification_date date,
  cost_budget numeric,
  cost_budget_include_expenses boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.harvest_users (
  id bigint primary key,
  first_name text not null,
  last_name text not null,
  email text,
  roles text,
  is_active boolean not null default true,
  weekly_capacity numeric,
  default_hourly_rate numeric,
  cost_rate numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.harvest_user_assignments (
  id bigint primary key,
  project_id bigint not null references public.harvest_projects (id) on delete cascade,
  user_id bigint not null references public.harvest_users (id) on delete cascade,
  is_active boolean not null default true,
  is_project_manager boolean not null default false,
  use_default_rates boolean,
  hourly_rate numeric,
  budget numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create unique index if not exists harvest_user_assignments_project_user_idx
  on public.harvest_user_assignments (project_id, user_id);

create table if not exists public.harvest_assignment_events (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.harvest_projects (id) on delete cascade,
  user_id bigint not null references public.harvest_users (id) on delete cascade,
  action text not null check (action in ('assigned', 'removed')),
  happened_at timestamptz not null default now(),
  source_sync_at timestamptz,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.project_baselines (
  harvest_project_id bigint primary key references public.harvest_projects (id) on delete cascade,
  original_ends_on date,
  baseline_captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.harvest_time_entries_monthly (
  month_start date not null,
  user_id bigint not null references public.harvest_users (id) on delete cascade,
  project_id bigint not null references public.harvest_projects (id) on delete cascade,
  client_id bigint references public.harvest_clients (id) on delete set null,
  billable_hours numeric not null default 0,
  non_billable_hours numeric not null default 0,
  total_hours numeric not null default 0,
  billable_amount numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (month_start, user_id, project_id)
);

create index if not exists harvest_time_entries_monthly_project_idx
  on public.harvest_time_entries_monthly (project_id, month_start);

create table if not exists public.project_department_map (
  harvest_project_id bigint primary key references public.harvest_projects (id) on delete cascade,
  department text not null check (department in ('b2b-firms', 'b2b-products', 'residential', 'marketing')),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_financial_overrides (
  harvest_project_id bigint primary key references public.harvest_projects (id) on delete cascade,
  monthly_fee_override numeric,
  freelancer_cost_override numeric,
  commission_cost_override numeric,
  other_cost_override numeric,
  notes text,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists harvest_sync_state_set_updated_at on public.harvest_sync_state;
create trigger harvest_sync_state_set_updated_at
before insert or update on public.harvest_sync_state
for each row execute function public.set_updated_at();

drop trigger if exists harvest_clients_set_updated_at on public.harvest_clients;
create trigger harvest_clients_set_updated_at
before update on public.harvest_clients
for each row execute function public.set_updated_at();

drop trigger if exists harvest_projects_set_updated_at on public.harvest_projects;
create trigger harvest_projects_set_updated_at
before update on public.harvest_projects
for each row execute function public.set_updated_at();

drop trigger if exists harvest_users_set_updated_at on public.harvest_users;
create trigger harvest_users_set_updated_at
before update on public.harvest_users
for each row execute function public.set_updated_at();

drop trigger if exists harvest_user_assignments_set_updated_at on public.harvest_user_assignments;
create trigger harvest_user_assignments_set_updated_at
before update on public.harvest_user_assignments
for each row execute function public.set_updated_at();

drop trigger if exists harvest_time_entries_monthly_set_updated_at on public.harvest_time_entries_monthly;
create trigger harvest_time_entries_monthly_set_updated_at
before update on public.harvest_time_entries_monthly
for each row execute function public.set_updated_at();

drop trigger if exists project_baselines_set_updated_at on public.project_baselines;
create trigger project_baselines_set_updated_at
before update on public.project_baselines
for each row execute function public.set_updated_at();

drop trigger if exists project_department_map_set_updated_at on public.project_department_map;
create trigger project_department_map_set_updated_at
before update on public.project_department_map
for each row execute function public.set_updated_at();

drop trigger if exists project_financial_overrides_set_updated_at on public.project_financial_overrides;
create trigger project_financial_overrides_set_updated_at
before update on public.project_financial_overrides
for each row execute function public.set_updated_at();

alter table public.harvest_sync_state enable row level security;
alter table public.harvest_clients enable row level security;
alter table public.harvest_projects enable row level security;
alter table public.harvest_users enable row level security;
alter table public.harvest_user_assignments enable row level security;
alter table public.harvest_assignment_events enable row level security;
alter table public.project_baselines enable row level security;
alter table public.harvest_time_entries_monthly enable row level security;
alter table public.project_department_map enable row level security;
alter table public.project_financial_overrides enable row level security;

drop policy if exists "Allow authenticated read harvest_sync_state" on public.harvest_sync_state;
create policy "Allow authenticated read harvest_sync_state"
  on public.harvest_sync_state for select to authenticated using (true);
drop policy if exists "Allow authenticated read harvest_clients" on public.harvest_clients;
create policy "Allow authenticated read harvest_clients"
  on public.harvest_clients for select to authenticated using (true);
drop policy if exists "Allow authenticated read harvest_projects" on public.harvest_projects;
create policy "Allow authenticated read harvest_projects"
  on public.harvest_projects for select to authenticated using (true);
drop policy if exists "Allow authenticated read harvest_users" on public.harvest_users;
create policy "Allow authenticated read harvest_users"
  on public.harvest_users for select to authenticated using (true);
drop policy if exists "Allow authenticated read harvest_user_assignments" on public.harvest_user_assignments;
create policy "Allow authenticated read harvest_user_assignments"
  on public.harvest_user_assignments for select to authenticated using (true);
drop policy if exists "Allow authenticated read harvest_assignment_events" on public.harvest_assignment_events;
create policy "Allow authenticated read harvest_assignment_events"
  on public.harvest_assignment_events for select to authenticated using (true);
drop policy if exists "Allow authenticated read project_baselines" on public.project_baselines;
create policy "Allow authenticated read project_baselines"
  on public.project_baselines for select to authenticated using (true);
drop policy if exists "Allow authenticated read harvest_time_entries_monthly" on public.harvest_time_entries_monthly;
create policy "Allow authenticated read harvest_time_entries_monthly"
  on public.harvest_time_entries_monthly for select to authenticated using (true);
drop policy if exists "Allow authenticated read project_department_map" on public.project_department_map;
create policy "Allow authenticated read project_department_map"
  on public.project_department_map for select to authenticated using (true);
drop policy if exists "Allow authenticated read project_financial_overrides" on public.project_financial_overrides;
create policy "Allow authenticated read project_financial_overrides"
  on public.project_financial_overrides for select to authenticated using (true);
