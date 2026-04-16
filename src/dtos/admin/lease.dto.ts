export interface CreateLeaseDto {
  tenantId: string; // ID of the user being assigned
  unitId: string; // ID of the unit they are renting

  rentAmount: number;
  serviceCharge?: number; // Optional based on the modal

  startDate: string | Date;
  endDate: string | Date;

  moveOutNotice?: string; // e.g., "1 Month", "2 Weeks"
  documentUrl?: string; // The URL from the dragged & dropped file
}

// All fields optional — only provided fields are updated
export interface UpdateLeaseDto {
  rentAmount?: number;
  serviceCharge?: number;
  startDate?: string | Date;
  endDate?: string | Date;
  moveOutNotice?: string;
  documentUrl?: string;
}

// Renewing an expired/terminated lease creates a new active lease for the same tenant + unit
export interface RenewLeaseDto {
  startDate: string | Date;
  endDate: string | Date;
  rentAmount?: number;     // defaults to the previous lease's rentAmount
  serviceCharge?: number;  // defaults to the previous lease's serviceCharge
  moveOutNotice?: string;
  documentUrl?: string;
}
