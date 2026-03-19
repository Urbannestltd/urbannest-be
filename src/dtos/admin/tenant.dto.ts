export interface TenantProfileResponseDto {
  // Header
  id: string;
  fullName: string;
  profilePic: string | null;
  status: "Active Lease" | "No Active Lease";

  // General Information
  email: string;
  phone: string | null;
  emergencyContact: string | null;
  dateOfBirth: Date | null;
  occupation: string | null;
  employer: string | null;

  // Lease Information (Current)
  currentLease: {
    rentAmount: number;
    serviceCharge: number;
    leaseExpiryPercentage: string; // e.g., "80%"
    leaseLength: string; // e.g., "4 years"
    startDate: Date;
    endDate: Date;
    moveOutNotice: string | null;
    agreementUrl: string | null;
  } | null;

  // Histories & Lists
  leaseHistory: {
    reference: string;
    startDate: Date;
    endDate: Date;
    agreementUrl: string | null;
  }[];
  visitorHistory: {
    name: string;
    phone: string | null;
    status: string;
    frequency: string;
  }[];
  paymentHistory: {
    type: string;
    amount: number;
    date: Date;
    status: string;
  }[];

  // Cohabitants (Mocked for now as schema supports 1 tenant/lease, but structured for the UI)
  cohabitants: { name: string; email: string; photoUrl: string | null }[];
}
