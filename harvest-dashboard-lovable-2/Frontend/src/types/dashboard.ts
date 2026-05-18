export type Department = "b2b-firms" | "b2b-products" | "residential" | "marketing" | "unassigned";

/** Departments shown in nav, dashboards, and charts (excludes Harvest “not mapped yet”). */
export const ROLLUP_DEPARTMENT_IDS: readonly Department[] = ["b2b-firms", "b2b-products", "residential", "marketing"];

export interface DepartmentInfo {
  id: Department;
  name: string;
  color: string;
}

export const DEPARTMENTS: DepartmentInfo[] = [
  { id: "b2b-firms", name: "B2B Firms", color: "hsl(204, 60%, 76%)" },
  { id: "b2b-products", name: "B2B Products", color: "hsl(56, 94%, 48%)" },
  { id: "residential", name: "Residential & Consumer Product", color: "hsl(0, 0%, 30%)" },
  { id: "marketing", name: "Marketing", color: "hsl(204, 40%, 60%)" },
];

export type ProjectStatus = "active" | "on-track" | "extended" | "at-risk" | "completed" | "pipeline" | "inactive";

export interface Project {
  id: string;
  code: string;
  /** Harvest project title (distinct from client + code). */
  projectName: string;
  clientName: string;
  department: Department;
  isActive: boolean;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  originalEndDate?: string;
  daysLate?: number;
  monthlyFee: number;
  totalRevenue: number;
  costs: {
    freelancers: number;
    commissions: number;
    other: number;
  };
  netRevenue: number;
  profitMargin: number;
  /** Internal loaded cost (hours × Harvest user cost_rate) for assigned team */
  loadedInternalCost?: number;
  loadedNet: number;
  loadedMargin: number;
  assignedTeam: string[];
  hoursTracked: number;
  hoursBudgeted: number;
  utilization: number;
  /** Harvest project created_at when synced */
  createdAt?: string | null;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  department: Department;
  utilization: number;
  billableUtilization?: number;
  internalUtilization?: number;
  clientLoad: number;
  assignedProjects: string[];
  avatar?: string;
  /** Fully loaded annual salary (salary + benefits + overhead) */
  loadedAnnualSalary?: number;
  isContractor?: boolean;
  hasAccessToAllFutureProjects?: boolean;
  canCreateProjects?: boolean;
  calendarIntegrationEnabled?: boolean;
  calendarIntegrationSource?: string;
  avatarUrl?: string;
  timezone?: string;
  telephone?: string;
  employeeId?: string;
  accessRoles?: string[];
  permissionsClaims?: string[];
  roles?: string[];
}

export interface ForecastMonth {
  month: string;
  revenue: number;
  costs: number;
  netRevenue: number;
  projected: boolean;
}

export interface DepartmentMetrics {
  department: Department;
  totalRevenue: number;
  totalCosts: number;
  netRevenue: number;
  profitMargin: number;
  /** Fully loaded margin including allocated team salaries */
  loadedCosts: number;
  loadedNetRevenue: number;
  loadedMargin: number;
  activeProjects: number;
  pipelineValue: number;
  avgUtilization: number;
  teamSize: number;
}

export interface TeamAssignmentRecord {
  memberId: string;
  memberName: string;
  role: string;
  /** Event date from Harvest sync (assignment or removal). */
  assignedDate: string;
  /** Set when `action` is `removed` (same source date as assignedDate for sorting). */
  removedDate?: string;
  action: "assigned" | "removed";
}

export interface NewProjectRequest {
  clientName: string;
  code: string;
  department: Exclude<Department, "unassigned">;
  monthlyFee: number;
  startDate: string;
  endDate: string;
  assignedTeam: string[];
}
