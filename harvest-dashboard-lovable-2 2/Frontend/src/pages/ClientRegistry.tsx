import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { DEPARTMENTS } from "@/types/dashboard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Search, Plus } from "lucide-react";
import { NewProjectDialog } from "@/components/dashboard/NewProjectDialog";
import { StatCardSkeleton, TableSkeleton } from "@/components/dashboard/Skeletons";
import { useProjects } from "@/hooks/usePageData";
import { getProjectStatusBadge } from "@/lib/projectStatusDisplay";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ActivityFilter = "all" | "active" | "inactive";

export default function ClientRegistry() {
  const navigate = useNavigate();
  const { data: projectList, isPending } = useProjects();
  const projects = useMemo(() => projectList ?? [], [projectList]);
  const [search, setSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

  const projectsForView = useMemo(() => {
    if (activityFilter === "active") return projects.filter((p) => p.isActive);
    if (activityFilter === "inactive") return projects.filter((p) => !p.isActive);
    return projects;
  }, [projects, activityFilter]);

  const clientGroups = useMemo(() => {
    const groups: Record<string, { clientName: string; clientNumber: string; isNumericCode: boolean; projects: typeof projects; totalMonthlyFee: number; department: string }> = {};
    for (const p of projectsForView) {
      const rawPrefix = p.code.split("-")[0];
      // Only treat prefix as client number if it looks numeric; otherwise group by full client name
      const isNumeric = /^\d+$/.test(rawPrefix);
      const clientNum = isNumeric ? rawPrefix : p.clientName;
      if (!groups[clientNum]) {
        const baseName = p.clientName.split(" - ")[0];
        groups[clientNum] = { clientName: baseName, clientNumber: isNumeric ? rawPrefix : "", isNumericCode: isNumeric, projects: [], totalMonthlyFee: 0, department: p.department };
      }
      groups[clientNum].projects.push(p);
      groups[clientNum].totalMonthlyFee += p.monthlyFee;
    }
    return Object.values(groups);
  }, [projectsForView]);

  const filteredClients = useMemo(() => {
    if (!search) return clientGroups;
    const q = search.toLowerCase();
    return clientGroups.filter(g =>
      g.clientName.toLowerCase().includes(q) ||
      g.projects.some(p => p.code.includes(q) || p.clientName.toLowerCase().includes(q))
    );
  }, [clientGroups, search]);

  const totalActiveRevenue = projectsForView
    .filter((p) => p.isActive && p.status !== "pipeline" && p.status !== "completed")
    .reduce((s, p) => s + p.monthlyFee, 0);
  const uniqueClients = clientGroups.length;
  const activeProjectsInView = projectsForView.filter((p) => p.isActive).length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Client Registry</h1>
          <p className="text-sm text-muted-foreground">All projects, pricing history, and fee changes in one place</p>
        </div>
        <Button onClick={() => setNewProjectOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {isPending ? (
          Array.from({ length: 3 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <div className="bg-card border rounded-lg p-4">
              <p className="text-xs text-muted-foreground font-medium">Total Clients</p>
              <p className="text-2xl font-bold mt-1">{uniqueClients}</p>
            </div>
            <div className="bg-card border rounded-lg p-4">
              <p className="text-xs text-muted-foreground font-medium">Active projects (Harvest)</p>
              <p className="text-2xl font-bold mt-1">{activeProjectsInView}</p>
            </div>
            <div className="bg-card border rounded-lg p-4">
              <p className="text-xs text-muted-foreground font-medium">Monthly Retainer Revenue</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(totalActiveRevenue)}</p>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Tabs value={activityFilter} onValueChange={(v) => setActivityFilter(v as ActivityFilter)} className="w-full sm:w-auto">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Project activity</p>
          <TabsList className="h-9">
            <TabsTrigger value="all" className="text-xs px-3">All</TabsTrigger>
            <TabsTrigger value="active" className="text-xs px-3">Active</TabsTrigger>
            <TabsTrigger value="inactive" className="text-xs px-3">Inactive</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative max-w-sm w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search clients or project codes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isPending ? (
        <TableSkeleton rows={8} cols={9} />
      ) : (
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-semibold">Client</TableHead>
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
                {filteredClients.flatMap((group) =>
                  group.projects.map((project, idx) => {
                    const dept = DEPARTMENTS.find((d) => d.id === project.department);
                    const status = getProjectStatusBadge(project);
                    return (
                      <TableRow key={project.id}>
                        {idx === 0 ? (
                          <TableCell rowSpan={group.projects.length} className="font-medium text-sm align-top border-r">
                            <button
                              onClick={() => group.isNumericCode ? navigate(`/dashboard/clients/${group.clientNumber}`) : undefined}
                              className={cn(
                                "flex items-center gap-2 transition-colors text-left",
                                group.isNumericCode && "hover:text-primary cursor-pointer",
                                !group.isNumericCode && "cursor-default",
                              )}
                            >
                              <div
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: dept?.color ?? "hsl(0,0%,70%)" }}
                              />
                              {group.clientName}
                            </button>
                            {group.isNumericCode && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 pl-4">Client #{group.clientNumber}</p>
                            )}
                          </TableCell>
                        ) : null}
                        <TableCell className="font-mono text-xs text-muted-foreground">{project.code}</TableCell>
                        <TableCell className="text-sm">{project.projectName}</TableCell>
                        <TableCell className="text-xs">
                          {dept?.name ?? (project.department === "unassigned" ? "Unassigned" : "—")}
                        </TableCell>
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
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </motion.div>
  );
}
