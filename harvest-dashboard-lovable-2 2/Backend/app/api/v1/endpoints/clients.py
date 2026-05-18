from collections import defaultdict
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.harvest import HarvestProject, ProjectPricingLog, ProjectDepartmentMap, ProjectFinancialOverride
from app.services.operations_service import OperationsService

router = APIRouter()


class CreateProjectRequest(BaseModel):
    clientName: str
    code: str
    department: str
    monthlyFee: float
    startDate: str
    endDate: str
    assignedTeam: list[str]


@router.get("/clients")
async def get_clients(db: AsyncSession = Depends(get_db)) -> dict:
    """
    Returns projects grouped by client name (flat) and nested by department → client → projects.
    Department comes from `project_department_map` (operations settings), not Harvest.
    """
    payload = await OperationsService(db).get_overview()
    grouped: dict[str, list[dict]] = {}
    by_department: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    for project in payload["projects"]:
        grouped.setdefault(project["clientName"], []).append(project)
        dept_id = project["departmentId"]
        by_department[dept_id][project["clientName"]].append(project)
    return {
        "clients": grouped,
        "byDepartment": {dept: dict(names) for dept, names in by_department.items()},
    }


@router.get("/clients/{client_number}")
async def get_client_detail(client_number: str, db: AsyncSession = Depends(get_db)) -> dict:
    payload = await OperationsService(db).get_overview()
    matches = [p for p in payload["projects"] if str(p["id"]) == client_number or p["clientName"] == client_number]
    if not matches:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"projects": matches, "teamMembers": payload["teamMembers"], "teamHistory": payload["teamHistory"]}


@router.get("/clients/{client_number}/pricing-history")
async def get_pricing_history(client_number: str, db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Get pricing history for all projects under a client."""
    # Find all projects for this client
    stmt = select(HarvestProject).where(
        HarvestProject.code.like(f"{client_number}-%")
    )
    result = await db.execute(stmt)
    projects = result.scalars().all()

    if not projects:
        return []

    project_ids = [p.harvest_id for p in projects]

    # Get all pricing log entries for these projects
    stmt = (
        select(ProjectPricingLog)
        .where(ProjectPricingLog.harvest_project_id.in_(project_ids))
        .order_by(ProjectPricingLog.change_date.desc())
    )
    result = await db.execute(stmt)
    entries = result.scalars().all()

    return [
        {
            "projectCode": next((p.code for p in projects if p.harvest_id == e.harvest_project_id), None),
            "changeDate": e.change_date.isoformat() if e.change_date else None,
            "changeType": e.change_type,
            "previousFee": float(e.previous_fee) if e.previous_fee else None,
            "newFee": float(e.new_fee),
            "notes": e.notes,
        }
        for e in entries
    ]


@router.post("/projects")
async def create_project(req: CreateProjectRequest, db: AsyncSession = Depends(get_db)) -> dict:
    """
    Create project mapping and financial override records.
    Note: Does not insert into harvest_projects (Harvest is source of truth).
    These records are pre-created so they're ready when Harvest sync runs.
    """
    # Generate a temporary harvest_project_id for the mapping
    # In production, this would be populated during Harvest sync
    temp_harvest_id = int(uuid4().int % (2**63))

    # Create financial override
    override = ProjectFinancialOverride(
        id=uuid4(),
        harvest_project_id=temp_harvest_id,
        monthly_fee_override=req.monthlyFee,
        updated_at=datetime.utcnow(),
    )

    # Create department mapping
    dept_map = ProjectDepartmentMap(
        id=uuid4(),
        harvest_project_id=temp_harvest_id,
        department=req.department,
        updated_at=datetime.utcnow(),
    )

    db.add(override)
    db.add(dept_map)
    await db.commit()

    return {
        "ok": True,
        "message": "Project config saved. It will appear in dashboards after the next Harvest sync.",
    }

