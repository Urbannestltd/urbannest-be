import { z } from "zod";

const PROPERTY_TYPES = ["MULTI_UNIT", "SINGLE_FAMILY", "COMMERCIAL", "RESIDENTIAL"] as const;
const SORT_OPTIONS = [
  "name_asc",
  "name_desc",
  "occupancy_asc",
  "occupancy_desc",
  "units_asc",
  "units_desc",
] as const;

export const LandlordPropertiesQuerySchema = z.object({
  search: z.string().max(100).optional(),
  type: z.enum(PROPERTY_TYPES).optional(),
  minUnits: z.coerce.number().int().min(0).optional(),
  maxUnits: z.coerce.number().int().min(0).optional(),
  minOccupancy: z.coerce.number().int().min(0).max(100).optional(),
  maxOccupancy: z.coerce.number().int().min(0).max(100).optional(),
  sortBy: z.enum(SORT_OPTIONS).optional(),
});
export type LandlordPropertiesQuery = z.infer<typeof LandlordPropertiesQuerySchema>;

export interface LandlordPropertyItem {
  id: string;
  name: string | null;
  type: string;
  address: string;
  city: string | null;
  state: string;
  totalUnits: number;
  occupancyRate: number;
}
