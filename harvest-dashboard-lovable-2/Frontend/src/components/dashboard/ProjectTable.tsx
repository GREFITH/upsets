import { Project, TeamMember } from "@/types/dashboard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Users, MoreHorizontal, HelpCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { PROJECT_STATUS_BADGES } from "@/lib/projectStatusDisplay";

interface ProjectTableProps {
  projects: Project[];
  teamMembers: TeamMember[];
  onEditDates?: (project: Project) => void;
  onEditTeam?: (project: Project) => void;
}

export function ProjectTable({ projects, teamMembers: _teamMembers, onEditDates, onEditTeam }: ProjectTableProps) {
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

  const projectMetrics = useMemo(() => {
    const map: Record<string, { loadedNet: number; loadedMargin: number }> = {};
    for (const p of projects) {
      map[p.id] = { loadedNet: p.loadedNet, loadedMargin: p.loadedMargin };
    }
    return map;
  }, [projects]);

  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      <div className="p-4 border-b">
        <h3 className="font-semibold text-sm">Projects & Accounts</h3>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-semibold">Code</TableHead>
              <TableHead className="text-xs font-semibold">Client</TableHead>
              <TableHead className="text-xs font-semibold">Status</TableHead>
              <TableHead className="text-xs font-semibold text-right">Monthly Fee</TableHead>
              <TableHead className="text-xs font-semibold text-right">Gross Net</TableHead>
              <TableHead className="text-xs font-semibold text-right">Gross Margin</TableHead>
              <TableHead className="text-xs font-semibold text-right">Loaded Net</TableHead>
              <TableHead className="text-xs font-semibold text-right">Loaded Margin</TableHead>
              <TableHead className="text-xs font-semibold text-right">
                <div className="flex items-center justify-end gap-1">
                  <span>Utilization</span>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs text-xs">
                        <div className="space-y-2">
                          <p className="font-semibold">Team Utilization %</p>
                          <p>Average hours worked by assigned team members vs their target (160 hrs/month)</p>
                          <p className="text-emerald-400">• &lt;100%: Capacity available</p>
                          <p className="text-yellow-400">• 80-100%: Fully utilized</p>
                          <p className="text-red-400">• &gt;100%: Over-allocated</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </TableHead>
              <TableHead className="text-xs font-semibold w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => {
              const status = PROJECT_STATUS_BADGES[project.status];
              const metrics = projectMetrics[project.id];
              return (
                <TableRow key={project.id} className="group">
                  <TableCell className="font-mono text-xs text-muted-foreground">{project.code}</TableCell>
                  <TableCell className="font-medium text-sm">{project.clientName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className={cn("text-[10px] font-medium", status.className)}>
                        {status.label}
                      </Badge>
                      {project.status === "extended" && project.originalEndDate && (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-[10px] font-medium ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 cursor-default">
                                Late {project.daysLate ??
                                  Math.floor(
                                    (new Date(project.endDate).getTime() -
                                     new Date(project.originalEndDate).getTime()) /
                                    (1000 * 60 * 60 * 24)
                                  )}d
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Original end date:{" "}
                              {new Date(project.originalEndDate).toLocaleDateString(
                                "en-US", { month: "long", day: "numeric", year: "numeric" }
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(project.monthlyFee)}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{formatCurrency(project.netRevenue)}</TableCell>
                  <TableCell className="text-right text-sm">
                    <span className={cn(
                      project.profitMargin >= 80 ? "text-success" : project.profitMargin >= 70 ? "text-foreground" : "text-destructive"
                    )}>
                      {project.profitMargin.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    <span className={cn(metrics?.loadedNet < 0 && "text-destructive")}>
                      {formatCurrency(metrics?.loadedNet ?? 0)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <span className={cn(
                      (metrics?.loadedMargin ?? 0) >= 50 ? "text-success" :
                      (metrics?.loadedMargin ?? 0) >= 20 ? "text-foreground" : "text-destructive"
                    )}>
                      {(metrics?.loadedMargin ?? 0).toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <span className={cn(
                      project.utilization > 100 ? "text-destructive font-medium" : project.utilization >= 80 ? "text-success" : "text-muted-foreground"
                    )}>
                      {project.utilization.toFixed(0)}%
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            onEditDates?.(project);
                          }}
                        >
                          <Calendar className="h-3.5 w-3.5 mr-2" />
                          Edit Timeline
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            onEditTeam?.(project);
                          }}
                        >
                          <Users className="h-3.5 w-3.5 mr-2" />
                          Manage Team
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Legend explaining metrics */}
      <div className="p-4 border-t bg-muted/20 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground">Metrics Legend</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <p className="font-medium">Gross Net / Gross Margin</p>
            <p className="text-muted-foreground">Revenue minus direct costs (freelancers, commissions, other)</p>
          </div>
          <div className="space-y-1">
            <p className="font-medium">Loaded Net / Loaded Margin</p>
            <p className="text-muted-foreground">Net revenue minus fully-loaded team salaries (salary + benefits + overhead)</p>
          </div>
          <div className="space-y-1">
            <p className="font-medium">Utilization</p>
            <p className="text-muted-foreground">
              <strong>Formula:</strong> (Team Hours Worked ÷ 160 hrs/month target) × 100
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-medium">Utilization Thresholds</p>
            <div className="space-y-0.5 text-muted-foreground">
              <p><span className="text-green-600 font-medium">&lt;100%</span> = Capacity available</p>
              <p><span className="text-orange-600 font-medium">80-100%</span> = Fully utilized</p>
              <p><span className="text-red-600 font-medium">&gt;100%</span> = Over-allocated</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
