import { z } from "zod";

const MAINTENANCE_CATEGORIES = [
  "PLUMBING",
  "ELECTRICAL",
  "HVAC",
  "APPLIANCE",
  "STRUCTURAL",
  "PEST_CONTROL",
  "CLEANING",
  "SAFETY_SECURITY",
  "OTHER",
] as const;

export const LandlordMaintenanceQuerySchema = z.object({
  category: z.enum(MAINTENANCE_CATEGORIES).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});
export type LandlordMaintenanceQuery = z.infer<typeof LandlordMaintenanceQuerySchema>;

export interface MaintenancePropertyChartItem {
  propertyId: string;
  propertyName: string | null;
  ticketCount: number;
  totalCost: number;
}

export interface LandlordMaintenanceSummary {
  openTickets: number;
  totalExpenses: number;
  avgResolutionDays: number;
  chart: MaintenancePropertyChartItem[];
}
