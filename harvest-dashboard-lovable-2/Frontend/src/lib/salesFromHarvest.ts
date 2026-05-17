import { DEPARTMENTS, type Department, type Project, ROLLUP_DEPARTMENT_IDS } from "@/types/dashboard";

/** Prefer Harvest `createdAt`; fall back to project start when missing. */
export function projectSnapshotDate(p: Project): Date {
  if (p.createdAt) {
    const d = new Date(p.createdAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const s = new Date(p.startDate);
  return Number.isNaN(s.getTime()) ? new Date(0) : s;
}

export function isOpenHarvestProject(p: Project): boolean {
  return p.status !== "completed";
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, delta: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + delta);
  return x;
}

export function countNewProjectsInMonth(projects: Project[], monthStart: Date): number {
  const next = addMonths(monthStart, 1);
  return projects.filter((p) => {
    const t = projectSnapshotDate(p);
    return t >= monthStart && t < next;
  }).length;
}

export type MonthlyProjectTrend = { yearMonth: string; label: string; created: number };

/** Last `count` calendar months ending at `anchor` (inclusive), oldest first. */
export function monthlyNewProjectTrend(projects: Project[], anchor: Date, count: number): MonthlyProjectTrend[] {
  const out: MonthlyProjectTrend[] = [];
  const end = startOfMonth(anchor);
  for (let i = count - 1; i >= 0; i--) {
    const ms = addMonths(end, -i);
    const y = ms.getFullYear();
    const m = ms.getMonth() + 1;
    const yearMonth = `${y}-${String(m).padStart(2, "0")}`;
    const label = ms.toLocaleDateString("en-US", { month: "short" });
    out.push({
      yearMonth,
      label,
      created: countNewProjectsInMonth(projects, ms),
    });
  }
  return out;
}

export type ClientPipelineRow = {
  clientName: string;
  projects: number;
  monthlyFees: number;
  sharePercent: number;
};

export function topClientsByOpenPipeline(projects: Project[], limit: number): ClientPipelineRow[] {
  const open = projects.filter(isOpenHarvestProject);
  const byClient = new Map<string, { projects: number; monthlyFees: number }>();
  for (const p of open) {
    const key = p.clientName || "Unknown";
    const cur = byClient.get(key) ?? { projects: 0, monthlyFees: 0 };
    cur.projects += 1;
    cur.monthlyFees += p.monthlyFee || 0;
    byClient.set(key, cur);
  }
  const rows = [...byClient.entries()]
    .map(([clientName, v]) => ({ clientName, ...v }))
    .sort((a, b) => b.monthlyFees - a.monthlyFees);
  const maxFee = rows[0]?.monthlyFees ?? 0;
  return rows.slice(0, limit).map((r) => ({
    ...r,
    sharePercent: maxFee > 0 ? Math.round((r.monthlyFees / maxFee) * 100) : 0,
  }));
}

export type DepartmentPipelineRow = {
  department: Department;
  name: string;
  color: string;
  activeProjects: number;
  monthlyFees: number;
};

export function pipelineByRollupDepartments(projects: Project[]): DepartmentPipelineRow[] {
  const open = projects.filter(isOpenHarvestProject);
  return ROLLUP_DEPARTMENT_IDS.map((id) => {
    const meta = DEPARTMENTS.find((d) => d.id === id)!;
    const inDept = open.filter((p) => p.department === id);
    const monthlyFees = inDept.reduce((s, p) => s + (p.monthlyFee || 0), 0);
    return {
      department: id,
      name: meta.name,
      color: meta.color,
      activeProjects: inDept.length,
      monthlyFees,
    };
  });
}

export type SalesHarvestKpis = {
  newProjectsThisMonth: number;
  newProjectsLastMonth: number;
  newProjectsMoMPercent: number | null;
  /** Sum of Harvest monthly fee on non-completed projects (open pipeline run-rate). */
  openPipelineMonthlyFees: number;
  /** Share of dashboard projects currently marked completed. */
  completedSharePercent: number;
  /** Mean monthly fee across open projects. */
  avgMonthlyFeeOpen: number;
};

export function computeSalesHarvestKpis(projects: Project[], now: Date = new Date()): SalesHarvestKpis {
  const thisMonth = startOfMonth(now);
  const lastMonth = addMonths(thisMonth, -1);
  const newThis = countNewProjectsInMonth(projects, thisMonth);
  const newLast = countNewProjectsInMonth(projects, lastMonth);
  const newProjectsMoMPercent =
    newLast > 0 ? Math.round(((newThis - newLast) / newLast) * 100) : newThis > 0 ? 100 : null;

  const open = projects.filter(isOpenHarvestProject);
  const openPipelineMonthlyFees = Math.round(open.reduce((s, p) => s + (p.monthlyFee || 0), 0));
  const completed = projects.filter((p) => p.status === "completed").length;
  const completedSharePercent =
    projects.length > 0 ? Math.round((completed / projects.length) * 100) : 0;
  const avgMonthlyFeeOpen =
    open.length > 0 ? Math.round(open.reduce((s, p) => s + (p.monthlyFee || 0), 0) / open.length) : 0;

  return {
    newProjectsThisMonth: newThis,
    newProjectsLastMonth: newLast,
    newProjectsMoMPercent,
    openPipelineMonthlyFees,
    completedSharePercent,
    avgMonthlyFeeOpen,
  };
}
