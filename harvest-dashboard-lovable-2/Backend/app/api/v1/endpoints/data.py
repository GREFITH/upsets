from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.operations_service import OperationsService

router = APIRouter()


@router.get("/date-range")
async def get_date_range(db: AsyncSession = Depends(get_db)) -> dict:
    """Returns the min and max spent_date available in time entries."""
    return await OperationsService(db).get_date_range()


@router.get("/projects")
async def get_projects(
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Project list with financials. 8 DB queries (no assignment events)."""
    return await OperationsService(db).get_projects(from_date=from_date, to_date=to_date)


@router.get("/team")
async def get_team_members(
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Team member list with utilisation. 6 DB queries (no baselines/overrides/events)."""
    return await OperationsService(db).get_team_members(from_date=from_date, to_date=to_date)


@router.get("/metrics")
async def get_department_metrics(
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Aggregated department metrics. 8 DB queries (no assignment events)."""
    return await OperationsService(db).get_department_metrics(from_date=from_date, to_date=to_date)


@router.get("/dashboard")
async def get_dashboard(
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Bundled projects + team + department metrics in one response (single shared DB gather)."""
    return await OperationsService(db).get_dashboard(from_date=from_date, to_date=to_date)


@router.get("/team-history")
async def get_team_history(db: AsyncSession = Depends(get_db)) -> dict:
    """Team assignment event history keyed by project ID. 4 DB queries."""
    return await OperationsService(db).get_team_history()


@router.get("/forecast/{department_id}")
async def get_forecast(
    department_id: str,
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Monthly revenue forecast for a department: last 12 months actual + 3 projected."""
    return await OperationsService(db).get_forecast(department_id, from_date=from_date, to_date=to_date)


@router.get("/unmapped-count")
async def get_unmapped_count(db: AsyncSession = Depends(get_db)) -> dict:
    """Returns count of active projects with billable hours that have no department mapping."""
    return await OperationsService(db).get_unmapped_project_count()
