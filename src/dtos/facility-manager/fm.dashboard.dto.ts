import { z } from "zod";

// ── Shared enums ──────────────────────────────────────────────────────────────

const MaintenancePriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "EMERGENCY"]);
const InviteFrequencyEnum = z.enum(["ONE_OFF", "ONE_OFF_AGENT", "WHOLE_DAY", "RECURRING"]);

// ── Requests (query params) ───────────────────────────────────────────────────

export const GetDashboardTicketsQuerySchema = z.object({
  priority: z
    .string()
    .optional()
    .transform((val) => val?.split(",").map((p) => p.trim().toUpperCase()))
    .pipe(z.array(MaintenancePriorityEnum).optional()),
});
export type GetDashboardTicketsQuery = z.infer<typeof GetDashboardTicketsQuerySchema>;

export const GetDashboardVisitorsQuerySchema = z.object({
  frequency: z
    .string()
    .optional()
    .transform((val) => val?.split(",").map((f) => f.trim().toUpperCase()))
    .pipe(z.array(InviteFrequencyEnum).optional()),
});
export type GetDashboardVisitorsQuery = z.infer<typeof GetDashboardVisitorsQuerySchema>;

// ── Responses ─────────────────────────────────────────────────────────────────

export interface FmDashboardSummaryResponse {
  propertiesManaged: number;
  openTickets: number;
  pendingBudgetApprovals: number;
  todayVisitorCount: number;
}

export interface FmDashboardTicketItem {
  id: string;
  subject: string;
  propertyId: string;
  propertyName: string;
  unitName: string;
  tenantName: string;
  category: string;
  priority: string;
  status: string;
  createdAt: Date;
}

export interface FmDashboardVisitorItem {
  id: string;
  visitorName: string;
  propertyId: string;
  propertyName: string;
  unitName: string;
  tenantName: string;
  validFrom: Date;
  validUntil: Date;
  accessType: string;
  isWalkIn: boolean;
  status: string;
  checkedInAt: Date | null;
}
