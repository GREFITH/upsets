/**
 * Maps UI labels to Postgres tables/columns and API fields for developer tooltips.
 * Ground truth: Backend/app/services/operations_service.py (_build_project_rows, _build_metric_rows, _build_team_rows).
 */

const API_METRICS = "GET /api/v1/metrics → OperationsService.get_department_metrics().";
const API_OVERVIEW = "GET /api/v1/overview → departmentMetrics[] (same aggregation as /metrics).";

const REVENUE_CORE = [
  "Per project: Σ harvest_time_entries.rounded_hours × harvest_time_entries.billable_rate",
  "where billable=true and billable_rate IS NOT NULL (grouped by project_id).",
  "Only harvest_projects with is_active=true and, when client_id is set, harvest_clients.is_active=true.",
  "Department rollup: project_department_map.department on each harvest_projects.harvest_id.",
  "Code path: _build_project_rows (revenue_by_project) then _build_metric_rows sums totalRevenue by departmentId.",
  API_METRICS,
].join("\n");

const NET_CORE = [
  "Revenue (time entries as above) minus project_financial_overrides:",
  "freelancer_cost_override + commission_cost_override + other_cost_override per project.",
  "Code path: _build_project_rows net_revenue = total_revenue - direct_total; metrics sum netRevenue by department.",
  API_METRICS,
].join("\n");

const LOADED_NET_CORE = [
  "Per project: net revenue minus internal loaded cost.",
  "Internal: for users on the project (harvest_user_assignments plus users with hours on that project),",
  "Σ harvest_time_entries.hours × harvest_users.cost_rate for each (user_id, project_id) pair.",
  "Department loadedNetRevenue = Σ netRevenue − Σ loadedInternal across projects in that department.",
  "Code path: _build_project_rows loaded_net; _build_metric_rows aggregates loadedNetRevenue.",
  API_METRICS,
].join("\n");

const ACTIVE_PROJECTS_CORE = [
  "Counts visible projects in the department whose derived status is active or extended",
  "(harvest_projects.is_active, ends_on, project_baselines.original_ends_on).",
  "Code path: _build_metric_rows when row.status in {active, extended}.",
  API_METRICS,
].join("\n");

const TEAM_SIZE_CORE = [
  "teamSize: distinct Harvest user IDs on assignedTeam for visible projects in the department",
  "(harvest_user_assignments plus users inferred from harvest_time_entries on those projects).",
].join("\n");

const UTILIZATION_CORE = [
  "Per active user in _build_team_rows: Σ harvest_time_entries.hours on visible projects ÷ 160 × 100.",
  "Department utilization in metrics: average of those user utilizations for users whose primary department",
  "(mode of project_department_map.department on their projects) matches this department.",
  "Code path: _build_team_rows + _build_metric_rows utilization.",
  API_METRICS,
].join("\n");

/** Top-row KPI cards on DepartmentDashboard (title must match KPICard `title`). */
export const DEPARTMENT_KPI_DATA_SOURCES: Record<string, string> = {
  Revenue: ["Displayed field: totalRevenue.", REVENUE_CORE].join("\n"),
  "Net Revenue": ["Displayed field: netRevenue.", NET_CORE].join("\n"),
  "Loaded Net": ["Displayed field: loadedNetRevenue.", LOADED_NET_CORE].join("\n"),
  "Active Projects": ["Displayed field: activeProjects.", ACTIVE_PROJECTS_CORE].join("\n"),
  Team: ["Displayed fields: teamSize and utilization (chip).", TEAM_SIZE_CORE, UTILIZATION_CORE].join("\n"),
};

/** Overview page KPI titles (wording differs from department page). */
export const OVERVIEW_KPI_DATA_SOURCES: Record<string, string> = {
  "Total Revenue": ["Displayed: sum of each department totalRevenue in the UI.", REVENUE_CORE, API_OVERVIEW].join("\n"),
  "Gross Net": ["Displayed: sum of each department netRevenue in the UI.", NET_CORE, API_OVERVIEW].join("\n"),
  "Loaded Net": ["Displayed: sum of each department loadedNetRevenue in the UI.", LOADED_NET_CORE, API_OVERVIEW].join("\n"),
  Pipeline: [
    "Displayed: sum of metrics.pipelineValue from overview department rows.",
    "Backend currently returns pipelineValue as 0; a full implementation would likely use harvest_projects",
    "status plus fee or project_financial_overrides.monthly_fee_override for pipeline-stage projects.",
    API_OVERVIEW,
  ].join("\n"),
  Team: [
    "Displayed: sum of teamSize; utilization chip is the simple mean of department utilization values in the UI.",
    TEAM_SIZE_CORE,
    UTILIZATION_CORE,
    API_OVERVIEW,
  ].join("\n"),
};

/** Overview department mini-grid (MetricLabel keys). */
export const DEPARTMENT_GRID_METRIC_DATA_SOURCES: Record<string, string> = {
  Revenue: DEPARTMENT_KPI_DATA_SOURCES.Revenue,
  "Net Revenue": DEPARTMENT_KPI_DATA_SOURCES["Net Revenue"],
  "Active Projects": DEPARTMENT_KPI_DATA_SOURCES["Active Projects"],
  "Avg Utilization": ["Displayed field: avgUtilization for that department row.", UTILIZATION_CORE].join("\n"),
};
