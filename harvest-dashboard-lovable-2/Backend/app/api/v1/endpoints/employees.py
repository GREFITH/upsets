from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.harvest import HarvestUser
from app.schemas.operations import CostRateUpdateRequest
from app.services.operations_service import OperationsService

router = APIRouter()


@router.get("/employees")
async def get_employees(db: AsyncSession = Depends(get_db)) -> dict:
    payload = await OperationsService(db).get_overview()
    return {"employees": payload["teamMembers"]}


@router.put("/employees/cost-rates")
async def update_cost_rates(request: CostRateUpdateRequest, db: AsyncSession = Depends(get_db)) -> dict:
    for entry in request.entries:
        user = (await db.execute(select(HarvestUser).where(HarvestUser.harvest_id == entry.id))).scalar_one_or_none()
        if user:
            user.cost_rate = entry.costRate
            db.add(user)
    await db.commit()
    return {"ok": True}

