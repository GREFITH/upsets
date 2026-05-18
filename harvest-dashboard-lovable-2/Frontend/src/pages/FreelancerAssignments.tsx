import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, DollarSign, Users, TrendingDown, Save } from "lucide-react";
import { getAssignmentMonthlyCosts } from "@/data/freelancerData";
import type { BillingType, FreelancerAssignment, NewFreelancerAssignmentRequest } from "@/types/freelancer";
import { NewFreelancerDialog } from "@/components/dashboard/NewFreelancerDialog";
import { useProjects, useTeamMembers } from "@/hooks/usePageData";
import { apiClient } from "@/lib/api/client";
import { toast } from "@/hooks/use-toast";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(value);
}

function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
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
  const contractors = useMemo(
    () => (teamData ?? []).filter((m) => m.isContractor === true),
    [teamData]
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assignments, setAssignments] = useState<FreelancerAssignment[]>([]);

  // Fetch contractor assignments from API (harvest_user_assignments table)
  const { data: apiAssignments, isLoading: isLoadingAssignments } = useQuery({
    queryKey: ["freelancer-assignments"],
    queryFn: async () => {
      const rows = await apiClient.get<Array<{
        id: string;
        userId: number;
        projectId: number;
        projectCode: string;
        projectName: string;
        freelancerName: string;
        costRate?: number;
        billRate?: number;
        estimatedMonthlyCost: number;
        clientName?: string;
        avatarUrl?: string;
        startDate?: string;
        endDate?: string;
      }>>("/api/v1/freelancer-assignments");
      return Array.isArray(rows) ? rows : [];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Convert API assignments to FreelancerAssignment format on load
  useMemo(() => {
    if (apiAssignments && apiAssignments.length > 0 && assignments.length === 0) {
      const converted = apiAssignments.map((a) => {
        const billingType: BillingType = a.billRate ? "harvest" : "flat-rate";
        return {
          id: a.id,
          projectCode: a.projectCode,
          projectName: a.projectName,
          freelancerName: a.freelancerName,
          billingType,
          billRate: a.billRate,
          flatRateAmount: a.estimatedMonthlyCost,
          negotiatedHours: undefined,
          startDate: a.startDate || new Date().toISOString(),
          endDate: a.endDate || new Date().toISOString(),
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

  // Save assignments mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Roll up costs per project
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

      // Call API with rolled-up costs
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

  const monthlySummary = useMemo(() => {
    const summary: Record<string, { total: number; byProject: Record<string, number> }> = {};

    for (const assignment of assignments) {
      const costs = getAssignmentMonthlyCosts(assignment);
      for (const c of costs) {
        if (!summary[c.month]) summary[c.month] = { total: 0, byProject: {} };
        summary[c.month].total += c.cost;
        summary[c.month].byProject[c.projectCode] = (summary[c.month].byProject[c.projectCode] || 0) + c.cost;
      }
    }

    return Object.entries(summary)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, row]) => ({ month, ...row }));
  }, [assignments]);

  const totalActiveCost = assignments.reduce((sum, a) => {
    const costs = getAssignmentMonthlyCosts(a);
    return sum + costs.reduce((s, c) => s + c.cost, 0);
  }, 0);

  const uniqueFreelancers = new Set(assignments.map((a) => a.freelancerName)).size;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Freelancer Assignments</h1>
          <p className="text-muted-foreground text-sm">Track freelancer costs by project and month.</p>
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-secondary/20 flex items-center justify-center">
                <Users className="h-5 w-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Contractors</p>
                <p className="text-2xl font-bold">{contractors.length}</p>
              </div>
            </div>
            {contractors.length > 0 && (
              <div className="mt-4 text-xs space-y-1">
                {contractors.slice(0, 3).map((c) => (
                  <div key={c.id} className="flex items-center gap-1.5">
                    {c.avatarUrl ? (
                      <img src={c.avatarUrl} alt={c.name} className="h-4 w-4 rounded-full" />
                    ) : (
                      <div className="h-4 w-4 rounded-full bg-muted flex items-center justify-center text-[8px] font-semibold">
                        {c.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                    )}
                    <span className="text-muted-foreground truncate">{c.name}</span>
                  </div>
                ))}
                {contractors.length > 3 && (
                  <p className="text-muted-foreground">+{contractors.length - 3} more</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-secondary/20 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Assignments</p>
                <p className="text-2xl font-bold">{apiAssignments?.length ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Lifetime Cost</p>
                <p className="text-2xl font-bold">{formatCurrency(totalActiveCost)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Assignments</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Freelancer</TableHead>
                <TableHead>Billing Type</TableHead>
                <TableHead>Rate / Amount</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Est. Monthly Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    No assignments yet. Use New Assignment to add one.
                  </TableCell>
                </TableRow>
              ) : (
                assignments.map((a) => {
                  const monthlyCost =
                    a.billingType === "harvest" ? (a.billRate || 0) * 160 : a.flatRateAmount || 0;

                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div>
                          <span className="font-mono text-sm font-medium">{a.projectCode}</span>
                          {a.projectName && <p className="text-xs text-muted-foreground">{a.projectName}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{a.freelancerName}</TableCell>
                      <TableCell>
                        <Badge variant={a.billingType === "harvest" ? "default" : "secondary"}>
                          {a.billingType === "harvest" ? "Harvest" : "Flat Rate"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {a.billingType === "harvest"
                          ? `$${a.billRate}/hr`
                          : `${formatCurrency(a.flatRateAmount || 0)}/mo`}
                        {a.negotiatedHours && (
                          <span className="text-xs text-muted-foreground ml-1">({a.negotiatedHours}hrs)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(a.startDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                        {" — "}
                        {new Date(a.endDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(monthlyCost)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Monthly Cost Breakdown by Project</CardTitle>
          <p className="text-sm text-muted-foreground">
            These costs are deducted from the corresponding project's gross monthly revenue
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Projects</TableHead>
                <TableHead className="text-right">Total Freelancer Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthlySummary.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-10">
                    No monthly breakdown yet.
                  </TableCell>
                </TableRow>
              ) : (
                monthlySummary.map((row) => (
                  <TableRow key={row.month}>
                    <TableCell className="font-medium">{formatMonth(row.month)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(row.byProject).map(([code, cost]) => (
                          <Badge key={code} variant="outline" className="text-xs">
                            {code}: {formatCurrency(cost)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-bold text-destructive">
                      {formatCurrency(row.total)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <NewFreelancerDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={addAssignment} contractors={contractors} />
    </motion.div>
  );
}
