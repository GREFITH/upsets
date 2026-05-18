from fastapi import APIRouter

from app.api.v1.endpoints import clients, data, departments, employees, overview, settings, sync

api_router = APIRouter()
api_router.include_router(overview.router, tags=["overview"])
api_router.include_router(data.router, tags=["data"])
api_router.include_router(departments.router, tags=["departments"])
api_router.include_router(clients.router, tags=["clients"])
api_router.include_router(employees.router, tags=["employees"])
api_router.include_router(settings.router, tags=["settings"])
api_router.include_router(sync.router, tags=["sync"])

