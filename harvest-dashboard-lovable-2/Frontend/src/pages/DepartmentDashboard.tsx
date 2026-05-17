import { useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { DEPARTMENTS, Project } from "@/types/dashboard";
import { KPICard } from "@/components/dashboard/KPICard";
import { ProjectTable } from "@/components/dashboard/ProjectTable";
import { ForecastChart } from "@/components/dashboard/ForecastChart";
import { TeamOverview } from "@/components/dashboard/TeamOverview";
import { EditTimelineDialog } from "@/components/dashboard/EditTimelineDialog";
import { EditTeamDialog } from "@/components/dashboard/EditTeamDialog";
import { KPICardSkeleton, ChartSkeleton, TableSkeleton } from "@/components/dashboard/Skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, Users, Briefcase, AlertTriangle } from "lucide-react";
import { emptyDepartmentMetrics } from "@/hooks/useOperationsData";
import { useSyncHistory, useDepartmentData, useUnmappedCount } from "@/hooks/usePageData";
import { useNavigate } from "react-router-dom";
import { DEPARTMENT_KPI_DATA_SOURCES } from "@/lib/dashboardDeveloperSources";
import { DateRangePicker } from "@/components/dashboard/DateRangePicker";
import { useDateRangeContext } from "@/contexts/DateRangeContext";
import { formatRangeSubtitle } from "@/lib/formatRangeSubtitle";

function formatProjectChipLabel(p: Project): string {
  const client = (p.clientName ?? "").trim();
  const title = (p.projectName ?? "").trim();
  const combined = title ? `${client} — ${title}` : client;
  return combined.replace(/\s{2,}/g, " ").trim();
}

export default function DepartmentDashboard() {
  const navigate = useNavigate();
  const { dateRange } = useDateRangeContext();
  const { data: syncHistory = [] } = useSyncHistory();
  const lastSync = syncHistory.find((r) => r.status === "success");
  const { departmentId } = useParams<{ departmentId: string }>();
  const department = DEPARTMENTS.find(d => d.id === departmentId);
  const fallbackDepartment = department?.id ?? "b2b-firms";
  const { data: departmentData, isPending, isForecastPending } = useDepartmentData(fallbackDepartment);
  const { data: unmappedCount = 0 } = useUnmappedCount();

  const [editTimelineProject, setEditTimelineProject] = useState<Project | null>(null);
  const [editTeamProject, setEditTeamProject] = useState<Project | null>(null);

  if (!department) return <Navigate to="/dashboard" replace />;
  const metrics = departmentData.metrics ?? emptyDepartmentMetrics(department.id);
  const projects = departmentData.projects;
  const team = departmentData.team;
  const forecast = departmentData.forecast;

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", minimumFractionDigits: 0 }).format(n);

  // Alert for projects ending in 30 days
  const today = new Date();
  const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const endingSoon = (projects ?? []).filter(
    (p) => p.isActive && p.endDate && new Date(p.endDate) >= today && new Date(p.endDate) <= in30
  );
  const endingSoonText = endingSoon.map((p) => `${p.clientName} (${new Date(p.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })})`).join(", ");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

      {unmappedCount > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
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
      )}

      {endingSoon.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <span className="font-medium">{endingSoon.length} project{endingSoon.length !== 1 ? "s" : ""} ending within 30 days:</span>
            {" "}{endingSoonText}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 rounded-full" style={{ backgroundColor: department.color }} />
          <div>
            <h1 className="text-2xl font-bold">{department.name}</h1>
            <p className="text-sm text-muted-foreground">
              Department Dashboard · {formatRangeSubtitle(dateRange, lastSync)}
            </p>
          </div>
        </div>
        <DateRangePicker />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {isPending ? (
          Array.from({ length: 5 }).map((_, i) => <KPICardSkeleton key={i} />)
        ) : (
          <>
            <KPICard
              title="Revenue"
              value={formatCurrency(metrics.totalRevenue)}
              icon={DollarSign}
              change={`${metrics.profitMargin.toFixed(1)}% gross margin`}
              changeType="positive"
              formula={"Σ (rounded_hours × billable_rate)\nfor all billable time entries in the period"}
              dataSource={DEPARTMENT_KPI_DATA_SOURCES.Revenue}
            />
            <KPICard
              title="Net Revenue"
              value={formatCurrency(metrics.netRevenue)}
              icon={TrendingUp}
              change={formatCurrency(metrics.totalCosts) + " direct costs"}
              changeType="neutral"
              formula={"Revenue − Direct Costs\nDirect Costs = freelancer + commission + other overrides"}
              dataSource={DEPARTMENT_KPI_DATA_SOURCES["Net Revenue"]}
            />
            <KPICard
              title="Loaded Net"
              value={formatCurrency(metrics.loadedNetRevenue)}
              icon={TrendingUp}
              change={`${metrics.loadedMargin.toFixed(1)}% loaded margin`}
              changeType={metrics.loadedMargin > 30 ? "positive" : "negative"}
              formula={"Net Revenue − Internal Cost\nInternal Cost = Σ (hours × user cost rate) per project"}
              dataSource={DEPARTMENT_KPI_DATA_SOURCES["Loaded Net"]}
            />
            <KPICard
              title="Active Projects"
              value={String(metrics.activeProjects)}
              icon={Briefcase}
              subtitle={metrics.pipelineValue > 0 ? `${formatCurrency(metrics.pipelineValue)} pipeline` : undefined}
              formula={"Count of projects with status 'active' or 'extended'\n(excludes inactive / archived projects)"}
              dataSource={DEPARTMENT_KPI_DATA_SOURCES["Active Projects"]}
            />
            <KPICard
              title="Team"
              value={`${metrics.teamSize} members`}
              icon={Users}
              change={`${metrics.avgUtilization.toFixed(0)}% avg utilization`}
              changeType={metrics.avgUtilization > 85 ? "negative" : "positive"}
              formula={"Utilization = hours_worked ÷ 160 × 100\n(160 hrs = standard monthly capacity per member)"}
              dataSource={DEPARTMENT_KPI_DATA_SOURCES.Team}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          {isPending || isForecastPending ? (
            <ChartSkeleton height={260} />
          ) : (
            <ForecastChart data={forecast} title={`${department.name} — Revenue Forecast`} />
          )}
        </div>
        <div className="xl:col-span-1">
          {isPending ? (
            <div className="bg-card border rounded-lg p-5 space-y-3">
              <Skeleton className="h-4 w-28 mb-2" />
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-1">
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <TeamOverview
              members={team}
              projectNameById={Object.fromEntries(
                projects.map((p) => [p.id, formatProjectChipLabel(p)]),
              )}
            />
          )}
        </div>
      </div>

      {isPending ? (
        <TableSkeleton rows={5} cols={8} />
      ) : (
        <ProjectTable
          projects={projects}
          teamMembers={team}
          onEditDates={(p) => setEditTimelineProject(p)}
          onEditTeam={(p) => setEditTeamProject(p)}
        />
      )}

      <EditTimelineDialog
        project={editTimelineProject}
        open={!!editTimelineProject}
        onOpenChange={(open) => !open && setEditTimelineProject(null)}
      />
      <EditTeamDialog
        project={editTeamProject}
        open={!!editTeamProject}
        onOpenChange={(open) => !open && setEditTeamProject(null)}
      />
    </motion.div>
  );
}
