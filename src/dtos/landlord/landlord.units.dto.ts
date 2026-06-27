import { z } from "zod";

const UNIT_STATUSES = ["AVAILABLE", "OCCUPIED", "MAINTENANCE"] as const;

export const LandlordUnitsQuerySchema = z.object({
  propertyId: z.string().uuid("Invalid property ID").optional(),
  search: z.string().max(100).optional(),
  status: z.enum(UNIT_STATUSES).optional(),
  sortBy: z.enum(["name_asc", "name_desc", "status_asc", "status_desc"]).optional(),
});
export type LandlordUnitsQuery = z.infer<typeof LandlordUnitsQuerySchema>;

export interface LandlordUnit {
  id: string;
  propertyId: string;
  propertyName: string | null;
  unitName: string;
  status: string;
  baseRent: number | null;
  tenantId: string | null;
  tenantName: string | null;
  leaseStartDate: Date | null;
  leaseEndDate: Date | null;
  complaintsPercentage: number;
  leaseExpiryPercentage: number;
  members: number;
}

export interface LandlordUnitsByFloor {
  floor: string;
  units: LandlordUnit[];
}

export type LandlordUnitItem = LandlordUnitsByFloor[];
