from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.harvest import (
    DEPT_LABELS,
    SYNC_STATE_KEY,
    HarvestProject,
    HarvestSyncState,
    ProjectDepartmentMap,
    ProjectFinancialOverride,
)
from app.schemas.operations import (
    FinancialOverrideUpdateRequest,
    HarvestSettingsResponse,
    ProjectMappingUpdateRequest,
)

router = APIRouter()


@router.get("/settings/harvest", response_model=HarvestSettingsResponse)
async def get_harvest_settings(db: AsyncSession = Depends(get_db)) -> HarvestSettingsResponse:
    mappings = (await db.execute(select(ProjectDepartmentMap))).scalars().all()
    overrides = (await db.execute(select(ProjectFinancialOverride))).scalars().all()
    sync_state = (await db.execute(
        select(HarvestSyncState).where(HarvestSyncState.resource == SYNC_STATE_KEY)
    )).scalar_one_or_none()
    meta: dict = (sync_state.meta or {}) if sync_state else {}
    raw_phases = meta.get("phases", {})
    from app.schemas.operations import SyncPhase
    sync_phases = {k: SyncPhase(**v) if isinstance(v, dict) else v for k, v in raw_phases.items()}

    return HarvestSettingsResponse(
        projectMappings=[
            {
                "projectId": row.harvest_project_id,
                "departmentId": row.department,
                "departmentName": DEPT_LABELS.get(row.department, row.department),
            }
            for row in mappings
        ],
        financialOverrides=[
            {
                "projectId": row.harvest_project_id,
                "budgetOverride": None,
                "monthlyBurnOverride": float(row.monthly_fee_override) if row.monthly_fee_override is not None else None,
                "freelancerCostOverride": float(row.freelancer_cost_override)
                if row.freelancer_cost_override is not None
                else None,
                "commissionCostOverride": float(row.commission_cost_override)
                if row.commission_cost_override is not None
                else None,
                "otherCostOverride": float(row.other_cost_override) if row.other_cost_override is not None else None,
            }
            for row in overrides
        ],
        lastSuccessAt=sync_state.last_success_at if sync_state else None,
        lastError=sync_state.last_error if sync_state else None,
        syncStartedAt=meta.get("sync_started_at"),
        currentPhase=meta.get("current_phase"),
        syncPhases=sync_phases,
    )


@router.put("/settings/project-mapping")
async def update_project_mapping(request: ProjectMappingUpdateRequest, db: AsyncSession = Depends(get_db)) -> dict:
    for entry in request.entries:
        pid = int(entry["projectId"])
        proj = (await db.execute(select(HarvestProject).where(HarvestProject.harvest_id == pid))).scalar_one_or_none()
        if not proj:
            raise HTTPException(
                status_code=422,
                detail=f"Harvest project {pid} is not in the database yet. Run a Harvest sync before mapping.",
            )
        existing_map = (await db.execute(
            select(ProjectDepartmentMap).where(ProjectDepartmentMap.harvest_project_id == pid)
        )).scalar_one_or_none()
        if existing_map:
            existing_map.department = str(entry["departmentId"])
        else:
            db.add(ProjectDepartmentMap(harvest_project_id=pid, department=str(entry["departmentId"])))
    await db.commit()
    return {"ok": True}


@router.put("/settings/financial-overrides")
async def update_financial_overrides(
    request: FinancialOverrideUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    for entry in request.entries:
        pid = int(entry["projectId"])
        proj = (await db.execute(select(HarvestProject).where(HarvestProject.harvest_id == pid))).scalar_one_or_none()
        if not proj:
            raise HTTPException(
                status_code=422,
                detail=f"Harvest project {pid} is not in the database yet. Run a Harvest sync before saving overrides.",
            )
        row = (await db.execute(
            select(ProjectFinancialOverride).where(ProjectFinancialOverride.harvest_project_id == pid)
        )).scalar_one_or_none()
        if not row:
            row = ProjectFinancialOverride(harvest_project_id=pid)
            db.add(row)
        if "monthlyBurnOverride" in entry:
            row.monthly_fee_override = entry.get("monthlyBurnOverride")
        if "freelancerCostOverride" in entry:
            row.freelancer_cost_override = entry.get("freelancerCostOverride")
        if "commissionCostOverride" in entry:
            row.commission_cost_override = entry.get("commissionCostOverride")
        if "otherCostOverride" in entry:
            row.other_cost_override = entry.get("otherCostOverride")
        if "notes" in entry:
            row.notes = entry.get("notes")
    await db.commit()
    return {"ok": True}
