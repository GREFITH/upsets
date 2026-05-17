from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.operations import OverviewResponse
from app.services.operations_service import OperationsService

router = APIRouter()


@router.get("/overview", response_model=OverviewResponse)
async def get_overview(db: AsyncSession = Depends(get_db)) -> OverviewResponse:
    payload = await OperationsService(db).get_overview()
    return OverviewResponse(**payload)

