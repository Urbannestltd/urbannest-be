import { PropertyType, UnitStatus, UnitType } from "@prisma/client";

export type ActivePropertyType = Extract<PropertyType, "COMMERCIAL" | "RESIDENTIAL">;

export interface CreatePropertyAdminDto {
  name?: string;
  type: ActivePropertyType;
  price?: number;
  address: string;
  state: string;

  // Optional
  city?: string;
  zip?: string;

  // Arrays
  amenities?: string[];
  images?: string[];

  // Used for auto-generating units (optional — RESIDENTIAL may have just 1 unit)
  noOfFloors?: number;
  noOfUnitsPerFloor?: number;
}

export type PropertyRole = "LANDLORD" | "FACILITY_MANAGER" | "TENANT";

export interface CreateUnitAdminDto {
  name: string; // e.g., "Unit 1"
  floor?: string; // e.g., "First Floor"
  baseRent?: number; // e.g., 2000000
  bedrooms?: number;
  bathrooms?: number;
  type?: UnitType;
  status?: UnitStatus;
}

// 2. The DTO used by your Controller
export interface ManageMemberDto {
  userId: string;
  role: PropertyRole;

  // Required ONLY if role === "TENANT"
  unitId?: string;

  // Optional Lease Details
  rentAmount?: number;
  leaseMonths?: number;
}

export interface UpdatePropertyAdminDto {
  name?: string;
  price?: number;
  address?: string;
  state?: string;
  city?: string;
  zip?: string;

  // Arrays
  amenities?: string[];
  images?: string[];
}

export interface PropertyDetailsResponseDto {
  id: string;
  name: string | null;
  address: string;
  lastUpdated: Date;

  // Property Details Card
  rentalPrice: number;
  noOfFloors: number;
  noOfUnits: number;
  listedOn: Date;
  occupancyRate: string; // e.g., "90%"
  complaintsPercentage: string; // e.g., "78%"

  // Media & Features
  images: string[];
  amenities: string[];

  // People Cards
  facilityManager: {
    name: string;
    email: string;
    photoUrl: string | null;
  } | null;
  landlord: { name: string; email: string; photoUrl: string | null } | null;
  agent: { name: string; email: string; photoUrl: string | null } | null;

  // Revenue Chart
  rentalRevenue: { month: string; revenue: number }[];
}
