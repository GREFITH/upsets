import { useState, useMemo } from "react";
import { Department, DEPARTMENTS, Project } from "@/types/dashboard";
import { useOperationsData } from "@/hooks/useOperationsData";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Lock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDepartment?: Department;
}

function getExistingClients(projects: Project[]): Map<string, string> {
  const clients = new Map<string, string>();
  for (const p of projects) {
    const match = p.code.match(/^(\d{3})-\d{2}$/);
    if (match) {
      clients.set(p.clientName.toLowerCase(), match[1]);
    }
  }
  return clients;
}

function getNextClientNumber(projects: Project[]): string {
  let maxNum = 0;
  for (const p of projects) {
    const match = p.code.match(/^(\d{3})-\d{2}$/);
    if (match) {
      maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return String(maxNum + 1).padStart(3, "0");
}

function getNextProjectNumber(clientNumber: string, projects: Project[]): string {
  let maxProj = 0;
  for (const p of projects) {
    const match = p.code.match(/^(\d{3})-(\d{2})$/);
    if (match && match[1] === clientNumber) {
      maxProj = Math.max(maxProj, parseInt(match[2], 10));
    }
  }
  return String(maxProj + 1).padStart(2, "0");
}

function generateCode(clientName: string, projects: Project[]): { code: string; isExisting: boolean } {
  if (!clientName.trim()) return { code: "", isExisting: false };

  const existing = getExistingClients(projects);
  const key = clientName.trim().toLowerCase();

  if (existing.has(key)) {
    const clientNum = existing.get(key)!;
    const projNum = getNextProjectNumber(clientNum, projects);
    return { code: `${clientNum}-${projNum}`, isExisting: true };
  }

  const clientNum = getNextClientNumber(projects);
  return { code: `${clientNum}-01`, isExisting: false };
}

export function NewProjectDialog({ open, onOpenChange, defaultDepartment }: NewProjectDialogProps) {
  const [clientName, setClientName] = useState("");
  const [department, setDepartment] = useState<Department | "">(defaultDepartment ?? "");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const { data } = useOperationsData();
  const projects = data?.projects ?? [];

  const { code, isExisting } = useMemo(
    () => generateCode(clientName, projects),
    [clientName, projects],
  );

  const handleSubmit = () => {
    if (!clientName || !code || !department || !monthlyFee || !startDate || !endDate) {
      toast.error("Please fill in all required fields");
      return;
    }
    toast.success(`Project ${code} created`, {
      description: `${clientName} added to ${DEPARTMENTS.find(d => d.id === department)?.name}. Fee of $${monthlyFee}/mo will flow into forecast.`,
    });
    onOpenChange(false);
    setClientName(""); setMonthlyFee("");
    setStartDate(undefined); setEndDate(undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Onboard New Project</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Client Name</Label>
              <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. Acme Corp" />
              {isExisting && clientName && (
                <p className="text-[10px] text-muted-foreground">
                  Existing client — next project number assigned automatically.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Project Code</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={code}
                  readOnly
                  className="bg-muted font-mono"
                  placeholder="Auto-generated"
                />
                <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Auto-assigned as XXX-XX (client-project).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Department</Label>
              <Select value={department} onValueChange={(v) => setDepartment(v as Department)}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Monthly Fee ($)</Label>
              <Input type="number" value={monthlyFee} onChange={e => setMonthlyFee(e.target.value)} placeholder="15000" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left text-sm", !startDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left text-sm", !endDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "PPP") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={setEndDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground">
            This project will be added to the department's forecast. Fees × months will calculate total projected revenue.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>Create Project</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
