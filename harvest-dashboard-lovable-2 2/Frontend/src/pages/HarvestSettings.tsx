import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, History, RefreshCw, Save } from "lucide-react";
import { useHarvestSyncPending } from "@/hooks/useHarvestSyncPending";
import { invalidateHarvestBackedQueries, useManualHarvestSync } from "@/hooks/useOperationsData";
import type { SyncPhaseInfo, SyncState } from "@/hooks/useOperationsData";
import { useProjects, useSyncHistory } from "@/hooks/usePageData";
import { SyncStatusPopover } from "@/components/SyncStatusPopover";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { DEPARTMENTS, Department, ROLLUP_DEPARTMENT_IDS, Project } from "@/types/dashboard";
import { apiClient } from "@/lib/api/client";
import { clearHarvestSyncPending } from "@/lib/harvestSyncPending";
import { toast } from "@/hooks/use-toast";

// ─── animation variants ────────────────────────────────────────────────────────

const pageVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

const rowVariants = {
  hidden: { opacity: 0, x: -8 },
  show: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.22, ease: "easeOut", delay: i * 0.04 },
  }),
};

const bannerVariants = {
  hidden: { opacity: 0, height: 0, marginBottom: 0 },
  show: { opacity: 1, height: "auto", marginBottom: 8, transition: { duration: 0.25, ease: "easeOut" } },
  exit: { opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.2 } },
};

// ─── types ─────────────────────────────────────────────────────────────────────

type MappingDraft = Record<string, Department>;
type OverrideDraft = Record<
  string,
  {
    monthly_fee_override: string;
    freelancer_cost_override: string;
    commission_cost_override: string;
    other_cost_override: string;
  }
>;

type SavedOverride = {
  projectId: number;
  monthlyBurnOverride: number | null;
  freelancerCostOverride: number | null;
  commissionCostOverride: number | null;
  otherCostOverride: number | null;
};

type SavedMapping = {
  projectId: number;
  departmentId: string;
};

type SettingsResponse = {
  projectMappings: SavedMapping[];
  financialOverrides: SavedOverride[];
  lastSuccessAt: string | null;
  lastError: string | null;
  syncStartedAt: string | null;
  currentPhase: string | null;
  syncPhases: Record<string, SyncPhaseInfo>;
};

function numToStr(v: number | null | undefined): string {
  if (v == null) return "";
  return String(v);
}

// ─── skeleton for the table while loading ─────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="rounded-md border overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-muted/50 border-b">
            {["Project Code", "Name", "Client", "Department", "Monthly Fee", "Freelancer", "Commission", "Other"].map((h) => (
              <th key={h} className="px-4 py-3 text-left">
                <Skeleton className="h-3 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b last:border-0">
              {Array.from({ length: 8 }).map((__, j) => (
                <td key={j} className="px-4 py-3">
                  <Skeleton className="h-8 w-full max-w-[120px]" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── project table ─────────────────────────────────────────────────────────────

type ProjectTableProps = {
  projects: Project[];
  mappingDraft: Record<string, Department>;
  overrideDraft: Record<string, { monthly_fee_override: string; freelancer_cost_override: string; commission_cost_override: string; other_cost_override: string }>;
  setMappingDraft: React.Dispatch<React.SetStateAction<Record<string, Department>>>;
  setOverrideDraft: React.Dispatch<React.SetStateAction<Record<string, { monthly_fee_override: string; freelancer_cost_override: string; commission_cost_override: string; other_cost_override: string }>>>;
  dimmed?: boolean;
};

function ProjectTable({ projects, mappingDraft, overrideDraft, setMappingDraft, setOverrideDraft, dimmed }: ProjectTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project Code</TableHead>
          <TableHead>Project Name</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Department</TableHead>
          <TableHead>Monthly Fee Override</TableHead>
          <TableHead>Freelancer Cost Override</TableHead>
          <TableHead>Commission Override</TableHead>
          <TableHead>Other Cost Override</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project, i) => (
          <motion.tr
            key={project.id}
            custom={i}
            variants={rowVariants}
            initial="hidden"
            animate="show"
            className={`border-b transition-opacity ${dimmed ? "opacity-40 hover:opacity-70" : ""}`}
          >
            <TableCell className="font-mono text-xs">{project.code}</TableCell>
            <TableCell className="text-sm max-w-[280px]" title={project.projectName || undefined}>
              <span className="line-clamp-2">{project.projectName || "—"}</span>
            </TableCell>
            <TableCell>{project.clientName}</TableCell>
            <TableCell>
              <Select
                value={mappingDraft[project.id] ?? project.department}
                onValueChange={(value) =>
                  setMappingDraft((prev) => ({ ...prev, [project.id]: value as Department }))
                }
              >
                <SelectTrigger className="h-9 min-w-[12rem] max-w-[18rem] w-full justify-start gap-2 text-left [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned" className="text-muted-foreground">Select department</SelectItem>
                  {ROLLUP_DEPARTMENT_IDS.map((deptId) => {
                    const dept = DEPARTMENTS.find((d) => d.id === deptId)!;
                    return <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell>
              <Input
                placeholder={String(project.monthlyFee || "")}
                value={overrideDraft[project.id]?.monthly_fee_override ?? ""}
                onChange={(e) => setOverrideDraft((prev) => ({ ...prev, [project.id]: { ...prev[project.id] ?? { freelancer_cost_override: "", commission_cost_override: "", other_cost_override: "" }, monthly_fee_override: e.target.value } }))}
              />
            </TableCell>
            <TableCell>
              <Input
                value={overrideDraft[project.id]?.freelancer_cost_override ?? ""}
                onChange={(e) => setOverrideDraft((prev) => ({ ...prev, [project.id]: { ...prev[project.id] ?? { monthly_fee_override: "", commission_cost_override: "", other_cost_override: "" }, freelancer_cost_override: e.target.value } }))}
              />
            </TableCell>
            <TableCell>
              <Input
                value={overrideDraft[project.id]?.commission_cost_override ?? ""}
                onChange={(e) => setOverrideDraft((prev) => ({ ...prev, [project.id]: { ...prev[project.id] ?? { monthly_fee_override: "", freelancer_cost_override: "", other_cost_override: "" }, commission_cost_override: e.target.value } }))}
              />
            </TableCell>
            <TableCell>
              <Input
                value={overrideDraft[project.id]?.other_cost_override ?? ""}
                onChange={(e) => setOverrideDraft((prev) => ({ ...prev, [project.id]: { ...prev[project.id] ?? { monthly_fee_override: "", freelancer_cost_override: "", commission_cost_override: "" }, other_cost_override: e.target.value } }))}
              />
            </TableCell>
          </motion.tr>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── page ──────────────────────────────────────────────────────────────────────

export default function HarvestSettings() {
  const queryClient = useQueryClient();
  const { data: projectList, isFetched: operationsDataReady } = useProjects();
  const { data: syncHistory = [], isPending: syncHistoryPending } = useSyncHistory();
  const syncMutation = useManualHarvestSync();
  const [saving, setSaving] = useState(false);
  const [syncLogOpen, setSyncLogOpen] = useState(false);

  const [mappingDraft, setMappingDraft] = useState<MappingDraft>({});
  const [overrideDraft, setOverrideDraft] = useState<OverrideDraft>({});
  const [draftSeeded, setDraftSeeded] = useState(false);

  const { data: savedSettings, isPending: settingsPending } = useQuery({
    queryKey: ["harvest-settings-overrides"],
    queryFn: async () => {
      const res = await apiClient.get<SettingsResponse>("/api/v1/settings/harvest");
      return res;
    },
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!savedSettings || draftSeeded) return;
    const newOverrides: OverrideDraft = {};
    for (const ov of savedSettings.financialOverrides) {
      newOverrides[String(ov.projectId)] = {
        monthly_fee_override: numToStr(ov.monthlyBurnOverride),
        freelancer_cost_override: numToStr(ov.freelancerCostOverride),
        commission_cost_override: numToStr(ov.commissionCostOverride),
        other_cost_override: numToStr(ov.otherCostOverride),
      };
    }
    const newMappings: MappingDraft = {};
    for (const m of savedSettings.projectMappings) {
      newMappings[String(m.projectId)] = m.departmentId as Department;
    }
    setOverrideDraft(newOverrides);
    setMappingDraft(newMappings);
    setDraftSeeded(true);
  }, [savedSettings, draftSeeded]);

  const projects = projectList ?? [];
  const activeProjects = projects.filter((p) => p.isActive);
  const inactiveProjects = projects.filter((p) => !p.isActive);
  const lastSynced = savedSettings?.lastSuccessAt ?? null;
  const syncError = savedSettings?.lastError ?? null;
  const harvestSyncPending = useHarvestSyncPending(lastSynced);
  const harvestPostInFlight = syncMutation.isPending;

  const { data: liveStatus } = useQuery<SyncState>({
    queryKey: ["sync-status-live"],
    queryFn: async () => {
      const res = await apiClient.get<{
        lastSuccessAt: string | null;
        lastError: string | null;
        syncStartedAt: string | null;
        currentPhase: string | null;
        phases: SyncState["syncPhases"];
      }>("/api/v1/sync/status");
      return {
        lastSuccessAt: res.lastSuccessAt,
        lastError: res.lastError,
        syncStartedAt: res.syncStartedAt,
        currentPhase: res.currentPhase,
        syncPhases: res.phases ?? {},
      };
    },
    enabled: harvestPostInFlight,
    refetchInterval: harvestPostInFlight ? 1000 : false,
    staleTime: 0,
  });

  const settingsSyncState: SyncState | null = savedSettings
    ? {
        lastSuccessAt: savedSettings.lastSuccessAt ?? null,
        lastError: savedSettings.lastError ?? null,
        syncStartedAt: savedSettings.syncStartedAt ?? null,
        currentPhase: savedSettings.currentPhase ?? null,
        syncPhases: savedSettings.syncPhases ?? {},
      }
    : null;
  const displaySyncState: SyncState | null = harvestPostInFlight
    ? (liveStatus ?? settingsSyncState)
    : settingsSyncState;

  const canSave = useMemo(() => Boolean(projects.length > 0), [projects.length]);

  function dismissStuckHarvestSync() {
    clearHarvestSyncPending();
    syncMutation.reset();
  }

  async function saveConfig() {
    setSaving(true);
    try {
      const mappingRows = Object.entries(mappingDraft).map(([projectId, departmentId]) => ({
        projectId: Number(projectId),
        departmentId,
        departmentName:
          departmentId === "unassigned"
            ? "Unassigned"
            : (DEPARTMENTS.find((d) => d.id === departmentId)?.name ?? departmentId),
      }));
      const overrideRows = Object.entries(overrideDraft)
        .map(([projectId, row]) => {
          const pid = Number(projectId);
          const mf = row.monthly_fee_override.trim();
          const fr = row.freelancer_cost_override.trim();
          const cm = row.commission_cost_override.trim();
          const ot = row.other_cost_override.trim();
          if (!mf && !fr && !cm && !ot) return null;
          return {
            projectId: pid,
            monthlyBurnOverride: mf ? Number(mf) : null,
            freelancerCostOverride: fr ? Number(fr) : null,
            commissionCostOverride: cm ? Number(cm) : null,
            otherCostOverride: ot ? Number(ot) : null,
          };
        })
        .filter(Boolean);

      if (mappingRows.length) {
        await apiClient.put("/api/v1/settings/project-mapping", { entries: mappingRows });
      }
      if (overrideRows.length) {
        await apiClient.put("/api/v1/settings/financial-overrides", { entries: overrideRows });
      }
      await invalidateHarvestBackedQueries(queryClient);
      setDraftSeeded(false);
      toast({
        title: "Saved",
        description:
          "Mappings and overrides are stored in Postgres. Use Sync to pull the latest hours from Harvest.",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not save settings to Supabase.";
      toast({
        title: "Save failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const isLoading = settingsPending || !operationsDataReady;

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={cardVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Harvest Settings</h1>
          <p className="text-sm text-muted-foreground">Manage department mapping, financial overrides, and sync status.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <SyncStatusPopover syncState={displaySyncState} isSyncing={harvestPostInFlight} />
          <Sheet open={syncLogOpen} onOpenChange={setSyncLogOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" type="button">
                <History className="h-4 w-4 mr-2" />
                View sync logs
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Harvest sync history</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                {syncHistoryPending ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : syncHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sync runs recorded yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Started</TableHead>
                        <TableHead>Completed</TableHead>
                        <TableHead>From</TableHead>
                        <TableHead>Till</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Entries synced</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {syncHistory.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {row.startedAt ? new Date(row.startedAt).toLocaleString() : "—"}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {row.completedAt ? new Date(row.completedAt).toLocaleString() : "—"}
                          </TableCell>
                          <TableCell className="text-xs">{row.fromDate ?? "—"}</TableCell>
                          <TableCell className="text-xs">{row.throughDate ?? "—"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                row.status === "failed"
                                  ? "destructive"
                                  : row.status === "running"
                                    ? "default"
                                    : row.status === "stale"
                                      ? "outline"
                                      : "secondary"
                              }
                            >
                              {row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{row.entriesSynced ?? "—"}</TableCell>
                          <TableCell className="text-xs max-w-[180px] break-words text-muted-foreground">
                            {row.errorMessage ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </SheetContent>
          </Sheet>
          <Button
            variant="outline"
            title={
              !operationsDataReady
                ? "Loading sync status from the server…"
                : harvestPostInFlight
                  ? "A Harvest sync request is running in this tab (waiting on the server)."
                  : harvestSyncPending
                    ? "No request is active in this tab — this is a saved 'syncing' hint (e.g. after an API restart). Click to run a new sync, or dismiss below."
                    : "Pull the latest data from Harvest into Postgres"
            }
            onClick={() => {
              if (!operationsDataReady) return;
              syncMutation.mutate({ baselineLastSuccessAt: lastSynced ?? null });
            }}
            disabled
          >
            <RefreshCw className={`h-4 w-4 mr-2 transition-transform ${harvestPostInFlight ? "animate-spin" : ""}`} />
            {harvestPostInFlight ? "Syncing" : harvestSyncPending ? "Retry sync" : "Sync"}
          </Button>
          <motion.div whileTap={{ scale: 0.96 }}>
            <Button onClick={saveConfig} disabled={saving || !canSave || isLoading}>
              <motion.span
                key={saving ? "saving" : "save"}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
                className="flex items-center"
              >
                <Save className={`h-4 w-4 mr-2 ${saving ? "animate-pulse" : ""}`} />
                {saving ? "Saving…" : "Save"}
              </motion.span>
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Sync Health card */}
      <motion.div variants={cardVariants}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sync Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-64" />
              </div>
            ) : (
              <p>
                Last synced:{" "}
                <span className="font-medium">
                  {lastSynced ? new Date(lastSynced).toLocaleString() : "No successful sync yet"}
                </span>
              </p>
            )}

            <AnimatePresence>
              {harvestSyncPending && !harvestPostInFlight && (
                <motion.p
                  key="stuck-hint"
                  variants={bannerVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="text-muted-foreground rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed overflow-hidden"
                >
                  This tab does not have an active HTTP sync right now. If you restarted the API, the previous run was
                  interrupted — use{" "}
                  <span className="font-medium text-foreground">Retry sync</span> or{" "}
                  <button
                    type="button"
                    className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
                    onClick={dismissStuckHarvestSync}
                  >
                    dismiss local status
                  </button>
                  .
                </motion.p>
              )}

              {syncError && (
                <motion.div
                  key="sync-error"
                  variants={bannerVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive flex items-start gap-2 overflow-hidden"
                >
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{syncError}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>

      {/* Project Mapping & Overrides card */}
      <motion.div variants={cardVariants}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Project Mapping & Financial Overrides</CardTitle>
            <p className="text-sm text-muted-foreground font-normal">
              Changing a department or override only updates this screen until you click{" "}
              <span className="font-medium text-foreground">Save</span>.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="space-y-6">
                <div>
                  <Skeleton className="h-3 w-24 mb-3" />
                  <TableSkeleton />
                </div>
                <div>
                  <Skeleton className="h-3 w-36 mb-3" />
                  <TableSkeleton />
                </div>
              </div>
            ) : projects.length === 0 ? (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm text-muted-foreground"
              >
                No projects available yet. Run a sync first.
              </motion.p>
            ) : (
              <>
                {activeProjects.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      Active ({activeProjects.length})
                    </p>
                    <ProjectTable
                      projects={activeProjects}
                      mappingDraft={mappingDraft}
                      overrideDraft={overrideDraft}
                      setMappingDraft={setMappingDraft}
                      setOverrideDraft={setOverrideDraft}
                    />
                  </motion.div>
                )}

                {inactiveProjects.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: 0.08 }}
                  >
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      Archived / Inactive ({inactiveProjects.length})
                    </p>
                    <ProjectTable
                      projects={inactiveProjects}
                      mappingDraft={mappingDraft}
                      overrideDraft={overrideDraft}
                      setMappingDraft={setMappingDraft}
                      setOverrideDraft={setOverrideDraft}
                      dimmed
                    />
                  </motion.div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
