import { prisma } from "../../config/prisma";
import {
  AdminGetPaymentsQuery,
  CombinedLedgerItemDto,
  FinancialMetricsDto,
} from "../../dtos/admin/payment.dto";

export class AdminPaymentService {
  public async getAllPayments(
    filters: AdminGetPaymentsQuery,
  ): Promise<CombinedLedgerItemDto[]> {
    const dateRange = filters.startDate || filters.endDate
      ? {
          gte: filters.startDate ? new Date(filters.startDate) : undefined,
          lte: filters.endDate   ? new Date(filters.endDate)   : undefined,
        }
      : undefined;

    const results: CombinedLedgerItemDto[] = [];

    // ── Payments ────────────────────────────────────────────────────────────
    if (!filters.source || filters.source === "PAYMENT") {
      const payments = await prisma.payment.findMany({
        where: {
          ...(filters.tenantId   && { userId: filters.tenantId }),
          ...(filters.status     && { status: filters.status }),
          ...(filters.type       && { type: filters.type }),
          ...(dateRange          && { createdAt: dateRange }),
          ...(filters.propertyId && { lease: { unit: { propertyId: filters.propertyId } } }),
        },
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { userId: true, userFullName: true, userEmail: true } },
          lease: {
            include: {
              unit: { include: { property: { select: { id: true, name: true } } } },
            },
          },
        },
      });

      results.push(
        ...payments.map((p) => ({
          recordType: "PAYMENT" as const,
          id: p.id,
          amount: p.amount,
          date: p.createdAt,
          reference: p.reference,
          status: p.status,
          paymentType: p.type,
          dueDate: p.dueDate,
          paidDate: p.paidDate,
          tenant: p.user
            ? { id: p.user.userId, name: p.user.userFullName ?? p.user.userEmail, email: p.user.userEmail }
            : null,
          unit: p.lease?.unit ? { id: p.lease.unit.id, name: p.lease.unit.name } : null,
          property: p.lease?.unit?.property
            ? { id: p.lease.unit.property.id, name: p.lease.unit.property.name }
            : null,
          category: null,
          description: null,
        })),
      );
    }

    // ── Expenses ─────────────────────────────────────────────────────────────
    if (!filters.source || filters.source === "EXPENSE") {
      const expenses = await prisma.expense.findMany({
        where: {
          ...(filters.propertyId && { propertyId: filters.propertyId }),
          ...(dateRange          && { date: dateRange }),
        },
        orderBy: { date: "desc" },
        include: {
          property: { select: { id: true, name: true } },
          unit:     { select: { id: true, name: true } },
        },
      });

      results.push(
        ...expenses.map((e) => ({
          recordType: "EXPENSE" as const,
          id: e.id,
          amount: e.amount,
          date: e.date,
          reference: null,
          status: null,
          paymentType: null,
          dueDate: null,
          paidDate: null,
          tenant: null,
          unit: e.unit ? { id: e.unit.id, name: e.unit.name } : null,
          property: e.property ? { id: e.property.id, name: e.property.name } : null,
          category: e.category,
          description: e.description,
        })),
      );
    }

    // Merge and sort by date descending
    results.sort((a, b) => b.date.getTime() - a.date.getTime());

    return results;
  }

  public async getFinancialMetrics(propertyId?: string): Promise<FinancialMetricsDto> {
    const propertyFilter = propertyId
      ? { lease: { unit: { propertyId } } }
      : {};

    const leaseFilter = propertyId
      ? { status: "ACTIVE" as const, unit: { propertyId } }
      : { status: "ACTIVE" as const };

    const [
      expectedRevenue,
      collectedRent,
      collectedServiceCharge,
      collectedUtility,
      defaultingTenants,
    ] = await Promise.all([
      // Expected: sum of rentAmount on all active leases
      prisma.lease.aggregate({
        _sum: { rentAmount: true },
        where: leaseFilter,
      }),

      // Collected: PAID rent payments
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: "PAID", type: "RENT", ...propertyFilter },
      }),

      // Collected: PAID service charge payments
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: "PAID", type: "SERVICE_CHARGE", ...propertyFilter },
      }),

      // Collected: PAID utility bill payments
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: "PAID",
          type: { in: ["UTILITY_BILL", "UTILITY_TOKEN"] },
          ...propertyFilter,
        },
      }),

      // Defaulting: distinct tenants with at least one OVERDUE payment
      prisma.user.count({
        where: {
          userRole: { roleName: "TENANT" },
          payments: {
            some: {
              status: "OVERDUE",
              ...(propertyId ? { lease: { unit: { propertyId } } } : {}),
            },
          },
        },
      }),
    ]);

    const rent = collectedRent._sum.amount ?? 0;
    const serviceCharge = collectedServiceCharge._sum.amount ?? 0;
    const utilityBills = collectedUtility._sum.amount ?? 0;
    const totalExpected = expectedRevenue._sum.rentAmount ?? 0;

    return {
      totalExpectedRevenue: totalExpected,
      totalCollected: rent,
      outstandingAmount: Math.max(0, totalExpected - rent),
      defaultingTenants,
      collectedBreakdown: { rent, serviceCharge, utilityBills },
    };
  }

  public async generateCsvExport(
    filters: AdminGetPaymentsQuery,
  ): Promise<string> {
    const items = await this.getAllPayments(filters);

    const escape = (val: string | number | null | undefined) => {
      if (val == null) return "";
      const s = String(val);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const header = [
      "recordType",
      "id",
      "amount",
      "date",
      "reference",
      "status",
      "paymentType",
      "paidDate",
      "dueDate",
      "category",
      "description",
      "tenantName",
      "tenantEmail",
      "propertyName",
      "unitName",
    ].join(",");

    const rows = items.map((item) =>
      [
        escape(item.recordType),
        escape(item.id),
        item.amount,
        escape(item.date.toISOString()),
        escape(item.reference),
        escape(item.status),
        escape(item.paymentType),
        escape(item.paidDate?.toISOString() ?? null),
        escape(item.dueDate?.toISOString() ?? null),
        escape(item.category),
        escape(item.description),
        escape(item.tenant?.name ?? null),
        escape(item.tenant?.email ?? null),
        escape(item.property?.name ?? null),
        escape(item.unit?.name ?? null),
      ].join(","),
    );

    return [header, ...rows].join("\n");
  }
}
