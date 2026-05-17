import { CheckCircle2, Circle, Info, Loader2, XCircle } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import type { SyncPhaseInfo, SyncState } from "@/hooks/useOperationsData";

const PHASE_LABELS: Record<string, string> = {
  clients: "Clients",
  projects: "Projects",
  users: "Team Members",
  assignments: "Assignments",
  time_entries: "Time Entries",
};

const PHASE_ORDER = [
  "clients",
  "projects",
  "users",
  "assignments",
  "time_entries",
];

function PhaseIcon({ status }: { status: SyncPhaseInfo["status"] }) {
  if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />;
  if (status === "syncing") return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" />;
  if (status === "error") return <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />;
  return <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />;
}

type Props = {
  syncState: SyncState | null;
  isSyncing: boolean;
};

export function SyncStatusPopover({ syncState, isSyncing }: Props) {
  const phases = syncState?.syncPhases ?? {};
  const hasPhases = Object.keys(phases).length > 0;
  const lastSynced = syncState?.lastSuccessAt;
  const lastError = syncState?.lastError;

  const orderedPhases = PHASE_ORDER.map((key) => ({
    key,
    label: PHASE_LABELS[key] ?? key,
    info: phases[key] ?? null,
  }));

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="Sync details">
          <Info className="h-4 w-4" />
        </Button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-80 text-sm p-4 space-y-3">
        {/* Header */}
        <div className="space-y-1">
          <p className="font-semibold text-foreground">Sync Status</p>
          <p className="text-xs text-muted-foreground">
            Last synced:{" "}
            <span className="font-medium text-foreground">
              {lastSynced ? new Date(lastSynced).toLocaleString() : "Never"}
            </span>
          </p>
        </div>

        {/* Phase list */}
        {(hasPhases || isSyncing) && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Modules</p>
            <ul className="space-y-1">
              {orderedPhases.map(({ key, label, info }) => {
                const status: SyncPhaseInfo["status"] = info?.status ?? (isSyncing ? "pending" : "pending");
                return (
                  <li key={key} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <PhaseIcon status={status} />
                      <span className={`truncate text-xs ${status === "syncing" ? "text-blue-500 font-medium" : status === "completed" ? "text-foreground" : "text-muted-foreground"}`}>
                        {label}
                      </span>
                    </div>
                    {info?.count != null && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {status === "syncing" && info.total != null
                          ? `${info.count.toLocaleString()} / ${info.total.toLocaleString()}`
                          : info.count.toLocaleString()}
                      </span>
                    )}
                    {status === "syncing" && info?.count == null && (
                      <span className="text-xs text-blue-500 shrink-0">…</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Error */}
        {lastError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive flex items-start gap-1.5">
            <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="line-clamp-4">{lastError}</span>
          </div>
        )}

        {!hasPhases && !isSyncing && !lastError && (
          <p className="text-xs text-muted-foreground">No sync has run yet. Click Sync to start.</p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
