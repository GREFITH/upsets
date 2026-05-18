import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.harvest import SYNC_STATE_KEY, HarvestSyncHistory, HarvestSyncState
from app.services.sync_service import SyncService

router = APIRouter()
logger = logging.getLogger(__name__)

# Rows stuck in ``running`` (e.g. server killed) surface as ``stale`` in the API — DB row unchanged.
_STALE_RUNNING_AFTER = timedelta(hours=1)


def _public_sync_status(row: HarvestSyncHistory) -> str:
    if row.status != "running":
        return row.status
    if row.started_at is None:
        return "running"
    started = row.started_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=UTC)
    if datetime.now(UTC) - started > _STALE_RUNNING_AFTER:
        return "stale"
    return "running"


def _serialize_sync_history_row(r: HarvestSyncHistory) -> dict:
    return {
        "id": r.id,
        "startedAt": r.started_at.isoformat() if r.started_at else None,
        "completedAt": r.completed_at.isoformat() if r.completed_at else None,
        "status": _public_sync_status(r),
        "fromDate": r.from_date.isoformat() if r.from_date else None,
        "throughDate": r.through_date.isoformat() if r.through_date else None,
        "fullResync": r.full_resync,
        "entriesSynced": r.entries_synced,
        "triggerSource": r.trigger_source,
        "errorMessage": r.error_message,
    }


@router.get("/sync/status")
async def get_sync_status(db: AsyncSession = Depends(get_db)) -> dict:
    """Return current sync state without triggering a sync — used for progress polling."""
    state = (await db.execute(
        select(HarvestSyncState).where(HarvestSyncState.resource == SYNC_STATE_KEY)
    )).scalar_one_or_none()
    if not state:
        return {"lastSuccessAt": None, "lastError": None, "syncStartedAt": None, "currentPhase": None, "phases": {}}
    meta: dict = state.meta or {}
    return {
        "lastSuccessAt": state.last_success_at.isoformat() if state.last_success_at else None,
        "lastError": state.last_error,
        "syncStartedAt": meta.get("sync_started_at"),
        "currentPhase": meta.get("current_phase"),
        "phases": meta.get("phases", {}),
    }


@router.get("/sync-history")
async def get_sync_history(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Recent Harvest sync runs for the settings UI (newest first)."""
    rows = (
        await db.execute(
            select(HarvestSyncHistory).order_by(desc(HarvestSyncHistory.started_at)).limit(limit)
        )
    ).scalars().all()
    return [_serialize_sync_history_row(r) for r in rows]


@router.post("/sync/harvest")
async def sync_harvest(
    full_time_resync: bool = False,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Trigger Harvest → Postgres sync.

    `full_time_resync`: delete all rows in `harvest_time_entries` and rebuild from every
    time entry in Harvest (use after bulk edits or if hours look wrong). Default incremental
    sync only requests time entries updated since last success.
    """
    logger.info(
        "Harvest sync started (full_time_resync=%s). Uvicorn access log line appears when the sync finishes.",
        full_time_resync,
    )
    return await SyncService(db).run_harvest_sync(full_time_resync=full_time_resync)
