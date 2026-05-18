import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { DEPARTMENTS } from "@/types/dashboard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft, Users, Briefcase, DollarSign, History } from "lucide-react";
import { useProjects, useTeamMembers, useTeamHistory } from "@/hooks/usePageData";
import { getProjectStatusBadge } from "@/lib/projectStatusDisplay";
import { StatCardSkeleton, TableSkeleton } from "@/components/dashboard/Skeletons";
import { apiClient } from "@/lib/api/client";

interface PricingLogEntry {
  projectCode: string;
  changeDate: string;
  changeType: string;
  previousFee: number | null;
  newFee: number;
  notes: string | null;
}

const changeTypeConfig: Record<string, { label: string; className: string }> = {
  "new-project": { label: "New Project", className: "bg-success/10 text-success border-success/20" },
  "fee-increase": { label: "Fee Increase", className: "bg-accent/20 text-accent-foreground border-accent/30" },
  "fee-decrease": { label: "Fee Decrease", className: "bg-destructive/10 text-destructive border-destructive/20" },
  "retainer-change": { label: "Retainer Change", className: "bg-warning/10 text-warning border-warning/20" },
  "project-end": { label: "Project End", className: "bg-muted text-muted-foreground border-muted" },
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

export default function ClientDetail() {
  const { clientNumber } = useParams<{ clientNumber: string }>();
  const navigate = useNavigate();
  const { data: projectList, isPending: projectsPending } = useProjects();
  const { data: memberList, isPending: membersPending } = useTeamMembers();
  const { data: historyMap, isPending: historyPending } = useTeamHistory();
  const { data: pricingHistory = [], isPending: pricingPending } = useQuery({
    queryKey: ["pricing-history", clientNumber],
    queryFn: () => clientNumber ? apiClient.get<PricingLogEntry[]>(`/api/v1/clients/${clientNumber}/pricing-history`) : Promise.resolve([]),
    enabled: !!clientNumber,
  });
  const isPending = projectsPending || membersPending || historyPending || pricingPending;

  const allProjects = useMemo(() => projectList ?? [], [projectList]);
  const allMembers = useMemo(() => memberList ?? [], [memberList]);
  const allTeamHistory = useMemo(() => historyMap ?? {}, [historyMap]);

  const clientData = useMemo(() => {
    if (!clientNumber) return null;
    const projects = allProjects.filter(p => p.code.startsWith(clientNumber + "-"));
    if (projects.length === 0) return null;

    const baseName = projects[0].clientName.split(" - ")[0];
    const totalMonthlyFee = projects.reduce((s, p) => s + p.monthlyFee, 0);
    const totalRevenue = projects.reduce((s, p) => s + p.totalRevenue, 0);
    const teamMemberIds = new Set(projects.flatMap(p => p.assignedTeam));
    const team = allMembers.filter((tm) => teamMemberIds.has(tm.id));
    const teamHistory = projects.flatMap(p => {
      const history = allTeamHistory[p.id] || [];
      return history.map((h) => ({ ...h, projectCode: p.code, projectName: p.projectName || p.clientName }));
    }).sort((a, b) => new Date(a.assignedDate).getTime() - new Date(b.assignedDate).getTime());
    const sortedPricingHistory = [...(pricingHistory ?? [])].sort((a, b) => new Date(b.changeDate).getTime() - new Date(a.changeDate).getTime());

    return { baseName, clientNumber, projects, totalMonthlyFee, totalRevenue, team, teamHistory, pricingHistory: sortedPricingHistory };
  }, [allMembers, allProjects, allTeamHistory, clientNumber, pricingHistory]);

  if (isPending) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/clients")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="space-y-1.5">
            <div className="h-7 w-48 rounded-md bg-muted animate-pulse" />
            <div className="h-4 w-32 rounded-md bg-muted animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <TableSkeleton rows={4} cols={8} />
        <TableSkeleton rows={3} cols={7} />
      </motion.div>
    );
  }

  if (!clientData) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Client not found.</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/clients")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{clientData.baseName}</h1>
          <p className="text-sm text-muted-foreground">Client #{clientData.clientNumber} · {clientData.projects.length} project{clientData.projects.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border rounded-lg p-4">
          <p className="text-xs text-muted-foreground font-medium">Active Projects</p>
          <p className="text-2xl font-bold mt-1">{clientData.projects.filter((p) => p.isActive).length}</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-xs text-muted-foreground font-medium">Monthly Retainer</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(clientData.totalMonthlyFee)}</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-xs text-muted-foreground font-medium">Total Revenue</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(clientData.totalRevenue)}</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-xs text-muted-foreground font-medium">Team Members</p>
          <p className="text-2xl font-bold mt-1">{clientData.team.length}</p>
        </div>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="p-4 border-b flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Projects</h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">Code</TableHead>
                <TableHead className="text-xs font-semibold">Project Name</TableHead>
                <TableHead className="text-xs font-semibold">Department</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold">Start</TableHead>
                <TableHead className="text-xs font-semibold">End</TableHead>
                <TableHead className="text-xs font-semibold text-right">Monthly Fee</TableHead>
                <TableHead className="text-xs font-semibold text-right">Total Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientData.projects.map((project) => {
                const dept = DEPARTMENTS.find((d) => d.id === project.department);
                const status = getProjectStatusBadge(project);
                return (
                  <TableRow key={project.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{project.code}</TableCell>
                    <TableCell className="text-sm font-medium">{project.clientName}</TableCell>
                    <TableCell className="text-xs">{dept?.name ?? (project.department === "unassigned" ? "Unassigned" : "—")}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-[10px] font-medium", status.className)}>
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(project.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(project.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatCurrency(project.monthlyFee)}</TableCell>
                    <TableCell className="text-right text-sm">{formatCurrency(project.totalRevenue)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="p-4 border-b flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Pricing History</h3>
          {clientData.pricingHistory.length > 0 && (
            <span className="text-xs text-muted-foreground ml-auto">
              {clientData.pricingHistory.length} change{clientData.pricingHistory.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {clientData.pricingHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-semibold">Date</TableHead>
                  <TableHead className="text-xs font-semibold">Project</TableHead>
                  <TableHead className="text-xs font-semibold">Change</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Previous Fee</TableHead>
                  <TableHead className="text-xs font-semibold text-right">New Fee</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Δ</TableHead>
                  <TableHead className="text-xs font-semibold">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientData.pricingHistory.map((entry, i) => {
                  const config = changeTypeConfig[entry.changeType] || { label: entry.changeType, className: "border-border text-muted-foreground" };
                  const delta = entry.previousFee !== null ? entry.newFee - entry.previousFee : null;
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(entry.changeDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </TableCell>
                      <TableCell className="text-sm font-mono">{entry.projectCode}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[10px] font-medium", config.className)}>
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {entry.previousFee !== null ? formatCurrency(entry.previousFee) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(entry.newFee)}</TableCell>
                      <TableCell className="text-right text-sm">
                        {delta !== null ? (
                          <span className={cn(delta > 0 ? "text-success" : "text-destructive")}>
                            {delta > 0 ? "+" : ""}{formatCurrency(delta)}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{entry.notes || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">No pricing history recorded yet. History will appear here as fees change over time.</div>
        )}
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="p-4 border-b flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Current Team</h3>
        </div>
        {clientData.team.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-semibold">Name</TableHead>
                  <TableHead className="text-xs font-semibold">Role</TableHead>
                  <TableHead className="text-xs font-semibold">Department</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Utilization</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Client Load</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientData.team.map(member => {
                  const dept = DEPARTMENTS.find(d => d.id === member.department);
                  return (
                    <TableRow key={member.id}>
                      <TableCell className="text-sm font-medium">{member.name}</TableCell>
                      <TableCell className="text-sm">{member.role}</TableCell>
                      <TableCell className="text-xs">
                        {dept?.name ?? (member.department === "unassigned" ? "Unassigned" : "—")}
                      </TableCell>
                      <TableCell className="text-right text-sm">{member.utilization}%</TableCell>
                      <TableCell className="text-right text-sm">{member.clientLoad}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">No team members assigned yet.</div>
        )}
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="p-4 border-b flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Team History</h3>
        </div>
        {clientData.teamHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-semibold">Date</TableHead>
                  <TableHead className="text-xs font-semibold">Action</TableHead>
                  <TableHead className="text-xs font-semibold">Team Member</TableHead>
                  <TableHead className="text-xs font-semibold">Role</TableHead>
                  <TableHead className="text-xs font-semibold">Project</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientData.teamHistory.map((record, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(record.action === "removed" && record.removedDate ? record.removedDate : record.assignedDate)
                        .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-medium",
                          record.action === "assigned"
                            ? "bg-success/10 text-success border-success/20"
                            : "bg-destructive/10 text-destructive border-destructive/20"
                        )}
                      >
                        {record.action === "assigned" ? "Assigned" : "Removed"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{record.memberName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{record.role}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{record.projectCode} — {record.projectName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">No team history recorded yet.</div>
        )}
      </div>
    </motion.div>
  );
}
