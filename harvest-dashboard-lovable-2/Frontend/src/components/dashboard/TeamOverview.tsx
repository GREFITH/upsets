import { useMemo, useState } from "react";
import { TeamMember } from "@/types/dashboard";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TeamOverviewProps {
  members: TeamMember[];
  projectNameById?: Record<string, string>;
}

const MAX_VISIBLE_PROJECT_CHIPS = 4;

export function TeamOverview({ members, projectNameById = {} }: TeamOverviewProps) {
  return (
    <div className="bg-card border rounded-lg overflow-hidden flex flex-col max-h-[min(72vh,52rem)]">
      <div className="p-3 border-b shrink-0">
        <h3 className="font-semibold text-sm">Team & Utilization</h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {members.length} {members.length === 1 ? "person" : "people"} · scroll to see all
        </p>
      </div>
      <div className="divide-y overflow-y-auto overscroll-contain min-h-0">
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            projectNameById={projectNameById}
          />
        ))}
      </div>
    </div>
  );
}

function MemberRow({
  member,
  projectNameById,
}: {
  member: TeamMember;
  projectNameById: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const assigned = member.assignedProjects ?? [];
  const projectNames = useMemo(
    () =>
      assigned
        .map((pid) => projectNameById[pid])
        .filter(Boolean)
        .map((s) => String(s).replace(/\s{2,}/g, " ").trim()),
    [member.assignedProjects, projectNameById],
  );

  const visible = expanded ? projectNames : projectNames.slice(0, MAX_VISIBLE_PROJECT_CHIPS);
  const hiddenCount = projectNames.length - visible.length;

  return (
    <div className="p-3 flex gap-3 items-start">
      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-[10px] font-semibold text-muted-foreground leading-none">
          {(member.name || "?")
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 3) || "?"}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight truncate">{member.name}</p>
            <p className="text-[10px] text-muted-foreground truncate">{member.role}</p>
          </div>
          <div className="text-right shrink-0">
            <p
              className={cn(
                "text-sm font-semibold tabular-nums",
                member.utilization > 95
                  ? "text-destructive"
                  : member.utilization >= 75
                    ? "text-success"
                    : "text-muted-foreground",
              )}
            >
              {member.utilization}%
            </p>
            <p className="text-[10px] text-muted-foreground whitespace-nowrap">
              {member.clientLoad} {member.clientLoad === 1 ? "client" : "clients"}
            </p>
          </div>
        </div>
        <Progress value={Math.min(member.utilization, 100)} className="h-1.5" />
        {projectNames.length > 0 && (
          <div className="mt-2 space-y-1">
            <div className="flex flex-wrap gap-1">
              {visible.map((name, i) => (
                <span
                  key={`${member.id}-${i}`}
                  className="text-[10px] leading-snug px-1.5 py-0.5 rounded bg-muted text-muted-foreground max-w-full break-words text-left"
                  title={name}
                >
                  {name}
                </span>
              ))}
            </div>
            {projectNames.length > MAX_VISIBLE_PROJECT_CHIPS && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[10px] text-muted-foreground"
                onClick={() => setExpanded((e) => !e)}
              >
                {expanded ? "Show less" : `+${hiddenCount} more project${hiddenCount === 1 ? "" : "s"}`}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
