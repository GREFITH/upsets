from datetime import date, datetime
import uuid
from uuid import uuid4

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, Numeric, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import text

from app.models.base import Base


class HarvestSyncState(Base):
    __tablename__ = "harvest_sync_state"
    __table_args__ = (UniqueConstraint("resource", name="harvest_sync_state_resource_key"),)

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    resource: Mapped[str] = mapped_column(Text, nullable=False)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    updated_since_pointer: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cursor_page: Mapped[int | None] = mapped_column(Integer)
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )


class HarvestClient(Base):
    __tablename__ = "harvest_clients"
    __table_args__ = (UniqueConstraint("harvest_id", name="harvest_clients_harvest_id_key"),)

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    harvest_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    name: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'active'"))
    address: Mapped[str | None] = mapped_column(Text)
    currency: Mapped[str | None] = mapped_column(Text)
    statement_key: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class HarvestProject(Base):
    __tablename__ = "harvest_projects"
    __table_args__ = (UniqueConstraint("harvest_id", name="harvest_projects_harvest_id_key"),)

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    harvest_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    client_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("harvest_clients.harvest_id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(Text)
    code: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'active'"))
    starts_on: Mapped[date | None] = mapped_column(Date)
    ends_on: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    budget: Mapped[float | None] = mapped_column(Numeric)
    budget_by: Mapped[str | None] = mapped_column(Text)
    hourly_rate: Mapped[float | None] = mapped_column(Numeric)
    fee: Mapped[float | None] = mapped_column(Numeric)
    is_billable: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    is_fixed_fee: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    bill_by: Mapped[str | None] = mapped_column(Text)
    budget_is_monthly: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    notify_when_over_budget: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    over_budget_notification_percentage: Mapped[float | None] = mapped_column(Numeric)
    show_budget_to_all: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    over_budget_notification_date: Mapped[date | None] = mapped_column(Date)
    cost_budget: Mapped[float | None] = mapped_column(Numeric)
    cost_budget_include_expenses: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class HarvestUser(Base):
    __tablename__ = "harvest_users"
    __table_args__ = (UniqueConstraint("harvest_id", name="harvest_users_harvest_id_key"),)

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    harvest_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    first_name: Mapped[str] = mapped_column(Text)
    last_name: Mapped[str] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(Text)
    is_contractor: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    has_access_to_all_future_projects: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    can_create_projects: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    calendar_integration_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    avatar_url: Mapped[str | None] = mapped_column(Text)
    timezone: Mapped[str | None] = mapped_column(Text)
    telephone: Mapped[str | None] = mapped_column(Text)
    employee_id: Mapped[str | None] = mapped_column(Text)
    calendar_integration_source: Mapped[str | None] = mapped_column(Text)
    access_roles: Mapped[list | None] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    permissions_claims: Mapped[dict | None] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    roles: Mapped[list | None] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    weekly_capacity: Mapped[float | None] = mapped_column(Numeric)
    default_hourly_rate: Mapped[float | None] = mapped_column(Numeric)
    cost_rate: Mapped[float | None] = mapped_column(Numeric)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class HarvestUserAssignment(Base):
    __tablename__ = "harvest_user_assignments"
    __table_args__ = (UniqueConstraint("harvest_id", name="harvest_user_assignments_harvest_id_key"),)

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    harvest_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("harvest_projects.harvest_id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("harvest_users.harvest_id", ondelete="CASCADE"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    is_project_manager: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    use_default_rates: Mapped[bool | None] = mapped_column(Boolean)
    hourly_rate: Mapped[float | None] = mapped_column(Numeric)
    budget: Mapped[float | None] = mapped_column(Numeric)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))


class HarvestAssignmentEvent(Base):
    __tablename__ = "harvest_assignment_events"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("harvest_projects.harvest_id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("harvest_users.harvest_id", ondelete="CASCADE"))
    action: Mapped[str] = mapped_column(Text)
    happened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    source_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ProjectBaseline(Base):
    __tablename__ = "project_baselines"
    __table_args__ = (UniqueConstraint("harvest_project_id", name="project_baselines_harvest_project_id_key"),)

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    harvest_project_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("harvest_projects.harvest_id", ondelete="CASCADE"), nullable=False
    )
    original_ends_on: Mapped[date | None] = mapped_column(Date)
    baseline_captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class HarvestTimeEntry(Base):
    __tablename__ = "harvest_time_entries"
    __table_args__ = (UniqueConstraint("harvest_id", name="harvest_time_entries_harvest_id_key"),)

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    harvest_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    spent_date: Mapped[date] = mapped_column(Date, nullable=False)
    hours: Mapped[float] = mapped_column(Numeric, nullable=False, server_default=text("0"))
    rounded_hours: Mapped[float] = mapped_column(Numeric, nullable=False, server_default=text("0"))
    notes: Mapped[str | None] = mapped_column(Text)
    billable: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    budgeted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    billable_rate: Mapped[float | None] = mapped_column(Numeric)
    cost_rate: Mapped[float | None] = mapped_column(Numeric)
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    is_billed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    is_running: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    approval_status: Mapped[str | None] = mapped_column(Text)
    timer_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_time: Mapped[str | None] = mapped_column(Text)
    ended_time: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("harvest_users.harvest_id", ondelete="CASCADE"))
    client_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("harvest_clients.harvest_id", ondelete="SET NULL"))
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("harvest_projects.harvest_id", ondelete="CASCADE"))
    task_id: Mapped[int | None] = mapped_column(BigInteger)
    task_name: Mapped[str | None] = mapped_column(Text)
    invoice_id: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ProjectDepartmentMap(Base):
    __tablename__ = "project_department_map"
    __table_args__ = (UniqueConstraint("harvest_project_id", name="project_department_map_harvest_project_id_key"),)

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    harvest_project_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("harvest_projects.harvest_id", ondelete="CASCADE"), nullable=False
    )
    department: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class ProjectFinancialOverride(Base):
    __tablename__ = "project_financial_overrides"
    __table_args__ = (UniqueConstraint("harvest_project_id", name="project_financial_overrides_harvest_project_id_key"),)

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    harvest_project_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("harvest_projects.harvest_id", ondelete="CASCADE"), nullable=False
    )
    monthly_fee_override: Mapped[float | None] = mapped_column(Numeric)
    freelancer_cost_override: Mapped[float | None] = mapped_column(Numeric)
    commission_cost_override: Mapped[float | None] = mapped_column(Numeric)
    other_cost_override: Mapped[float | None] = mapped_column(Numeric)
    notes: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class HarvestSyncHistory(Base):
    """Append-only audit log for manual Harvest sync runs (UI: View sync logs)."""

    __tablename__ = "harvest_sync_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, nullable=False)
    from_date: Mapped[date | None] = mapped_column(Date)
    through_date: Mapped[date | None] = mapped_column(Date)
    full_resync: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    entries_synced: Mapped[int | None] = mapped_column(Integer)
    trigger_source: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'manual'"))
    error_message: Mapped[str | None] = mapped_column(Text)


class ProjectPricingLog(Base):
    """Audit log for project pricing changes."""

    __tablename__ = "project_pricing_log"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    harvest_project_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("harvest_projects.harvest_id", ondelete="CASCADE"), nullable=False
    )
    change_date: Mapped[date] = mapped_column(Date, nullable=False)
    change_type: Mapped[str] = mapped_column(Text, nullable=False)
    previous_fee: Mapped[float | None] = mapped_column(Numeric)
    new_fee: Mapped[float] = mapped_column(Numeric, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )


SYNC_STATE_KEY = "all"

DEPT_LABELS: dict[str, str] = {
    "unassigned": "Unassigned",
    "b2b-firms": "B2B Firms",
    "b2b-products": "B2B Products",
    "residential": "Residential & Consumer Product",
    "marketing": "Marketing",
}

# Departments that roll up to KPI cards and dashboards (excludes unmapped work).
ROLLUP_DEPARTMENT_IDS: frozenset[str] = frozenset(
    {"b2b-firms", "b2b-products", "residential", "marketing"},
)
