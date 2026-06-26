import { z } from "zod";

const LEASE_STATUSES = ["ACTIVE", "EXPIRED", "TERMINATED"] as const;

export const LandlordTenantsQuerySchema = z.object({
  propertyId: z.string().uuid("Invalid property ID").optional(),
  search: z.string().max(100).optional(),
  status: z.enum(LEASE_STATUSES).optional(),
  sortBy: z.enum(["name_asc", "name_desc", "status_asc", "status_desc", "startDate_asc", "startDate_desc"]).optional(),
});
export type LandlordTenantsQuery = z.infer<typeof LandlordTenantsQuerySchema>;

export interface LandlordTenantItem {
  leaseId: string;
  tenantId: string;
  tenantName: string | null;
  tenantEmail: string | null;
  tenantPhone: string | null;
  propertyId: string;
  propertyName: string | null;
  unitId: string;
  unitName: string;
  leaseStatus: string;
  rentAmount: number;
  leaseStartDate: Date;
  leaseEndDate: Date;
}

export interface LandlordTenantDetail {
  // Header
  id: string;
  fullName: string;
  profilePic: string | null;
  status: "Active Lease" | "No Active Lease";

  // General Information
  email: string;
  phone: string | null;
  emergencyContact: string | null;
  dateOfBirth: Date | null;
  occupation: string | null;
  employer: string | null;

  // Lease Information (Current)
  currentLease: {
    leaseId: string;
    propertyId: string;
    propertyName: string | null;
    unitId: string;
    unitName: string;
    rentAmount: number;
    serviceCharge: number;
    leaseExpiryPercentage: string;
    leaseLength: string;
    startDate: Date;
    endDate: Date;
    moveOutNotice: string | null;
    agreementUrl: string | null;
  } | null;

  // Histories & Lists
  leaseHistory: {
    leaseId: string;
    propertyName: string | null;
    unitName: string;
    startDate: Date;
    endDate: Date;
    agreementUrl: string | null;
  }[];
  paymentHistory: {
    type: string;
    amount: number;
    date: Date;
    status: string;
  }[];
}
