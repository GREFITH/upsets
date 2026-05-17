from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.operations_service import OperationsService

router = APIRouter()


@router.get("/departments/{department_id}")
async def get_department(department_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    payload = await OperationsService(db).get_overview()
    projects = [p for p in payload["projects"] if p["departmentId"] == department_id]
    if not projects:
        raise HTTPException(status_code=404, detail="Department not found")
    return {
        "departmentId": department_id,
        "projects": projects,
        "teamMembers": payload["teamMembers"],
        "teamHistory": payload["teamHistory"],
        "departmentMetrics": [m for m in payload["departmentMetrics"] if m["departmentId"] == department_id],
    }

