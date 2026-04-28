export interface DashboardMetricsDto {
  totalProperties: number;
  totalTenants: number;
  defaultingTenants: number;
  revenue: {
    expectedIncome: number;
    amountCollected: number;
    collectedPercent: number;
  };
  maintenanceChart: { property: string; count: number }[];
}

export interface TenantStatusDto {
  id: string;
  name: string;
  photoUrl: string | null;
  phone: string | null;
  propertyName: string;
  unitName: string;
  propertyImages?: string[];
  unitId?: string;
  propertyId?: string;
  address: string;
  leaseDuration: string;
  status: "ACTIVE" | "EXPIRED";
}

export interface TenantStatusesResponseDto {
  expired: TenantStatusDto[];
  latest: TenantStatusDto[];
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
    expired: number;
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
