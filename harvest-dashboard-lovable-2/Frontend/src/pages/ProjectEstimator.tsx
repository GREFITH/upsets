import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Calculator, TrendingUp, Users, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { DEPARTMENTS, Department, Project, TeamMember } from "@/types/dashboard";
import { cn } from "@/lib/utils";
import { useProjects, useTeamMembers } from "@/hooks/usePageData";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(value);
}

interface EstimateResult {
  recommendedDuration: number;
  recommendedTeamSize: number;
  suggestedRoles: string[];
  estimatedFreelancerBudget: number;
  estimatedLaborCost: number;
  totalEstimatedCost: number;
  grossMargin: number;
  loadedMargin: number;
  requiredFeeForTarget: number;
  comparableProjects: Project[];
  risks: string[];
}

function generateEstimate(
  projectsInput: Project[],
  teamInput: TeamMember[],
  department: Department,
  monthlyFee: number,
  targetMargin: number,
  complexity: number,
  durationMonths: number
): EstimateResult {
  // Find comparable projects in same department
  const deptProjects = projectsInput.filter(p => p.department === department && p.status !== "pipeline");
  const deptTeam = teamInput.filter(t => t.department === department);

  // Averages from historical data
  const avgTeamSize = deptProjects.length > 0
    ? Math.round(deptProjects.reduce((s, p) => s + p.assignedTeam.length, 0) / deptProjects.length)
    : 2;
  const avgDuration = deptProjects.length > 0
    ? Math.round(deptProjects.reduce((s, p) => {
        const start = new Date(p.startDate);
        const end = new Date(p.endDate);
        return s + ((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30));
      }, 0) / deptProjects.length)
    : 8;
  const avgMonthlyFee = deptProjects.length > 0
    ? deptProjects.reduce((s, p) => s + p.monthlyFee, 0) / deptProjects.length
    : 12000;

  // Complexity adjustment (1-5 scale)
  const complexityMultiplier = 0.7 + (complexity / 5) * 0.6; // 0.7 to 1.3

  // Team size recommendation
  const recommendedTeamSize = Math.max(1, Math.round(avgTeamSize * complexityMultiplier));
  const recommendedDuration = durationMonths || Math.round(avgDuration * complexityMultiplier);

  // Suggested roles based on department
  const deptRoles = [...new Set(deptTeam.map(t => t.role))];
  const suggestedRoles = deptRoles.slice(0, recommendedTeamSize);

  // Labor cost estimate (from loaded salaries)
  const avgSalary = deptTeam.length > 0
    ? deptTeam.reduce((s, t) => s + (t.loadedAnnualSalary || 0), 0) / deptTeam.length
    : 100000;
  const monthlyLaborPerPerson = avgSalary / 12;
  // Assume ~60% utilization allocation to this project per person
  const estimatedLaborCost = monthlyLaborPerPerson * 0.6 * recommendedTeamSize * recommendedDuration;

  // Freelancer budget estimate (no assignment history in this estimator path)
  const estimatedFreelancerBudget = 0;

  // Revenue & costs
  const totalRevenue = monthlyFee * recommendedDuration;
  const commissionRate = 0.05;
  const commissions = totalRevenue * commissionRate;
  const otherCosts = recommendedDuration * 500 * complexityMultiplier; // misc overhead
  const directCosts = estimatedFreelancerBudget + commissions + otherCosts;
  const totalEstimatedCost = directCosts + estimatedLaborCost;

  const grossMargin = totalRevenue > 0 ? ((totalRevenue - directCosts) / totalRevenue) * 100 : 0;
  const loadedMargin = totalRevenue > 0 ? ((totalRevenue - totalEstimatedCost) / totalRevenue) * 100 : 0;

  // Required fee to hit target margin (loaded)
  const requiredTotalRevenue = totalEstimatedCost / (1 - targetMargin / 100);
  const requiredFeeForTarget = recommendedDuration > 0 ? requiredTotalRevenue / recommendedDuration : 0;

  // Risk assessment
  const risks: string[] = [];
  if (loadedMargin < 20) risks.push("⚠️ Loaded margin below 20% — project may not be profitable after labor costs");
  if (loadedMargin < 0) risks.push("🚨 Negative loaded margin — this project would lose money at this price");
  if (monthlyFee < avgMonthlyFee * 0.6) risks.push("⚠️ Fee is significantly below department average — consider value justification");
  if (complexity >= 4 && recommendedTeamSize < 3) risks.push("⚠️ High complexity with small team — risk of burnout and delays");
  if (deptTeam.filter(t => t.utilization > 85).length > deptTeam.length * 0.5) risks.push("⚠️ Over 50% of department already at 85%+ utilization — resource constraint risk");
  if (recommendedDuration > 12) risks.push("⚠️ Long engagement — consider phased approach with renewal checkpoints");
  if (risks.length === 0) risks.push("✅ No major risks identified — project looks well-scoped");

  // Comparable projects (sorted by similarity in fee)
  const comparableProjects = [...deptProjects]
    .sort((a, b) => Math.abs(a.monthlyFee - monthlyFee) - Math.abs(b.monthlyFee - monthlyFee))
    .slice(0, 3);

  return {
    recommendedDuration,
    recommendedTeamSize,
    suggestedRoles,
    estimatedFreelancerBudget,
    estimatedLaborCost,
    totalEstimatedCost,
    grossMargin,
    loadedMargin,
    requiredFeeForTarget,
    comparableProjects,
    risks,
  };
}

export default function ProjectEstimator() {
  const { data: projectList, isPending: projectsPending } = useProjects();
  const { data: teamList, isPending: teamPending } = useTeamMembers();
  const isDataLoading = projectsPending || teamPending;
  const sourceProjects = projectList ?? [];
  const sourceTeam = teamList ?? [];
  const [department, setDepartment] = useState<Department>("b2b-firms");
  const [monthlyFee, setMonthlyFee] = useState("15000");
  const [targetMargin, setTargetMargin] = useState([40]);
  const [complexity, setComplexity] = useState([3]);
  const [duration, setDuration] = useState("0");
  const [hasEstimate, setHasEstimate] = useState(false);

  const estimate = useMemo(() => {
    if (!hasEstimate) return null;
    return generateEstimate(
      sourceProjects,
      sourceTeam,
      department,
      Number(monthlyFee),
      targetMargin[0],
      complexity[0],
      Number(duration)
    );
  }, [hasEstimate, sourceProjects, sourceTeam, department, monthlyFee, targetMargin, complexity, duration]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Project Estimator</h1>
        <p className="text-muted-foreground text-sm">Scope new projects based on historical performance data</p>
      </div>

      {/* Input Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calculator className="h-5 w-5" /> Project Parameters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={department} onValueChange={(v) => setDepartment(v as Department)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Proposed Monthly Fee ($)</Label>
              <Input type="number" value={monthlyFee} onChange={e => setMonthlyFee(e.target.value)} placeholder="e.g. 15000" />
            </div>

            <div className="space-y-2">
              <Label>Duration (months, 0 = auto-suggest)</Label>
              <Input type="number" value={duration} onChange={e => setDuration(e.target.value)} placeholder="0 for auto" />
            </div>

            <div className="space-y-3">
              <Label>Target Loaded Margin: {targetMargin[0]}%</Label>
              <Slider value={targetMargin} onValueChange={setTargetMargin} min={10} max={70} step={5} />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>10%</span>
                <span>70%</span>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Complexity: {complexity[0]}/5</Label>
              <Slider value={complexity} onValueChange={setComplexity} min={1} max={5} step={1} />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Simple</span>
                <span>Complex</span>
              </div>
            </div>

            <div className="flex items-end">
              <Button onClick={() => setHasEstimate(true)} className="w-full" disabled={isDataLoading}>
                <Calculator className="h-4 w-4 mr-2" />
                {isDataLoading ? "Loading data…" : "Generate Estimate"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {estimate && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* KPI Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-secondary/20 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-secondary-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Recommended Duration</p>
                    <p className="text-xl font-bold">{estimate.recommendedDuration} months</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-secondary/20 flex items-center justify-center">
                    <Users className="h-5 w-5 text-secondary-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Team Size</p>
                    <p className="text-xl font-bold">{estimate.recommendedTeamSize} people</p>
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
                    <p className="text-xs text-muted-foreground">Gross Margin</p>
                    <p className={cn("text-xl font-bold", estimate.grossMargin >= 60 ? "text-success" : estimate.grossMargin >= 40 ? "text-foreground" : "text-destructive")}>
                      {estimate.grossMargin.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", estimate.loadedMargin >= targetMargin[0] ? "bg-success/10" : "bg-destructive/10")}>
                    <TrendingUp className={cn("h-5 w-5", estimate.loadedMargin >= targetMargin[0] ? "text-success" : "text-destructive")} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Loaded Margin</p>
                    <p className={cn("text-xl font-bold", estimate.loadedMargin >= targetMargin[0] ? "text-success" : "text-destructive")}>
                      {estimate.loadedMargin.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cost Breakdown + Pricing */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Cost Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Revenue ({estimate.recommendedDuration} mo × {formatCurrency(Number(monthlyFee))})</span>
                    <span className="font-semibold">{formatCurrency(Number(monthlyFee) * estimate.recommendedDuration)}</span>
                  </div>
                  <div className="border-t pt-2 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Estimated Freelancer Budget</span>
                      <span>{formatCurrency(estimate.estimatedFreelancerBudget)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Commissions (5%)</span>
                      <span>{formatCurrency(Number(monthlyFee) * estimate.recommendedDuration * 0.05)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Other / Overhead</span>
                      <span>{formatCurrency(estimate.totalEstimatedCost - estimate.estimatedLaborCost - estimate.estimatedFreelancerBudget - Number(monthlyFee) * estimate.recommendedDuration * 0.05)}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t pt-2">
                      <span className="text-muted-foreground">Team Labor (loaded salaries)</span>
                      <span>{formatCurrency(estimate.estimatedLaborCost)}</span>
                    </div>
                  </div>
                  <div className="border-t pt-2 flex justify-between font-semibold">
                    <span>Total Estimated Cost</span>
                    <span>{formatCurrency(estimate.totalEstimatedCost)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pricing Recommendation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-muted">
                    <p className="text-sm text-muted-foreground mb-1">To hit {targetMargin[0]}% loaded margin, charge at least:</p>
                    <p className="text-2xl font-bold">{formatCurrency(estimate.requiredFeeForTarget)}<span className="text-sm font-normal text-muted-foreground">/month</span></p>
                  </div>
                  {Number(monthlyFee) < estimate.requiredFeeForTarget ? (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      <p className="text-sm text-destructive">
                        Proposed fee of {formatCurrency(Number(monthlyFee))}/mo is {formatCurrency(estimate.requiredFeeForTarget - Number(monthlyFee))}/mo below target. Consider increasing or reducing scope.
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-success/10 border border-success/20 flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-success mt-0.5 shrink-0" />
                      <p className="text-sm text-success">
                        Proposed fee meets or exceeds the target margin requirement.
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="text-sm font-medium mb-2">Suggested Team Composition</p>
                    <div className="flex flex-wrap gap-2">
                      {estimate.suggestedRoles.map((role, i) => (
                        <Badge key={i} variant="outline">{role}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Risks */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Risk Assessment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {estimate.risks.map((risk, i) => (
                  <p key={i} className="text-sm">{risk}</p>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Comparable Projects */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Comparable Past Projects</CardTitle>
              <p className="text-sm text-muted-foreground">Similar projects from the same department, sorted by fee similarity</p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Monthly Fee</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Team Size</TableHead>
                    <TableHead>Margin</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {estimate.comparableProjects.map(p => {
                    const months = Math.round((new Date(p.endDate).getTime() - new Date(p.startDate).getTime()) / (1000 * 60 * 60 * 24 * 30));
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.clientName}</TableCell>
                        <TableCell>{formatCurrency(p.monthlyFee)}</TableCell>
                        <TableCell>{months} months</TableCell>
                        <TableCell>{p.assignedTeam.length} people</TableCell>
                        <TableCell className={cn(p.profitMargin >= 75 ? "text-success" : "text-destructive")}>
                          {p.profitMargin.toFixed(1)}%
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{p.status}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
