import { z } from "zod";

// ── Requests ──────────────────────────────────────────────────────────────────

export const GetFeesQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "PAID"]).optional(),
  propertyId: z.string().uuid("Invalid property ID").optional(),
});
export type GetFeesQuery = z.infer<typeof GetFeesQuerySchema>;

// ── Responses ─────────────────────────────────────────────────────────────────

export interface AgentFeeSummary {
  totalPending: number;
  totalApproved: number;
  totalPaid: number;
}

export interface AgentFeeListItem {
  feeId: string;
  propertyName: string | null;
  unitNumber: string | null;
  tenantName: string;
  amount: number;
  status: string;
  generationDate: Date;
}

export interface AgentFeesListResponse {
  fees: AgentFeeListItem[];
  totalAmount: number;
}
