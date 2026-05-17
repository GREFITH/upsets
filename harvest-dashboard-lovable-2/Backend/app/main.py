from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings

app = FastAPI(title=settings.app_name)

# CORS: strict mode uses an explicit allow-list (and optional regex). Relaxed mode allows any origin
# without credentials — matches our fetch() usage (no cookies) and avoids OPTIONS 400 when
# APP_CORS_ORIGINS does not exactly match the browser Origin (common on Railway).
if settings.app_cors_strict:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.get("/api/v1/health")
async def health() -> dict:
    return {"status": "ok", "env": settings.app_env}


app.include_router(api_router, prefix="/api/v1")

