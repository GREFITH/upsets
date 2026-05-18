import type { ProjectStatus } from "@/types/dashboard";

/** Harvest-backed statuses returned by the API today; CRM-style values kept for forward compatibility. */
const KNOWN_STATUSES = new Set<string>([
  "active",
  "inactive",
  "extended",
  "on-track",
  "at-risk",
  "completed",
  "pipeline",
]);

/**
 * Coerce API / cache values into a known ProjectStatus so badge tables never render blank.
 * Empty or unknown strings fall back to Harvest `isActive`.
 */
export function normalizeProjectStatus(raw: unknown, isActive: boolean): ProjectStatus {
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (KNOWN_STATUSES.has(s)) return s as ProjectStatus;
  }
  return isActive ? "active" : "inactive";
}

/** Badge copy + styling for every ProjectStatus (including Harvest `inactive`). */
export const PROJECT_STATUS_BADGES: Record<ProjectStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-success/10 text-success border-success/20" },
  inactive: { label: "Inactive", className: "bg-muted text-muted-foreground border-muted" },
  "on-track": { label: "On Track", className: "bg-secondary/20 text-secondary-foreground border-secondary/30" },
  extended: { label: "Extended", className: "bg-warning/10 text-warning border-warning/20" },
  "at-risk": { label: "At Risk", className: "bg-destructive/10 text-destructive border-destructive/20" },
  completed: { label: "Completed", className: "bg-muted text-muted-foreground border-muted" },
  pipeline: { label: "Pipeline", className: "bg-accent/20 text-accent-foreground border-accent/30" },
};

export function getProjectStatusBadge(project: { status: ProjectStatus; isActive: boolean }) {
  const key = normalizeProjectStatus(project.status, project.isActive);
  return PROJECT_STATUS_BADGES[key];
}
