// src/dtos/lease.dto.ts

export interface LeaseResponse {
  id: string;
  status: "ACTIVE" | "EXPIRED" | "TERMINATED";

  // 1. The Asset (Building & Flat)
  property: {
    name: string | null; // "Sunset Heights"
    unit: string; // "Apt 4B"
    address: string; // "123 Main St"
    fullAddress: string; // "123 Main St, Apt 4B, Lagos"
  };

  // 2. The Contract (Time & Money)
  contract: {
    startDate: Date;
    endDate: Date;
    daysRemaining: number;
    rentAmount: number;
    currency: string;
  };

  // 3. The File
  document: {
    url: string | null;
    canDownload: boolean;
  };
}
