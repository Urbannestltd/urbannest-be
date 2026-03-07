import { PropertyType } from "@prisma/client";

export interface CreatePropertyAdminDto {
  name?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  type: PropertyType;
  landlordId: string; // Admin assigns a landlord during creation
}

// Optional: If you want to create units at the exact same time as the property
export interface CreateUnitAdminDto {
  name: string;
  floor?: string;
  baseRent?: number;
  bedrooms?: number;
  bathrooms?: number;
  status?: "AVAILABLE" | "OCCUPIED" | "MAINTENANCE";
}
