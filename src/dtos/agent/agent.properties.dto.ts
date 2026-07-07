import { z } from "zod";

// ── Requests ──────────────────────────────────────────────────────────────────

export const AgentPropertiesQuerySchema = z.object({
  search: z.string().max(100).optional(),
  availability: z.enum(["ALL", "AVAILABLE", "FULLY_OCCUPIED"]).default("ALL"),
});
export type AgentPropertiesQuery = z.infer<typeof AgentPropertiesQuerySchema>;

// ── Responses ─────────────────────────────────────────────────────────────────

export interface AgentPropertyListItem {
  propertyId: string;
  propertyName: string | null;
  propertyType: string;
  address: string;
  dateAssigned: Date;
  availabilityStatus: "AVAILABLE" | "FULLY_OCCUPIED";
  totalUnitCount: number;
  availableUnitCount: number;
}
