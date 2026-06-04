import { z } from "zod";

// ── Requests (query params) ───────────────────────────────────────────────────

const OCCUPANCY_RANGES = ["0-20", "21-40", "41-60", "61-80", "81-100"] as const;
const VISITOR_PERIODS = ["today", "last_week", "last_month"] as const;

export const GetPropertiesQuerySchema = z.object({
  search: z.string().optional(),
  type: z.enum(["RESIDENTIAL", "COMMERCIAL"]).optional(),
  occupancy: z.enum(OCCUPANCY_RANGES).optional(),
  unitRange: z
    .string()
    .regex(/^\d+-\d+$/, "unitRange must be in format '1-10'")
    .optional(),
});
export type GetPropertiesQuery = z.infer<typeof GetPropertiesQuerySchema>;

export const GetTenantProfileQuerySchema = z.object({
  visitorPeriod: z.enum(VISITOR_PERIODS).optional(),
});
export type GetTenantProfileQuery = z.infer<typeof GetTenantProfileQuerySchema>;

// ── Responses ─────────────────────────────────────────────────────────────────

export interface FmPropertyListItem {
  id: string;
  name: string;
  address: string;
  state: string;
  city: string | null;
  type: string;
  images: string[];
  unitCount: number;
  occupancyRate: number;
  complaints: number;
  createdAt: Date;
}

export interface FmUnitListItem {
  id: string;
  name: string;
  floor: string;
  status: string;
  rentAmount: number;
  leaseId: string | null;
  tenantId: string | null;
  tenantName: string | null;
  tenantProfilePic: string | null;
  moveInDate: Date | null;
  leaseExpiry: string | null;
  members: number;
  complaints: {
    total: number;
    openCount: number;
    openPercent: number;
  };
}

export interface FmUnitsByPropertyResponse {
  totalUnits: number;
  grouped: {
    floor: string;
    units: FmUnitListItem[];
  }[];
}

export interface FmTenantProfileResponse {
  id: string;
  fullName: string;
  profilePic: string | null;
  status: string;
  email: string;
  phone: string | null;
  emergencyContact: string | null;
  dateOfBirth: Date | null;
  occupation: string | null;
  employer: string | null;
  currentLease: {
    leaseId: string;
    rentAmount: number;
    serviceCharge: number;
    leaseExpiryPercentage: string;
    leaseLength: string;
    startDate: Date;
    endDate: Date;
    moveOutNotice: string | null;
    agreementUrl: string | null;
  } | null;
  leaseHistory: {
    leaseId: string;
    reference: string;
    startDate: Date;
    endDate: Date;
    agreementUrl: string | null;
  }[];
  visitorHistory: {
    name: string;
    phone: string | null;
    status: string;
    frequency: string;
  }[];
  paymentHistory: {
    type: string;
    amount: number;
    date: Date;
    status: string;
  }[];
  cohabitants: unknown[];
}
