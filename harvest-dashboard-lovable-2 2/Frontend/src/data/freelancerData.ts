import { FreelancerAssignment, FreelancerMonthlyCost } from "@/types/freelancer";

/**
 * Calculate monthly costs for a freelancer assignment.
 * For harvest billing: billRate * 160 (standard monthly hours) unless overridden.
 * For flat-rate: flatRateAmount per month unless overridden.
 */
export function getAssignmentMonthlyCosts(assignment: FreelancerAssignment): FreelancerMonthlyCost[] {
  const costs: FreelancerMonthlyCost[] = [];
  const start = new Date(assignment.startDate);
  const end = new Date(assignment.endDate);

  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (current <= endMonth) {
    const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;

    let cost: number;
    if (assignment.monthlyOverrides?.[monthKey] !== undefined) {
      cost = assignment.monthlyOverrides[monthKey];
    } else if (assignment.billingType === "harvest") {
      cost = (assignment.billRate || 0) * 160;
    } else {
      cost = assignment.flatRateAmount || 0;
    }

    costs.push({
      month: monthKey,
      cost,
      projectCode: assignment.projectCode,
      freelancerName: assignment.freelancerName,
    });

    current.setMonth(current.getMonth() + 1);
  }

  return costs;
}
