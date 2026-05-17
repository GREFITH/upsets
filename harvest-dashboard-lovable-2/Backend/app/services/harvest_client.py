from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from datetime import date, datetime
from types import TracebackType
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# Harvest rate limit guidance: honor Retry-After; bounded retries with light exponential fallback.
_MAX_HTTP_RETRIES = 12

# Max records per page — Harvest honours values up to 2000 for most endpoints.
_PER_PAGE = 2000

# Max concurrent page fetches — stays comfortably under Harvest's 100 req/15 s cap.
_PAGE_CONCURRENCY = 5


class HarvestApiClient:
    """HTTP client for Harvest API v2 (GET). One keep-alive pool per sync; supports Harvest `updated_since` filters."""

    base_url = "https://api.harvestapp.com/v2"

    def __init__(self) -> None:
        timeout = httpx.Timeout(settings.harvest_http_timeout_seconds)
        self._client = httpx.AsyncClient(
            timeout=timeout,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=30),
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "HarvestApiClient":
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        await self.close()

    async def _sleep_rate_limit(self, response: httpx.Response, attempt: int) -> None:
        """Wait per Harvest 429 Retry-After, or exponential fallback."""
        ra = response.headers.get("Retry-After")
        if ra is not None:
            try:
                wait_s = float(ra)
            except ValueError:
                wait_s = min(120.0, 2.0**attempt)
        else:
            wait_s = min(120.0, 2.0**attempt)
        logger.warning(
            "Harvest rate limited (429); sleeping %.1fs before retry (attempt %s/%s)",
            wait_s, attempt + 1, _MAX_HTTP_RETRIES,
        )
        await asyncio.sleep(wait_s)

    async def _request_json(self, *, method: str, url: str, params: dict[str, Any] | None) -> dict:
        """GET with 429 handling (Retry-After primary, exponential fallback)."""
        last_exc: BaseException | None = None
        for attempt in range(_MAX_HTTP_RETRIES):
            response = await self._client.request(
                method,
                url,
                headers=settings.harvest_headers,
                params=params or {},
            )
            if response.status_code == 429:
                await self._sleep_rate_limit(response, attempt)
                continue
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                last_exc = exc
                if response.status_code >= 500 and attempt + 1 < _MAX_HTTP_RETRIES:
                    wait = min(60.0, 2.0**attempt)
                    logger.warning("Harvest server error %s; retrying in %.1fs (attempt %s/%s)", response.status_code, wait, attempt + 1, _MAX_HTTP_RETRIES)
                    await asyncio.sleep(wait)
                    continue
                raise
            return response.json()
        if last_exc:
            raise last_exc
        raise RuntimeError("Harvest request failed after retries")

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> dict:
        url = f"{self.base_url}{path}" if path.startswith("/") else f"{self.base_url}/{path}"
        return await self._request_json(method="GET", url=url, params=params)

    async def _get_absolute(self, url: str) -> dict:
        """Follow Harvest ``links.next`` (absolute or path-only URL on api.harvestapp.com)."""
        if url.startswith("/"):
            url = f"{self.base_url.rstrip('/')}{url}"
        parsed = urlparse(url)
        if parsed.scheme not in ("https", "http") or "harvestapp.com" not in (parsed.netloc or ""):
            raise ValueError(f"Refusing to fetch non-Harvest URL: {url!r}")
        return await self._request_json(method="GET", url=url, params=None)

    async def _fetch_page(
        self,
        rel_path: str,
        base_params: dict[str, Any],
        page_num: int,
        root_key: str,
        sem: asyncio.Semaphore,
    ) -> list[dict]:
        """Fetch a single numbered page under the shared semaphore."""
        async with sem:
            params = {**base_params, "page": page_num}
            logger.debug("Harvest %s page %s — fetching", rel_path, page_num)
            data = await self._get(rel_path, params)
            items = data.get(root_key, [])
            logger.debug("Harvest %s page %s — got %d items", rel_path, page_num, len(items))
            return items

    async def paginated(
        self,
        path: str,
        root_key: str,
        *,
        params: dict[str, Any] | None = None,
        updated_since: datetime | None = None,
    ) -> AsyncIterator[dict]:
        """
        Paginate a Harvest list endpoint, yielding individual records.

        Page 1 is fetched first (sequential) to read total_pages/total_entries.
        Remaining pages are fetched concurrently in batches of _PAGE_CONCURRENCY.
        Uses per_page=1000 so 60,000 records = 60 pages instead of 600.
        """
        base: dict[str, Any] = {"per_page": _PER_PAGE, **(params or {})}
        if updated_since is not None:
            base["updated_since"] = updated_since.isoformat()

        rel_path = path if path.startswith("/") else f"/{path}"

        # --- Page 1 (sequential) — establishes total_pages ---
        logger.info("Harvest %s — fetching page 1 (per_page=%s, updated_since=%s)", rel_path, _PER_PAGE, base.get("updated_since", "none"))
        payload = await self._get(rel_path, base)
        items = payload.get(root_key, [])
        total_pages: int = int(payload.get("total_pages") or 1)
        total_entries: int = int(payload.get("total_entries") or len(items))

        logger.info(
            "Harvest %s — page 1 complete: %d total page(s), %d total record(s)",
            rel_path, total_pages, total_entries,
        )

        for item in items:
            yield item

        if total_pages <= 1:
            logger.info("Harvest %s — single page, done.", rel_path)
            return

        # --- Pages 2..N (parallel batches) ---
        sem = asyncio.Semaphore(_PAGE_CONCURRENCY)
        total_batches = (total_pages - 1 + _PAGE_CONCURRENCY - 1) // _PAGE_CONCURRENCY
        batch_num = 0

        for batch_start in range(2, total_pages + 1, _PAGE_CONCURRENCY):
            batch_end = min(batch_start + _PAGE_CONCURRENCY, total_pages + 1)
            batch_pages = list(range(batch_start, batch_end))
            batch_num += 1
            logger.info(
                "Harvest %s — batch %d/%d: fetching pages %s-%s in parallel",
                rel_path, batch_num, total_batches, batch_pages[0], batch_pages[-1],
            )

            results = await asyncio.gather(
                *[self._fetch_page(rel_path, base, p, root_key, sem) for p in batch_pages]
            )

            fetched = sum(len(r) for r in results)
            logger.info(
                "Harvest %s — batch %d/%d complete: %d records fetched",
                rel_path, batch_num, total_batches, fetched,
            )

            for page_items in results:
                for item in page_items:
                    yield item

        logger.info("Harvest %s — all %d pages complete, %d total records", rel_path, total_pages, total_entries)

    async def get_project(self, project_id: int) -> dict:
        """GET /v2/projects/{id} — includes inactive/archived projects."""
        logger.debug("Harvest GET /projects/%s", project_id)
        data = await self._get(f"/projects/{int(project_id)}", None)
        return data.get("project") or data

    async def get_client(self, client_id: int) -> dict:
        """GET /v2/clients/{id} — includes inactive clients."""
        logger.debug("Harvest GET /clients/%s", client_id)
        data = await self._get(f"/clients/{int(client_id)}", None)
        return data.get("client") or data

    async def clients(self, *, updated_since: datetime | None = None, is_active: bool | None = None) -> AsyncIterator[dict]:
        params: dict[str, Any] = {}
        if is_active is not None:
            params["is_active"] = "true" if is_active else "false"
        logger.info("Harvest clients — updated_since=%s is_active=%s", updated_since, is_active)
        async for item in self.paginated("/clients", "clients", params=params, updated_since=updated_since):
            yield item

    async def projects(self, *, updated_since: datetime | None = None, is_active: bool | None = None) -> AsyncIterator[dict]:
        params: dict[str, Any] = {}
        if is_active is not None:
            params["is_active"] = "true" if is_active else "false"
        logger.info("Harvest projects — updated_since=%s is_active=%s", updated_since, is_active)
        async for item in self.paginated("/projects", "projects", params=params, updated_since=updated_since):
            yield item

    async def users(self, *, updated_since: datetime | None = None, is_active: bool | None = None) -> AsyncIterator[dict]:
        params: dict[str, Any] = {}
        if is_active is not None:
            params["is_active"] = "true" if is_active else "false"
        logger.info("Harvest users — updated_since=%s is_active=%s", updated_since, is_active)
        async for item in self.paginated("/users", "users", params=params, updated_since=updated_since):
            yield item

    async def user_assignments(self, *, updated_since: datetime | None = None, is_active: bool | None = None) -> AsyncIterator[dict]:
        params: dict[str, Any] = {}
        if is_active is not None:
            params["is_active"] = "true" if is_active else "false"
        logger.info("Harvest user_assignments — updated_since=%s is_active=%s", updated_since, is_active)
        async for item in self.paginated("/user_assignments", "user_assignments", params=params, updated_since=updated_since):
            yield item

    async def time_entries(
        self,
        *,
        updated_since: datetime | None = None,
        spent_date_from: date | None = None,
        spent_date_to: date | None = None,
    ) -> AsyncIterator[dict]:
        """Paginate ``/time_entries``. ``spent_date_*`` map to Harvest ``from`` / ``to`` (work day); ``updated_since`` is last-modified in Harvest."""
        params: dict[str, Any] = {}
        if spent_date_from is not None:
            params["from"] = spent_date_from.isoformat()
        if spent_date_to is not None:
            params["to"] = spent_date_to.isoformat()
        logger.info(
            "Harvest time_entries — updated_since=%s from=%s to=%s",
            updated_since,
            params.get("from"),
            params.get("to"),
        )
        async for item in self.paginated("/time_entries", "time_entries", params=params, updated_since=updated_since):
            yield item
