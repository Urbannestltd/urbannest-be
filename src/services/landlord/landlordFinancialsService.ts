import { Response } from "express";
import ExcelJS from "exceljs";
import { prisma } from "../../config/prisma";
import { ForbiddenError } from "../../utils/apiError";
import type {
  FinancialsSummaryQuery,
  FinancialsSummary,
  FinancialRevenueByProperty,
  FinancialRevenueByUnit,
  FinancialRevenueShare,
  FinancialArrearItem,
  FinancialTransactionItem,
  FinancialsTransactionsQuery,
  FinancialsExportQuery,
} from "../../dtos/landlord/landlord.financials.dto";

export class LandlordFinancialsService {

  private scopedProperty(landlordId: string, specificId?: string) {
    return {
      landlordId,
      isDeleted: false,
      ...(specificId ? { id: specificId } : {}),
    };
  }

  private resolveYear(year?: number): { start: Date; end: Date } {
    const y = year ?? new Date().getFullYear();
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59, 999) };
  }

  private monthsOverlap(start: Date, end: Date, yearStart: Date, yearEnd: Date): number {
    const overlapStart = start > yearStart ? start : yearStart;
    const overlapEnd = end < yearEnd ? end : yearEnd;
    if (overlapStart >= overlapEnd) return 0;
    const months =
      (overlapEnd.getFullYear() - overlapStart.getFullYear()) * 12 +
      (overlapEnd.getMonth() - overlapStart.getMonth()) +
      (overlapEnd.getDate() - overlapStart.getDate()) / 30;
    return Math.max(0, months);
  }

  private async assertLandlordOwnsProperty(landlordId: string, propertyId: string) {
    const prop = await prisma.property.findFirst({
      where: { id: propertyId, landlordId, isDeleted: false },
    });
    if (!prop) throw new ForbiddenError("Property not found or not owned by you");
    return prop;
  }

  // ── Summary ─────────────────────────────────────────────────────────────────

  public async getSummary(
    landlordId: string,
    query: FinancialsSummaryQuery,
  ): Promise<FinancialsSummary> {
    if (query.propertyId) {
      await this.assertLandlordOwnsProperty(landlordId, query.propertyId);
    }

    const propScope = this.scopedProperty(landlordId, query.propertyId);
    const { start, end } = this.resolveYear(query.year);

    const [revenueResult, outstandingResult, activeLeasesCount, unitGroups] = await Promise.all([
      prisma.payment.aggregate({
        where: {
          type: "RENT",
          status: "PAID",
          createdAt: { gte: start, lte: end },
          lease: { unit: { property: propScope } },
        },
        _sum: { amount: true },
      }),

      prisma.payment.aggregate({
        where: {
          type: "RENT",
          status: { in: ["PENDING", "OVERDUE"] },
          lease: { unit: { property: propScope } },
        },
        _sum: { amount: true },
      }),

      prisma.lease.count({
        where: {
          status: "ACTIVE",
          unit: { property: propScope },
        },
      }),

      prisma.unit.groupBy({
        by: ["status"],
        where: { property: propScope },
        _count: { id: true },
      }),
    ]);

    const totalUnitsCount = unitGroups
      .filter((g) => g.status !== "DELETED")
      .reduce((acc, g) => acc + g._count.id, 0);

    return {
      totalRevenueCollected: Math.round(revenueResult._sum.amount ?? 0),
      totalOutstandingRent: Math.round(outstandingResult._sum.amount ?? 0),
      activeLeasesCount,
      totalUnitsCount,
    };
  }

  // ── Revenue Chart ────────────────────────────────────────────────────────────

  public async getRevenueChart(
    landlordId: string,
    query: FinancialsSummaryQuery,
  ): Promise<FinancialRevenueByProperty[] | FinancialRevenueByUnit[]> {
    if (query.propertyId) {
      await this.assertLandlordOwnsProperty(landlordId, query.propertyId);
    }

    const propScope = this.scopedProperty(landlordId, query.propertyId);
    const { start, end } = this.resolveYear(query.year);

    if (query.propertyId) {
      const [units, leases, payments] = await Promise.all([
        prisma.unit.findMany({
          where: { property: propScope },
          select: { id: true, name: true, baseRent: true },
        }),
        prisma.lease.findMany({
          where: {
            status: "ACTIVE",
            startDate: { lte: end },
            endDate: { gte: start },
            unit: { property: propScope },
          },
          select: { unitId: true, rentAmount: true, startDate: true, endDate: true },
        }),
        prisma.payment.findMany({
          where: {
            type: "RENT",
            status: "PAID",
            createdAt: { gte: start, lte: end },
            lease: { unit: { property: propScope } },
          },
          select: { amount: true, lease: { select: { unitId: true } } },
        }),
      ]);

      const expectedByUnit = new Map<string, number>();
      for (const l of leases) {
        const months = this.monthsOverlap(l.startDate, l.endDate, start, end);
        expectedByUnit.set(l.unitId, (expectedByUnit.get(l.unitId) ?? 0) + l.rentAmount * months);
      }

      const collectedByUnit = new Map<string, number>();
      for (const p of payments) {
        const uid = p.lease?.unitId;
        if (uid) collectedByUnit.set(uid, (collectedByUnit.get(uid) ?? 0) + p.amount);
      }

      return units.map((u): FinancialRevenueByUnit => ({
        unitId: u.id,
        unitName: u.name,
        expectedRent: Math.round(expectedByUnit.get(u.id) ?? (u.baseRent ? u.baseRent * 12 : 0)),
        collectedRent: Math.round(collectedByUnit.get(u.id) ?? 0),
      }));
    } else {
      const [properties, leases, payments] = await Promise.all([
        prisma.property.findMany({
          where: propScope,
          select: { id: true, name: true },
        }),
        prisma.lease.findMany({
          where: {
            status: "ACTIVE",
            startDate: { lte: end },
            endDate: { gte: start },
            unit: { property: propScope },
          },
          select: {
            rentAmount: true,
            startDate: true,
            endDate: true,
            unit: { select: { propertyId: true } },
          },
        }),
        prisma.payment.findMany({
          where: {
            type: "RENT",
            status: "PAID",
            createdAt: { gte: start, lte: end },
            lease: { unit: { property: propScope } },
          },
          select: { amount: true, lease: { select: { unit: { select: { propertyId: true } } } } },
        }),
      ]);

      const expectedByProperty = new Map<string, number>();
      for (const l of leases) {
        const pid = l.unit.propertyId;
        const months = this.monthsOverlap(l.startDate, l.endDate, start, end);
        expectedByProperty.set(pid, (expectedByProperty.get(pid) ?? 0) + l.rentAmount * months);
      }

      const collectedByProperty = new Map<string, number>();
      for (const p of payments) {
        const pid = p.lease?.unit?.propertyId;
        if (pid) collectedByProperty.set(pid, (collectedByProperty.get(pid) ?? 0) + p.amount);
      }

      return properties.map((prop): FinancialRevenueByProperty => ({
        propertyId: prop.id,
        propertyName: prop.name,
        expectedRevenue: Math.round(expectedByProperty.get(prop.id) ?? 0),
        collectedRevenue: Math.round(collectedByProperty.get(prop.id) ?? 0),
      }));
    }
  }

  // ── Revenue Share ────────────────────────────────────────────────────────────

  public async getRevenueShare(
    landlordId: string,
    query: FinancialsSummaryQuery,
  ): Promise<FinancialRevenueShare[]> {
    if (query.propertyId) {
      await this.assertLandlordOwnsProperty(landlordId, query.propertyId);
    }

    const propScope = this.scopedProperty(landlordId, query.propertyId);
    const { start, end } = this.resolveYear(query.year);

    const [properties, payments] = await Promise.all([
      prisma.property.findMany({
        where: propScope,
        select: { id: true, name: true },
      }),
      prisma.payment.findMany({
        where: {
          type: "RENT",
          status: "PAID",
          createdAt: { gte: start, lte: end },
          lease: { unit: { property: propScope } },
        },
        select: { amount: true, lease: { select: { unit: { select: { propertyId: true } } } } },
      }),
    ]);

    const revenueByProperty = new Map<string, number>();
    for (const p of payments) {
      const pid = p.lease?.unit?.propertyId;
      if (pid) revenueByProperty.set(pid, (revenueByProperty.get(pid) ?? 0) + p.amount);
    }

    const totalRevenue = [...revenueByProperty.values()].reduce((a, b) => a + b, 0);

    return properties.map((prop): FinancialRevenueShare => {
      const amount = revenueByProperty.get(prop.id) ?? 0;
      return {
        propertyId: prop.id,
        propertyName: prop.name,
        revenueAmount: Math.round(amount),
        revenuePercentage: totalRevenue > 0 ? Math.round((amount / totalRevenue) * 10000) / 100 : 0,
      };
    });
  }

  // ── Arrears ──────────────────────────────────────────────────────────────────

  public async getArrears(
    landlordId: string,
    query: FinancialsSummaryQuery,
  ): Promise<FinancialArrearItem[]> {
    if (query.propertyId) {
      await this.assertLandlordOwnsProperty(landlordId, query.propertyId);
    }

    const propScope = this.scopedProperty(landlordId, query.propertyId);

    const payments = await prisma.payment.findMany({
      where: {
        type: "RENT",
        status: { in: ["PENDING", "OVERDUE"] },
        lease: { unit: { property: propScope } },
      },
      select: {
        id: true,
        amount: true,
        dueDate: true,
        lease: {
          select: {
            id: true,
            tenant: { select: { userFullName: true } },
            unit: {
              select: {
                name: true,
                property: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    const today = new Date();

    // Group by leaseId to aggregate balance and oldest due date per lease
    const leaseMap = new Map<
      string,
      {
        leaseId: string;
        tenantName: string | null;
        propertyName: string | null;
        unitName: string;
        balanceDue: number;
        oldestDueDate: Date | null;
      }
    >();

    for (const p of payments) {
      const leaseId = p.lease?.id;
      if (!leaseId) continue;

      const existing = leaseMap.get(leaseId);
      const dueDate = p.dueDate;
      const oldestDueDate =
        existing?.oldestDueDate == null
          ? dueDate
          : dueDate && dueDate < existing.oldestDueDate
          ? dueDate
          : existing.oldestDueDate;

      leaseMap.set(leaseId, {
        leaseId,
        tenantName: existing?.tenantName ?? p.lease?.tenant?.userFullName ?? null,
        propertyName: existing?.propertyName ?? p.lease?.unit?.property?.name ?? null,
        unitName: existing?.unitName ?? p.lease?.unit?.name ?? "",
        balanceDue: (existing?.balanceDue ?? 0) + p.amount,
        oldestDueDate: oldestDueDate ?? null,
      });
    }

    const arrears: FinancialArrearItem[] = [...leaseMap.values()].map((entry) => ({
      leaseId: entry.leaseId,
      tenantName: entry.tenantName,
      propertyName: entry.propertyName,
      unitName: entry.unitName,
      balanceDue: Math.round(entry.balanceDue),
      daysOverdue:
        entry.oldestDueDate
          ? Math.max(0, Math.floor((today.getTime() - entry.oldestDueDate.getTime()) / 86_400_000))
          : 0,
    }));

    arrears.sort((a, b) => b.balanceDue - a.balanceDue);
    return arrears;
  }

  // ── Transaction History ───────────────────────────────────────────────────────

  public async getTransactions(
    landlordId: string,
    query: FinancialsTransactionsQuery,
  ): Promise<FinancialTransactionItem[]> {
    if (query.propertyId) {
      await this.assertLandlordOwnsProperty(landlordId, query.propertyId);
    }

    const propScope = this.scopedProperty(landlordId, query.propertyId);

    const dateFilter =
      query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate
                ? { lte: new Date(`${query.endDate}T23:59:59.999Z`) }
                : {}),
            },
          }
        : {};

    const payments = await prisma.payment.findMany({
      where: {
        ...dateFilter,
        lease: { unit: { property: propScope } },
      },
      select: {
        id: true,
        amount: true,
        type: true,
        status: true,
        reference: true,
        createdAt: true,
        lease: {
          select: {
            tenant: { select: { userFullName: true } },
            unit: {
              select: {
                name: true,
                property: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return payments.map((p): FinancialTransactionItem => ({
      transactionId: p.id,
      transactionDate: p.createdAt,
      tenantName: p.lease?.tenant?.userFullName ?? null,
      propertyName: p.lease?.unit?.property?.name ?? null,
      unitName: p.lease?.unit?.name ?? null,
      amount: p.amount,
      paymentType: p.type,
      paymentStatus: p.status,
      reference: p.reference,
    }));
  }

  // ── Export Ledger ────────────────────────────────────────────────────────────

  public async exportLedger(
    landlordId: string,
    query: FinancialsExportQuery,
    res: Response,
  ): Promise<void> {
    const transactions = await this.getTransactions(landlordId, {
      propertyId: query.propertyId,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    const headers = ["Date", "Tenant", "Property", "Unit", "Amount", "Type", "Status", "Reference"];

    const rows = transactions.map((t) => [
      t.transactionDate.toISOString().slice(0, 10),
      t.tenantName ?? "",
      t.propertyName ?? "",
      t.unitName ?? "",
      t.amount,
      t.paymentType,
      t.paymentStatus,
      t.reference,
    ]);

    if (query.format === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Transaction Ledger");

      sheet.addRow(headers).font = { bold: true };
      for (const row of rows) sheet.addRow(row);

      sheet.columns.forEach((col) => { col.width = 20; });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=ledger.xlsx");
      await workbook.xlsx.write(res);
      res.end();
    } else {
      const escape = (v: unknown) => {
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };
      const csv = [headers, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=ledger.csv");
      res.send(csv);
    }
  }
}
