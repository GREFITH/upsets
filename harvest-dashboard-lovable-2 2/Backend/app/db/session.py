import ssl
from collections.abc import AsyncGenerator
from urllib.parse import urlparse
from uuid import uuid4

import certifi
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings


def _normalize_database_url(url: str) -> str:
    """Ensure asyncpg driver prefix so asyncpg/SQLAlchemy connect_args are honored."""
    u = url.strip()
    if u.startswith("postgresql+asyncpg://"):
        return u
    if u.startswith("postgresql://"):
        return "postgresql+asyncpg://" + u[len("postgresql://") :]
    if u.startswith("postgres://"):
        return "postgresql+asyncpg://" + u[len("postgres://") :]
    return u


def _uses_connection_pool_unsafe_for_asyncpg(database_url: str) -> bool:
    """Use NullPool when the server is known to multiplex connections (PgBouncer / Supabase edge).

    Transaction-pooler URLs (:6543) multiplex transactions and require NullPool.
    Session-pooler or direct URLs (:5432) do not multiplex and are safe with QueuePool.
    """
    lowered = database_url.lower()
    if ":6543" in lowered:
        return True
    return False


def _asyncpg_ssl_arg(database_url: str) -> bool | ssl.SSLContext | None:
    """SSL settings for asyncpg. Remote URLs use TLS; localhost skips SSL."""
    lowered = database_url.lower()
    if "localhost" in lowered or "127.0.0.1" in lowered:
        return None
    verify = settings.database_ssl_verify
    if not verify:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx
    # Explicit CA bundle fixes SSLCertVerificationError on Python installs without system certs.
    return ssl.create_default_context(cafile=certifi.where())


def _asyncpg_prepared_statement_name() -> str:
    """Unique prepared statement names for PgBouncer / transaction pooling (SQLAlchemy asyncpg, see #6467)."""
    return f"__asyncpg_{uuid4().hex}__"


def _build_sessionmaker() -> async_sessionmaker[AsyncSession]:
    database_url = _normalize_database_url(settings.database_url or "")
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is missing. Set it in Backend/.env "
            "(example: postgresql+asyncpg://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres)."
        )
    ssl_arg = _asyncpg_ssl_arg(database_url)
    # PgBouncer (transaction/statement pool): asyncpg + SQLAlchemy must not reuse named prepared statements.
    # - statement_cache_size=0 → asyncpg's LRU off
    # - prepared_statement_cache_size=0 → SQLAlchemy asyncpg dialect LRU off (default 100 still breaks PgBouncer)
    # - prepared_statement_name_func → unique names so backends never see "already exists" (SQLAlchemy #6467)
    connect_args: dict = {
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        "prepared_statement_name_func": _asyncpg_prepared_statement_name,
    }
    if ssl_arg is not None:
        connect_args["ssl"] = ssl_arg
    # Harvest sync runs long; Supabase may apply a short statement_timeout on pooled sessions.
    to_ms = settings.database_statement_timeout_ms
    if to_ms and to_ms > 0:
        connect_args.setdefault("server_settings", {})["statement_timeout"] = str(to_ms)

    pooler = _uses_connection_pool_unsafe_for_asyncpg(database_url) or settings.database_pgbouncer_compat
    engine_kw: dict = {
        "connect_args": connect_args,
    }
    if pooler:
        engine_kw["poolclass"] = NullPool
        engine_kw["pool_pre_ping"] = False
        engine_kw["query_cache_size"] = 0
    else:
        engine_kw["pool_pre_ping"] = True
        # Bound the connection pool to prevent exceeding the Supabase pooler limit of 15 connections in session mode
        engine_kw["pool_size"] = 5
        engine_kw["max_overflow"] = 5
    engine = create_async_engine(database_url, **engine_kw)
    return async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


SessionLocal = _build_sessionmaker()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session

