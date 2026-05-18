import { useState } from "react";
import { motion } from "framer-motion";
import { Info, AlertTriangle, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DEPARTMENTS } from "@/types/dashboard";
import { KPICard } from "@/components/dashboard/KPICard";
import { ForecastChart } from "@/components/dashboard/ForecastChart";
import { NewProjectDialog } from "@/components/dashboard/NewProjectDialog";
import { KPICardSkeleton, ChartSkeleton, DeptCardSkeleton } from "@/components/dashboard/Skeletons";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingUp, Users, Briefcase, Plus } from "lucide-react";
import { emptyDepartmentMetrics } from "@/hooks/useOperationsData";
import { useSyncHistory, useDepartmentMetrics, useForecast, usePrefetchAllForecasts, useUnmappedCount, useAllTeamAndProjects } from "@/hooks/usePageData";
import { TeamGanttChart } from "@/components/dashboard/TeamGanttChart";
import {
  DEPARTMENT_GRID_METRIC_DATA_SOURCES,
  OVERVIEW_KPI_DATA_SOURCES,
} from "@/lib/dashboardDeveloperSources";
import { DateRangePicker } from "@/components/dashboard/DateRangePicker";
import { useDateRangeContext } from "@/contexts/DateRangeContext";
import { formatRangeSubtitle } from "@/lib/formatRangeSubtitle";
import { IS_DEV_MODE } from "@/lib/devMode";

const METRIC_FORMULAS: Record<string, string> = {
  Revenue: "Σ (rounded_hours × billable_rate)\nfor all billable time entries in the period",
  "Net Revenue": "Revenue − Direct Costs\nDirect Costs = freelancer + commission + other overrides",
  "Active Projects": "Count of projects with status 'active' or 'extended'\n(excludes inactive / archived projects)",
  "Avg Utilization": "Avg of (hours_worked ÷ 160 × 100) per member\n(160 hrs = standard monthly capacity)",
};

function MetricLabel({ label }: { label: string }) {
  const formula = METRIC_FORMULAS[label];
  const dataSource = DEPARTMENT_GRID_METRIC_DATA_SOURCES[label];
  const hasTooltips = Boolean(formula || dataSource);
  return (
    <div className="flex items-center gap-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      {hasTooltips && (
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-0.5">
            {formula && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={`How ${label} is calculated`}
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed whitespace-pre-line">
                  {formula}
                </TooltipContent>
              </Tooltip>
            )}
            {dataSource && IS_DEV_MODE && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-sm border border-transparent text-[8px] font-bold font-mono leading-none text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                    aria-label={`Data sources for ${label} (developer)`}
                  >
                    D
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-md text-xs leading-relaxed whitespace-pre-line">
                  {dataSource}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}

export default function OverviewDashboard() {
  const navigate = useNavigate();
  const { dateRange } = useDateRangeContext();
  const { data: syncHistory = [] } = useSyncHistory();
  const lastSync = syncHistory.find((r) => r.status === "success");
  const { data: unmappedCount = 0 } = useUnmappedCount();
  const { data: metricsMap, isPending } = useDepartmentMetrics();
  const allMetrics = DEPARTMENTS.map((d) => metricsMap?.[d.id] ?? emptyDepartmentMetrics(d.id));
  const totalRevenue = allMetrics.reduce((s, m) => s + m.totalRevenue, 0);
  const totalNet = allMetrics.reduce((s, m) => s + m.netRevenue, 0);
  const totalLoadedNet = allMetrics.reduce((s, m) => s + m.loadedNetRevenue, 0);
  const totalPipeline = allMetrics.reduce((s, m) => s + m.pipelineValue, 0);
  const avgMargin = totalRevenue > 0 ? (totalNet / totalRevenue) * 100 : 0;
  const avgLoadedMargin = totalRevenue > 0 ? (totalLoadedNet / totalRevenue) * 100 : 0;
  const totalTeam = allMetrics.reduce((s, m) => s + m.teamSize, 0);
  const avgUtil = allMetrics.reduce((s, m) => s + m.avgUtilization, 0) / allMetrics.length;

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", minimumFractionDigits: 0 }).format(n);

  const { data: combinedForecast = [], isPending: isForecastPending } = useForecast("all");
  const { projects: allProjects, teamMembers: allTeamMembers, isPending: isGanttPending } = useAllTeamAndProjects();
  usePrefetchAllForecasts();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  const dismissAlert = (alertId: string) => {
    setDismissedAlerts(prev => new Set(prev).add(alertId));
  };


  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {unmappedCount > 0 && !dismissedAlerts.has("unmapped") && (
        <div className="flex items-start justify-between gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              <span className="font-medium">{unmappedCount} active project{unmappedCount !== 1 ? "s" : ""} with tracked hours have no department assigned.</span>
              {" "}Their revenue is hidden from all department charts.{" "}
              <button
                onClick={() => navigate("/dashboard/settings")}
                className="underline underline-offset-2 hover:no-underline font-medium"
              >
                Map them in Settings →
              </button>
            </span>
          </div>
          <button
            onClick={() => dismissAlert("unmapped")}
            className="shrink-0 p-0.5 hover:bg-amber-200/50 dark:hover:bg-amber-800/30 rounded transition-colors"
            aria-label="Dismiss alert"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {(() => {
        const today = new Date();
        const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        const endingSoon = (allProjects ?? []).filter(p =>
          p.isActive &&
          p.status !== "completed" &&
          p.status !== "pipeline" &&
          new Date(p.endDate) >= today &&
          new Date(p.endDate) <= in30
        );
        if (endingSoon.length === 0 || dismissedAlerts.has("ending-soon")) return null;
        return (
          <div className="flex items-start justify-between gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-300">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                <span className="font-medium">
                  {endingSoon.length} project{endingSoon.length !== 1 ? "s" : ""} ending within 30 days:
                </span>
                {" "}
                {endingSoon.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ", "}
                    <span className="font-medium">{p.clientName}</span>
                    {" "}
                    <span className="opacity-75">
                      ({new Date(p.endDate).toLocaleDateString(
                        "en-US", { month: "short", day: "numeric" }
                      )})
                    </span>
                  </span>
                ))}
              </span>
            </div>
            <button
              onClick={() => dismissAlert("ending-soon")}
              className="shrink-0 p-0.5 hover:bg-blue-200/50 dark:hover:bg-blue-800/30 rounded transition-colors"
              aria-label="Dismiss alert"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })()}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Operations Overview</h1>
          <p className="text-sm text-muted-foreground">
            All departments · {formatRangeSubtitle(dateRange, lastSync)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker />
          <Button onClick={() => setNewProjectOpen(true)} size="sm" disabled>
            <Plus className="h-4 w-4 mr-1" /> New Project
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {isPending ? (
          Array.from({ length: 5 }).map((_, i) => <KPICardSkeleton key={i} />)
        ) : (
          <>
            <KPICard
              title="Total Revenue"
              value={formatCurrency(totalRevenue)}
              icon={DollarSign}
              change="+12.3% YoY"
              changeType="positive"
              formula={"Σ (rounded_hours × billable_rate)\nfor all billable time entries in the period"}
              dataSource={OVERVIEW_KPI_DATA_SOURCES["Total Revenue"]}
            />
            <KPICard
              title="Gross Net"
              value={formatCurrency(totalNet)}
              icon={TrendingUp}
              change={`${avgMargin.toFixed(1)}% gross margin`}
              changeType="positive"
              formula={"Revenue − Direct Costs\nDirect Costs = freelancer + commission + other overrides"}
              dataSource={OVERVIEW_KPI_DATA_SOURCES["Gross Net"]}
            />
            <KPICard
              title="Loaded Net"
              value={formatCurrency(totalLoadedNet)}
              icon={TrendingUp}
              change={`${avgLoadedMargin.toFixed(1)}% loaded margin`}
              changeType={avgLoadedMargin > 20 ? "positive" : "negative"}
              formula={"Net Revenue − Internal Cost\nInternal Cost = Σ (hours × user cost rate) per project"}
              dataSource={OVERVIEW_KPI_DATA_SOURCES["Loaded Net"]}
            />
            <KPICard
              title="Pipeline"
              value={formatCurrency(totalPipeline)}
              icon={Briefcase}
              subtitle="pending close"
              formula={"Total monthly fee of projects with 'pipeline' status\n(not yet active / billed)"}
              dataSource={OVERVIEW_KPI_DATA_SOURCES.Pipeline}
            />
            <KPICard
              title="Team"
              value={`${totalTeam} members`}
              icon={Users}
              change={`${avgUtil.toFixed(0)}% avg utilization`}
              changeType="neutral"
              formula={"Utilization = hours_worked ÷ 160 × 100\n(160 hrs = standard monthly capacity per member)"}
              dataSource={OVERVIEW_KPI_DATA_SOURCES.Team}
            />
          </>
        )}
      </div>

      {isPending || isForecastPending ? (
        <ChartSkeleton height={420} />
      ) : (
        <ForecastChart data={combinedForecast} title="Company-Wide Revenue Forecast" />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isPending
          ? Array.from({ length: 4 }).map((_, i) => <DeptCardSkeleton key={i} />)
          : DEPARTMENTS.map(dept => {
              const metrics = metricsMap?.[dept.id] ?? emptyDepartmentMetrics(dept.id);
              return (
                <div key={dept.id} className="bg-card border rounded-lg p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: dept.color }} />
                    <h3 className="font-semibold text-sm">{dept.name}</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <MetricLabel label="Revenue" />
                      <p className="font-semibold">{formatCurrency(metrics.totalRevenue)}</p>
                    </div>
                    <div>
                      <MetricLabel label="Net Revenue" />
                      <p className="font-semibold">{formatCurrency(metrics.netRevenue)}</p>
                    </div>
                    <div>
                      <MetricLabel label="Active Projects" />
                      <p className="font-semibold">{metrics.activeProjects}</p>
                    </div>
                    <div>
                      <MetricLabel label="Avg Utilization" />
                      <p className="font-semibold">{metrics.avgUtilization.toFixed(0)}%</p>
                    </div>
                  </div>
                </div>
              );
            })}
      </div>

      <TeamGanttChart team={allTeamMembers} projects={allProjects} isLoading={isGanttPending} />

      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </motion.div>
  );
}
