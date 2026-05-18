import { useEffect, useMemo, useState } from "react";
import { Project, TeamAssignmentRecord } from "@/types/dashboard";
import { useOperationsData } from "@/hooks/useOperationsData";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { UserPlus, UserMinus, Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface EditTeamDialogProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatShortDate(date: string) {
  try {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return date;
  }
}

export function EditTeamDialog({ project, open, onOpenChange }: EditTeamDialogProps) {
  const { data } = useOperationsData();
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  useEffect(() => {
    if (open && project) {
      setSelectedMembers([...(project.assignedTeam ?? [])]);
    }
    if (!open) {
      setSelectedMembers([]);
    }
  }, [open, project?.id, project?.assignedTeam]);

  const history = project ? (data?.teamHistory[project.id] ?? []) : [];

  const sortedHistory = useMemo(() => {
    return [...history].sort(
      (a, b) =>
        new Date(b.assignedDate || b.removedDate || "").getTime() -
        new Date(a.assignedDate || a.removedDate || "").getTime(),
    );
  }, [history]);

  const allMembers = useMemo(() => {
    const list = data?.teamMembers ?? [];
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [data?.teamMembers]);

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  };

  const handleSave = () => {
    if (!project) return;
    const names = selectedMembers
      .map((id) => allMembers.find((m) => m.id === id)?.name)
      .filter(Boolean);
    toast.success("Changes saved", {
      description:
        names.length > 0
          ? `${names.join(", ")} selected for ${project.clientName}. (Assignment write-back to Harvest is not wired yet — this is UI only.)`
          : "No members selected.",
    });
    onOpenChange(false);
  };

  const dialogOpen = Boolean(open && project);

  return (
    <Dialog open={dialogOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto bg-card text-card-foreground border shadow-lg">
        {project ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 shrink-0" />
                Manage Team — {project.clientName}
              </DialogTitle>
              {(project.projectName || project.code) && (
                <p className="text-sm text-muted-foreground font-normal">
                  {[project.projectName, project.code].filter(Boolean).join(" · ")}
                </p>
              )}
            </DialogHeader>

            <Tabs defaultValue="current" className="mt-2">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="current" className="text-xs sm:text-sm">
                  Current Team
                </TabsTrigger>
                <TabsTrigger value="history" className="text-xs sm:text-sm gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Assignment History
                </TabsTrigger>
              </TabsList>

              <TabsContent value="current" className="mt-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Select team members for this account. Changes are logged in the assignment history.
                </p>
                <div className="space-y-0 max-h-[320px] overflow-y-auto border rounded-md divide-y">
                  {allMembers.map((member) => (
                    <label
                      key={member.id}
                      className="flex items-center gap-3 p-3 hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={selectedMembers.includes(member.id)}
                        onCheckedChange={() => toggleMember(member.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{member.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {member.role} · {member.utilization}% utilized
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                        {member.clientLoad} {member.clientLoad === 1 ? "client" : "clients"}
                      </span>
                    </label>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="history" className="mt-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Complete record of team member assignments and changes for this project.
                </p>
                {sortedHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No assignment history recorded yet.</p>
                ) : (
                  <div className="space-y-0 max-h-[320px] overflow-y-auto border rounded-md divide-y">
                    {sortedHistory.map((record: TeamAssignmentRecord, i) => (
                      <div
                        key={`${record.memberId}-${record.assignedDate}-${i}`}
                        className="flex items-start gap-3 p-3"
                      >
                        <div
                          className={cn(
                            "mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                            record.action === "assigned"
                              ? "bg-success/15 text-success"
                              : "bg-destructive/10 text-destructive",
                          )}
                        >
                          {record.action === "assigned" ? (
                            <UserPlus className="h-4 w-4" />
                          ) : (
                            <UserMinus className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{record.memberName}</p>
                          <p className="text-[11px] text-muted-foreground">{record.role}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={cn(
                              "text-xs font-medium",
                              record.action === "assigned" ? "text-success" : "text-destructive",
                            )}
                          >
                            {record.action === "assigned" ? "Assigned" : "Removed"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatShortDate(
                              record.action === "removed" && record.removedDate
                                ? record.removedDate
                                : record.assignedDate,
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled>
                Save Changes
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
