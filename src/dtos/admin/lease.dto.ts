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
