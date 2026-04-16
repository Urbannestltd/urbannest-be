import { PaymentType } from "@prisma/client";

export interface AdminPaymentListItemDto {
  id: string;
  reference: string;
  amount: number;
  status: string;
  type: string;
  dueDate: Date | null;
  paidDate: Date | null;
  createdAt: Date;
  tenant: {
    id: string;
    name: string;
    email: string;
  } | null;
  property: {
    id: string;
    name: string | null;
  } | null;
  unit: {
    id: string;
    name: string;
  } | null;
}

export interface AdminGetPaymentsQuery {
  propertyId?: string;
  tenantId?: string;
  startDate?: string;
  endDate?: string;
  type?: PaymentType;
}

export interface FinancialMetricsDto {
  totalExpectedRevenue: number;  // sum of rentAmount on all ACTIVE leases
  totalCollected: number;        // sum of PAID rent payments only
  outstandingAmount: number;     // sum of all OVERDUE payment amounts
  defaultingTenants: number;     // distinct tenants with >= 1 OVERDUE payment
  collectedBreakdown: {
    rent: number;
    serviceCharge: number;
    utilityBills: number;
  };
}
