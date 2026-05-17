-- Harvest project: first-class columns for API fields; remove unused JSON payload on projects only.
alter table public.harvest_projects
  add column if not exists is_billable boolean not null default true,
  add column if not exists is_fixed_fee boolean not null default false,
  add column if not exists bill_by text,
  add column if not exists budget_is_monthly boolean not null default false,
  add column if not exists notify_when_over_budget boolean not null default true,
  add column if not exists over_budget_notification_percentage numeric,
  add column if not exists show_budget_to_all boolean not null default false,
  add column if not exists over_budget_notification_date date,
  add column if not exists cost_budget numeric,
  add column if not exists cost_budget_include_expenses boolean not null default false;

alter table public.harvest_projects drop column if exists payload;
