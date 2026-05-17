import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useOperationsData } from "@/hooks/useOperationsData";
import { BillingType, NewFreelancerAssignmentRequest } from "@/types/freelancer";
import { toast } from "@/hooks/use-toast";

interface NewFreelancerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit?: (data: NewFreelancerAssignmentRequest) => void;
}

export function NewFreelancerDialog({ open, onOpenChange, onSubmit }: NewFreelancerDialogProps) {
  const { data } = useOperationsData();
  const [projectCode, setProjectCode] = useState("");
  const [freelancerName, setFreelancerName] = useState("");
  const [billingType, setBillingType] = useState<BillingType>("harvest");
  const [billRate, setBillRate] = useState("");
  const [flatRateAmount, setFlatRateAmount] = useState("");
  const [negotiatedHours, setNegotiatedHours] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  const activeProjects = (data?.projects ?? []).filter((p) => p.status !== "pipeline" && p.status !== "completed");

  function resetForm() {
    setProjectCode("");
    setFreelancerName("");
    setBillingType("harvest");
    setBillRate("");
    setFlatRateAmount("");
    setNegotiatedHours("");
    setStartDate("");
    setEndDate("");
    setNotes("");
  }

  function handleSubmit() {
    if (!projectCode || !freelancerName || !startDate || !endDate) {
      toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }

    if (billingType === "harvest" && !billRate) {
      toast({ title: "Missing bill rate", description: "Harvest billing requires a bill rate.", variant: "destructive" });
      return;
    }

    if (billingType === "flat-rate" && !flatRateAmount) {
      toast({ title: "Missing flat rate", description: "Please enter the flat rate amount.", variant: "destructive" });
      return;
    }

    const data: NewFreelancerAssignmentRequest = {
      projectCode,
      freelancerName,
      billingType,
      billRate: billingType === "harvest" ? Number(billRate) : undefined,
      flatRateAmount: billingType === "flat-rate" ? Number(flatRateAmount) : undefined,
      negotiatedHours: billingType === "flat-rate" && negotiatedHours ? Number(negotiatedHours) : undefined,
      startDate,
      endDate,
      notes: notes || undefined,
    };

    onSubmit?.(data);
    toast({ title: "Freelancer assigned", description: `${freelancerName} assigned to project ${projectCode}.` });
    resetForm();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Freelancer Assignment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Project Code *</Label>
            <Select value={projectCode} onValueChange={setProjectCode}>
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {activeProjects.map((p) => (
                  <SelectItem key={p.id} value={p.code}>
                    {p.code} — {p.clientName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Freelancer Name *</Label>
            <Input value={freelancerName} onChange={(e) => setFreelancerName(e.target.value)} placeholder="e.g. Jane Doe" />
          </div>

          <div className="space-y-2">
            <Label>Billing Type *</Label>
            <RadioGroup value={billingType} onValueChange={(v) => setBillingType(v as BillingType)} className="flex gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="harvest" id="harvest" />
                <Label htmlFor="harvest" className="cursor-pointer font-normal">Harvest (Hourly)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="flat-rate" id="flat-rate" />
                <Label htmlFor="flat-rate" className="cursor-pointer font-normal">Flat Rate / Negotiated</Label>
              </div>
            </RadioGroup>
          </div>

          {billingType === "harvest" && (
            <div className="space-y-2">
              <Label>Bill Rate ($/hr) *</Label>
              <Input type="number" value={billRate} onChange={(e) => setBillRate(e.target.value)} placeholder="e.g. 85" />
              <p className="text-xs text-muted-foreground">Hours will be pulled from Harvest once integrated.</p>
            </div>
          )}

          {billingType === "flat-rate" && (
            <>
              <div className="space-y-2">
                <Label>Flat Rate Amount ($/month) *</Label>
                <Input type="number" value={flatRateAmount} onChange={(e) => setFlatRateAmount(e.target.value)} placeholder="e.g. 3500" />
              </div>
              <div className="space-y-2">
                <Label>Negotiated Hours (optional)</Label>
                <Input type="number" value={negotiatedHours} onChange={(e) => setNegotiatedHours(e.target.value)} placeholder="e.g. 40" />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Date *</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional context..." rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>Assign Freelancer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
