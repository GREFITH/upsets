import { Project, TeamMember } from "@/types/dashboard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Users, MoreHorizontal } from "lucide-react";
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
              <TableHead className="text-xs font-semibold text-right">Utilization</TableHead>
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
                      {project.status === "extended" && project.originalEndDate && project.daysLate !== undefined && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-[10px] font-medium text-destructive border-destructive/30">
                                Late {project.daysLate}d
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              Original end date: {new Date(project.originalEndDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
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
    </div>
  );
}
