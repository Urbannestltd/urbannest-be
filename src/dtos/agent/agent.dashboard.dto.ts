import { z } from "zod";

// ── Requests ──────────────────────────────────────────────────────────────────

export const AgentDashboardQuerySchema = z.object({
  period: z.enum(["MONTH", "QUARTER", "YEAR"]).default("YEAR"),
});
export type AgentDashboardQuery = z.infer<typeof AgentDashboardQuerySchema>;

// ── Responses ─────────────────────────────────────────────────────────────────

export interface AgentDashboardSummary {
  assignedPropertiesCount: number;
  activeLeadsCount: number;
  pendingFeesAmount: number;
  leadsConvertedCount: number;
}

export interface MonthlyLeadPoint {
  month: string; // "YYYY-MM"
  count: number;
}

export interface MonthlyConversionPoint {
  month: string; // "YYYY-MM"
  totalLeads: number;
  convertedLeads: number;
}

export interface UpcomingVisitItem {
  visitId: string;
  propertyName: string | null;
  visitDate: Date;
  status: string;
}
