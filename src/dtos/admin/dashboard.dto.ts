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
