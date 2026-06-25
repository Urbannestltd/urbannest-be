import { z } from "zod";

// ── Requests ──────────────────────────────────────────────────────────────────

export const LandlordDashboardQuerySchema = z.object({
  propertyId: z.string().uuid("Invalid property ID").optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});
export type LandlordDashboardQuery = z.infer<typeof LandlordDashboardQuerySchema>;

export const PendingApprovalsQuerySchema = z.object({
  propertyId: z.string().uuid("Invalid property ID").optional(),
});
export type PendingApprovalsQuery = z.infer<typeof PendingApprovalsQuerySchema>;

export const RejectLeadBodySchema = z.object({
  reason: z.string().max(500).optional(),
});
export type RejectLeadBody = z.infer<typeof RejectLeadBodySchema>;

// ── Responses ─────────────────────────────────────────────────────────────────

export interface LandlordDashboardSummary {
  totalProperties: number;
  occupancyRate: number;
  revenueCollected: number;
  pendingApprovalsCount: number;
}

export interface LandlordRevenueByProperty {
  propertyId: string;
  propertyName: string | null;
  expectedRevenue: number;
  collectedRevenue: number;
  collectionRate: number;
}

export interface LandlordRevenueByUnit {
  unitId: string;
  unitName: string;
  expectedRent: number;
  collectedRent: number;
  collectionRate: number;
}

export interface LandlordPendingApprovalItem {
  leadId: string;
  applicantName: string;
  propertyId: string;
  propertyName: string | null;
  unitId: string | null;
  unitName: string | null;
  annualRent: number | null;
  agentId: string;
  agentName: string | null;
  createdAt: Date;
}
