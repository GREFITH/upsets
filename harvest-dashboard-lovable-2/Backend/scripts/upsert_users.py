#!/usr/bin/env python3
"""Upsert Harvest users from response.json into the database."""

import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.harvest import HarvestUser


def _num(value):
    """Parse numeric value safely."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


async def upsert_users_from_json(json_path: Path):
    """Load users from JSON file and upsert into database."""

    # Read JSON file
    with open(json_path) as f:
        data = json.load(f)

    users_data = data.get("users", [])
    print(f"Found {len(users_data)} users in JSON file")

    # Build row dicts
    rows = []
    for user in users_data:
        row = {
            "harvest_id": int(user["id"]),
            "first_name": (user.get("first_name") or "").strip(),
            "last_name": (user.get("last_name") or "").strip(),
            "email": user.get("email"),
            "is_contractor": bool(user.get("is_contractor", False)),
            "has_access_to_all_future_projects": bool(user.get("has_access_to_all_future_projects", False)),
            "can_create_projects": bool(user.get("can_create_projects", False)),
            "calendar_integration_enabled": bool(user.get("calendar_integration_enabled", False)),
            "avatar_url": user.get("avatar_url"),
            "timezone": user.get("timezone"),
            "telephone": user.get("telephone") or None,
            "employee_id": user.get("employee_id"),
            "calendar_integration_source": user.get("calendar_integration_source"),
            "access_roles": user.get("access_roles", []),
            "permissions_claims": user.get("permissions_claims", {}),
            "roles": user.get("roles", []),
            "is_active": bool(user.get("is_active", True)),
            "weekly_capacity": _num(user.get("weekly_capacity")),
            "default_hourly_rate": _num(user.get("default_hourly_rate")),
            "cost_rate": _num(user.get("cost_rate")),
        }
        rows.append(row)

    # Connect and upsert
    engine = create_async_engine(settings.database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            # Check if table has data
            result = await session.execute(select(HarvestUser).limit(1))
            existing = result.scalar_one_or_none()

            if existing:
                print(f"Table has existing data. Upserting {len(rows)} users...")
            else:
                print(f"Table is empty. Inserting {len(rows)} users...")

            # Upsert columns
            upsert_cols = (
                "first_name", "last_name", "email", "is_contractor", "has_access_to_all_future_projects",
                "can_create_projects", "calendar_integration_enabled", "avatar_url", "timezone", "telephone",
                "employee_id", "calendar_integration_source", "access_roles", "permissions_claims", "roles",
                "is_active", "weekly_capacity", "default_hourly_rate", "cost_rate"
            )

            # Bulk upsert
            stmt = pg_insert(HarvestUser).values(rows)
            stmt = stmt.on_conflict_do_update(
                index_elements=["harvest_id"],
                set_={c: getattr(stmt.excluded, c) for c in upsert_cols},
            )

            result = await session.execute(stmt)
            await session.commit()

            print(f"✓ Upserted {len(rows)} users successfully")

            # Show summary
            count_result = await session.execute(select(HarvestUser))
            total = len(count_result.scalars().all())
            contractors_result = await session.execute(
                select(HarvestUser).where(HarvestUser.is_contractor == True)
            )
            contractors = len(contractors_result.scalars().all())

            print(f"\nDatabase Summary:")
            print(f"  Total users: {total}")
            print(f"  Contractors: {contractors}")
            print(f"  Full-time: {total - contractors}")

    finally:
        await engine.dispose()


async def main():
    """Main entry point."""
    json_file = Path("/Users/grefithgohel/Desktop/UPTESTS/harvest-dashboard-lovable-2/users response.json")

    if not json_file.exists():
        print(f"Error: {json_file} not found")
        sys.exit(1)

    await upsert_users_from_json(json_file)


if __name__ == "__main__":
    asyncio.run(main())
