import { PaymentStatus, PaymentType } from "@prisma/client";

export interface CombinedLedgerItemDto {
  recordType: "PAYMENT" | "EXPENSE";
  id: string;
  amount: number;
  date: Date;

  // Payment-only (null for expenses)
  reference: string | null;
  status: string | null;
  paymentType: string | null;
  dueDate: Date | null;
  paidDate: Date | null;
  tenant: { id: string; name: string; email: string } | null;
  unit: { id: string; name: string } | null;

  // Expense-only (null for payments)
  category: string | null;
  description: string | null;

  // Common
  property: { id: string; name: string | null } | null;
}

export interface AdminGetPaymentsQuery {
  propertyId?: string;
  tenantId?: string;
  status?: PaymentStatus;
  startDate?: string;
  endDate?: string;
  type?: PaymentType;
  /** Limit results to a single record type. Omit to return both. */
  source?: "PAYMENT" | "EXPENSE";
  /** Case-insensitive search across tenant name, reference, description, property */
  search?: string;
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
