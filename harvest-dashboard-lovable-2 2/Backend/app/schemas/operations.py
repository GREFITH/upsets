from datetime import datetime

from pydantic import BaseModel, Field


class ProjectCostsOut(BaseModel):
    freelancers: float = 0
    commissions: float = 0
    other: float = 0


class ProjectOut(BaseModel):
    id: int
    code: str
    name: str
    clientName: str
    departmentId: str
    departmentName: str
    status: str
    deadline: str | None = None
    startsOn: str | None = None
    originalEndDate: str | None = None
    daysLate: int | None = None
    monthlyFee: float = 0
    totalRevenue: float = 0
    costs: ProjectCostsOut = Field(default_factory=ProjectCostsOut)
    netRevenue: float = 0
    profitMargin: float = 0
    loadedInternalCost: float = 0
    loadedNet: float = 0
    loadedMargin: float = 0
    assignedTeam: list[str] = Field(default_factory=list)
    hoursTracked: float = 0
    hoursBudgeted: float = 0
    utilization: float = 0


class TeamMemberOut(BaseModel):
    id: int
    name: str
    role: str
    department: str
    projects: list[int]
    utilization: float
    hoursWorked: float
    targetHours: float
    costRate: float | None = None


class DepartmentMetricOut(BaseModel):
    departmentId: str
    utilization: float
    activeProjects: int
    teamSize: int
    monthlyBurn: float
    totalRevenue: float = 0
    netRevenue: float = 0
    profitMargin: float = 0
    loadedCosts: float = 0
    loadedNetRevenue: float = 0
    loadedMargin: float = 0


class TeamHistoryItemOut(BaseModel):
    date: str
    action: str
    memberId: str
    memberName: str
    projectName: str
    reason: str | None = None


class OverviewResponse(BaseModel):
    projects: list[ProjectOut]
    teamMembers: list[TeamMemberOut]
    departmentMetrics: list[DepartmentMetricOut]
    teamHistory: dict[str, list[TeamHistoryItemOut]]


class SyncPhase(BaseModel):
    status: str  # "pending" | "syncing" | "completed" | "error"
    count: int | None = None
    started_at: str | None = None
    completed_at: str | None = None


class HarvestSettingsResponse(BaseModel):
    projectMappings: list[dict]
    financialOverrides: list[dict]
    lastSuccessAt: datetime | None = None
    lastError: str | None = None
    syncStartedAt: str | None = None
    currentPhase: str | None = None
    syncPhases: dict[str, SyncPhase] = Field(default_factory=dict)


class CostRateUpdate(BaseModel):
    id: int
    costRate: float


class CostRateUpdateRequest(BaseModel):
    entries: list[CostRateUpdate]


class ProjectMappingUpdateRequest(BaseModel):
    entries: list[dict]


class FinancialOverrideUpdateRequest(BaseModel):
    entries: list[dict]
