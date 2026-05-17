import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DollarSign, TrendingUp, Target, BarChart3, AlertCircle } from "lucide-react";
import { DEPARTMENTS, type ProjectStatus } from "@/types/dashboard";
import { cn } from "@/lib/utils";
import { useProjects } from "@/hooks/usePageData";
import { computeSalesHarvestKpis, isOpenHarvestProject } from "@/lib/salesFromHarvest";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(value);
}

const STATUS_FILTER: Array<"all" | ProjectStatus> = [
  "all",
  "active",
  "on-track",
  "extended",
  "at-risk",
  "pipeline",
  "completed",
];

function statusBadgeClass(status: ProjectStatus): string {
  switch (status) {
    case "completed":
      return "bg-muted text-muted-foreground";
    case "extended":
      return "bg-accent/20 text-accent-foreground";
    case "at-risk":
      return "bg-destructive/10 text-destructive";
    case "pipeline":
      return "bg-secondary/30 text-secondary-foreground";
    default:
      return "bg-secondary/20 text-secondary-foreground";
  }
}

export default function SalesPipeline() {
  const { data: projectList, isPending, isError, error } = useProjects();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const projects = projectList ?? [];

  const filtered = useMemo(() => {
    if (statusFilter === "all") return projects;
    return projects.filter((p) => p.status === statusFilter);
  }, [projects, statusFilter]);

  const kpis = useMemo(() => computeSalesHarvestKpis(projects), [projects]);
  const openCount = useMemo(() => projects.filter(isOpenHarvestProject).length, [projects]);

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-96" />
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
        <h1 className="text-2xl font-bold tracking-tight">Sales Pipeline</h1>
        <p className="text-muted-foreground text-sm">Harvest projects synced to the dashboard — filter by status.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-secondary/20 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Open projects</p>
                <p className="text-xl font-bold">{openCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Open monthly fees</p>
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
                <p className="text-xs text-muted-foreground">Shown in table</p>
                <p className="text-xl font-bold">{filtered.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground">Filter by status:</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "all" ? "All statuses" : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">Client</TableHead>
                <TableHead className="text-xs font-semibold">Project</TableHead>
                <TableHead className="text-xs font-semibold">Code</TableHead>
                <TableHead className="text-xs font-semibold">Department</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold text-right">Monthly fee</TableHead>
                <TableHead className="text-xs font-semibold text-right">Revenue (tracked)</TableHead>
                <TableHead className="text-xs font-semibold">End date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                    No projects match this filter.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => {
                  const dept = DEPARTMENTS.find((d) => d.id === p.department);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-sm">{p.clientName}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{p.projectName}</TableCell>
                      <TableCell className="font-mono text-xs">{p.code}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: dept?.color }} />
                          <span className="text-xs truncate max-w-[140px]">{dept?.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[10px] font-medium", statusBadgeClass(p.status))}>
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(p.monthlyFee)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(p.totalRevenue)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(p.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </motion.div>
  );
}
