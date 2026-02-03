import { z } from "zod";

// Base Schema for a single visitor info
const VisitorInfoSchema = z.object({
  name: z.string().min(2, "Name required"),
  phone: z.string().optional(),
});

// 1. SINGLE INVITE REQUEST
export const CreateInviteSchema = z.object({
  visitor: VisitorInfoSchema,
  type: z.enum(["GUEST", "DELIVERY", "SERVICE_PROVIDER"]),
  frequency: z.enum(["ONE_OFF", "WHOLE_DAY", "RECURRING"]).default("ONE_OFF"),

  // Time Window
  startDate: z.string().datetime(), // ISO String
  endDate: z.string().datetime(), // ISO String
});

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
  visitor: { name: string; phone?: string };
  type: "GUEST" | "DELIVERY" | "SERVICE_PROVIDER";
  frequency: "ONE_OFF" | "WHOLE_DAY" | "RECURRING";
  startDate: string;
  endDate: string;
}

export interface CreateBulkInviteRequest {
  visitors: Array<{ name: string; phone?: string }>;
  type: "GUEST" | "DELIVERY" | "SERVICE_PROVIDER";
  unitId: string;
  groupName: string;
  startDate: string;
  endDate: string;
}
