from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.harvest import (
    DEPT_LABELS,
    SYNC_STATE_KEY,
    HarvestClient,
    HarvestProject,
    HarvestSyncState,
    HarvestUser,
    HarvestUserAssignment,
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


def _is_internal_assignment(client_name: str | None, project_name: str | None) -> bool:
    """Check if an assignment is internal/non-billable based on client and project names."""
    INTERNAL_CLIENT_PATTERNS = [
        "upspring: internal",
        "upspring: business development",
        "upspring: marketing & pr",
        "upspring: podcast",
        "upspring: marketing",
    ]

    INTERNAL_PROJECT_PATTERNS = [
        "non-billable",
        "meetings",
        "company initiatives",
        "business development",
        "podcast",
        "website maintenance",
    ]

    client_lower = (client_name or "").lower()
    project_lower = (project_name or "").lower()

    if any(p in client_lower for p in INTERNAL_CLIENT_PATTERNS):
        return True
    if "non-billable" in project_lower:
        return True
    if client_lower == "upspring":
        return True
    if any(p in project_lower for p in INTERNAL_PROJECT_PATTERNS):
        return True
    return False


@router.get("/freelancer-assignments")
async def get_freelancer_assignments(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Fetch all billable contractor-to-project assignments with costs from existing tables."""
    import logging
    from sqlalchemy import and_

    logger = logging.getLogger(__name__)

    try:
        # Try to join with is_contractor filter first
        try:
            assignments = (
                await db.execute(
                    select(HarvestUserAssignment, HarvestUser, HarvestProject, HarvestClient).join(
                        HarvestUser, HarvestUserAssignment.user_id == HarvestUser.harvest_id
                    ).join(
                        HarvestProject, HarvestUserAssignment.project_id == HarvestProject.harvest_id
                    ).join(
                        HarvestClient, HarvestProject.client_id == HarvestClient.harvest_id, isouter=True
                    ).where(
                        and_(
                            HarvestUser.is_contractor == True,
                            HarvestUserAssignment.is_active == True
                        )
                    ).order_by(HarvestUserAssignment.created_at.desc())
                )
            ).all()
        except Exception as column_error:
            # Fallback: if is_contractor column doesn't exist, query without that filter
            logger.warning(f"is_contractor filter failed, using fallback query: {str(column_error)}")
            assignments = (
                await db.execute(
                    select(HarvestUserAssignment, HarvestUser, HarvestProject, HarvestClient).join(
                        HarvestUser, HarvestUserAssignment.user_id == HarvestUser.harvest_id
                    ).join(
                        HarvestProject, HarvestUserAssignment.project_id == HarvestProject.harvest_id
                    ).join(
                        HarvestClient, HarvestProject.client_id == HarvestClient.harvest_id, isouter=True
                    ).where(
                        HarvestUserAssignment.is_active == True
                    ).order_by(HarvestUserAssignment.created_at.desc())
                )
            ).all()

        result = []
        for assignment, user, project, client in assignments:
            # Check if this is actually a contractor (filter even if column didn't exist in query)
            try:
                is_contractor = getattr(user, "is_contractor", False)
                if not is_contractor:
                    continue
            except Exception:
                # If we can't determine contractor status, assume True (we got it from user_assignments)
                pass

            # Filter out internal/non-billable assignments
            if _is_internal_assignment(client.name if client else None, project.name):
                continue

            # Filter out E2M Team internal account
            if user.first_name == "E2M":
                continue

            # Cost per month: hourly_rate or cost_rate * 160 hours/month (or from assignment budget)
            monthly_cost = 0.0
            try:
                if assignment.hourly_rate:
                    monthly_cost = float(assignment.hourly_rate) * 160
                elif user.cost_rate:
                    monthly_cost = float(user.cost_rate) * 160
                elif assignment.budget:
                    monthly_cost = float(assignment.budget)
            except (TypeError, ValueError):
                monthly_cost = 0.0

            # Safely extract avatar_url with fallback
            avatar_url = None
            try:
                avatar_url = getattr(user, "avatar_url", None)
            except Exception:
                avatar_url = None

            result.append({
                "id": str(assignment.id),
                "userId": user.harvest_id,
                "projectId": project.harvest_id,
                "projectCode": project.code,
                "projectName": project.name,
                "freelancerName": f"{user.first_name} {user.last_name}",
                "costRate": float(user.cost_rate) if user.cost_rate else None,
                "billRate": float(assignment.hourly_rate) if assignment.hourly_rate else None,
                "estimatedMonthlyCost": monthly_cost,
                "clientName": client.name if client else None,
                "avatarUrl": avatar_url,
                "isProjectManager": assignment.is_project_manager,
                "startDate": project.starts_on.isoformat() if project.starts_on else None,
                "endDate": project.ends_on.isoformat() if project.ends_on else None,
            })

        return result

    except Exception as e:
        logger.error(
            f"Error fetching freelancer assignments: {str(e)}",
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load freelancer assignments: {str(e)}"
        )
