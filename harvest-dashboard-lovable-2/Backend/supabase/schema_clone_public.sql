-- =============================================================================
-- Public schema clone script (structure only — no data)
-- Generated from live Supabase introspection (MCP: list_tables + pg_catalog).
-- Run on an EMPTY database (or drop public objects first). Adjust schema if needed.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Tables (FK-safe order)
-- ---------------------------------------------------------------------------

CREATE TABLE public.harvest_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource text NOT NULL,
  last_success_at timestamptz,
  last_error text,
  updated_since_pointer timestamptz,
  cursor_page integer,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT harvest_sync_state_resource_key UNIQUE (resource)
);

CREATE TABLE public.harvest_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  harvest_id bigint NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  address text,
  currency text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active'::text,
  statement_key text,
  CONSTRAINT harvest_clients_harvest_id_key UNIQUE (harvest_id)
);

CREATE TABLE public.harvest_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  harvest_id bigint NOT NULL,
  client_id bigint,
  name text NOT NULL,
  code text,
  is_active boolean NOT NULL DEFAULT true,
  starts_on date,
  ends_on date,
  notes text,
  budget numeric,
  budget_by text,
  hourly_rate numeric,
  fee numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active'::text,
  is_billable boolean NOT NULL DEFAULT true,
  is_fixed_fee boolean NOT NULL DEFAULT false,
  bill_by text,
  budget_is_monthly boolean NOT NULL DEFAULT false,
  notify_when_over_budget boolean NOT NULL DEFAULT true,
  over_budget_notification_percentage numeric,
  show_budget_to_all boolean NOT NULL DEFAULT false,
  over_budget_notification_date date,
  cost_budget numeric,
  cost_budget_include_expenses boolean NOT NULL DEFAULT false,
  CONSTRAINT harvest_projects_harvest_id_key UNIQUE (harvest_id),
  CONSTRAINT harvest_projects_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.harvest_clients (harvest_id) ON DELETE SET NULL
);

CREATE TABLE public.harvest_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  harvest_id bigint NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  roles text,
  is_active boolean NOT NULL DEFAULT true,
  weekly_capacity numeric,
  default_hourly_rate numeric,
  cost_rate numeric,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT harvest_users_harvest_id_key UNIQUE (harvest_id)
);

CREATE TABLE public.harvest_user_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  harvest_id bigint NOT NULL,
  project_id bigint NOT NULL,
  user_id bigint NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_project_manager boolean NOT NULL DEFAULT false,
  use_default_rates boolean,
  hourly_rate numeric,
  budget numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT harvest_user_assignments_harvest_id_key UNIQUE (harvest_id),
  CONSTRAINT harvest_user_assignments_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.harvest_projects (harvest_id) ON DELETE CASCADE,
  CONSTRAINT harvest_user_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.harvest_users (harvest_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX harvest_user_assignments_project_user_idx ON public.harvest_user_assignments USING btree (project_id, user_id);

CREATE TABLE public.harvest_assignment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id bigint NOT NULL,
  user_id bigint NOT NULL,
  action text NOT NULL,
  happened_at timestamptz NOT NULL DEFAULT now(),
  source_sync_at timestamptz,
  CONSTRAINT harvest_assignment_events_action_check CHECK ((action = ANY (ARRAY['assigned'::text, 'removed'::text]))),
  CONSTRAINT harvest_assignment_events_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.harvest_projects (harvest_id) ON DELETE CASCADE,
  CONSTRAINT harvest_assignment_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.harvest_users (harvest_id) ON DELETE CASCADE
);

CREATE TABLE public.project_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  harvest_project_id bigint NOT NULL,
  original_ends_on date,
  baseline_captured_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_baselines_harvest_project_id_key UNIQUE (harvest_project_id),
  CONSTRAINT project_baselines_harvest_project_id_fkey FOREIGN KEY (harvest_project_id) REFERENCES public.harvest_projects (harvest_id) ON DELETE CASCADE
);

CREATE TABLE public.project_department_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  harvest_project_id bigint NOT NULL,
  department text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_department_map_department_check CHECK (
    (department = ANY (ARRAY['b2b-firms'::text, 'b2b-products'::text, 'residential'::text, 'marketing'::text]))
  ),
  CONSTRAINT project_department_map_harvest_project_id_key UNIQUE (harvest_project_id),
  CONSTRAINT project_department_map_harvest_project_id_fkey FOREIGN KEY (harvest_project_id) REFERENCES public.harvest_projects (harvest_id) ON DELETE CASCADE
);

CREATE TABLE public.project_financial_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  harvest_project_id bigint NOT NULL,
  monthly_fee_override numeric,
  freelancer_cost_override numeric,
  commission_cost_override numeric,
  other_cost_override numeric,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_financial_overrides_harvest_project_id_key UNIQUE (harvest_project_id),
  CONSTRAINT project_financial_overrides_harvest_project_id_fkey FOREIGN KEY (harvest_project_id) REFERENCES public.harvest_projects (harvest_id) ON DELETE CASCADE
);

CREATE TABLE public.harvest_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  harvest_id bigint NOT NULL,
  spent_date date NOT NULL,
  hours numeric NOT NULL DEFAULT 0,
  rounded_hours numeric NOT NULL DEFAULT 0,
  notes text,
  billable boolean NOT NULL DEFAULT false,
  budgeted boolean NOT NULL DEFAULT false,
  billable_rate numeric,
  cost_rate numeric,
  is_locked boolean NOT NULL DEFAULT false,
  is_billed boolean NOT NULL DEFAULT false,
  is_running boolean NOT NULL DEFAULT false,
  approval_status text,
  timer_started_at timestamptz,
  started_time text,
  ended_time text,
  user_id bigint NOT NULL,
  client_id bigint,
  project_id bigint NOT NULL,
  task_id bigint,
  task_name text,
  invoice_id bigint,
  created_at timestamptz,
  updated_at timestamptz,
  CONSTRAINT harvest_time_entries_harvest_id_key UNIQUE (harvest_id),
  CONSTRAINT harvest_time_entries_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.harvest_clients (harvest_id) ON DELETE SET NULL,
  CONSTRAINT harvest_time_entries_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.harvest_projects (harvest_id) ON DELETE CASCADE,
  CONSTRAINT harvest_time_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.harvest_users (harvest_id) ON DELETE CASCADE
);

CREATE INDEX idx_hte_project ON public.harvest_time_entries USING btree (project_id);
CREATE INDEX idx_hte_spent_date ON public.harvest_time_entries USING btree (spent_date);
CREATE INDEX idx_hte_user ON public.harvest_time_entries USING btree (user_id);

CREATE TABLE public.harvest_sync_history (
  id bigserial PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL,
  from_date date,
  through_date date,
  full_resync boolean NOT NULL DEFAULT false,
  entries_synced integer,
  trigger_source text NOT NULL DEFAULT 'manual'::text,
  error_message text,
  CONSTRAINT harvest_sync_history_status_check CHECK (
    (status = ANY (ARRAY['running'::text, 'success'::text, 'failed'::text]))
  )
);

CREATE INDEX idx_harvest_sync_history_started_at ON public.harvest_sync_history USING btree (started_at DESC);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER harvest_sync_state_set_updated_at
  BEFORE INSERT OR UPDATE ON public.harvest_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER harvest_clients_set_updated_at
  BEFORE UPDATE ON public.harvest_clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER harvest_projects_set_updated_at
  BEFORE UPDATE ON public.harvest_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER harvest_users_set_updated_at
  BEFORE UPDATE ON public.harvest_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER harvest_user_assignments_set_updated_at
  BEFORE UPDATE ON public.harvest_user_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER project_baselines_set_updated_at
  BEFORE UPDATE ON public.project_baselines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER project_department_map_set_updated_at
  BEFORE UPDATE ON public.project_department_map
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER project_financial_overrides_set_updated_at
  BEFORE UPDATE ON public.project_financial_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security + policies (match live project)
-- ---------------------------------------------------------------------------

ALTER TABLE public.harvest_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.harvest_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.harvest_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.harvest_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.harvest_user_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.harvest_assignment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_department_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_financial_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.harvest_time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.harvest_sync_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read harvest_sync_state"
  ON public.harvest_sync_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read harvest_clients"
  ON public.harvest_clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read harvest_projects"
  ON public.harvest_projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read harvest_users"
  ON public.harvest_users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read harvest_user_assignments"
  ON public.harvest_user_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read harvest_assignment_events"
  ON public.harvest_assignment_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read project_baselines"
  ON public.project_baselines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read project_department_map"
  ON public.project_department_map FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read project_financial_overrides"
  ON public.project_financial_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read harvest_time_entries"
  ON public.harvest_time_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read harvest_sync_history"
  ON public.harvest_sync_history FOR SELECT TO authenticated USING (true);
