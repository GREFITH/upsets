import { useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DollarSign, TrendingUp, Target, BarChart3, Building2, AlertCircle, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useProjects } from "@/hooks/usePageData";
import {
  computeSalesHarvestKpis,
  monthlyNewProjectTrend,
  pipelineByRollupDepartments,
  topClientsByOpenPipeline,
} from "@/lib/salesFromHarvest";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(value);
}

export default function SalesDashboard() {
  const { data: projectList, isPending, isError, error } = useProjects();

  const projects = projectList ?? [];

  const kpis = useMemo(() => computeSalesHarvestKpis(projects), [projects]);
  const clientRows = useMemo(() => topClientsByOpenPipeline(projects, 8), [projects]);
  const deptRows = useMemo(() => pipelineByRollupDepartments(projects), [projects]);
  const monthlyTrend = useMemo(() => monthlyNewProjectTrend(projects, new Date(), 12), [projects]);

  const maxCreated = useMemo(() => Math.max(1, ...monthlyTrend.map((m) => m.created)), [monthlyTrend]);

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
        <Skeleton className="h-56" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Could not load Harvest data</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : "Request failed"}</AlertDescription>
      </Alert>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Harvest projects after sync — new work, open retainer run-rate, and clients with active pipeline.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">New projects (this month)</p>
                <div className="flex items-center gap-2">
                  <p className="text-xl font-bold">{kpis.newProjectsThisMonth}</p>
                  {kpis.newProjectsMoMPercent !== null && kpis.newProjectsLastMonth > 0 && (
                    <span
                      className={`text-xs flex items-center ${kpis.newProjectsMoMPercent >= 0 ? "text-success" : "text-destructive"}`}
                    >
                      {kpis.newProjectsMoMPercent >= 0 ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      {Math.abs(kpis.newProjectsMoMPercent)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-secondary/20 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Open pipeline (monthly fees)</p>
                <p className="text-xl font-bold">{formatCurrency(kpis.openPipelineMonthlyFees)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/20 flex items-center justify-center">
                <Target className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Completed share</p>
                <p className="text-xl font-bold">{kpis.completedSharePercent}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg monthly fee (open)</p>
                <p className="text-xl font-bold">{formatCurrency(kpis.avgMonthlyFeeOpen)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Top clients (open pipeline)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {clientRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No open projects in Harvest yet.</p>
            ) : (
              <div className="space-y-3">
                {clientRows.map((row) => (
                  <div key={row.clientName} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{row.clientName}</span>
                      <span className="text-muted-foreground">
                        {row.projects} project{row.projects === 1 ? "" : "s"} · {formatCurrency(row.monthlyFees)}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-secondary rounded-full transition-all"
                        style={{ width: `${row.sharePercent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Open pipeline by department</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {deptRows.map((item) => (
                <div key={item.department} className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.activeProjects} open projects</p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold shrink-0">{formatCurrency(item.monthlyFees)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">New projects by month (last 12)</CardTitle>
          <p className="text-sm text-muted-foreground">Based on Harvest project created date (or start date if missing).</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12 gap-3">
            {monthlyTrend.map((m) => (
              <div key={m.yearMonth} className="text-center space-y-2">
                <div className="h-20 flex flex-col justify-end items-center">
                  <div
                    className="w-8 bg-secondary/80 rounded-t min-h-[4px]"
                    style={{ height: `${(m.created / maxCreated) * 100}%` }}
                  />
                </div>
                <p className="text-xs font-medium">{m.label}</p>
                <p className="text-[10px] text-muted-foreground">{m.created} new</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
