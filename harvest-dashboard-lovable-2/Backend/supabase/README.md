# Supabase artifacts in this repo

This folder holds **SQL migrations** that define the Postgres schema the FastAPI backend expects (`DATABASE_URL`, typically Supabase Postgres).

- **`migrations/`** — versioned DDL. The Harvest dashboard tables (`harvest_*`, `project_department_map`, etc.) are created by the migration files here.
- **Not checked in here:** Supabase CLI `config.toml`, Edge Functions, or remote project settings. Those live in the Supabase dashboard or a separate deployment repo unless you add them.

Apply migrations with Supabase CLI (`supabase db push` / linked project) or by running the SQL against your project (including MCP `apply_migration` during bootstrap).

After schema changes, keep **SQLAlchemy models** under `app/models/` in sync with these migrations.
