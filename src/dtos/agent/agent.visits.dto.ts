import { z } from "zod";

// ── Requests ──────────────────────────────────────────────────────────────────

export const ScheduleVisitSchema = z.object({
  propertyId: z.string().uuid("Invalid property ID"),
  unitId: z.string().uuid("Invalid unit ID").optional(),
  visitDate: z.string().datetime({ offset: true, message: "visitDate must be ISO 8601" }),
  purpose: z.string().max(300, "Purpose too long").optional(),
  notes: z.string().max(1000, "Notes too long").optional(),
});
export type ScheduleVisitRequest = z.infer<typeof ScheduleVisitSchema>;

export const GetVisitsQuerySchema = z.object({
  status: z
    .enum(["PENDING", "APPROVED", "REJECTED", "RESCHEDULED_PENDING_AGENT", "CANCELLED"])
    .optional(),
});
export type GetVisitsQuery = z.infer<typeof GetVisitsQuerySchema>;

// ── Responses ─────────────────────────────────────────────────────────────────

export interface AgentVisitListItem {
  id: string;
  propertyId: string;
  propertyName: string | null;
  propertyAddress: string;
  unitId: string | null;
  unitName: string | null;
  visitDate: Date;
  purpose: string | null;
  status: string;
  proposedDate: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
}

export interface AgentVisitDetail extends AgentVisitListItem {
  notes: string | null;
}
