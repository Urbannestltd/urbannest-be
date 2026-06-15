import { z } from "zod";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const NORMALIZED_VISIT_STATUSES = [
  "PENDING_APPROVAL",
  "UPCOMING",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
  "RESCHEDULED",
] as const;

export const UNIFIED_VISIT_TYPES = ["TENANT", "AGENT"] as const;

export type NormalizedVisitStatus = (typeof NORMALIZED_VISIT_STATUSES)[number];
export type UnifiedVisitType = (typeof UNIFIED_VISIT_TYPES)[number];

// ── Request ───────────────────────────────────────────────────────────────────

export const GetFmVisitsQuerySchema = z.object({
  propertyId: z.string().uuid("Invalid property ID").optional(),
  visitType: z.enum(UNIFIED_VISIT_TYPES).optional(),
  status: z.enum(NORMALIZED_VISIT_STATUSES).optional(),
  dateFrom: z
    .string()
    .datetime({ offset: true, message: "dateFrom must be ISO 8601" })
    .optional(),
  dateTo: z
    .string()
    .datetime({ offset: true, message: "dateTo must be ISO 8601" })
    .optional(),
  search: z.string().max(100).optional(),
});
export type GetFmVisitsQuery = z.infer<typeof GetFmVisitsQuerySchema>;

// ── Stats response ────────────────────────────────────────────────────────────

export interface FmVisitorStatsPeriod {
  total: number;
  scheduled: number;
  walkIns: number;
  noShows: number; // EXPIRED_NO_SHOW for scheduled visitors only
}

export interface FmVisitorStats {
  today: FmVisitorStatsPeriod;
  last15Days: FmVisitorStatsPeriod;
  last30Days: FmVisitorStatsPeriod;
}

// ── Response ──────────────────────────────────────────────────────────────────

export interface FmUnifiedVisit {
  id: string;
  visitType: UnifiedVisitType;

  // Normalized status for display; raw status carries the underlying value
  normalizedStatus: NormalizedVisitStatus;
  rawStatus: string;

  // The visiting person
  visitorName: string;
  visitorPhone: string | null;

  // Location
  propertyId: string;
  propertyName: string | null;
  propertyAddress: string;
  unitId: string | null;
  unitName: string | null;

  // Timing — validFrom for tenant invites, visitDate for agent visits
  visitDate: Date;

  // Agent visit extras (null for tenant visits)
  agentId: string | null;
  agentName: string | null;
  purpose: string | null;
  proposedDate: Date | null;
  rejectionReason: string | null;

  // Tenant visit extras (null for agent visits)
  tenantId: string | null;
  tenantName: string | null;
  frequency: string | null;

  // FM action flags — true only when visitType=AGENT and status=PENDING_APPROVAL
  canApprove: boolean;
  canReject: boolean;
  canReschedule: boolean;

  // Check-in/out timestamps (populated for tenant visits, null for agent visits)
  checkedInAt: Date | null;
  checkedOutAt: Date | null;

  createdAt: Date;
}
