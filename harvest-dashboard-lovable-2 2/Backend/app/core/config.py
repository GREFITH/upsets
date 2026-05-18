from datetime import date

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "UpSpring FastAPI Backend"
    app_env: str = "development"
    # Comma-separated origins when APP_CORS_STRICT=true. Ignored when strict is false (see below).
    app_cors_origins: str = "http://localhost:8080"
    # When true, only listed origins (and optional regex) may call the API; credentials allowed.
    # When false (default), any origin may read JSON responses (no cookies); fixes Railway CORS preflight 400s if origins are misconfigured.
    app_cors_strict: bool = False
    # Used only if APP_CORS_STRICT=true — e.g. https://.*\\.up\\.railway\\.app
    app_cors_origin_regex: str = ""
    database_url: str = ""
    # Force PgBouncer-safe engine settings (NullPool + unique prepared statement names) when auto-detection misses your host.
    database_pgbouncer_compat: bool = False
    # When true (default), Postgres TLS uses certifi's CA bundle (fixes many macOS VERIFY_FAILED errors).
    # Set DATABASE_SSL_VERIFY=false only if you must bypass verification (e.g. TLS-intercepting proxy); insecure.
    database_ssl_verify: bool = True
    # Postgres statement_timeout in ms (per connection). Supabase pooler often defaults low; sync hits 500 otherwise.
    # Set DATABASE_STATEMENT_TIMEOUT_MS=0 to rely on server default only.
    database_statement_timeout_ms: int = 1_800_000

    # Optional placeholders only: this FastAPI app uses DATABASE_URL + SQLAlchemy for Postgres.
    # Nothing in the backend reads these yet (e.g. reserved for future Supabase Auth/Storage clients).
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""

    harvest_token: str = ""
    harvest_account_id: str = ""
    harvest_user_agent_email: str = ""
    # First sync has no last_success_at; Harvest would otherwise return every time entry (often 10+ minutes).
    # Default pulls ~18 months; set HARVEST_INITIAL_SYNC_TIME_ENTRIES_DAYS=0 for full history (slow first run).
    harvest_initial_sync_time_entries_days: int = 548
    # Optional ISO date (YYYY-MM-DD). First sync / full time resync only: Harvest ``updated_since`` at 00:00 UTC.
    # This filters by when Harvest last *modified* the row — NOT the day the hours were logged (``spent_date``).
    # For “only hours on/after a work day”, use ``harvest_initial_sync_time_entries_spent_from`` instead.
    harvest_initial_sync_time_entries_updated_since: date | None = None
    # Optional ISO dates: Harvest ``from`` / ``to`` on GET /time_entries = ``spent_date`` (the day the time is for).
    # First sync or ``full_time_resync`` only (ignored on normal incrementals so edits to older dates still sync).
    # If ``spent_from`` is set, the first time-entry pass does **not** send ``updated_since`` (spent-date filter only).
    harvest_initial_sync_time_entries_spent_from: date | None = None
    harvest_initial_sync_time_entries_spent_to: date | None = None

    @field_validator(
        "harvest_initial_sync_time_entries_updated_since",
        "harvest_initial_sync_time_entries_spent_from",
        "harvest_initial_sync_time_entries_spent_to",
        mode="before",
    )
    @classmethod
    def _empty_optional_sync_dates(cls, v: object) -> object:
        if v is None or v == "":
            return None
        return v

    @model_validator(mode="after")
    def _spent_date_range_sane(self) -> "Settings":
        a, b = self.harvest_initial_sync_time_entries_spent_from, self.harvest_initial_sync_time_entries_spent_to
        if a is not None and b is not None and b < a:
            raise ValueError(
                "HARVEST_INITIAL_SYNC_TIME_ENTRIES_SPENT_TO must be on or after HARVEST_INITIAL_SYNC_TIME_ENTRIES_SPENT_FROM"
            )
        return self

    # HTTP read timeout per Harvest request (large pages).
    harvest_http_timeout_seconds: float = 120.0

    # Performance optimizations: only sync active projects/clients/users (default true for speed).
    # Set HARVEST_SYNC_ACTIVE_ONLY=false to include archived/inactive records.
    harvest_sync_active_only: bool = True

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.app_cors_origins.split(",") if origin.strip()]

    @property
    def cors_origin_regex(self) -> str | None:
        r = self.app_cors_origin_regex.strip()
        return r or None

    @property
    def harvest_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.harvest_token}",
            "Harvest-Account-Id": self.harvest_account_id,
            "User-Agent": f"UpSpringDashboard ({self.harvest_user_agent_email})",
            "Content-Type": "application/json",
        }


settings = Settings()
