import { z } from "zod";

// ── Requests ──────────────────────────────────────────────────────────────────

export const FinancialsSummaryQuerySchema = z.object({
  propertyId: z.string().uuid("Invalid property ID").optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});
export type FinancialsSummaryQuery = z.infer<typeof FinancialsSummaryQuerySchema>;

export const FinancialsTransactionsQuerySchema = z.object({
  propertyId: z.string().uuid("Invalid property ID").optional(),
  startDate: z.string().date("Invalid start date (YYYY-MM-DD)").optional(),
  endDate: z.string().date("Invalid end date (YYYY-MM-DD)").optional(),
});
export type FinancialsTransactionsQuery = z.infer<typeof FinancialsTransactionsQuerySchema>;

export const FinancialsExportQuerySchema = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  propertyId: z.string().uuid("Invalid property ID").optional(),
  startDate: z.string().date("Invalid start date (YYYY-MM-DD)").optional(),
  endDate: z.string().date("Invalid end date (YYYY-MM-DD)").optional(),
});
export type FinancialsExportQuery = z.infer<typeof FinancialsExportQuerySchema>;

// ── Responses ─────────────────────────────────────────────────────────────────

export interface FinancialsSummary {
  totalRevenueCollected: number;
  totalOutstandingRent: number;
  totalExpenses: number;
  activeLeasesCount: number;
  totalUnitsCount: number;
}

export interface FinancialRevenueByProperty {
  propertyId: string;
  propertyName: string | null;
  expectedRevenue: number;
  collectedRevenue: number;
}

export interface FinancialRevenueByUnit {
  unitId: string;
  unitName: string;
  expectedRent: number;
  collectedRent: number;
}

export interface FinancialRevenueShare {
  propertyId: string;
  propertyName: string | null;
  revenueAmount: number;
  revenuePercentage: number;
}

export interface FinancialArrearItem {
  leaseId: string;
  tenantName: string | null;
  propertyName: string | null;
  unitName: string;
  balanceDue: number;
  daysOverdue: number;
}

export interface FinancialTransactionItem {
  recordType: "PAYMENT" | "EXPENSE";
  transactionId: string;
  transactionDate: Date;
  tenantName: string | null;
  propertyName: string | null;
  unitName: string | null;
  amount: number;
  paymentType?: string;
  paymentStatus?: string;
  reference?: string;
  expenseCategory?: string;
  expenseDescription?: string;
  expenseStatus?: string;
}
