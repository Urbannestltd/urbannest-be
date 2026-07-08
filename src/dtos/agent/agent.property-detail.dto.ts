import { z } from "zod";

// ── Requests ──────────────────────────────────────────────────────────────────

export const MediaDownloadQuerySchema = z.object({
  url: z.string().url("Invalid media URL"),
});
export type MediaDownloadQuery = z.infer<typeof MediaDownloadQuerySchema>;

// ── Responses ─────────────────────────────────────────────────────────────────

export interface PropertyMediaItem {
  url: string;
  fileName: string;
}

export interface AgentPropertyDetail {
  propertyId: string;
  propertyName: string | null;
  propertyType: string;
  address: string;
  rent: number | null;
  noOfUnits: number;
  noOfFloors: number;
  lastUpdated: Date;
  media: PropertyMediaItem[];
  amenities: string[];
}

export interface MediaDownloadResponse {
  url: string;
}

export interface VacantUnitItem {
  unitId: string;
  unitName: string;
}
