import { z } from "zod";

const AGENT_VISIT_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "RESCHEDULED_PENDING_AGENT",
  "CANCELLED",
] as const;

// ── Requests ──────────────────────────────────────────────────────────────────

export const GetAgentVisitsQuerySchema = z.object({
  status: z.enum(AGENT_VISIT_STATUSES).optional(),
  propertyId: z.string().uuid("Invalid property ID").optional(),
  dateFrom: z.string().datetime({ offset: true, message: "dateFrom must be ISO 8601" }).optional(),
  dateTo: z.string().datetime({ offset: true, message: "dateTo must be ISO 8601" }).optional(),
});
export type GetAgentVisitsQuery = z.infer<typeof GetAgentVisitsQuerySchema>;

export const RejectVisitSchema = z.object({
  reason: z.string().min(1, "Reason is required").max(500, "Reason too long").optional(),
});
export type RejectVisitRequest = z.infer<typeof RejectVisitSchema>;

export const RescheduleVisitSchema = z.object({
  proposedDate: z
    .string()
    .datetime({ offset: true, message: "proposedDate must be ISO 8601" }),
});
export type RescheduleVisitRequest = z.infer<typeof RescheduleVisitSchema>;

// ── Responses ─────────────────────────────────────────────────────────────────

export interface FmAgentVisitListItem {
  id: string;
  agentId: string;
  agentName: string | null;
  agentPhone: string | null;
  propertyId: string;
  propertyName: string | null;
  propertyAddress: string;
  unitId: string | null;
  unitName: string | null;
  visitDate: Date;
  purpose: string | null;
  status: string;
  proposedDate: Date | null;
  createdAt: Date;
}

export interface FmAgentVisitDetail extends FmAgentVisitListItem {
  notes: string | null;
  rejectionReason: string | null;
}
