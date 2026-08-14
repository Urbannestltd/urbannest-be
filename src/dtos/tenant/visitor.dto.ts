import { z } from "zod";

// Base Schema for a single visitor info
const VisitorInfoSchema = z.object({
  name: z.string().min(2, "Name required"),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional(),
});

// 1. SINGLE INVITE REQUEST
//
// Time window requirements depend on frequency:
//  - ONE_OFF: startDate AND endDate required (a specific visit window).
//  - WHOLE_DAY: startDate required (the day); endDate is ignored — the
//    backend expands it to 00:00–23:59 of that day.
//  - RECURRING: startDate required (when access starts); endDate is ignored —
//    the pass is open-ended until the tenant revokes it.
export const CreateInviteSchema = z
  .object({
    visitor: VisitorInfoSchema,
    type: z.enum(["GUEST", "DELIVERY", "SERVICE_PROVIDER"]),
    frequency: z.enum(["ONE_OFF", "WHOLE_DAY", "RECURRING"]).default("ONE_OFF"),

    // Time Window — accepts a full ISO datetime or a plain date (YYYY-MM-DD)
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1).optional(),
  })
  .refine(
    (d) => !isNaN(new Date(d.startDate).getTime()),
    { message: "Invalid start date", path: ["startDate"] },
  )
  .refine(
    (d) => d.frequency !== "ONE_OFF" || (!!d.endDate && !isNaN(new Date(d.endDate).getTime())),
    { message: "End date is required for one-off invites", path: ["endDate"] },
  );

export const VerifyCodeSchema = z.object({
  accessCode: z.string().length(6, "Code must be 6 digits"),
});

export interface VerifyCodeRequest {
  accessCode: string;
}

// 2. BULK INVITE REQUEST (Commercial Use Case)
export const CreateBulkInviteSchema = z.object({
  visitors: z.array(VisitorInfoSchema).min(1, "At least one visitor required"),
  type: z.enum(["GUEST", "DELIVERY", "SERVICE_PROVIDER"]),

  // One time window for the whole group (e.g. "Meeting from 2pm-4pm")
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

export interface CreateInviteRequest {
  visitor: { name: string; phone?: string; email?: string };
  type: "GUEST" | "DELIVERY" | "SERVICE_PROVIDER";
  frequency: "ONE_OFF" | "WHOLE_DAY" | "RECURRING";
  /** For WHOLE_DAY/RECURRING, this is just "the day" — a plain date is fine. */
  startDate: string;
  /** Required for ONE_OFF only. Ignored for WHOLE_DAY/RECURRING. */
  endDate?: string;
}

export interface CreateBulkInviteRequest {
  visitors: Array<{ name: string; phone?: string }>;
  type: "GUEST" | "DELIVERY" | "SERVICE_PROVIDER";
  unitId: string;
  groupName: string;
  startDate: string;
  endDate: string;
}

export type { DateRangePreset as VisitorPeriodFilter } from "../../utils/dateRangePreset";

export interface VisitorStatsResponse {
  totalVisitors: number;
  totalScheduled: number;
  totalWalkIns: number;
}
