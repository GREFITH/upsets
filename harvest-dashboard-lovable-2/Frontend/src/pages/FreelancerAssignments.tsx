import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Save, Search } from "lucide-react";
import { getAssignmentMonthlyCosts } from "@/data/freelancerData";
import type { BillingType, FreelancerAssignment, NewFreelancerAssignmentRequest } from "@/types/freelancer";
import { NewFreelancerDialog } from "@/components/dashboard/NewFreelancerDialog";
import { useProjects, useTeamMembers } from "@/hooks/usePageData";
import { apiClient } from "@/lib/api/client";
import { toast } from "@/hooks/use-toast";

interface ApiAssignment {
  id: string;
  userId: number;
  projectId: number;
  projectCode: string | null;
  projectName: string;
  freelancerName: string;
  costRate?: number;
  billRate?: number;
  estimatedMonthlyCost: number;
  clientName?: string;
  avatarUrl?: string;
  startDate?: string;
  endDate?: string;
  isProjectManager?: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(value);
}

function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function getProjectKey(assignment: ApiAssignment): string {
  return assignment.projectCode ?? `${assignment.clientName}-${assignment.projectId}`;
}

function getStatus(startDate: string | null | undefined, endDate: string | null | undefined): "active" | "scheduled" | "completed" {
  const today = new Date();
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  if (end && end < today) return "completed";
  if (start && start > today) return "scheduled";
  return "active";
}

function formatPeriod(startDate: string | null | undefined, endDate: string | null | undefined): string {
  if (!startDate && !endDate) return "Ongoing";
  const start = startDate
    ? new Date(startDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : "?";
  const end = endDate ? new Date(endDate).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "Ongoing";
  return `${start} — ${end}`;
}

function isAssignmentActive(startDate: string | null | undefined, endDate: string | null | undefined): boolean {
  const today = new Date();
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  // Active if:
  // 1. Both dates null (ongoing)
  // 2. Only end null, started (no end = ongoing once started)
  // 3. Only start null, hasn't ended (no start = ongoing until end)
  // 4. Both exist and today falls within range
  if (!start && !end) return true;
  if (!end && start && start <= today) return true;
  if (!start && end && end >= today) return true;
  if (start && end && start <= today && end >= today) return true;
  return false;
}

function requestToAssignment(req: NewFreelancerAssignmentRequest): FreelancerAssignment {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    projectCode: req.projectCode,
    freelancerName: req.freelancerName,
    billingType: req.billingType,
    billRate: req.billRate,
    flatRateAmount: req.flatRateAmount,
    negotiatedHours: req.negotiatedHours,
    startDate: req.startDate,
    endDate: req.endDate,
    monthlyOverrides: req.monthlyOverrides,
    notes: req.notes,
    createdBy: "dashboard",
    createdAt: now,
  };
}

export default function FreelancerAssignments() {
  const { data: projectList } = useProjects();
  const { data: teamData } = useTeamMembers();
  const projects = projectList ?? [];
  const contractors = useMemo(() => (teamData ?? []).filter((m) => m.isContractor === true), [teamData]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assignments, setAssignments] = useState<FreelancerAssignment[]>([]);
  const [statusFilter, setStatusFilter] = useState<"active" | "completed" | "all">("active");
  const [freelancerFilter, setFreelancerFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch contractor assignments from API
  const { data: apiAssignments = [] } = useQuery({
    queryKey: ["freelancer-assignments"],
    queryFn: async () => {
      const rows = await apiClient.get<ApiAssignment[]>("/api/v1/freelancer-assignments");
      return Array.isArray(rows) ? rows : [];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Convert API assignments to FreelancerAssignment format on load
  useMemo(() => {
    if (apiAssignments.length > 0 && assignments.length === 0) {
      const converted = apiAssignments.map((a) => {
        const billingType: BillingType = a.billRate ? "harvest" : "flat-rate";
        return {
          id: a.id,
          projectCode: a.projectCode || undefined,
          projectName: a.projectName,
          freelancerName: a.freelancerName,
          billingType,
          billRate: a.billRate,
          flatRateAmount: a.estimatedMonthlyCost,
          negotiatedHours: undefined,
          startDate: a.startDate || null,
          endDate: a.endDate || null,
          monthlyOverrides: {},
          notes: `From Harvest: ${a.clientName} (Cost Rate: $${a.costRate}/hr)`,
          createdBy: "harvest-sync",
          createdAt: new Date().toISOString(),
        };
      });
      setAssignments(converted);
    }
  }, [apiAssignments]);

  const addAssignment = useCallback((req: NewFreelancerAssignmentRequest) => {
    setAssignments((prev) => [...prev, requestToAssignment(req)]);
  }, []);

  // Apply all filters
  const clientAssignments = useMemo(() => {
    let filtered = apiAssignments;

    // Apply status filter
    if (statusFilter === "active") {
      filtered = filtered.filter((a) => isAssignmentActive(a.startDate, a.endDate));
    } else if (statusFilter === "completed") {
      filtered = filtered.filter((a) => !isAssignmentActive(a.startDate, a.endDate) && a.endDate);
    }

    // Apply freelancer filter
    if (freelancerFilter !== "all") {
      filtered = filtered.filter((a) => a.freelancerName === freelancerFilter);
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          (a.clientName?.toLowerCase() ?? "").includes(query) ||
          (a.projectName?.toLowerCase() ?? "").includes(query) ||
          (a.projectCode?.toLowerCase() ?? "").includes(query)
      );
    }

    return filtered;
  }, [apiAssignments, statusFilter, freelancerFilter, searchQuery]);

  // Calculate KPI metrics
  const uniqueFreelancers = useMemo(() => {
    return new Set(clientAssignments.map((a) => a.freelancerName)).size;
  }, [clientAssignments]);

  const currentMonthCost = useMemo(() => {
    return clientAssignments.reduce((sum, a) => {
      const isActive = isAssignmentActive(a.startDate, a.endDate);
      return isActive ? sum + (a.estimatedMonthlyCost ?? 0) : sum;
    }, 0);
  }, [clientAssignments]);

  // Get unique freelancers for filter dropdown
  const freelancerOptions = useMemo(() => {
    return Array.from(new Set(apiAssignments.map((a) => a.freelancerName))).sort();
  }, [apiAssignments]);

  // Freelancer summary data
  const freelancerSummary = useMemo(() => {
    const summary: Record<
      string,
      {
        name: string;
        avatarUrl?: string;
        costRate?: number;
        clients: Set<string>;
        projectCount: number;
        totalMonthly: number;
      }
    > = {};

    for (const assignment of clientAssignments) {
      if (!summary[assignment.freelancerName]) {
        summary[assignment.freelancerName] = {
          name: assignment.freelancerName,
          avatarUrl: assignment.avatarUrl,
          costRate: assignment.costRate,
          clients: new Set(),
          projectCount: 0,
          totalMonthly: 0,
        };
      }

      summary[assignment.freelancerName].projectCount += 1;
      summary[assignment.freelancerName].totalMonthly += assignment.estimatedMonthlyCost ?? 0;
      if (assignment.clientName) {
        summary[assignment.freelancerName].clients.add(assignment.clientName);
      }
    }

    return Object.values(summary);
  }, [clientAssignments]);

  // Save assignments mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const costsByProject: Record<string, number> = {};
      for (const assignment of assignments) {
        const costs = getAssignmentMonthlyCosts(assignment);
        const totalCost = costs.reduce((s, c) => s + c.cost, 0);
        const projectCode = assignment.projectCode;
        const project = projects.find((p) => p.code === projectCode);
        if (project) {
          const projectId = String(project.id);
          costsByProject[projectId] = (costsByProject[projectId] || 0) + totalCost / (costs.length || 1);
        }
      }

      return apiClient.put("/api/v1/settings/financial-overrides", {
        entries: Object.entries(costsByProject).map(([projectId, cost]) => ({
          projectId: parseInt(projectId),
          freelancerCostOverride: Math.round(cost),
        })),
      });
    },
    onSuccess: () => {
      toast({
        title: "Saved",
        description: "Freelancer assignments have been saved.",
      });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to save assignments.";
      toast({
        title: "Save failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  // Monthly summary for breakdown
  const monthlySummary = useMemo(() => {
    const summary: Record<
      string,
      {
        total: number;
        byProject: Record<string, { cost: number; freelancer: string }[]>;
        assignments: ApiAssignment[];
      }
    > = {};

    for (const assignment of clientAssignments) {
      const start = assignment.startDate ? new Date(assignment.startDate) : null;
      const end = assignment.endDate ? new Date(assignment.endDate) : null;

      // Generate months for this assignment
      let currentDate = start || new Date();
      const endDate = end || new Date();

      if (!start && !end) {
        // For assignments with no dates, only include in current month
        const monthKey = currentDate.toISOString().slice(0, 7);
        if (!summary[monthKey]) {
          summary[monthKey] = { total: 0, byProject: {}, assignments: [] };
        }
        const key = getProjectKey(assignment);
        if (!summary[monthKey].byProject[key]) {
          summary[monthKey].byProject[key] = [];
        }
        summary[monthKey].byProject[key].push({
          cost: assignment.estimatedMonthlyCost ?? 0,
          freelancer: assignment.freelancerName,
        });
        summary[monthKey].total += assignment.estimatedMonthlyCost ?? 0;
        summary[monthKey].assignments.push(assignment);
      } else {
        // For dated assignments, include all months they span
        while (currentDate <= endDate) {
          const monthKey = currentDate.toISOString().slice(0, 7);
          if (!summary[monthKey]) {
            summary[monthKey] = { total: 0, byProject: {}, assignments: [] };
          }
          const key = getProjectKey(assignment);
          if (!summary[monthKey].byProject[key]) {
            summary[monthKey].byProject[key] = [];
          }
          summary[monthKey].byProject[key].push({
            cost: assignment.estimatedMonthlyCost ?? 0,
            freelancer: assignment.freelancerName,
          });
          summary[monthKey].total += assignment.estimatedMonthlyCost ?? 0;
          summary[monthKey].assignments.push(assignment);

          currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
        }
      }
    }

    return Object.entries(summary)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, row]) => ({
        month,
        total: row.total,
        byProject: row.byProject,
        assignments: row.assignments,
      }));
  }, [clientAssignments]);

  // Calculate month-to-month trend colors
  const monthlyCostTrends = useMemo(() => {
    const trends: Record<string, "up" | "down" | "neutral"> = {};
    for (let i = 0; i < monthlySummary.length; i++) {
      const current = monthlySummary[i];
      const prev = i > 0 ? monthlySummary[i - 1] : null;

      if (!prev) {
        trends[current.month] = "neutral";
      } else if (current.total > prev.total) {
        trends[current.month] = "up";
      } else if (current.total < prev.total) {
        trends[current.month] = "down";
      } else {
        trends[current.month] = "neutral";
      }
    }
    return trends;
  }, [monthlySummary]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Freelancer Assignments</h1>
          <p className="text-muted-foreground text-sm">Track billable freelancer costs by project and month.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Assignment
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={assignments.length === 0 || saveMutation.isPending}>
            <Save className="h-4 w-4 mr-2" /> Save
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 12H9m4 0v4m0-8v4" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Freelancers</p>
                <p className="text-2xl font-bold">{uniqueFreelancers}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Assignments</p>
                <p className="text-2xl font-bold">{clientAssignments.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Est. Monthly Cost</p>
                <p className="text-2xl font-bold">{formatCurrency(currentMonthCost)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Freelancer Summary Cards */}
      {freelancerSummary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Freelancer Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {freelancerSummary.map((freelancer) => (
                <Card key={freelancer.name} className="bg-muted/30">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3 mb-3">
                      {freelancer.avatarUrl ? (
                        <img src={freelancer.avatarUrl} alt={freelancer.name} className="h-10 w-10 rounded-full" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center font-semibold text-sm">
                          {freelancer.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-medium">{freelancer.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {freelancer.costRate ? `$${freelancer.costRate}/hr` : "Rate not set"} •{" "}
                          {freelancer.projectCount} active {freelancer.projectCount === 1 ? "project" : "projects"}
                        </p>
                      </div>
                    </div>
                    <div className="mb-3 pb-3 border-t border-border">
                      <p className="text-sm font-bold mt-3">{formatCurrency(freelancer.totalMonthly)}/mo est.</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {Array.from(freelancer.clients)
                        .slice(0, 3)
                        .map((client) => (
                          <Badge key={client} variant="outline" className="text-xs">
                            {client}
                          </Badge>
                        ))}
                      {freelancer.clients.size > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{freelancer.clients.size - 3}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Assignments Table with Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">All Assignments</CardTitle>
            <div className="flex items-center gap-3">
              {/* Status Filter */}
              <div className="flex gap-1 bg-muted p-1 rounded-lg">
                {(["active", "completed", "all"] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      statusFilter === status
                        ? "bg-background text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>

              {/* Freelancer Filter */}
              <select
                value={freelancerFilter}
                onChange={(e) => setFreelancerFilter(e.target.value)}
                className="text-xs px-3 py-1.5 rounded border border-input bg-background"
              >
                <option value="all">All Freelancers</option>
                {freelancerOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              {/* Search Box */}
              <div className="relative">
                <Search className="absolute left-2 top-1.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search project..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded border border-input bg-background w-40"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Freelancer</TableHead>
                <TableHead>Cost Rate</TableHead>
                <TableHead>Est. Monthly</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientAssignments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                    No assignments match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                clientAssignments
                  .sort((a, b) => {
                    // Active first, then by end date (soonest first), then completed
                    const aActive = isAssignmentActive(a.startDate, a.endDate);
                    const bActive = isAssignmentActive(b.startDate, b.endDate);
                    if (aActive !== bActive) return aActive ? -1 : 1;
                    if (aActive) {
                      const aEnd = a.endDate ? new Date(a.endDate).getTime() : Infinity;
                      const bEnd = b.endDate ? new Date(b.endDate).getTime() : Infinity;
                      return aEnd - bEnd;
                    }
                    return 0;
                  })
                  .map((assignment) => {
                    const status = getStatus(assignment.startDate, assignment.endDate);
                    return (
                      <TableRow key={assignment.id}>
                        <TableCell>
                          <div>
                            <span className="text-xs text-muted-foreground font-mono">{assignment.projectCode ?? "No code"}</span>
                            <div className="text-sm font-medium">{assignment.projectName}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{assignment.clientName || "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {assignment.avatarUrl ? (
                              <img src={assignment.avatarUrl} alt={assignment.freelancerName} className="h-6 w-6 rounded-full" />
                            ) : (
                              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold">
                                {assignment.freelancerName
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")
                                  .slice(0, 2)}
                              </div>
                            )}
                            <span className="text-sm">{assignment.freelancerName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{assignment.costRate ? `$${assignment.costRate}/hr` : "Rate not set"}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(assignment.estimatedMonthlyCost ?? 0)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatPeriod(assignment.startDate, assignment.endDate)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={status === "active" ? "default" : status === "scheduled" ? "secondary" : "outline"}
                            className={
                              status === "active"
                                ? "bg-green-500/20 text-green-700 dark:text-green-400"
                                : status === "scheduled"
                                  ? "bg-blue-500/20 text-blue-700 dark:text-blue-400"
                                  : ""
                            }
                          >
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Monthly Cost Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Monthly Cost Breakdown</CardTitle>
          <p className="text-sm text-muted-foreground">Billable freelancer costs by project</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Projects & Freelancers</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthlySummary.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-10">
                    No monthly breakdown available.
                  </TableCell>
                </TableRow>
              ) : (
                monthlySummary.map((row) => {
                  const trend = monthlyCostTrends[row.month];
                  const trendColor =
                    trend === "up" ? "text-red-600" : trend === "down" ? "text-green-600" : "text-muted-foreground";

                  return (
                    <TableRow key={row.month}>
                      <TableCell className="font-medium">{formatMonth(row.month)}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {Object.entries(row.byProject).map(([code, items]) => (
                            <div key={code} className="flex flex-wrap gap-1">
                              {items.map((item, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {item.freelancer} — {code}: {formatCurrency(item.cost)}
                                </Badge>
                              ))}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className={`text-right font-bold ${trendColor}`}>{formatCurrency(row.total)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <NewFreelancerDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={addAssignment} contractors={contractors} />
    </motion.div>
  );
}
