from collections import defaultdict
from datetime import date

from sqlalchemy import and_, case, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.models.harvest import (
    DEPT_LABELS,
    ROLLUP_DEPARTMENT_IDS,
    HarvestAssignmentEvent,
    HarvestClient,
    HarvestProject,
    HarvestTimeEntry,
    HarvestUser,
    HarvestUserAssignment,
    ProjectBaseline,
    ProjectDepartmentMap,
    ProjectFinancialOverride,
)


def _override_monthly_total(o: ProjectFinancialOverride | None) -> float:
    if not o:
        return 0.0
    parts = (
        o.monthly_fee_override,
        o.freelancer_cost_override,
        o.commission_cost_override,
        o.other_cost_override,
    )
    return sum(float(x or 0) for x in parts)


def _direct_costs(o: ProjectFinancialOverride | None) -> dict[str, float]:
    if not o:
        return {"freelancers": 0.0, "commissions": 0.0, "other": 0.0}
    return {
        "freelancers": float(o.freelancer_cost_override or 0),
        "commissions": float(o.commission_cost_override or 0),
        "other": float(o.other_cost_override or 0),
    }


def _monthly_fee(p: HarvestProject, o: ProjectFinancialOverride | None) -> float:
    if o and o.monthly_fee_override is not None:
        return float(o.monthly_fee_override)
    return float(p.fee or 0)


def _spent_date_clauses(from_date: date | None, to_date: date | None) -> list:
    """Build WHERE fragments for Harvest time entry date windows (inclusive bounds)."""
    clauses: list = []
    if from_date is not None:
        clauses.append(HarvestTimeEntry.spent_date >= from_date)
    if to_date is not None:
        clauses.append(HarvestTimeEntry.spent_date <= to_date)
    return clauses


def _revenue_line_expression():
    """Billable revenue per row — matches Python: billable and billable_rate truthy."""
    return case(
        (
            and_(HarvestTimeEntry.billable.is_(True), HarvestTimeEntry.billable_rate.isnot(None)),
            HarvestTimeEntry.rounded_hours * HarvestTimeEntry.billable_rate,
        ),
        else_=0,
    )


def _project_user_agg_select(from_date: date | None, to_date: date | None) -> Select:
    """Aggregate hours and billable revenue by (project, user) for dashboard rollups."""
    clauses = _spent_date_clauses(from_date, to_date)
    rev = _revenue_line_expression()
    stmt = (
        select(
            HarvestTimeEntry.project_id,
            HarvestTimeEntry.user_id,
            func.sum(HarvestTimeEntry.hours).label("hours"),
            func.sum(rev).label("revenue"),
        )
        .group_by(HarvestTimeEntry.project_id, HarvestTimeEntry.user_id)
    )
    if clauses:
        stmt = stmt.where(*clauses)
    return stmt


def _month_project_revenue_select(from_date: date | None, to_date: date | None) -> Select:
    """Monthly billable revenue by project for forecast charts."""
    clauses = _spent_date_clauses(from_date, to_date)
    rev = _revenue_line_expression()
    month_bucket = func.date_trunc("month", HarvestTimeEntry.spent_date)
    stmt = (
        select(
            month_bucket.label("month_bucket"),
            HarvestTimeEntry.project_id,
            func.sum(rev).label("revenue"),
        )
        .group_by(month_bucket, HarvestTimeEntry.project_id)
    )
    if clauses:
        stmt = stmt.where(*clauses)
    return stmt


def _parse_project_user_agg_rows(rows: list, visible_ids: set) -> tuple[dict[int, float], list[tuple[int, int, float]]]:
    """Split SQL aggregate rows into revenue-by-project and hour tuples visible to the client model."""
    revenue_by_project: dict[int, float] = defaultdict(float)
    hour_lines: list[tuple[int, int, float]] = []
    for row in rows:
        pid = int(row.project_id)
        if pid not in visible_ids:
            continue
        uid = int(row.user_id)
        hrs = float(row.hours or 0)
        rev = float(row.revenue or 0)
        hour_lines.append((pid, uid, hrs))
        revenue_by_project[pid] += rev
    return revenue_by_project, hour_lines


def _build_visibility(projects: list, clients: list) -> tuple[dict, set, dict]:
    """Return (client_name_by_id, visible_project_ids, project_name_by_id)."""
    client_name_by_id = {c.harvest_id: (c.name or "Unknown Client") for c in clients}
    client_active_by_id = {c.harvest_id: bool(c.is_active) for c in clients}

    def _visible(p: HarvestProject) -> bool:
        if not p.is_active:
            return False
        if p.client_id is None:
            return True
        return client_active_by_id.get(int(p.client_id), True)

    visible_ids = {p.harvest_id for p in projects if _visible(p)}
    project_name_by_id = {p.harvest_id: (p.name or f"Project {p.harvest_id}") for p in projects}
    return client_name_by_id, visible_ids, project_name_by_id


def _build_assignment_maps(
    assignments: list,
    entry_hour_lines: list[tuple[int, int, float]],
    visible_ids: set,
) -> tuple[dict, dict, dict, dict]:
    """Return (assigned_users_by_project, user_projects, hours_by_project, hours_user_project)."""
    assigned_users_by_project: dict[int, list[int]] = defaultdict(list)
    user_projects: dict[int, list[int]] = defaultdict(list)

    for a in assignments:
        if a.is_active and a.project_id in visible_ids:
            assigned_users_by_project[a.project_id].append(a.user_id)
            user_projects[a.user_id].append(a.project_id)

    hours_by_project: dict[int, float] = defaultdict(float)
    hours_user_project: dict[tuple[int, int], float] = defaultdict(float)

    for project_id, user_id, th in entry_hour_lines:
        if project_id not in visible_ids:
            continue
        hours_by_project[project_id] += th
        hours_user_project[(user_id, project_id)] += th

    # Treat anyone with logged hours as assigned (Harvest API can be stale on team membership).
    for (uid, pid), hrs in hours_user_project.items():
        if hrs <= 0 or pid not in visible_ids:
            continue
        lst = assigned_users_by_project[pid]
        if uid not in lst:
            lst.append(uid)
        ups = user_projects[uid]
        if pid not in ups:
            ups.append(pid)

    return assigned_users_by_project, user_projects, hours_by_project, hours_user_project


def _build_project_rows(
    projects: list,
    client_name_by_id: dict,
    visible_ids: set,
    users: list,
    assignments: list,
    dept_maps: list,
    baselines: list,
    revenue_by_project: dict[int, float],
    entry_hour_lines: list[tuple[int, int, float]],
    overrides: list,
    *,
    include_inactive: bool = False,
) -> list[dict]:
    dept_by_project = {m.harvest_project_id: m for m in dept_maps}
    baseline_by_project = {b.harvest_project_id: b for b in baselines}
    override_by_project = {o.harvest_project_id: o for o in overrides}
    user_by_id = {u.harvest_id: u for u in users}

    assigned_users_by_project, _, hours_by_project, hours_user_project = _build_assignment_maps(
        assignments, entry_hour_lines, visible_ids
    )

    project_rows: list[dict] = []
    for p in projects:
        is_active = bool(p.is_active)
        if not include_inactive and p.harvest_id not in visible_ids:
            continue
        dept = dept_by_project.get(p.harvest_id)
        raw_slug = (dept.department if dept else "") or ""
        dept_slug = raw_slug if raw_slug in DEPT_LABELS else "unassigned"
        dept_label = DEPT_LABELS.get(dept_slug, dept_slug.replace("-", " ").title())
        bl = baseline_by_project.get(p.harvest_id)
        if not is_active:
            status = "inactive"
        elif bl and bl.original_ends_on and p.ends_on and p.ends_on > bl.original_ends_on:
            status = "extended"
        else:
            status = "active"

        ov = override_by_project.get(p.harvest_id)
        monthly_fee = _monthly_fee(p, ov)
        costs = _direct_costs(ov)
        direct_total = costs["freelancers"] + costs["commissions"] + costs["other"]
        total_revenue = float(revenue_by_project.get(p.harvest_id, 0.0))
        net_revenue = total_revenue - direct_total
        profit_margin = round((net_revenue / total_revenue) * 100, 2) if total_revenue > 0 else 0.0

        internal_loaded = 0.0
        for uid in assigned_users_by_project.get(p.harvest_id, []):
            u = user_by_id.get(uid)
            hrs = hours_user_project.get((uid, p.harvest_id), 0.0)
            rate = float(u.cost_rate or 0) if u else 0.0
            internal_loaded += hrs * rate

        loaded_net = net_revenue - internal_loaded
        loaded_margin = round((loaded_net / total_revenue) * 100, 2) if total_revenue > 0 else 0.0

        hours_tracked = hours_by_project[p.harvest_id]
        budget_raw = float(p.budget or 0)
        bb = (p.budget_by or "").lower() if p.budget_by else ""
        if budget_raw > 0 and "hour" in bb:
            hours_budgeted = budget_raw
        elif budget_raw > 0:
            hours_budgeted = budget_raw
        else:
            hours_budgeted = max(hours_tracked * 1.2, 1.0)
        utilization = round(min(999.0, (hours_tracked / hours_budgeted) * 100), 2) if hours_budgeted > 0 else 0.0

        days_late = None
        if status == "extended" and bl and bl.original_ends_on and p.ends_on:
            days_late = (p.ends_on - bl.original_ends_on).days

        project_rows.append(
            {
                "id": p.harvest_id,
                "code": (p.code or p.name or f"PRJ-{p.harvest_id}").strip(),
                "name": p.name or f"Project {p.harvest_id}",
                "clientName": client_name_by_id.get(p.client_id, "Unknown Client"),
                "departmentId": dept_slug,
                "departmentName": dept_label,
                "isActive": is_active,
                "status": status,
                "startDate": p.starts_on.isoformat() if p.starts_on else None,
                "endDate": p.ends_on.isoformat() if p.ends_on else None,
                "originalEndDate": bl.original_ends_on.isoformat() if bl and bl.original_ends_on else None,
                "daysLate": days_late,
                "monthlyFee": round(monthly_fee, 2),
                "totalRevenue": round(total_revenue, 2),
                "costs": {k: round(v, 2) for k, v in costs.items()},
                "netRevenue": round(net_revenue, 2),
                "profitMargin": profit_margin,
                "loadedInternalCost": round(internal_loaded, 2),
                "loadedNet": round(loaded_net, 2),
                "loadedMargin": loaded_margin,
                "assignedTeam": [str(uid) for uid in assigned_users_by_project.get(p.harvest_id, [])],
                "hoursTracked": round(hours_tracked, 2),
                "hoursBudgeted": round(hours_budgeted, 2),
                "utilization": utilization,
                "createdAt": p.created_at.isoformat() if p.created_at else None,
            }
        )
    return project_rows


def _build_team_rows(
    users: list,
    assignments: list,
    dept_maps: list,
    entry_hour_lines: list[tuple[int, int, float]],
    visible_ids: set,
    entries: list = None,
) -> list[dict]:
    dept_by_project = {m.harvest_project_id: m for m in dept_maps}
    _, user_projects, _, _ = _build_assignment_maps(assignments, entry_hour_lines, visible_ids)

    def primary_department_for_user(uid: int) -> str:
        pids = user_projects.get(uid) or []
        counts: dict[str, int] = defaultdict(int)
        for pid in pids:
            m = dept_by_project.get(pid)
            if m:
                counts[m.department] += 1
        if counts:
            return max(counts, key=counts.get)  # type: ignore[arg-type]
        return "unassigned"

    member_hours: dict[int, float] = defaultdict(float)
    member_billable_hours: dict[int, float] = defaultdict(float)
    member_internal_hours: dict[int, float] = defaultdict(float)

    for project_id, user_id, th in entry_hour_lines:
        if project_id in visible_ids:
            member_hours[user_id] += th

    # If entries are provided, calculate billable vs internal breakdown
    if entries:
        for entry in entries:
            if entry.project_id in visible_ids and entry.user_id:
                if entry.billable:
                    member_billable_hours[entry.user_id] += float(entry.rounded_hours or 0)
                else:
                    member_internal_hours[entry.user_id] += float(entry.rounded_hours or 0)

    team_rows = []
    for u in users:
        if not u.is_active:
            continue
        hours = member_hours.get(u.harvest_id, 0.0)
        billable_hours = member_billable_hours.get(u.harvest_id, 0.0)
        internal_hours = member_internal_hours.get(u.harvest_id, 0.0)
        target = 160.0
        utilization = round((hours / target) * 100, 2) if target else 0.0
        billable_utilization = round((billable_hours / target) * 100, 2) if target else 0.0
        internal_utilization = round((internal_hours / target) * 100, 2) if target else 0.0
        dept = primary_department_for_user(u.harvest_id)
        role_str = "Team Member"
        if u.roles:
            if isinstance(u.roles, list):
                role_str = u.roles[0] if u.roles else "Team Member"
            else:
                role_str = str(u.roles).split(",")[0].strip()

        team_rows.append(
            {
                "id": u.harvest_id,
                "name": f"{u.first_name or ''} {u.last_name or ''}".strip() or f"User {u.harvest_id}",
                "role": role_str,
                "department": dept,
                "projects": list(dict.fromkeys(user_projects.get(u.harvest_id, []))),
                "utilization": utilization,
                "billableUtilization": billable_utilization,
                "internalUtilization": internal_utilization,
                "hoursWorked": round(hours, 2),
                "targetHours": target,
                "costRate": float(u.cost_rate) if u.cost_rate is not None else None,
                "isContractor": u.is_contractor,
                "avatarUrl": u.avatar_url,
                "timezone": u.timezone,
                "accessRoles": u.access_roles,
                "canCreateProjects": u.can_create_projects,
                "roles": u.roles,
                "hasAccessToAllFutureProjects": u.has_access_to_all_future_projects,
                "calendarIntegrationEnabled": u.calendar_integration_enabled,
                "calendarIntegrationSource": u.calendar_integration_source,
                "permissionsClaims": u.permissions_claims,
                "employeeId": u.employee_id,
                "telephone": u.telephone,
            }
        )
    return team_rows


def _build_metric_rows(project_rows: list[dict], team_rows: list[dict], override_by_project: dict) -> list[dict]:
    dept_metrics: dict[str, dict] = defaultdict(
        lambda: {
            "utilization": 0.0,
            "activeProjects": 0,
            "teamSize": 0,
            "monthlyBurn": 0.0,
            "totalRevenue": 0.0,
            "netRevenue": 0.0,
            "directCosts": 0.0,
            "loadedInternal": 0.0,
        }
    )
    for row in project_rows:
        metric = dept_metrics[row["departmentId"]]
        if row["status"] in {"active", "extended"}:
            metric["activeProjects"] += 1
        ov = override_by_project.get(row["id"])
        metric["monthlyBurn"] = float(metric["monthlyBurn"]) + _override_monthly_total(ov)
        tr = float(row["totalRevenue"])
        metric["totalRevenue"] = float(metric["totalRevenue"]) + tr
        metric["netRevenue"] = float(metric["netRevenue"]) + float(row["netRevenue"])
        dc = float(row["costs"]["freelancers"]) + float(row["costs"]["commissions"]) + float(row["costs"]["other"])
        metric["directCosts"] = float(metric["directCosts"]) + dc
        metric["loadedInternal"] = float(metric["loadedInternal"]) + float(row["loadedInternalCost"])

    # Team size = unique users assigned to any visible project in a department.
    dept_member_ids: dict[str, set[int]] = defaultdict(set)
    for row in project_rows:
        dep = row["departmentId"]
        for uid_str in row["assignedTeam"]:
            dept_member_ids[dep].add(int(uid_str))
    for dep_id, mids in dept_member_ids.items():
        dept_metrics[dep_id]["teamSize"] = len(mids)

    for dep_id in dept_metrics:
        members_in_dep = [m for m in team_rows if m["department"] == dep_id]
        if members_in_dep:
            dept_metrics[dep_id]["utilization"] = round(
                sum(m["utilization"] for m in members_in_dep) / len(members_in_dep), 2
            )

    for dep_id, vals in dept_metrics.items():
        tr = float(vals["totalRevenue"])
        nr = float(vals["netRevenue"])
        li = float(vals["loadedInternal"])
        vals["profitMargin"] = round((nr / tr) * 100, 2) if tr > 0 else 0.0
        ln = nr - li
        vals["loadedNetRevenue"] = round(ln, 2)
        vals["loadedCosts"] = round(float(vals["directCosts"]) + li, 2)
        vals["loadedMargin"] = round((ln / tr) * 100, 2) if tr > 0 else 0.0

    return [
        {
            "departmentId": department_id,
            "utilization": float(values["utilization"]),
            "activeProjects": int(values["activeProjects"]),
            "teamSize": int(values["teamSize"]),
            "monthlyBurn": round(float(values["monthlyBurn"]), 2),
            "totalRevenue": round(float(values["totalRevenue"]), 2),
            "netRevenue": round(float(values["netRevenue"]), 2),
            "profitMargin": float(values.get("profitMargin", 0)),
            "loadedCosts": round(float(values.get("loadedCosts", 0)), 2),
            "loadedNetRevenue": round(float(values.get("loadedNetRevenue", 0)), 2),
            "loadedMargin": float(values.get("loadedMargin", 0)),
        }
        for department_id, values in dept_metrics.items()
        if department_id in ROLLUP_DEPARTMENT_IDS
    ]


class OperationsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _gather_projects_bundle(
        self, from_date: date | None, to_date: date | None
    ) -> tuple[list, list, list, list, list, list, list, list]:
        """Load dimension tables + entry aggregates on the request session.
        Sequential reads avoid exhausting the PgBouncer 15-connection pool when
        multiple endpoints fan out on a single page load."""
        db = self.db
        projects    = (await db.execute(select(HarvestProject))).scalars().all()
        clients     = (await db.execute(select(HarvestClient))).scalars().all()
        users       = (await db.execute(select(HarvestUser))).scalars().all()
        assignments = (await db.execute(select(HarvestUserAssignment))).scalars().all()
        dept_maps   = (await db.execute(select(ProjectDepartmentMap))).scalars().all()
        baselines   = (await db.execute(select(ProjectBaseline))).scalars().all()
        agg_rows    = (await db.execute(_project_user_agg_select(from_date, to_date))).all()
        overrides   = (await db.execute(select(ProjectFinancialOverride))).scalars().all()
        return projects, clients, users, assignments, dept_maps, baselines, agg_rows, overrides

    async def _gather_team_bundle(
        self, from_date: date | None, to_date: date | None
    ) -> tuple[list, list, list, list, list, list]:
        """Subset of project bundle (no baselines / overrides) for team-only endpoint."""
        db = self.db
        projects    = (await db.execute(select(HarvestProject))).scalars().all()
        clients     = (await db.execute(select(HarvestClient))).scalars().all()
        users       = (await db.execute(select(HarvestUser))).scalars().all()
        assignments = (await db.execute(select(HarvestUserAssignment))).scalars().all()
        dept_maps   = (await db.execute(select(ProjectDepartmentMap))).scalars().all()
        agg_rows    = (await db.execute(_project_user_agg_select(from_date, to_date))).all()
        return projects, clients, users, assignments, dept_maps, agg_rows

    async def _gather_forecast_bundle(
        self, from_date: date | None, to_date: date | None
    ) -> tuple[list, list, list, list, list]:
        """Forecast inputs: org shape + monthly revenue aggregates."""
        db = self.db
        projects     = (await db.execute(select(HarvestProject))).scalars().all()
        clients      = (await db.execute(select(HarvestClient))).scalars().all()
        dept_maps    = (await db.execute(select(ProjectDepartmentMap))).scalars().all()
        overrides    = (await db.execute(select(ProjectFinancialOverride))).scalars().all()
        monthly_rows = (await db.execute(_month_project_revenue_select(from_date, to_date))).all()
        return projects, clients, dept_maps, overrides, monthly_rows

    async def _fetch_entries(self, from_date: date | None, to_date: date | None) -> list:
        q = select(HarvestTimeEntry)
        if from_date:
            q = q.where(HarvestTimeEntry.spent_date >= from_date)
        if to_date:
            q = q.where(HarvestTimeEntry.spent_date <= to_date)
        return (await self.db.execute(q)).scalars().all()

    async def get_date_range(self) -> dict:
        """Bounds for the date picker: min/max and 95% floor all use ``spent_date <= CURRENT_DATE`` only."""
        sql = text(
            """
            WITH past AS (
                SELECT spent_date FROM harvest_time_entries
                WHERE spent_date <= CURRENT_DATE
            ),
            ranked AS (
                SELECT spent_date,
                       ROW_NUMBER() OVER (ORDER BY spent_date DESC) AS rn,
                       COUNT(*) OVER () AS total
                FROM past
            )
            SELECT
                (SELECT MIN(spent_date) FROM past) AS min_date,
                (SELECT MAX(spent_date) FROM past) AS max_date,
                (SELECT MIN(spent_date) FROM ranked
                 WHERE total > 0 AND rn <= CEIL(total::numeric * 0.95)::bigint) AS primary_min
            """
        )
        row = (await self.db.execute(sql)).one()
        min_date, max_date, primary_min = row[0], row[1], row[2]
        return {
            "minDate": min_date.isoformat() if min_date else None,
            "maxDate": max_date.isoformat() if max_date else None,
            "primaryMinDate": primary_min.isoformat() if primary_min else None,
        }

    async def get_projects(self, *, from_date: date | None = None, to_date: date | None = None) -> list[dict]:
        """Project list with financials — parallel base load + SQL rollups for time."""
        (
            projects,
            clients,
            users,
            assignments,
            dept_maps,
            baselines,
            agg_rows,
            overrides,
        ) = await self._gather_projects_bundle(from_date, to_date)
        client_name_by_id, visible_ids, _ = _build_visibility(projects, clients)
        revenue_by_project, hour_lines = _parse_project_user_agg_rows(agg_rows, visible_ids)
        return _build_project_rows(
            projects,
            client_name_by_id,
            visible_ids,
            users,
            assignments,
            dept_maps,
            baselines,
            revenue_by_project,
            hour_lines,
            overrides,
            include_inactive=True,
        )

    async def get_team_members(self, *, from_date: date | None = None, to_date: date | None = None) -> list[dict]:
        """Team list with utilization — parallel base load + same entry aggregates as metrics."""
        projects, clients, users, assignments, dept_maps, agg_rows = await self._gather_team_bundle(
            from_date, to_date
        )
        _, visible_ids, _ = _build_visibility(projects, clients)
        _, hour_lines = _parse_project_user_agg_rows(agg_rows, visible_ids)
        entries = await self._fetch_entries(from_date, to_date)
        return _build_team_rows(users, assignments, dept_maps, hour_lines, visible_ids, entries)

    async def get_department_metrics(self, *, from_date: date | None = None, to_date: date | None = None) -> list[dict]:
        """Department KPI rows — reuses project + team builders on aggregated time."""
        (
            projects,
            clients,
            users,
            assignments,
            dept_maps,
            baselines,
            agg_rows,
            overrides,
        ) = await self._gather_projects_bundle(from_date, to_date)
        client_name_by_id, visible_ids, _ = _build_visibility(projects, clients)
        revenue_by_project, hour_lines = _parse_project_user_agg_rows(agg_rows, visible_ids)
        project_rows = _build_project_rows(
            projects,
            client_name_by_id,
            visible_ids,
            users,
            assignments,
            dept_maps,
            baselines,
            revenue_by_project,
            hour_lines,
            overrides,
        )
        entries = await self._fetch_entries(from_date, to_date)
        team_rows = _build_team_rows(users, assignments, dept_maps, hour_lines, visible_ids, entries)
        override_by_project = {o.harvest_project_id: o for o in overrides}
        return _build_metric_rows(project_rows, team_rows, override_by_project)

    async def get_dashboard(self, *, from_date: date | None = None, to_date: date | None = None) -> dict:
        """One shared base-fetch for department pages: same payloads as /projects, /team, /metrics."""
        (
            projects,
            clients,
            users,
            assignments,
            dept_maps,
            baselines,
            agg_rows,
            overrides,
        ) = await self._gather_projects_bundle(from_date, to_date)
        client_name_by_id, visible_ids, _ = _build_visibility(projects, clients)
        revenue_by_project, hour_lines = _parse_project_user_agg_rows(agg_rows, visible_ids)
        override_by_project = {o.harvest_project_id: o for o in overrides}

        projects_payload = _build_project_rows(
            projects,
            client_name_by_id,
            visible_ids,
            users,
            assignments,
            dept_maps,
            baselines,
            revenue_by_project,
            hour_lines,
            overrides,
            include_inactive=True,
        )
        team_payload = _build_team_rows(users, assignments, dept_maps, hour_lines, visible_ids)
        project_rows_for_metrics = _build_project_rows(
            projects,
            client_name_by_id,
            visible_ids,
            users,
            assignments,
            dept_maps,
            baselines,
            revenue_by_project,
            hour_lines,
            overrides,
            include_inactive=False,
        )
        metrics_payload = _build_metric_rows(project_rows_for_metrics, team_payload, override_by_project)
        return {
            "projects": projects_payload,
            "team": team_payload,
            "metrics": metrics_payload,
        }

    async def get_team_history(self) -> dict:
        """4 queries — returns assignment event history per project. Minimal queries."""
        projects = (await self.db.execute(select(HarvestProject))).scalars().all()
        clients = (await self.db.execute(select(HarvestClient))).scalars().all()
        _, visible_ids, project_name_by_id = _build_visibility(projects, clients)

        users = (await self.db.execute(select(HarvestUser))).scalars().all()
        events = (await self.db.execute(select(HarvestAssignmentEvent))).scalars().all()

        user_name_by_id = {
            u.harvest_id: f"{u.first_name or ''} {u.last_name or ''}".strip() or f"User {u.harvest_id}"
            for u in users
        }

        history: dict[str, list[dict]] = defaultdict(list)
        for event in sorted(events, key=lambda x: x.happened_at, reverse=True):
            if event.project_id not in visible_ids:
                continue
            history[str(event.project_id)].append(
                {
                    "date": event.happened_at.date().isoformat(),
                    "action": event.action,
                    "memberId": str(event.user_id),
                    "memberName": user_name_by_id.get(event.user_id, f"User {event.user_id}"),
                    "projectName": project_name_by_id.get(event.project_id, f"Project {event.project_id}"),
                    "reason": None,
                }
            )
        return dict(history)

    async def get_unmapped_project_count(self) -> dict:
        """Count active projects that have billable time entries but no department mapping."""
        projects = (await self.db.execute(select(HarvestProject))).scalars().all()
        clients = (await self.db.execute(select(HarvestClient))).scalars().all()
        _, visible_ids, _ = _build_visibility(projects, clients)

        dept_maps = (await self.db.execute(select(ProjectDepartmentMap))).scalars().all()
        mapped_ids = {m.harvest_project_id for m in dept_maps}

        entries = (await self.db.execute(select(HarvestTimeEntry))).scalars().all()
        projects_with_hours: set[int] = set()
        for e in entries:
            if e.project_id in visible_ids and e.billable:
                projects_with_hours.add(e.project_id)

        unmapped = projects_with_hours - mapped_ids
        return {"unmappedCount": len(unmapped)}

    async def get_forecast(self, department_id: str, *, from_date: date | None = None, to_date: date | None = None) -> list[dict]:
        """Monthly revenue forecast — parallel dimension load + grouped monthly revenue SQL."""
        projects, clients, dept_maps, overrides, monthly_rows = await self._gather_forecast_bundle(
            from_date, to_date
        )
        _, visible_ids, _ = _build_visibility(projects, clients)

        if department_id == "all":
            dept_visible = visible_ids
        else:
            dept_project_ids = {m.harvest_project_id for m in dept_maps if m.department == department_id}
            dept_visible = visible_ids & dept_project_ids

        total_direct_costs = sum(
            float(o.freelancer_cost_override or 0)
            + float(o.commission_cost_override or 0)
            + float(o.other_cost_override or 0)
            for o in overrides
            if o.harvest_project_id in dept_visible
        )

        revenue_by_month_key: dict[tuple[int, int], float] = defaultdict(float)
        for row in monthly_rows:
            pid = int(row.project_id)
            if pid not in dept_visible:
                continue
            mb = row.month_bucket
            if mb is None:
                continue
            y = int(mb.year)
            m = int(mb.month)
            revenue_by_month_key[(y, m)] += float(row.revenue or 0)

        # Compute cost ratio from total historical revenue so costs scale with revenue
        # per month rather than being deducted as a fixed constant every month.
        total_historical_revenue = sum(revenue_by_month_key.values())
        cost_ratio = (total_direct_costs / total_historical_revenue) if total_historical_revenue > 0 else 0.0

        def _add_months(d: date, n: int) -> date:
            m = d.month + n
            y = d.year + (m - 1) // 12
            m = ((m - 1) % 12) + 1
            return d.replace(year=y, month=m)

        today = date.today()
        first_of_month = today.replace(day=1)

        # Build the list of months to show as actuals.
        # When a date range is specified, enumerate months within that window.
        # Otherwise default to the last 12 months rolling window.
        months: list[dict] = []
        if from_date and to_date:
            cur = from_date.replace(day=1)
            end_month = to_date.replace(day=1)
            while cur <= end_month:
                rev = revenue_by_month_key.get((cur.year, cur.month), 0.0)
                costs = round(rev * cost_ratio, 2)
                months.append({
                    "month": cur.strftime("%b %y"),
                    "revenue": round(rev, 2),
                    "costs": costs,
                    "netRevenue": round(rev - costs, 2),
                    "projected": False,
                })
                cur = _add_months(cur, 1)
        else:
            for i in range(11, -1, -1):
                d = _add_months(first_of_month, -i)
                rev = revenue_by_month_key.get((d.year, d.month), 0.0)
                costs = round(rev * cost_ratio, 2)
                months.append({
                    "month": d.strftime("%b %y"),
                    "revenue": round(rev, 2),
                    "costs": costs,
                    "netRevenue": round(rev - costs, 2),
                    "projected": False,
                })

        last_3 = [m["revenue"] for m in months[-3:] if m["revenue"] > 0]
        avg_revenue = sum(last_3) / len(last_3) if last_3 else 0.0
        avg_costs = round(avg_revenue * cost_ratio, 2)

        # Only add projections when no explicit end date is set (open-ended view)
        if not to_date:
            for i in range(1, 4):
                d = _add_months(first_of_month, i)
                months.append({
                    "month": d.strftime("%b %y"),
                    "revenue": round(avg_revenue, 2),
                    "costs": avg_costs,
                    "netRevenue": round(avg_revenue - avg_costs, 2),
                    "projected": True,
                })

        return months

    async def get_overview(self) -> dict:
        """Legacy overview — parallel bundle for Harvest-backed tables + assignment events on request session."""
        (
            projects,
            clients,
            users,
            assignments,
            dept_maps,
            baselines,
            agg_rows,
            overrides,
        ) = await self._gather_projects_bundle(None, None)
        client_name_by_id, visible_ids, project_name_by_id = _build_visibility(projects, clients)
        events = (await self.db.execute(select(HarvestAssignmentEvent))).scalars().all()

        revenue_by_project, hour_lines = _parse_project_user_agg_rows(agg_rows, visible_ids)
        project_rows = _build_project_rows(
            projects,
            client_name_by_id,
            visible_ids,
            users,
            assignments,
            dept_maps,
            baselines,
            revenue_by_project,
            hour_lines,
            overrides,
        )
        entries = await self._fetch_entries(None, None)
        team_rows = _build_team_rows(users, assignments, dept_maps, hour_lines, visible_ids, entries)
        override_by_project = {o.harvest_project_id: o for o in overrides}
        metric_rows = _build_metric_rows(project_rows, team_rows, override_by_project)

        user_name_by_id = {
            u.harvest_id: f"{u.first_name or ''} {u.last_name or ''}".strip() or f"User {u.harvest_id}"
            for u in users
        }
        history: dict[str, list[dict]] = defaultdict(list)
        for event in sorted(events, key=lambda x: x.happened_at, reverse=True):
            if event.project_id not in visible_ids:
                continue
            history[str(event.project_id)].append(
                {
                    "date": event.happened_at.date().isoformat(),
                    "action": event.action,
                    "memberId": str(event.user_id),
                    "memberName": user_name_by_id.get(event.user_id, f"User {event.user_id}"),
                    "projectName": project_name_by_id.get(event.project_id, f"Project {event.project_id}"),
                    "reason": None,
                }
            )

        return {
            "projects": project_rows,
            "teamMembers": team_rows,
            "departmentMetrics": metric_rows,
            "teamHistory": dict(history),
        }
