export type BillingType = "harvest" | "flat-rate";

export interface FreelancerAssignment {
  id: string;
  projectCode: string;
  freelancerName: string;
  billingType: BillingType;
  /** For harvest: hourly bill rate */
  billRate?: number;
  /** For flat-rate: total flat amount */
  flatRateAmount?: number;
  /** For flat-rate with negotiated hours */
  negotiatedHours?: number;
  startDate: string;
  endDate: string;
  /** Optional per-month cost overrides (key = "YYYY-MM") */
  monthlyOverrides?: Record<string, number>;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface FreelancerMonthlyCost {
  month: string; // "YYYY-MM"
  cost: number;
  projectCode: string;
  freelancerName: string;
}

export interface NewFreelancerAssignmentRequest {
  projectCode: string;
  freelancerName: string;
  billingType: BillingType;
  billRate?: number;
  flatRateAmount?: number;
  negotiatedHours?: number;
  startDate: string;
  endDate: string;
  monthlyOverrides?: Record<string, number>;
  notes?: string;
}
