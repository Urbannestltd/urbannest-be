import { z } from "zod";

// ── Requests ──────────────────────────────────────────────────────────────────

export const GetFeesQuerySchema = z.object({
  status: z.enum(["PENDING", "PAID"]).optional(),
  propertyId: z.string().uuid("Invalid property ID").optional(),
});
export type GetFeesQuery = z.infer<typeof GetFeesQuerySchema>;

// ── Responses ─────────────────────────────────────────────────────────────────

// A fee is PENDING from landlord approval until the admin marks it PAID once
// the commission is actually sent — there is no agent-visible "Approved" state.
export interface AgentFeeSummary {
  totalPending: number;
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
