export interface DashboardMetricsDto {
  totalProperties: number;
  totalTenants: number;
  defaultingTenants: number;
  revenue: {
    expectedIncome: number;
    amountCollected: number;
  };
  maintenanceChart: { month: string; count: number }[];
}

export interface TenantStatusDto {
  id: string;
  name: string;
  photoUrl: string | null;
  phone: string | null;
  address: string;
  leaseDuration: string;
  status: "ACTIVE" | "DEFAULTING";
}

export interface PersonSummaryDto {
  id: string;
  name: string;
  photoUrl: string | null;
}

export interface PropertyOverviewItemDto {
  propertyId: string;
  propertyName: string;
  occupancyPercent: number;
  tenantSummary: {
    active: number;
    defaulting: number;
  };
  arrears: number;
  openMaintenance: number;
  openMaintenancePercent: number;
  facilityManager: PersonSummaryDto | null;
  landlord: PersonSummaryDto | null;
  alerts: string[];
}

export interface PropertyOverviewResponseDto {
  properties: PropertyOverviewItemDto[];
  totalProperties: number;
}
