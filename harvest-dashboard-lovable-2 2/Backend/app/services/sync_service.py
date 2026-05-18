from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from dateutil.parser import isoparse
from sqlalchemy import delete, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.harvest import (
    SYNC_STATE_KEY,
    HarvestAssignmentEvent,
    HarvestClient,
    HarvestProject,
    HarvestSyncHistory,
    HarvestSyncState,
    HarvestTimeEntry,
    HarvestUser,
    HarvestUserAssignment,
    ProjectBaseline,
)
from app.services.harvest_client import HarvestApiClient

# Chunk bulk INSERT .. ON CONFLICT so statements stay under param limits and pooler-friendly.
_BULK_UPSERT_CHUNK = 1000

logger = logging.getLogger(__name__)


def _first_sync_time_entries_updated_since(now: datetime) -> datetime | None:
    """Harvest ``updated_since`` for the first time-entries pull when ``last_success_at`` is still null.

    If ``HARVEST_INITIAL_SYNC_TIME_ENTRIES_UPDATED_SINCE`` is set, that calendar day at 00:00 UTC wins over
    the rolling ``HARVEST_INITIAL_SYNC_TIME_ENTRIES_DAYS`` window. A date after ``now`` falls back to the
    days-based window so we never send a future ``updated_since`` to Harvest.
    """
    fixed = settings.harvest_initial_sync_time_entries_updated_since
    if fixed is not None:
        anchor = datetime(fixed.year, fixed.month, fixed.day, tzinfo=UTC)
        if anchor > now:
            logger.warning(
                "HARVEST_INITIAL_SYNC_TIME_ENTRIES_UPDATED_SINCE=%s is after sync start time; using rolling days instead.",
                fixed.isoformat(),
            )
            days = settings.harvest_initial_sync_time_entries_days
            return None if days <= 0 else now - timedelta(days=days)
        logger.info(
            "First sync time entries — HARVEST_INITIAL_SYNC_TIME_ENTRIES_UPDATED_SINCE=%s → updated_since=%s",
            fixed.isoformat(),
            anchor.isoformat(),
        )
        return anchor
    days = settings.harvest_initial_sync_time_entries_days
    return None if days <= 0 else now - timedelta(days=days)


# Ordered list of sync phases shown in the UI.
SYNC_PHASES = [
    "clients",
    "projects",
    "users",
    "assignments",
    "time_entries",
]


def _num(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _optional_date(value: Any) -> date | None:
    """Parse Harvest date or ISO datetime strings to a calendar date for Postgres ``date`` columns."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return isoparse(str(value)).date()
    except (ValueError, TypeError, OSError):
        return None


# Columns updated on ``ON CONFLICT (id) DO UPDATE`` for ``harvest_projects`` bulk upserts (excludes primary key ``id``).
_HARVEST_PROJECT_UPSERT_COLS = (
    "client_id",
    "name",
    "code",
    "is_active",
    "status",
    "starts_on",
    "ends_on",
    "notes",
    "budget",
    "budget_by",
    "hourly_rate",
    "fee",
    "is_billable",
    "is_fixed_fee",
    "bill_by",
    "budget_is_monthly",
    "notify_when_over_budget",
    "over_budget_notification_percentage",
    "show_budget_to_all",
    "over_budget_notification_date",
    "cost_budget",
    "cost_budget_include_expenses",
)


def harvest_project_row_dict(api: dict[str, Any]) -> dict[str, Any]:
    """Map Harvest ``/projects`` (or single-project) JSON into a ``harvest_projects`` row dict — no JSONB payload."""
    pid = int(api["id"])
    client_raw = api.get("client") or {}
    client_id: int | None = None
    if isinstance(client_raw, dict) and client_raw.get("id") is not None:
        client_id = int(client_raw["id"])
    is_active = bool(api.get("is_active", True))
    notes_raw = api.get("notes")
    if notes_raw is None:
        notes: str | None = None
    elif isinstance(notes_raw, str):
        notes = notes_raw if notes_raw != "" else None
    else:
        notes = str(notes_raw)
    bb = api.get("budget_by")
    budget_by = (str(bb).strip() if bb is not None and str(bb).strip() != "" else None)
    bill_raw = api.get("bill_by")
    bill_by = (str(bill_raw).strip() if bill_raw is not None and str(bill_raw).strip() != "" else None)

    return {
        "harvest_id": pid,
        "client_id": client_id,
        "name": (api.get("name") or "").strip() or f"Project {pid}",
        "code": api.get("code"),
        "is_active": is_active,
        "status": "active" if is_active else "inactive",
        "starts_on": _optional_date(api.get("starts_on")),
        "ends_on": _optional_date(api.get("ends_on")),
        "notes": notes,
        "budget": _num(api.get("budget")),
        "budget_by": budget_by,
        "hourly_rate": _num(api.get("hourly_rate")),
        "fee": _num(api.get("fee")),
        "is_billable": bool(api.get("is_billable", True)),
        "is_fixed_fee": bool(api.get("is_fixed_fee", False)),
        "bill_by": bill_by,
        "budget_is_monthly": bool(api.get("budget_is_monthly", False)),
        "notify_when_over_budget": bool(api.get("notify_when_over_budget", True)),
        "over_budget_notification_percentage": _num(api.get("over_budget_notification_percentage")),
        "show_budget_to_all": bool(api.get("show_budget_to_all", False)),
        "over_budget_notification_date": _optional_date(api.get("over_budget_notification_date")),
        "cost_budget": _num(api.get("cost_budget")),
        "cost_budget_include_expenses": bool(api.get("cost_budget_include_expenses", False)),
    }


# Columns updated on conflict for ``harvest_clients`` bulk upserts (excludes ``id``).
_HARVEST_CLIENT_UPSERT_COLS = ("name", "is_active", "status", "statement_key")


def harvest_client_row_dict(api: dict[str, Any]) -> dict[str, Any]:
    """Map Harvest ``/clients`` JSON to a ``harvest_clients`` row dict (no JSONB payload)."""
    cid = int(api["id"])
    is_active = bool(api.get("is_active", True))
    raw_sk = api.get("statement_key")
    if raw_sk is None:
        statement_key: str | None = None
    elif isinstance(raw_sk, str):
        statement_key = raw_sk.strip() or None
    else:
        statement_key = str(raw_sk).strip() or None
    return {
        "harvest_id": cid,
        "name": (api.get("name") or "").strip() or "Unknown",
        "is_active": is_active,
        "status": "active" if is_active else "inactive",
        "statement_key": statement_key,
    }


def harvest_client_from_api_payload(payload: dict) -> HarvestClient:
    """Build ``HarvestClient`` from Harvest list/retrieve JSON (single source for persisted columns)."""
    return HarvestClient(**harvest_client_row_dict(payload))


class SyncService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _init_sync_meta(self, state: HarvestSyncState) -> None:
        """Write initial phase skeleton to meta so the UI can render all phases as pending."""
        phases = {p: {"status": "pending", "count": None, "started_at": None, "completed_at": None} for p in SYNC_PHASES}
        state.meta = {"sync_started_at": datetime.now(UTC).isoformat(), "current_phase": None, "phases": phases}
        state.updated_at = datetime.now(UTC)

    async def _begin_phase(self, state: HarvestSyncState, phase: str) -> None:
        meta = dict(state.meta or {})
        phases = dict(meta.get("phases", {}))
        phases[phase] = {**phases.get(phase, {}), "status": "syncing", "started_at": datetime.now(UTC).isoformat()}
        meta["current_phase"] = phase
        meta["phases"] = phases
        state.meta = meta
        state.updated_at = datetime.now(UTC)
        # Commit immediately so the polling endpoint (separate DB session) sees the phase start.
        await self.db.commit()
        await self.db.refresh(state)
        logger.info("Phase %s started", phase)

    async def _complete_phase(
        self, state: HarvestSyncState, phase: str, count: int | None = None, total: int | None = None
    ) -> None:
        meta = dict(state.meta or {})
        phases = dict(meta.get("phases", {}))
        update: dict = {"status": "completed", "count": count, "completed_at": datetime.now(UTC).isoformat()}
        if total is not None:
            update["total"] = total
        phases[phase] = {**phases.get(phase, {}), **update}
        meta["phases"] = phases
        state.meta = meta
        state.updated_at = datetime.now(UTC)
        logger.info("Phase %s completed: count=%s total=%s", phase, count, total)

    async def _update_phase_count(
        self, state: HarvestSyncState, phase: str, count: int, total: int | None = None
    ) -> None:
        """Commit intermediate progress so the polling endpoint (separate DB session) sees live X / total."""
        meta = dict(state.meta or {})
        phases = dict(meta.get("phases", {}))
        update: dict = {"count": count}
        if total is not None:
            update["total"] = total
        phases[phase] = {**phases.get(phase, {}), **update}
        meta["phases"] = phases
        state.meta = meta
        state.updated_at = datetime.now(UTC)
        logger.info("Phase %s progress: %s / %s", phase, count, total if total is not None else "?")
        await self.db.commit()
        await self.db.refresh(state)

    async def _apply_local_statement_timeout(self) -> None:
        """Supabase pooler often uses a short statement_timeout; long syncs need headroom."""
        ms = settings.database_statement_timeout_ms
        if ms and ms > 0:
            await self.db.execute(text(f"SET LOCAL statement_timeout = {ms}"))

    async def _sync_state(self) -> HarvestSyncState:
        # PK is now UUID; look up by the unique `resource` text key.
        result = (await self.db.execute(
            select(HarvestSyncState).where(HarvestSyncState.resource == SYNC_STATE_KEY)
        )).scalar_one_or_none()
        if not result:
            now = datetime.now(UTC)
            result = HarvestSyncState(resource=SYNC_STATE_KEY, meta={}, updated_at=now)
            self.db.add(result)
            await self.db.flush()
        return result

    async def run_harvest_sync(self, *, full_time_resync: bool = False) -> dict:
        """
        Pull from Harvest → upsert into Postgres.

        After the first successful sync, Harvest list endpoints are called with ``updated_since``
        (last successful sync time) so only changed clients/projects/users/assignments/time are fetched.

        On the **first** run (``last_success_at`` is null), clients/projects/users/assignments are still
        fetched with ``updated_since=None`` (full Harvest catalogs). Only the **time_entries** phase uses a
        narrower window: optional Harvest ``from``/``to`` (``spent_date``) via
        ``HARVEST_INITIAL_SYNC_TIME_ENTRIES_SPENT_FROM`` / ``_SPENT_TO``, or else ``updated_since`` from
        ``HARVEST_INITIAL_SYNC_TIME_ENTRIES_UPDATED_SINCE`` / ``_DAYS``, unless ``full_time_resync`` clears the
        table and refetches with no ``updated_since`` (optional spent filters still apply on that refetch).

        Work is committed in phases so one long Harvest page does not hold a single giant transaction.

        Individual time entries are streamed and bulk-upserted into ``harvest_time_entries`` after
        all FK parents (clients, projects, users) are committed so foreign keys succeed.

        Performance optimizations:
        - Fetches ALL clients/projects (active + inactive) to avoid FK gaps
        - Bulk upserts via pg_insert ON CONFLICT instead of per-row merge()
        - Reduces initial time entry window to avoid fetching years of history
        """
        await self._apply_local_statement_timeout()
        state = await self._sync_state()
        previous_assignments = {
            row.harvest_id: row
            for row in (await self.db.execute(select(HarvestUserAssignment))).scalars().all()
        }
        now = datetime.now(UTC)

        # Harvest incremental filter: only rows changed since last successful sync (None = full catalog).
        since: datetime | None = state.last_success_at
        is_full_sync = since is None

        logger.info(
            "Harvest sync starting — full_time_resync=%s is_full_sync=%s since=%s",
            full_time_resync, is_full_sync, since,
        )

        history_id: int | None = None
        try:
            try:
                # Audit log: ``from_date`` is last-success day for incrementals, else optional spent-date / updated-since floor.
                watermark_date = (
                    since.date()
                    if since is not None
                    else (
                        settings.harvest_initial_sync_time_entries_spent_from
                        or settings.harvest_initial_sync_time_entries_updated_since
                    )
                )
                hist = HarvestSyncHistory(
                    status="running",
                    from_date=watermark_date,
                    full_resync=full_time_resync,
                    trigger_source="manual",
                )
                self.db.add(hist)
                await self.db.flush()
                history_id = hist.id
                await self.db.commit()
                await self.db.refresh(state)
                await self._apply_local_statement_timeout()
            except Exception as hist_exc:
                logger.warning("harvest_sync_history row not recorded: %s", hist_exc)

            await self._init_sync_meta(state)
            await self.db.flush()
            logger.info("Sync meta initialised, phases: %s", SYNC_PHASES)

            if full_time_resync:
                logger.info("full_time_resync=True — deleting all harvest_time_entries rows")
                await self.db.execute(delete(HarvestTimeEntry))
                await self.db.flush()

            async with HarvestApiClient() as harvest:
                logger.info("=== Phase: clients ===")
                await self._begin_phase(state, "clients")
                clients_count = await self._phase_clients(harvest, state, since)
                await self._complete_phase(state, "clients", count=clients_count)
                await self.db.commit()
                await self._apply_local_statement_timeout()
                logger.info("clients done — upserted=%s", clients_count)

                logger.info("=== Phase: projects ===")
                await self._begin_phase(state, "projects")
                projects_count = await self._phase_projects(harvest, state, since)
                await self._complete_phase(state, "projects", count=projects_count)
                await self.db.commit()
                await self._apply_local_statement_timeout()
                logger.info("projects done — upserted=%s", projects_count)

                logger.info("=== Phase: users ===")
                await self._begin_phase(state, "users")
                users_count = await self._phase_users(harvest, state, since)
                await self._complete_phase(state, "users", count=users_count)
                await self.db.commit()
                await self._apply_local_statement_timeout()
                logger.info("users done — upserted=%s", users_count)

                logger.info("=== Phase: assignments ===")
                await self._begin_phase(state, "assignments")
                assignments_count = await self._phase_assignments(harvest, state, since, previous_assignments, now)
                await self._complete_phase(state, "assignments", count=assignments_count)
                await self.db.commit()
                await self._apply_local_statement_timeout()
                logger.info("assignments done — upserted=%s", assignments_count)

                logger.info("=== Phase: time_entries ===")
                await self._begin_phase(state, "time_entries")
                raw_count = await self._phase_time_entries(
                    harvest, state, now, full_time_resync
                )
                await self._complete_phase(state, "time_entries", count=raw_count)
                await self.db.commit()
                await self._apply_local_statement_timeout()
                logger.info("time_entries done — upserted=%s individual entries", raw_count)

            state.last_success_at = now
            state.last_error = None
            state.updated_since_pointer = now
            state.updated_at = now
            if history_id is not None:
                await self.db.execute(
                    update(HarvestSyncHistory)
                    .where(HarvestSyncHistory.id == history_id)
                    .values(
                        status="success",
                        completed_at=datetime.now(UTC),
                        through_date=datetime.now(UTC).date(),
                        entries_synced=raw_count,
                    )
                )
            await self.db.commit()

            stats = {
                "ok": True,
                "syncedAt": now.isoformat(),
                "fullTimeResync": full_time_resync,
                "incremental": since is not None,
            }
            logger.info("=== Harvest sync SUCCESS === stats=%s", stats)
            return stats
        except Exception as exc:
            # The connection may have been closed by Supabase/PgBouncer if the sync ran too long
            # (ConnectionDoesNotExistError). Guard both rollback and the follow-up error-state write
            # so the *original* exception is always what gets re-raised and shown in the UI.
            try:
                await self.db.rollback()
            except Exception as rollback_err:
                logger.warning(
                    "Rollback failed after sync error (connection likely closed by pooler): %s", rollback_err
                )

            if history_id is not None:
                try:
                    await self.db.execute(
                        update(HarvestSyncHistory)
                        .where(HarvestSyncHistory.id == history_id)
                        .values(
                            status="failed",
                            completed_at=datetime.now(UTC),
                            error_message=str(exc)[:4000],
                        )
                    )
                    await self.db.commit()
                except Exception as hist_err:
                    logger.warning("Could not persist harvest_sync_history failure: %s", hist_err)

            # Try to persist the error message so the UI shows what actually went wrong.
            try:
                st = (await self.db.execute(
                    select(HarvestSyncState).where(HarvestSyncState.resource == SYNC_STATE_KEY)
                )).scalar_one_or_none()
                if st:
                    st.last_error = str(exc)
                    st.updated_at = datetime.now(UTC)
                await self.db.commit()
            except Exception as state_err:
                logger.warning(
                    "Could not persist sync error state (connection closed): %s", state_err
                )
            raise

    async def _phase_clients(self, harvest: HarvestApiClient, state: HarvestSyncState, since: datetime | None) -> int:
        peek_params: dict[str, Any] = {"per_page": 1, "page": 1}
        if since is not None:
            peek_params["updated_since"] = since.isoformat()
        total: int | None = None
        try:
            peek = await harvest._get("/clients", peek_params)
            total = int(peek.get("total_entries") or 0) or None
            if total:
                await self._update_phase_count(state, "clients", 0, total=total)
        except Exception as exc:
            logger.warning("Could not peek clients total: %s", exc)

        rows: list[dict] = []
        async for payload in harvest.clients(updated_since=since):
            rows.append(harvest_client_row_dict(payload))
        if rows:
            # One round-trip per chunk: merge() would SELECT+UPSERT per row (very slow over Supabase).
            for i in range(0, len(rows), _BULK_UPSERT_CHUNK):
                chunk = rows[i : i + _BULK_UPSERT_CHUNK]
                stmt = pg_insert(HarvestClient).values(chunk)
                await self.db.execute(
                    stmt.on_conflict_do_update(
                        index_elements=["harvest_id"],
                        set_={c: getattr(stmt.excluded, c) for c in _HARVEST_CLIENT_UPSERT_COLS},
                    )
                )
        return len(rows)

    async def _phase_projects(
        self,
        harvest: HarvestApiClient,
        state: HarvestSyncState,
        since: datetime | None,
    ) -> int:
        peek_params: dict[str, Any] = {"per_page": 1, "page": 1}
        if since is not None:
            peek_params["updated_since"] = since.isoformat()
        total: int | None = None
        try:
            peek = await harvest._get("/projects", peek_params)
            total = int(peek.get("total_entries") or 0) or None
            if total:
                await self._update_phase_count(state, "projects", 0, total=total)
        except Exception as exc:
            logger.warning("Could not peek projects total: %s", exc)

        rows: list[dict] = []
        baselines: list[tuple[int, date]] = []
        async for payload in harvest.projects(updated_since=since):
            row = harvest_project_row_dict(payload)
            rows.append(row)
            if row.get("ends_on"):
                baselines.append((int(row["harvest_id"]), row["ends_on"]))
        if rows:
            for i in range(0, len(rows), _BULK_UPSERT_CHUNK):
                chunk = rows[i : i + _BULK_UPSERT_CHUNK]
                stmt = pg_insert(HarvestProject).values(chunk)
                await self.db.execute(
                    stmt.on_conflict_do_update(
                        index_elements=["harvest_id"],
                        set_={c: getattr(stmt.excluded, c) for c in _HARVEST_PROJECT_UPSERT_COLS},
                    )
                )
        for pid, ends_on in baselines:
            await self._apply_project_baseline_if_needed(pid, ends_on)
        return len(rows)

    async def _apply_project_baseline_if_needed(self, harvest_project_id: int, ends_on: date | None) -> None:
        if not ends_on:
            return
        # PK is now UUID; look up by unique harvest_project_id.
        baseline = (await self.db.execute(
            select(ProjectBaseline).where(ProjectBaseline.harvest_project_id == harvest_project_id)
        )).scalar_one_or_none()
        if not baseline:
            self.db.add(ProjectBaseline(harvest_project_id=harvest_project_id, original_ends_on=ends_on))

    async def _phase_users(self, harvest: HarvestApiClient, state: HarvestSyncState, since: datetime | None) -> int:
        peek_params: dict[str, Any] = {"per_page": 1, "page": 1}
        if since is not None:
            peek_params["updated_since"] = since.isoformat()
        total: int | None = None
        try:
            peek = await harvest._get("/users", peek_params)
            total = int(peek.get("total_entries") or 0) or None
            if total:
                await self._update_phase_count(state, "users", 0, total=total)
        except Exception as exc:
            logger.warning("Could not peek users total: %s", exc)

        rows: list[dict] = []
        async for payload in harvest.users(updated_since=since):
            rows.append({
                "harvest_id": int(payload["id"]),
                "first_name": (payload.get("first_name") or "").strip(),
                "last_name": (payload.get("last_name") or "").strip(),
                "email": payload.get("email"),
                "is_active": bool(payload.get("is_active", True)),
                "weekly_capacity": _num(payload.get("weekly_capacity")),
                "default_hourly_rate": _num(payload.get("default_hourly_rate")),
                "cost_rate": _num(payload.get("cost_rate")),
                "is_contractor": bool(payload.get("is_contractor", False)),
                "has_access_to_all_future_projects": bool(payload.get("has_access_to_all_future_projects", False)),
                "can_create_projects": bool(payload.get("can_create_projects", False)),
                "calendar_integration_enabled": bool(payload.get("calendar_integration_enabled", False)),
                "avatar_url": payload.get("avatar_url"),
                "timezone": payload.get("timezone"),
                "telephone": payload.get("telephone"),
                "employee_id": payload.get("employee_id"),
                "calendar_integration_source": payload.get("calendar_integration_source"),
                "access_roles": payload.get("access_roles") or [],
                "permissions_claims": payload.get("permissions_claims") or {},
                "roles": payload.get("roles") or [],
            })
        if rows:
            _user_cols = (
                "first_name",
                "last_name",
                "email",
                "is_active",
                "weekly_capacity",
                "default_hourly_rate",
                "cost_rate",
                "is_contractor",
                "has_access_to_all_future_projects",
                "can_create_projects",
                "calendar_integration_enabled",
                "avatar_url",
                "timezone",
                "telephone",
                "employee_id",
                "calendar_integration_source",
                "access_roles",
                "permissions_claims",
                "roles",
            )
            for i in range(0, len(rows), _BULK_UPSERT_CHUNK):
                chunk = rows[i : i + _BULK_UPSERT_CHUNK]
                stmt = pg_insert(HarvestUser).values(chunk)
                await self.db.execute(
                    stmt.on_conflict_do_update(
                        index_elements=["harvest_id"],
                        set_={c: getattr(stmt.excluded, c) for c in _user_cols},
                    )
                )
        return len(rows)

    async def _phase_assignments(
        self,
        harvest: HarvestApiClient,
        state: HarvestSyncState,
        since: datetime | None,
        previous_assignments: dict[int, HarvestUserAssignment],
        now: datetime,
    ) -> int:
        peek_params: dict[str, Any] = {"per_page": 1, "page": 1}
        if since is not None:
            peek_params["updated_since"] = since.isoformat()
        total: int | None = None
        try:
            peek = await harvest._get("/user_assignments", peek_params)
            total = int(peek.get("total_entries") or 0) or None
            if total:
                await self._update_phase_count(state, "assignments", 0, total=total)
        except Exception as exc:
            logger.warning("Could not peek assignments total: %s", exc)

        current_assignment_ids: set[int] = set()
        # Map assignment id → (project_id, user_id) for event rows after bulk upsert.
        aid_to_project_user: dict[int, tuple[int, int]] = {}
        rows: list[dict] = []
        async for payload in harvest.user_assignments(updated_since=since):
            aid = int(payload["id"])
            project_raw = payload.get("project") or {}
            user_raw = payload.get("user") or {}
            project_id = int(project_raw["id"]) if project_raw.get("id") is not None else None
            user_id = int(user_raw["id"]) if user_raw.get("id") is not None else None
            if project_id is None or user_id is None:
                continue

            current_assignment_ids.add(aid)
            aid_to_project_user[aid] = (project_id, user_id)
            rows.append(
                {
                    "harvest_id": aid,
                    "project_id": project_id,
                    "user_id": user_id,
                    "is_active": bool(payload.get("is_active", True)),
                    "payload": {},
                }
            )

        if rows:
            for i in range(0, len(rows), _BULK_UPSERT_CHUNK):
                chunk = rows[i : i + _BULK_UPSERT_CHUNK]
                a_stmt = pg_insert(HarvestUserAssignment).values(chunk)
                await self.db.execute(
                    a_stmt.on_conflict_do_update(
                        index_elements=["harvest_id"],
                        set_={
                            "project_id": a_stmt.excluded.project_id,
                            "user_id": a_stmt.excluded.user_id,
                            "is_active": a_stmt.excluded.is_active,
                            "payload": a_stmt.excluded.payload,
                        },
                    )
                )

        prev_keys = set(previous_assignments.keys())
        for aid in current_assignment_ids - prev_keys:
            project_id, user_id = aid_to_project_user[aid]
            self.db.add(
                HarvestAssignmentEvent(
                    id=uuid.uuid4(),
                    project_id=project_id,
                    user_id=user_id,
                    action="assigned",
                    happened_at=now,
                    source_sync_at=now,
                )
            )

        count = len(rows)

        # Full catalog only: incremental `updated_since` responses omit unchanged rows — never treat
        # "missing from this page" as removed.
        if since is None:
            for assignment in previous_assignments.values():
                if assignment.harvest_id not in current_assignment_ids:
                    self.db.add(
                        HarvestAssignmentEvent(
                            id=uuid.uuid4(),
                            project_id=assignment.project_id,
                            user_id=assignment.user_id,
                            action="removed",
                            happened_at=now,
                            source_sync_at=now,
                        )
                    )
            removed_assignment_ids = set(previous_assignments.keys()) - current_assignment_ids
            if removed_assignment_ids:
                await self.db.execute(
                    delete(HarvestUserAssignment).where(HarvestUserAssignment.harvest_id.in_(removed_assignment_ids))
                )
        return count

    async def _phase_time_entries(
        self,
        harvest: HarvestApiClient,
        state: HarvestSyncState,
        now: datetime,
        full_time_resync: bool,
    ) -> int:
        """Stream individual Harvest time entries → bulk upsert into harvest_time_entries.

        FK parents (clients, projects, users) are already committed before this phase runs.
        Returns the total entry count upserted.
        """
        spent_from: date | None = None
        spent_to: date | None = None
        if state.last_success_at is None or full_time_resync:
            spent_from = settings.harvest_initial_sync_time_entries_spent_from
            spent_to = settings.harvest_initial_sync_time_entries_spent_to

        if full_time_resync:
            time_since: datetime | None = None
        elif state.last_success_at is not None:
            time_since = state.last_success_at
            spent_from, spent_to = None, None
        else:
            if spent_from is not None:
                time_since = None
                logger.info(
                    "First sync time entries — Harvest spent_date from=%s to=%s (from/to params; no updated_since)",
                    spent_from.isoformat(),
                    spent_to.isoformat() if spent_to is not None else "open",
                )
            else:
                time_since = _first_sync_time_entries_updated_since(now)

        logger.info(
            "time_entries — time_since=%s spent_from=%s spent_to=%s full_time_resync=%s",
            time_since,
            spent_from,
            spent_to,
            full_time_resync,
        )

        # Preflight: get total so the UI can show "X / total" immediately.
        total_entries: int | None = None
        try:
            peek_params: dict[str, Any] = {"per_page": 1, "page": 1}
            if time_since is not None:
                peek_params["updated_since"] = time_since.isoformat()
            if spent_from is not None:
                peek_params["from"] = spent_from.isoformat()
            if spent_to is not None:
                peek_params["to"] = spent_to.isoformat()
            peek = await harvest._get("/time_entries", peek_params)
            total_entries = int(peek.get("total_entries") or 0) or None
            logger.info("time_entries — total_entries from API: %s", total_entries)
            if total_entries:
                await self._update_phase_count(state, "time_entries", 0, total=total_entries)
        except Exception as exc:
            logger.warning("Could not peek total_entries for time_entries: %s", exc)

        _upsert_cols = (
            "spent_date", "hours", "rounded_hours", "notes", "billable", "budgeted",
            "billable_rate", "cost_rate", "is_locked", "is_billed", "is_running",
            "approval_status", "timer_started_at", "started_time", "ended_time",
            "user_id", "client_id", "project_id", "task_id", "task_name",
            "invoice_id", "created_at", "updated_at",
        )

        async def _flush(batch: list[dict]) -> None:
            if not batch:
                return
            stmt = pg_insert(HarvestTimeEntry).values(batch)
            await self.db.execute(
                stmt.on_conflict_do_update(
                    index_elements=["harvest_id"],
                    set_={c: getattr(stmt.excluded, c) for c in _upsert_cols},
                )
            )
            await self.db.commit()
            await self._apply_local_statement_timeout()

        raw_count = 0
        batch: list[dict] = []

        async for payload in harvest.time_entries(
            updated_since=time_since,
            spent_date_from=spent_from,
            spent_date_to=spent_to,
        ):
            raw_count += 1
            project_raw = payload.get("project") or {}
            user_raw = payload.get("user") or {}
            client_raw = payload.get("client") or {}
            task_raw = payload.get("task") or {}
            invoice_raw = payload.get("invoice") or {}

            pid = int(project_raw["id"]) if project_raw.get("id") is not None else None
            uid = int(user_raw["id"]) if user_raw.get("id") is not None else None
            if pid is None or uid is None:
                continue

            cid = int(client_raw["id"]) if isinstance(client_raw, dict) and client_raw.get("id") else None
            task_id = int(task_raw["id"]) if isinstance(task_raw, dict) and task_raw.get("id") else None
            task_name = task_raw.get("name") if isinstance(task_raw, dict) else None
            invoice_id = int(invoice_raw["id"]) if isinstance(invoice_raw, dict) and invoice_raw.get("id") else None

            timer_raw = payload.get("timer_started_at")
            created_raw = payload.get("created_at")
            updated_raw = payload.get("updated_at")

            batch.append({
                "harvest_id": int(payload["id"]),
                "spent_date": _optional_date(payload["spent_date"]),
                "hours": float(payload.get("hours") or 0),
                "rounded_hours": float(payload.get("rounded_hours") or 0),
                "notes": payload.get("notes"),
                "billable": bool(payload.get("billable", False)),
                "budgeted": bool(payload.get("budgeted", False)),
                "billable_rate": _num(payload.get("billable_rate")),
                "cost_rate": _num(payload.get("cost_rate")),
                "is_locked": bool(payload.get("is_locked", False)),
                "is_billed": bool(payload.get("is_billed", False)),
                "is_running": bool(payload.get("is_running", False)),
                "approval_status": payload.get("approval_status"),
                "timer_started_at": isoparse(timer_raw) if timer_raw else None,
                "started_time": payload.get("started_time"),
                "ended_time": payload.get("ended_time"),
                "user_id": uid,
                "client_id": cid,
                "project_id": pid,
                "task_id": task_id,
                "task_name": task_name,
                "invoice_id": invoice_id,
                "created_at": isoparse(created_raw) if created_raw else None,
                "updated_at": isoparse(updated_raw) if updated_raw else None,
            })

            if len(batch) >= _BULK_UPSERT_CHUNK:
                await _flush(batch)
                batch = []
                await self._update_phase_count(state, "time_entries", raw_count, total=total_entries)

        await _flush(batch)
        logger.info("time_entries — upserted %s individual entries", raw_count)
        return raw_count
