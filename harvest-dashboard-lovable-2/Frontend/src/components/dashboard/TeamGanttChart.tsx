import { useMemo, useState } from "react";
import {
  format, parseISO, differenceInDays, addMonths,
  isAfter, isBefore, startOfDay, eachMonthOfInterval,
} from "date-fns";
import type { Project, TeamMember } from "@/types/dashboard";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList,
} from "@/components/ui/command";
import { CalendarDays, Users, ChevronsUpDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// ── UpSpring brand palette ───────────────────────────────────────────────────
const BRAND = {
  chartreuse:      "#F3E600",
  chartreuseHover: "#e5d800",
  blue:            "#9BCBEB",
  blueMid:         "#6aafd9",
  blueDark:        "#4A8EAB",
  blueLight:       "#C6E3F3",
  black:           "#1a1a1a",
};

const BAR_COLORS: Array<{ bg: string; text: string }> = [
  { bg: BRAND.chartreuse, text: BRAND.black  },
  { bg: BRAND.blue,       text: BRAND.black  },
  { bg: BRAND.blueMid,    text: "#ffffff"    },
  { bg: "#ECE81A",        text: BRAND.black  },
  { bg: BRAND.blueLight,  text: BRAND.black  },
  { bg: BRAND.blueDark,   text: "#ffffff"    },
  { bg: "#F5EC4D",        text: BRAND.black  },
  { bg: "#3a7a9c",        text: "#ffffff"    },
];

function colorForId(id: string, isExtended: boolean = false) {
  if (isExtended) return { bg: "#fbbf24", text: "#78350f" };
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i);
  return BAR_COLORS[Math.abs(h) % BAR_COLORS.length];
}

interface Props {
  team:      TeamMember[];
  projects:  Project[];
  isLoading?: boolean;
}

// ── All Members Grid View ────────────────────────────────────────────────────
function isNonBillable(p: Project): boolean {
  if (p.isActive === false) return true;
  const name = (p.projectName ?? "").toLowerCase();
  const client = (p.clientName ?? "").toLowerCase();
  return (
    name.includes("non-billable") ||
    client.includes("non-billable") ||
    name.includes("upspring non") ||
    name.includes("award submission") ||
    name.includes("internal")
  );
}

function AllMembersGridView({ team, projects, today, in30Days, showNonBillable }: { team: TeamMember[]; projects: Project[]; today: Date; in30Days: Date; showNonBillable: boolean }) {
  const displayProjects = useMemo(
    () => (showNonBillable ? projects : projects.filter((p) => !isNonBillable(p))),
    [projects, showNonBillable],
  );

  const monthsSet = useMemo(() => {
    const months = new Set<string>();
    displayProjects.forEach((p) => {
      if (!p.startDate || !p.endDate) return;
      const start = parseISO(p.startDate);
      const end = parseISO(p.endDate);
      eachMonthOfInterval({ start, end: addMonths(end, 2) }).forEach((m) =>
        months.add(format(m, "yyyy-MM")),
      );
    });
    for (let i = 0; i < 3; i++) months.add(format(addMonths(today, i), "yyyy-MM"));
    return Array.from(months).sort();
  }, [displayProjects, today]);

  function getMonthCell(member: TeamMember, monthStr: string): {
    type: "project-start" | "project-continuation" | "gap" | "empty";
    project?: Project;
    color?: { bg: string; text: string };
    endingSoon?: boolean;
  } {
    const [year, month] = monthStr.split("-");
    const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const monthEnd = addMonths(monthDate, 1);

    const memberProjs = displayProjects.filter(
      (p) =>
        (p.assignedTeam ?? []).includes(member.id) &&
        p.startDate && p.endDate &&
        parseISO(p.startDate) < monthEnd &&
        parseISO(p.endDate) > monthDate,
    );

    if (memberProjs.length > 0) {
      const proj = memberProjs[0];
      const isStartMonth = format(parseISO(proj.startDate), "yyyy-MM") === monthStr;
      const endDate = parseISO(proj.endDate);
      const endingSoon = !isBefore(endDate, today) && !isAfter(endDate, in30Days);
      return {
        type: isStartMonth ? "project-start" : "project-continuation",
        project: proj,
        color: colorForId(proj.id, proj.status === "extended"),
        endingSoon,
      };
    }

    const allMemberProjs = displayProjects.filter(
      (p) => (p.assignedTeam ?? []).includes(member.id) && p.startDate && p.endDate,
    );
    const hasProjectBefore = allMemberProjs.some((p) => parseISO(p.endDate) <= monthDate);
    const hasProjectAfter  = allMemberProjs.some((p) => parseISO(p.startDate) >= monthEnd);

    if (hasProjectBefore && hasProjectAfter) return { type: "gap" };
    return { type: "empty" };
  }

  const greenStripeStyle: React.CSSProperties = {
    backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(16,185,129,0.1) 10px, rgba(16,185,129,0.1) 20px)",
  };

  return (
    <div className="p-5 overflow-x-auto">
      <div className="inline-block border rounded-lg">
        <table className="text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="p-2 text-left font-semibold border-r min-w-[120px]">Team Member</th>
              {monthsSet.map((monthStr) => (
                <th key={monthStr} className="p-2 text-center font-semibold border-r min-w-[60px] whitespace-nowrap">
                  {format(parseISO(monthStr + "-01"), "MMM yy")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {team.map((member) => (
              <tr key={member.id} className="border-b hover:bg-muted/30">
                <td className="p-2 text-left font-medium border-r">
                  <div className="truncate">{member.name}</div>
                  <div className="text-[10px] text-muted-foreground">{member.role}</div>
                </td>
                {monthsSet.map((monthStr) => {
                  const cell = getMonthCell(member, monthStr);
                  return (
                    <td key={`${member.id}-${monthStr}`} className="p-1 text-center border-r">

                      {/* Project start — solid color box, red ring if ending within 30 days */}
                      {cell.type === "project-start" && cell.project && cell.color && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "h-10 rounded flex items-center justify-center text-[9px] font-semibold cursor-default truncate px-1",
                                  cell.endingSoon && "ring-2 ring-red-500 animate-pulse",
                                )}
                                style={{ background: cell.color.bg, color: cell.color.text }}
                              >
                                {cell.project.projectName || cell.project.code}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs max-w-[220px] space-y-1">
                              <p className="font-semibold">{cell.project.projectName}</p>
                              <p className="text-muted-foreground">{cell.project.clientName}</p>
                              <p className="text-muted-foreground">
                                {format(parseISO(cell.project.startDate), "MMM d, yyyy")} → {format(parseISO(cell.project.endDate), "MMM d, yyyy")}
                              </p>
                              {cell.endingSoon && (
                                <p className="text-red-500 font-semibold">
                                  ⚠ Ending in {differenceInDays(parseISO(cell.project.endDate), today)} days
                                </p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}

                      {/* Continuation — green stripe, tooltip shows availability date */}
                      {cell.type === "project-continuation" && cell.project && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className="h-10 rounded bg-emerald-100 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 cursor-default"
                                style={greenStripeStyle}
                              />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs max-w-[220px] space-y-1">
                              <p className="font-semibold text-emerald-700">Booked this month</p>
                              <p className="text-muted-foreground">On: {cell.project.projectName}</p>
                              <p className="text-muted-foreground">
                                Available from: <span className="font-medium text-foreground">{format(parseISO(cell.project.endDate), "MMM d, yyyy")}</span>
                              </p>
                              {cell.endingSoon && (
                                <p className="text-red-500 font-semibold">
                                  ⚠ Project ending in {differenceInDays(parseISO(cell.project.endDate), today)} days
                                </p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}

                      {/* Gap — green stripe, tooltip shows "available between projects" */}
                      {cell.type === "gap" && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className="h-10 rounded bg-emerald-100 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 cursor-default"
                                style={greenStripeStyle}
                              />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs max-w-[180px] space-y-1">
                              <p className="font-semibold text-emerald-700">Available</p>
                              <p className="text-muted-foreground">No project assigned this month</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}

                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[10px] text-muted-foreground/60">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded" style={{ background: BRAND.chartreuse }} />
          <span>Active project start</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded" style={{ background: "#fbbf24" }} />
          <span>Extended project start</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="h-3 w-3 rounded bg-emerald-100 border border-emerald-200"
            style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(16,185,129,0.1) 4px, rgba(16,185,129,0.1) 8px)" }}
          />
          <span>Booked / Available gap</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded ring-2 ring-red-500 animate-pulse bg-white dark:bg-background" />
          <span>Ending soon*</span>
        </div>
      </div>
      <p className="mt-1.5 text-[9px] text-muted-foreground/40 italic">
        * Red pulsing border = project ending within 30 days — member will be available soon.
        {!showNonBillable && " Non-billable projects hidden. Toggle above to show all."}
      </p>
    </div>
  );
}

// ── Skeleton shown while data loads ─────────────────────────────────────────
function GanttSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4 border-b bg-muted/20">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2.5 flex-1">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-9 w-full sm:w-[280px] rounded-md" />
        </div>
      </CardHeader>
      <CardContent className="p-5">
        <Skeleton className="h-3 w-48 mb-4" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-36 rounded-lg" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function TeamGanttChart({ team, projects, isLoading = false }: Props) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [comboOpen, setComboOpen]   = useState(false);
  const [viewMode, setViewMode] = useState<"individual" | "all-members">("individual");
  const [showNonBillable, setShowNonBillable] = useState(false);
  const today = startOfDay(new Date());
  const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  const sortedTeam = useMemo(
    () => [...team].sort((a, b) => a.name.localeCompare(b.name)),
    [team],
  );

  const selectedMember = useMemo(
    () => sortedTeam.find((m) => m.id === selectedId) ?? null,
    [sortedTeam, selectedId],
  );

  // Availability for every member (drives dropdown + chips)
  const availabilityMap = useMemo(() => {
    const map = new Map<string, Date | null>();
    sortedTeam.forEach((member) => {
      const memberProjs = projects
        .filter(
          (p) =>
            (p.assignedTeam ?? []).includes(member.id) &&
            p.startDate && p.endDate && p.startDate !== p.endDate,
        )
        .map((p) => ({ end: parseISO(p.endDate), isPast: isBefore(parseISO(p.endDate), today) }));
      const future = memberProjs.filter((a) => !a.isPast);
      map.set(
        member.id,
        future.length === 0
          ? null
          : future.reduce((mx, a) => (isAfter(a.end, mx) ? a.end : mx), future[0].end),
      );
    });
    return map;
  }, [sortedTeam, projects, today]);

  // Projects for the selected member
  const memberProjects = useMemo(() => {
    if (!selectedMember) return [];
    return projects
      .filter(
        (p) =>
          (p.assignedTeam ?? []).includes(selectedMember.id) &&
          p.startDate && p.endDate && p.startDate !== p.endDate,
      )
      .map((p) => {
        const start = parseISO(p.startDate);
        const end = parseISO(p.endDate);
        return {
          project: p,
          start,
          end,
          color: colorForId(p.id, p.status === "extended"),
          isPast: isBefore(end, today),
          isEndingSoon: !isBefore(end, today) && !isAfter(end, in30Days),
        };
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [selectedMember, projects, today, in30Days]);

  const availableFrom = selectedMember
    ? (availabilityMap.get(selectedMember.id) ?? null)
    : null;

  // Timeline bounds
  const { tlStart, totalDays, months } = useMemo(() => {
    if (memberProjects.length === 0) {
      const s = startOfDay(new Date());
      const e = addMonths(s, 6);
      return { tlStart: s, totalDays: differenceInDays(e, s), months: eachMonthOfInterval({ start: s, end: e }) };
    }
    const all = memberProjects.flatMap((a) => [a.start, a.end]);
    const tS  = startOfDay(all.reduce((mn, d) => (isBefore(d, mn) ? d : mn), all[0]));
    const tE  = addMonths(all.reduce((mx, d) => (isAfter(d, mx) ? d : mx), all[0]), 2);
    return {
      tlStart: tS,
      totalDays: Math.max(1, differenceInDays(tE, tS)),
      months: eachMonthOfInterval({ start: tS, end: tE }),
    };
  }, [memberProjects]);

  function pct(d: Date) {
    return Math.max(0, Math.min(100, (differenceInDays(d, tlStart) / totalDays) * 100));
  }
  function initials(name: string) {
    return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  }

  const availNowCount = sortedTeam.filter((m) => availabilityMap.get(m.id) === null).length;

  if (isLoading) return <GanttSkeleton />;

  return (
    <Card className="overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <CardHeader className="pb-4 border-b bg-muted/20">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2.5 flex-1">
              {/* Icon — neutral, matches other dashboard cards */}
              <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-base">Team Availability</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {sortedTeam.length} members &middot; {availNowCount} available now
                </p>
              </div>
            </div>

            {/* ── Mode toggle + non-billable toggle ────────────────────── */}
            <div className="flex items-center gap-2 shrink-0">
              <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as "individual" | "all-members")} className="border rounded-md p-0.5 bg-background">
                <ToggleGroupItem value="individual" className="text-xs h-8" aria-label="Individual view">
                  Individual
                </ToggleGroupItem>
                <ToggleGroupItem value="all-members" className="text-xs h-8" aria-label="All members view">
                  All Members
                </ToggleGroupItem>
              </ToggleGroup>
              {viewMode === "all-members" && (
                <Button
                  variant={showNonBillable ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-8 shrink-0"
                  onClick={() => setShowNonBillable((v) => !v)}
                >
                  {showNonBillable ? "All projects" : "Billable only"}
                </Button>
              )}
            </div>
          </div>

          {viewMode === "individual" && (
            <Popover open={comboOpen} onOpenChange={setComboOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboOpen}
                  className="w-full sm:w-[280px] h-9 text-sm justify-between font-normal bg-background hover:bg-muted data-[state=open]:bg-muted"
                >
                  <span className="truncate text-left">
                    {selectedMember ? selectedMember.name : "Select a team member…"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-40" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="end">
                <Command>
                  <CommandInput placeholder="Search members…" className="h-9 text-sm" />
                  <CommandList>
                    <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                      No member found.
                    </CommandEmpty>
                    <CommandGroup>
                      {sortedTeam.map((m) => {
                        const avail = availabilityMap.get(m.id) ?? null;
                        const isNow = avail === null;
                        return (
                          <CommandItem
                            key={m.id}
                            value={m.name}
                            onSelect={() => {
                              setSelectedId(m.id === selectedId ? "" : m.id);
                              setComboOpen(false);
                            }}
                            className="cursor-pointer data-[selected=true]:bg-muted data-[selected=true]:text-foreground"
                          >
                            <div className="flex items-center gap-2 w-full min-w-0">
                              {/* Selected checkmark */}
                              <Check
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0",
                                  selectedId === m.id ? "opacity-100" : "opacity-0",
                                )}
                              />
                              {/* Avatar */}
                              <div
                                className="h-5 w-5 rounded-full flex items-center justify-center shrink-0 text-[8px] font-bold text-white"
                                style={{ background: BRAND.black }}
                              >
                                {initials(m.name)}
                              </div>
                              <span className="flex-1 truncate text-sm">{m.name}</span>
                              {/* Availability indicator */}
                              {isNow ? (
                                <div className="flex items-center gap-1 shrink-0">
                                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  <span className="text-[9px] font-semibold text-emerald-600">Now</span>
                                </div>
                              ) : (
                                <span className="text-[9px] text-muted-foreground shrink-0">
                                  {format(avail!, "MMM d")}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* ── All Members grid view ────────────────────────────────────── */}
        {viewMode === "all-members" && (
          <AllMembersGridView
            team={sortedTeam}
            projects={projects}
            today={today}
            in30Days={in30Days}
            showNonBillable={showNonBillable}
          />
        )}

        {/* ── Empty state chip grid ────────────────────────────────────── */}
        {!selectedMember && viewMode === "individual" && (
          <div className="p-5">
            <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest mb-3">
              {sortedTeam.length} Team Members — click to view timeline
            </p>
            <div className="flex flex-wrap gap-2">
              {sortedTeam.map((m) => {
                const avail = availabilityMap.get(m.id) ?? null;
                const isNow = avail === null;
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className={cn(
                      "group flex items-center gap-2.5 pl-2.5 pr-3 py-2 rounded-lg border bg-card",
                      "transition-all duration-150 hover:shadow-sm focus:outline-none",
                      isNow
                        ? "hover:border-emerald-300 dark:hover:border-emerald-700"
                        : "hover:border-border hover:bg-muted/40",
                    )}
                  >
                    <div
                      className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold text-white"
                      style={{ background: BRAND.black }}
                    >
                      {initials(m.name)}
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-xs font-semibold leading-tight truncate">{m.name}</p>
                      {isNow ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                          <span className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                            Available now
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 mt-0.5">
                          <CalendarDays className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
                          <span className="text-[9px] text-muted-foreground">
                            From {format(avail!, "MMM d, yyyy")}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Selected member: info strip + Gantt ──────────────────────── */}
        {selectedMember && (
          <div>
            {/* Info strip */}
            <div className="flex items-center gap-4 px-5 py-3.5 border-b bg-muted/10">
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
                style={{ background: BRAND.black }}
              >
                {initials(selectedMember.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{selectedMember.name}</p>
                  <Badge variant="outline" className="text-[10px] px-1.5 h-4">
                    {selectedMember.role}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-0.5">
                  <span className={cn(
                    "text-xs font-medium",
                    selectedMember.utilization > 100 ? "text-destructive" :
                    selectedMember.utilization >= 75 ? "text-amber-600" : "text-muted-foreground",
                  )}>
                    {selectedMember.utilization.toFixed(0)}% utilization
                  </span>
                  <span className="text-muted-foreground/30 text-xs">·</span>
                  <span className="text-xs text-muted-foreground">
                    {memberProjects.length} project{memberProjects.length !== 1 ? "s" : ""} assigned
                  </span>
                </div>
              </div>
              {/* Single availability badge */}
              <div className="shrink-0">
                {availableFrom === null ? (
                  <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-3 py-1.5 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-semibold">Available now</span>
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 border"
                    style={{ background: BRAND.chartreuse, borderColor: BRAND.chartreuseHover }}
                  >
                    <CalendarDays className="h-3.5 w-3.5 shrink-0" style={{ color: BRAND.black }} />
                    <div>
                      <p className="text-[10px] leading-none mb-0.5 opacity-60" style={{ color: BRAND.black }}>
                        Available from
                      </p>
                      <p className="text-xs font-bold leading-none" style={{ color: BRAND.black }}>
                        {format(availableFrom, "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* No projects */}
            {memberProjects.length === 0 && (
              <div className="px-5 py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No projects with date ranges found for{" "}
                  <span className="font-medium text-foreground">{selectedMember.name}</span>.
                </p>
              </div>
            )}

            {/* Gantt */}
            {memberProjects.length > 0 && (
              <div className="p-5 overflow-x-auto">
                <div style={{ minWidth: 640 }}>
                  {/* Month axis */}
                  <div className="flex mb-2">
                    <div className="w-[230px] shrink-0" />
                    <div className="relative flex-1 h-5">
                      {months.map((m) => (
                        <div
                          key={m.toISOString()}
                          className="absolute top-0 text-[10px] text-muted-foreground/50 font-medium select-none"
                          style={{ left: `${pct(m)}%`, transform: "translateX(-50%)" }}
                        >
                          {format(m, "MMM yy")}
                        </div>
                      ))}
                    </div>
                  </div>

                  <TooltipProvider delayDuration={60}>
                    <div className="space-y-2">
                      {memberProjects.map(({ project, start, end, color, isPast, isEndingSoon }) => {
                        const left  = pct(start);
                        const width = Math.max(1, pct(end) - left);
                        return (
                          <div key={project.id} className="flex items-center group">
                            {/* Left label */}
                            <div className="w-[230px] shrink-0 pr-4 flex items-center gap-2 border-r border-border/40">
                              <div
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ background: isPast ? "#d1d5db" : color.bg, opacity: isPast ? 0.4 : 1 }}
                              />
                              <div className="min-w-0">
                                <p className={cn("text-xs font-medium truncate leading-tight", isPast && "text-muted-foreground/60")}>
                                  {project.clientName}
                                </p>
                                <p className="text-[10px] text-muted-foreground/55 truncate leading-tight">
                                  {project.projectName}
                                </p>
                              </div>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[9px] px-1 h-3.5 leading-none shrink-0 ml-auto capitalize",
                                  isPast
                                    ? "border-border/30 text-muted-foreground/35 bg-transparent"
                                    : project.status === "active"
                                    ? "border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:bg-emerald-950/40"
                                    : "border-border text-muted-foreground",
                                )}
                              >
                                {isPast ? "ended" : project.status}
                              </Badge>
                            </div>

                            {/* Timeline row */}
                            <div className="relative flex-1 h-9 bg-muted/20 rounded-lg overflow-hidden">
                              {months.map((m) => (
                                <div
                                  key={m.toISOString()}
                                  className="absolute inset-y-0 w-px bg-border/20 pointer-events-none"
                                  style={{ left: `${pct(m)}%` }}
                                />
                              ))}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    className={cn(
                                      "absolute top-1.5 h-6 rounded-md cursor-default transition-opacity",
                                      isEndingSoon && !isPast && "ring-2 ring-offset-1 ring-red-500 animate-pulse"
                                    )}
                                    style={{
                                      left:       `${left}%`,
                                      width:      `${width}%`,
                                      background: isPast ? "#d1d5db" : color.bg,
                                      opacity:    isPast ? 0.4 : 0.92,
                                    }}
                                    onMouseEnter={(e) => { if (!isPast) (e.currentTarget as HTMLDivElement).style.opacity = "1"; }}
                                    onMouseLeave={(e) => { if (!isPast) (e.currentTarget as HTMLDivElement).style.opacity = "0.92"; }}
                                  >
                                    <div className="absolute inset-0 rounded-md flex items-center px-2 overflow-hidden">
                                      <span
                                        className="text-[9px] font-semibold truncate leading-none select-none"
                                        style={{ color: isPast ? "#9ca3af" : color.text }}
                                      >
                                        {format(start, "MMM d")} → {format(end, "MMM d, yy")}
                                      </span>
                                    </div>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs max-w-[220px] space-y-1">
                                  <p className="font-semibold">{project.clientName}</p>
                                  {project.projectName && (
                                    <p className="text-muted-foreground">{project.projectName}</p>
                                  )}
                                  <div className="border-t pt-1 mt-1 space-y-0.5">
                                    <p><span className="text-muted-foreground">Start:</span> {format(start, "MMM d, yyyy")}</p>
                                    <p><span className="text-muted-foreground">End:</span>   {format(end,   "MMM d, yyyy")}</p>
                                    <p>
                                      <span className="text-muted-foreground">Status:</span>{" "}
                                      <span className="capitalize font-medium">{isPast ? "ended" : project.status}</span>
                                    </p>
                                    {isEndingSoon && !isPast && (
                                      <p className="text-amber-600 font-medium">⚠ Ending in {differenceInDays(end, today)} days</p>
                                    )}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </TooltipProvider>

                  {/* Legend */}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-4 pt-3 border-t text-[10px] text-muted-foreground/50">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="h-2.5 w-5 rounded-sm border"
                        style={{ background: BRAND.chartreuse, borderColor: BRAND.chartreuseHover }}
                      />
                      <span>Active</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-2.5 w-5 rounded-sm bg-gray-300" />
                      <span>Ended</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
