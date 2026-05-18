import { useMemo } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Department, DepartmentMetrics, ForecastMonth, Project, TeamAssignmentRecord, TeamMember } from "@/types/dashboard";
import { apiClient } from "@/lib/api/client";
import { toast } from "@/hooks/use-toast";
import {
  clearHarvestSyncPending,
  hadLikelyRecentPageUnload,
  setHarvestSyncPending,
} from "@/lib/harvestSyncPending";
import { normalizeProjectStatus } from "@/lib/projectStatusDisplay";

export type SyncPhaseInfo = {
  status: "pending" | "syncing" | "completed" | "error";
  count: number | null;
  total: number | null;
  started_at: string | null;
  completed_at: string | null;
};

export type SyncState = {
  lastSuccessAt: string | null;
  lastError: string | null;
  syncStartedAt: string | null;
  currentPhase: string | null;
  syncPhases: Record<string, SyncPhaseInfo>;
};

export type OperationsDataset = {
  projects: Project[];
  teamMembers: TeamMember[];
  teamHistory: Record<string, TeamAssignmentRecord[]>;
  forecast: Record<Department, ForecastMonth[]>;
  metricsByDepartment: Record<Department, DepartmentMetrics>;
  syncState: SyncState | null;
  source: "api";
};

const DEPARTMENT_IDS: Department[] = ["b2b-firms", "b2b-products", "residential", "marketing", "unassigned"];

function asDepartment(id: string): Department {
  return (DEPARTMENT_IDS.includes(id as Department) ? id : "unassigned") as Department;
}

/** Zero-filled metrics when the API has no row yet for a department. */
export function emptyDepartmentMetrics(department: Department): DepartmentMetrics {
  return {
    department,
    totalRevenue: 0,
    totalCosts: 0,
    netRevenue: 0,
    profitMargin: 0,
    loadedCosts: 0,
    loadedNetRevenue: 0,
    loadedMargin: 0,
    activeProjects: 0,
    pipelineValue: 0,
    avgUtilization: 0,
    teamSize: 0,
  };
}

function buildEmptyDataset(): OperationsDataset {
  const metrics = {
    "b2b-firms": emptyDepartmentMetrics("b2b-firms"),
    "b2b-products": emptyDepartmentMetrics("b2b-products"),
    residential: emptyDepartmentMetrics("residential"),
    marketing: emptyDepartmentMetrics("marketing"),
    unassigned: emptyDepartmentMetrics("unassigned"),
  };

  return {
    projects: [],
    teamMembers: [],
    teamHistory: {},
    forecast: {
      "b2b-firms": [],
      "b2b-products": [],
      residential: [],
      marketing: [],
      unassigned: [],
    },
    metricsByDepartment: metrics,
    syncState: null,
    source: "api",
  };
}

type OverviewProject = {
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
  daysLate?: number | null;
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

type OverviewTeamMember = {
  id: number;
  name: string;
  role: string;
  department?: string;
  projects: number[];
  utilization: number;
  hoursWorked: number;
  targetHours: number;
  costRate?: number | null;
};

type OverviewDepartmentMetric = {
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

type OverviewTeamHistoryRow = {
  memberName: string;
  memberId?: string;
  date: string;
  action: "assigned" | "removed" | string;
  projectName?: string;
};

type SettingsApiResponse = {
  lastSuccessAt: string | null;
  lastError: string | null;
  syncStartedAt: string | null;
  currentPhase: string | null;
  syncPhases: Record<string, SyncPhaseInfo>;
};

async function fetchOperationsDataset(): Promise<OperationsDataset> {
  const [overview, settings] = await Promise.all([
    apiClient.get<{
      projects: OverviewProject[];
      teamMembers: OverviewTeamMember[];
      departmentMetrics: OverviewDepartmentMetric[];
      teamHistory: Record<string, OverviewTeamHistoryRow[]>;
    }>("/api/v1/overview"),
    apiClient.get<SettingsApiResponse>("/api/v1/settings/harvest"),
  ]);

  const projects: Project[] = overview.projects.map((p) => {
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
      daysLate: p.daysLate ?? undefined,
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
  });

  const teamMembers: TeamMember[] = overview.teamMembers.map((member) => {
    const projectIds = member.projects ?? [];
    return {
      id: String(member.id),
      name: member.name,
      role: member.role,
      department: asDepartment(member.department ?? "unassigned"),
      utilization: member.utilization,
      clientLoad: projectIds.length,
      assignedProjects: projectIds.map(String),
      loadedAnnualSalary: member.costRate ?? undefined,
    };
  });

  const metricsByDepartment = { ...buildEmptyDataset().metricsByDepartment };
  for (const m of overview.departmentMetrics) {
    const dep = asDepartment(m.departmentId);
    const tr = m.totalRevenue ?? 0;
    const nr = m.netRevenue ?? 0;
    metricsByDepartment[dep] = {
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
    };
  }

  const teamHistory = Object.fromEntries(
    Object.entries(overview.teamHistory).map(([projectId, rows]) => [
      projectId,
      rows.map((row) => {
        const isRemoved = row.action === "removed";
        return {
          memberId: row.memberId ?? String(row.memberName),
          memberName: row.memberName,
          role: "Team Member",
          assignedDate: row.date,
          removedDate: isRemoved ? row.date : undefined,
          action: isRemoved ? ("removed" as const) : ("assigned" as const),
        };
      }),
    ]),
  ) as Record<string, TeamAssignmentRecord[]>;

  const empty = buildEmptyDataset();

  return {
    projects,
    teamMembers,
    teamHistory,
    forecast: empty.forecast,
    metricsByDepartment,
    syncState: {
      lastSuccessAt: settings.lastSuccessAt,
      lastError: settings.lastError,
      syncStartedAt: settings.syncStartedAt ?? null,
      currentPhase: settings.currentPhase ?? null,
      syncPhases: settings.syncPhases ?? {},
    },
    source: "api",
  };
}

export function useOperationsData() {
  return useQuery({
    queryKey: ["operations-data"],
    queryFn: fetchOperationsDataset,
    staleTime: 1000 * 60 * 5,
  });
}

export function useDepartmentData(departmentId: Department) {
  const query = useOperationsData();
  const data = useMemo(() => {
    const dataset = query.data ?? buildEmptyDataset();
    const deptProjectIds = new Set(
      dataset.projects.filter((p) => p.department === departmentId).map((p) => p.id),
    );
    const team = dataset.teamMembers.filter(
      (m) =>
        m.department === departmentId ||
        (m.assignedProjects ?? []).some((pid) => deptProjectIds.has(String(pid))),
    );
    return {
      metrics: dataset.metricsByDepartment[departmentId],
      projects: dataset.projects.filter((p) => p.department === departmentId),
      team,
      forecast: dataset.forecast[departmentId],
      syncState: dataset.syncState,
      source: dataset.source,
    };
  }, [query.data, departmentId]);
  return { ...query, data };
}

export type ManualHarvestSyncVariables = {
  /** Current "Last synced" value from the UI / operations-data — required so refresh survives empty React Query cache. */
  baselineLastSuccessAt: string | null;
};

/**
 * React Query keys backed by Harvest sync data. Overview uses `operations-data`; most pages use
 * focused hooks from `usePageData` — all must be invalidated when a sync completes or the UI keeps
 * stale rows until the 5-minute `staleTime` expires.
 */
const HARVEST_BACKED_QUERY_KEYS: readonly unknown[][] = [
  ["operations-data"],
  ["projects"],
  ["team-members"],
  ["dashboard"],
  ["date-range"],
  ["team-history"],
  ["harvest-settings-overrides"],
  ["sync-status-live"],
  ["sync-history"],
  ["forecast"],
];

/** Mark all Harvest-backed caches stale and refetch any queries currently mounted. */
export async function invalidateHarvestBackedQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    HARVEST_BACKED_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

/**
 * Refresh/close can abort the in-flight POST; do not wipe persisted "Syncing" in that case.
 * Backend restarts also surface as "Failed to fetch" — only treat that as navigation if we saw a recent `pagehide`.
 */
function isLikelyNavigationOrAbortError(error: unknown): boolean {
  if (error == null) return false;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  const err = error as { name?: string; message?: string };
  if (err.name === "AbortError") return true;
  const msg = typeof err.message === "string" ? err.message : String(error);
  if (/The (user )?aborted|signal is aborted|aborted a request|AbortError|cancel|dismount/i.test(msg)) {
    return true;
  }
  if (/Load failed|Failed to fetch|NetworkError|networkerror/i.test(msg)) {
    return hadLikelyRecentPageUnload();
  }
  return false;
}

export function useManualHarvestSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (_vars: ManualHarvestSyncVariables) => {
      return apiClient.post("/api/v1/sync/harvest");
    },
    onMutate: (vars) => {
      setHarvestSyncPending(vars.baselineLastSuccessAt);
    },
    onSuccess: async () => {
      clearHarvestSyncPending();
      toast({
        title: "Sync finished",
        description: "Dashboard data was refreshed from the server.",
      });
      await invalidateHarvestBackedQueries(queryClient);
    },
    onError: (error: unknown) => {
      if (isLikelyNavigationOrAbortError(error)) {
        return;
      }
      clearHarvestSyncPending();
      toast({
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Harvest sync could not complete.",
        variant: "destructive",
      });
    },
  });
}
