import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Department, DepartmentMetrics, ForecastMonth, Project, TeamAssignmentRecord, TeamMember } from "@/types/dashboard";
import { apiClient } from "@/lib/api/client";
import { emptyDepartmentMetrics } from "@/hooks/useOperationsData";
import { normalizeProjectStatus } from "@/lib/projectStatusDisplay";
import { useDateRangeContext } from "@/contexts/DateRangeContext";

// ---------------------------------------------------------------------------
// Raw API response shapes
// ---------------------------------------------------------------------------

type ApiProject = {
  id: number;
  code: string;
  name: string;
  clientName: string;
  departmentId: string;
  departmentName?: string;
  isActive?: boolean;
  status: string;
  deadline: string | null;
  startsOn?: string | null;
  originalEndDate?: string | null;
  monthlyFee?: number;
  totalRevenue?: number;
  costs?: { freelancers: number; commissions: number; other: number };
  netRevenue?: number;
  profitMargin?: number;
  loadedInternalCost?: number;
  loadedNet?: number;
  loadedMargin?: number;
  assignedTeam?: string[];
  hoursTracked?: number;
  hoursBudgeted?: number;
  utilization?: number;
  createdAt?: string | null;
};

type ApiTeamMember = {
  id: number;
  name: string;
  role: string;
  department?: string;
  projects: number[];
  utilization: number;
  billableUtilization?: number;
  internalUtilization?: number;
  hoursWorked: number;
  targetHours: number;
  costRate?: number | null;
  isContractor?: boolean;
  hasAccessToAllFutureProjects?: boolean;
  canCreateProjects?: boolean;
  calendarIntegrationEnabled?: boolean;
  calendarIntegrationSource?: string;
  avatarUrl?: string;
  timezone?: string;
  telephone?: string;
  employeeId?: string;
  accessRoles?: string[];
  permissionsClaims?: string[];
  roles?: string[];
};

type ApiDepartmentMetric = {
  departmentId: string;
  utilization: number;
  activeProjects: number;
  teamSize: number;
  monthlyBurn: number;
  totalRevenue?: number;
  netRevenue?: number;
  profitMargin?: number;
  loadedCosts?: number;
  loadedNetRevenue?: number;
  loadedMargin?: number;
};

/** Response from `GET /api/v1/dashboard` (projects + team + metrics in one round-trip). */
type ApiDashboardResponse = {
  projects: ApiProject[];
  team: ApiTeamMember[];
  metrics: ApiDepartmentMetric[];
};

type ApiTeamHistoryRow = {
  memberName: string;
  memberId?: string;
  date: string;
  action: "assigned" | "removed" | string;
  projectName?: string;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

const DEPARTMENT_IDS: Department[] = ["b2b-firms", "b2b-products", "residential", "marketing", "unassigned"];

function asDepartment(id: string): Department {
  return (DEPARTMENT_IDS.includes(id as Department) ? id : "unassigned") as Department;
}

function mapProject(p: ApiProject): Project {
  const dept = asDepartment(p.departmentId);
  const costs = p.costs ?? { freelancers: 0, commissions: 0, other: 0 };
  return {
    id: String(p.id),
    code: p.code || p.name,
    projectName: p.name ?? "",
    clientName: p.clientName,
    department: dept,
    isActive: p.isActive ?? true,
    status: normalizeProjectStatus(p.status, p.isActive ?? true),
    startDate: p.startsOn ?? p.deadline ?? new Date().toISOString(),
    endDate: p.deadline ?? p.startsOn ?? new Date().toISOString(),
    originalEndDate: p.originalEndDate ?? undefined,
    monthlyFee: p.monthlyFee ?? 0,
    totalRevenue: p.totalRevenue ?? 0,
    costs,
    netRevenue: p.netRevenue ?? 0,
    profitMargin: p.profitMargin ?? 0,
    loadedInternalCost: p.loadedInternalCost,
    loadedNet: p.loadedNet ?? 0,
    loadedMargin: p.loadedMargin ?? 0,
    assignedTeam: p.assignedTeam ?? [],
    hoursTracked: p.hoursTracked ?? 0,
    hoursBudgeted: p.hoursBudgeted ?? 0,
    utilization: p.utilization ?? 0,
    createdAt: p.createdAt ?? null,
  };
}

function mapTeamMember(member: ApiTeamMember): TeamMember {
  const projectIds = member.projects ?? [];
  return {
    id: String(member.id),
    name: member.name,
    role: member.role,
    department: asDepartment(member.department ?? "unassigned"),
    utilization: member.utilization,
    billableUtilization: member.billableUtilization,
    internalUtilization: member.internalUtilization,
    clientLoad: projectIds.length,
    assignedProjects: projectIds.map(String),
    loadedAnnualSalary: member.costRate ?? undefined,
    isContractor: member.isContractor,
    hasAccessToAllFutureProjects: member.hasAccessToAllFutureProjects,
    canCreateProjects: member.canCreateProjects,
    calendarIntegrationEnabled: member.calendarIntegrationEnabled,
    calendarIntegrationSource: member.calendarIntegrationSource,
    avatarUrl: member.avatarUrl,
    timezone: member.timezone,
    telephone: member.telephone,
    employeeId: member.employeeId,
    accessRoles: member.accessRoles,
    permissionsClaims: member.permissionsClaims,
    roles: member.roles,
  };
}

function mapMetric(m: ApiDepartmentMetric): [Department, DepartmentMetrics] {
  const dep = asDepartment(m.departmentId);
  const tr = m.totalRevenue ?? 0;
  const nr = m.netRevenue ?? 0;
  return [
    dep,
    {
      department: dep,
      totalRevenue: tr,
      totalCosts: Math.max(0, tr - nr),
      netRevenue: nr,
      profitMargin: m.profitMargin ?? 0,
      loadedCosts: m.loadedCosts ?? 0,
      loadedNetRevenue: m.loadedNetRevenue ?? 0,
      loadedMargin: m.loadedMargin ?? 0,
      activeProjects: m.activeProjects,
      pipelineValue: 0,
      avgUtilization: m.utilization,
      teamSize: m.teamSize,
    },
  ];
}

function mapHistoryRows(rows: ApiTeamHistoryRow[]): TeamAssignmentRecord[] {
  return rows.map((row) => {
    const isRemoved = row.action === "removed";
    return {
      memberId: row.memberId ?? String(row.memberName),
      memberName: row.memberName,
      role: "Team Member",
      assignedDate: row.date,
      removedDate: isRemoved ? row.date : undefined,
      action: isRemoved ? ("removed" as const) : ("assigned" as const),
    };
  });
}

// ---------------------------------------------------------------------------
// Shared dashboard bundle (one `/api/v1/dashboard` per date filter)
// ---------------------------------------------------------------------------

/** Normalized payload from `GET /api/v1/dashboard` for reuse across overview + department routes. */
export type DashboardBundleData = {
  projects: Project[];
  teamMembers: TeamMember[];
  metricsByDepartment: Record<Department, DepartmentMetrics>;
};

async function fetchDashboardBundle(dateRange: {
  fromDate: string | null;
  toDate: string | null;
}): Promise<DashboardBundleData> {
  const raw = await apiClient.get<ApiDashboardResponse>("/api/v1/dashboard", {
    from_date: dateRange.fromDate,
    to_date: dateRange.toDate,
  });
  const metricsMap = {} as Record<Department, DepartmentMetrics>;
  for (const m of raw.metrics ?? []) {
    const [dep, metrics] = mapMetric(m);
    metricsMap[dep] = metrics;
  }
  return {
    projects: (raw.projects ?? []).map(mapProject),
    teamMembers: (raw.team ?? []).map(mapTeamMember),
    metricsByDepartment: metricsMap,
  };
}

/** Single React Query subscription for bundled projects/team/metrics (shared query key site-wide). */
function useDashboardBundleQuery() {
  const { dateRange } = useDateRangeContext();
  return useQuery({
    queryKey: ["dashboard", dateRange.fromDate, dateRange.toDate],
    queryFn: () => fetchDashboardBundle(dateRange),
    staleTime: 1000 * 60 * 5,
  });
}

// ---------------------------------------------------------------------------
// Focused hooks — each fetches only what its page needs
// ---------------------------------------------------------------------------

export function useDateRange() {
  return useQuery({
    queryKey: ["date-range"],
    queryFn: async () => {
      const res = await apiClient.get<{
        minDate: string | null;
        maxDate: string | null;
        primaryMinDate: string | null;
      }>("/api/v1/date-range");
      return res;
    },
    staleTime: 1000 * 60 * 30,
  });
}

export function useProjects() {
  const { dateRange } = useDateRangeContext();
  return useQuery({
    queryKey: ["projects", dateRange.fromDate, dateRange.toDate],
    queryFn: async () => {
      const rows = await apiClient.get<ApiProject[]>("/api/v1/projects", {
        from_date: dateRange.fromDate,
        to_date: dateRange.toDate,
      });
      return rows.map(mapProject);
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useTeamMembers() {
  const { dateRange } = useDateRangeContext();
  return useQuery({
    queryKey: ["team-members", dateRange.fromDate, dateRange.toDate],
    queryFn: async () => {
      const rows = await apiClient.get<ApiTeamMember[]>("/api/v1/team", {
        from_date: dateRange.fromDate,
        to_date: dateRange.toDate,
      });
      return rows.map(mapTeamMember);
    },
    staleTime: 1000 * 60 * 5,
  });
}

/** Projects + team from the same cached `/dashboard` bundle (no extra API call). */
export function useAllTeamAndProjects() {
  const q = useDashboardBundleQuery();
  return {
    projects: q.data?.projects ?? ([] as Project[]),
    teamMembers: q.data?.teamMembers ?? ([] as TeamMember[]),
    isPending: q.isPending,
  };
}

/** Overview KPI grid — reads metrics from the same cached `/dashboard` bundle as department pages (avoids a second heavy DB round-trip). */
export function useDepartmentMetrics() {
  const q = useDashboardBundleQuery();
  return {
    data: q.data?.metricsByDepartment,
    isPending: q.isPending,
    isError: q.isError,
    error: q.error,
    isFetching: q.isFetching,
    refetch: q.refetch,
  };
}

export function useTeamHistory() {
  return useQuery({
    queryKey: ["team-history"],
    queryFn: async () => {
      const raw = await apiClient.get<Record<string, ApiTeamHistoryRow[]>>("/api/v1/team-history");
      return Object.fromEntries(
        Object.entries(raw).map(([projectId, rows]) => [projectId, mapHistoryRows(rows)])
      ) as Record<string, TeamAssignmentRecord[]>;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useForecast(departmentId: Department | "all") {
  const { dateRange } = useDateRangeContext();
  return useQuery({
    queryKey: ["forecast", departmentId, dateRange.fromDate, dateRange.toDate],
    queryFn: async () => {
      const rows = await apiClient.get<ForecastMonth[]>(`/api/v1/forecast/${departmentId}`, {
        from_date: dateRange.fromDate,
        to_date: dateRange.toDate,
      });
      return Array.isArray(rows) ? rows : [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useUnmappedCount() {
  return useQuery({
    queryKey: ["unmapped-count"],
    queryFn: async () => {
      const res = await apiClient.get<{ unmappedCount: number }>("/api/v1/unmapped-count");
      return res.unmappedCount ?? 0;
    },
    staleTime: 1000 * 60 * 5,
  });
}

/** One row from `GET /api/v1/sync-history` (Harvest Settings sync log sheet). */
export type SyncHistoryRow = {
  id: number;
  startedAt: string | null;
  completedAt: string | null;
  /** `running` | `success` | `failed` | `stale` (running but started more than 1 hour ago — likely crashed). */
  status: string;
  fromDate: string | null;
  throughDate: string | null;
  fullResync: boolean;
  entriesSynced: number | null;
  triggerSource: string;
  errorMessage: string | null;
};

/**
 * Polls recent Harvest sync runs; refetches every 3s while any row is still `running`
 * so the log sheet updates when a sync finishes without a manual reload.
 */
export function useSyncHistory() {
  return useQuery({
    queryKey: ["sync-history"],
    queryFn: async () => {
      const rows = await apiClient.get<SyncHistoryRow[]>("/api/v1/sync-history");
      return Array.isArray(rows) ? rows : [];
    },
    staleTime: 1000 * 30,
    refetchInterval: (query) =>
      query.state.data?.some((r) => r.status === "running") ? 3000 : false,
  });
}

const FORECAST_PREFETCH_DEPARTMENTS: Array<Department | "all"> = [
  "all",
  "b2b-firms",
  "b2b-products",
  "residential",
  "marketing",
];

/**
 * Prefetch forecast series after date-range changes. Runs **sequentially** so concurrent
 * DB sessions stay under Supabase’s small session-mode pool (parallel prefetches + `/metrics`
 * previously triggered `EMAXCONNSESSION` / HTTP 500).
 */
export function usePrefetchAllForecasts() {
  const queryClient = useQueryClient();
  const { dateRange } = useDateRangeContext();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const departmentId of FORECAST_PREFETCH_DEPARTMENTS) {
        if (cancelled) return;
        await queryClient.prefetchQuery({
          queryKey: ["forecast", departmentId, dateRange.fromDate, dateRange.toDate],
          queryFn: async () => {
            const rows = await apiClient.get<ForecastMonth[]>(`/api/v1/forecast/${departmentId}`, {
              from_date: dateRange.fromDate,
              to_date: dateRange.toDate,
            });
            return Array.isArray(rows) ? rows : [];
          },
          staleTime: 1000 * 60 * 5,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryClient, dateRange.fromDate, dateRange.toDate]);
}

// ---------------------------------------------------------------------------
// Department-scoped view: consolidated dashboard fetch + forecast
// ---------------------------------------------------------------------------

export function useDepartmentData(departmentId: Department) {
  const bundleQuery = useDashboardBundleQuery();

  const forecastQuery = useForecast(departmentId);

  const isPending = bundleQuery.isPending;
  const isForecastPending = forecastQuery.isPending;
  const isError = bundleQuery.isError || forecastQuery.isError;
  const error = bundleQuery.error ?? forecastQuery.error;
  const isFetched = bundleQuery.isFetched && forecastQuery.isFetched;

  const allProjects = bundleQuery.data?.projects ?? [];
  const allMembers = bundleQuery.data?.teamMembers ?? [];
  const allMetrics = bundleQuery.data?.metricsByDepartment ?? ({} as Record<Department, DepartmentMetrics>);
  const forecast = forecastQuery.data ?? [];

  const data = useMemo(() => {
    const deptProjects = allProjects.filter((p) => p.department === departmentId);
    const deptProjectIds = new Set(deptProjects.map((p) => p.id));
    const team = allMembers.filter(
      (m) =>
        m.department === departmentId ||
        (m.assignedProjects ?? []).some((pid) => deptProjectIds.has(pid)),
    );
    return {
      metrics: allMetrics[departmentId] ?? emptyDepartmentMetrics(departmentId),
      projects: deptProjects,
      team,
      forecast,
      syncState: null,
      source: "api" as const,
    };
  }, [allProjects, allMembers, allMetrics, departmentId, forecast]);

  return { data, isPending, isForecastPending, isError, error, isFetched };
}
