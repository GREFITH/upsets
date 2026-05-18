import { useState } from "react";
import { Project } from "@/types/dashboard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface EditTimelineDialogProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditTimelineDialog({ project, open, onOpenChange }: EditTimelineDialogProps) {
  const [newEndDate, setNewEndDate] = useState<Date | undefined>(
    project ? new Date(project.endDate) : undefined
  );

  if (!project) return null;

  const originalEnd = new Date(project.endDate);
  const isExtension = newEndDate && newEndDate > originalEnd;

  const handleSave = () => {
    if (newEndDate) {
      toast.success(`Timeline updated for ${project.clientName}`, {
        description: `New end date: ${format(newEndDate, "PPP")}${isExtension ? " (Extended)" : ""}`,
      });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Edit Timeline — {project.clientName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Project Code</p>
              <p className="font-mono text-sm">{project.code}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Start Date</p>
              <p className="text-sm">{format(new Date(project.startDate), "MMM d, yyyy")}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2">New End Date</p>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left", !newEndDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {newEndDate ? format(newEndDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={newEndDate}
                  onSelect={setNewEndDate}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {isExtension && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-warning/10 border border-warning/20">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-medium text-warning">This extends the project timeline</p>
                <p className="text-muted-foreground mt-0.5">
                  Original end: {format(originalEnd, "MMM d, yyyy")} → New: {format(newEndDate, "MMM d, yyyy")}. 
                  This will be flagged as "Extended" and impact the forecast budget.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
