import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DEPARTMENTS, TeamMember } from "@/types/dashboard";
import { Save, DollarSign } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useTeamMembers } from "@/hooks/usePageData";
import { apiClient } from "@/lib/api/client";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(value);
}

type ContractorFilter = "all" | "full-time" | "contractors";

export default function EmployeeData() {
  const { data: teamData, isPending } = useTeamMembers();
  const [members, setMembers] = useState<TeamMember[]>(() => [...(teamData ?? [])]);
  const [filter, setFilter] = useState<ContractorFilter>("all");

  const filteredMembers = useMemo(() => {
    if (filter === "contractors") {
      return members.filter((m) => m.isContractor === true);
    } else if (filter === "full-time") {
      return members.filter((m) => m.isContractor !== true);
    }
    return members;
  }, [members, filter]);

  useEffect(() => {
    if (teamData) setMembers([...teamData]);
  }, [teamData]);

  function handleSalaryChange(id: string, value: string) {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, loadedAnnualSalary: value ? Number(value) : undefined } : m))
    );
  }

  async function handleSave() {
    const payload = members.map((m) => ({
      id: Number(m.id),
      costRate: m.loadedAnnualSalary ? m.loadedAnnualSalary / 2080 : 0,
    }));
    try {
      await apiClient.put("/api/v1/employees/cost-rates", { entries: payload });
      toast({ title: "Saved", description: "Employee salary data has been updated. Dashboard margins will reflect changes." });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to save employee salary data.";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    }
  }

  const totalLoadedCost = filteredMembers.reduce((s, m) => s + (m.loadedAnnualSalary || 0), 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employee Data</h1>
          <p className="text-muted-foreground text-sm">Manage loaded salaries — admin only</p>
        </div>
        <Button onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" /> Save Changes
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Filter:</span>
        <ToggleGroup type="single" value={filter} onValueChange={(v) => setFilter(v as ContractorFilter)}>
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="full-time">Full-time</ToggleGroupItem>
          <ToggleGroupItem value="contractors">Contractors</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-secondary/20 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Loaded Payroll</p>
                {isPending ? (
                  <Skeleton className="h-8 w-32 mt-1" />
                ) : (
                  <p className="text-2xl font-bold">{formatCurrency(totalLoadedCost)}</p>
                )}
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
                <p className="text-sm text-muted-foreground">Avg Loaded Salary</p>
                {isPending ? (
                  <Skeleton className="h-8 w-28 mt-1" />
                ) : (
                  <p className="text-2xl font-bold">{formatCurrency(filteredMembers.length > 0 ? totalLoadedCost / filteredMembers.length : 0)}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isPending ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-3 rounded-full" />
                  <Skeleton className="h-5 w-36" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-9 w-36 rounded-md" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        DEPARTMENTS.map((dept) => {
          const deptMembers = filteredMembers.filter((m) => m.department === dept.id);
          if (deptMembers.length === 0) return null;
          return (
            <Card key={dept.id}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: dept.color }} />
                  {dept.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Utilization</TableHead>
                      <TableHead>Projects</TableHead>
                      <TableHead className="text-right">Loaded Annual Salary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deptMembers.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.role}</TableCell>
                        <TableCell>
                          <Badge variant={m.isContractor ? "outline" : "default"} className={m.isContractor ? "bg-amber-50 text-amber-900 border-amber-200" : "bg-green-50 text-green-900 border-green-200"}>
                            {m.isContractor ? "Contractor" : "Full-time"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={m.utilization > 90 ? "destructive" : m.utilization > 75 ? "default" : "secondary"}>
                            {m.utilization}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{m.assignedProjects.length}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={m.loadedAnnualSalary || ""}
                            onChange={(e) => handleSalaryChange(m.id, e.target.value)}
                            placeholder="e.g. 120000"
                            className="w-36 ml-auto text-right"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })
      )}
    </motion.div>
  );
}
