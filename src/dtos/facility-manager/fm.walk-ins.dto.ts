import { z } from "zod";

const VISITOR_TYPES = ["GUEST", "DELIVERY", "SERVICE_PROVIDER"] as const;
const FALLBACK_RULES = ["SEND_UP", "REFUSE_ENTRY"] as const;
const WALK_IN_STATUSES = ["PENDING", "CHECKED_IN", "CHECKED_OUT", "REJECTED"] as const;

// ── Requests ──────────────────────────────────────────────────────────────────

export const RegisterWalkInSchema = z.object({
  unitId: z.string().uuid("Invalid unit ID"),
  visitorName: z.string().min(2, "Visitor name is required").max(100),
  visitorPhone: z.string().max(20).optional(),
  visitorEmail: z.string().email("Invalid email").optional(),
  visitorType: z.enum(VISITOR_TYPES).default("GUEST"),
  fallbackRule: z.enum(FALLBACK_RULES).optional(),
});
export type RegisterWalkInRequest = z.infer<typeof RegisterWalkInSchema>;


export const WalkInListQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(WALK_IN_STATUSES).optional(),
  unitId: z.string().uuid().optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
});
export type WalkInListQuery = z.infer<typeof WalkInListQuerySchema>;

// ── Responses ─────────────────────────────────────────────────────────────────

export interface WalkInListItem {
  id: string;
  visitorName: string;
  visitorPhone: string | null;
  visitorType: string;
  frequency: string;
  status: string;
  unitId: string;
  unitName: string;
  propertyId: string;
  propertyName: string | null;
  tenantName: string | null;
  fallbackRule: string | null;
  approvalExpiresAt: Date | null;
  secondsUntilExpiry: number | null;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  createdAt: Date;
}

export interface WalkInStatus {
  id: string;
  status: string;
  approvalExpiresAt: Date | null;
  secondsUntilExpiry: number | null;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
}

export interface RepeatVisitorProfile {
  visitorName: string;
  visitorPhone: string | null;
  visitorType: string;
  lastVisitDate: Date;
  lastUnitId: string;
  lastUnitName: string;
  lastPropertyId: string;
  lastPropertyName: string | null;
  totalVisits: number;
}
