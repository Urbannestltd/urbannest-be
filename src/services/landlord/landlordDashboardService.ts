import { prisma } from "../../config/prisma";
import { ForbiddenError } from "../../utils/apiError";
import type {
  LandlordDashboardQuery,
  LandlordDashboardSummary,
  LandlordRevenueByProperty,
  LandlordRevenueByUnit,
} from "../../dtos/landlord/landlord.dashboard.dto";

export class LandlordDashboardService {

  private scopedProperty(landlordId: string, specificId?: string) {
    return {
      landlordId,
      isDeleted: false,
      ...(specificId ? { id: specificId } : {}),
    };
  }

  private resolveYear(year?: number): { start: Date; end: Date } {
    const y = year ?? new Date().getFullYear();
    return {
      start: new Date(y, 0, 1),
      end: new Date(y, 11, 31, 23, 59, 59, 999),
    };
  }

  private async assertLandlordOwnsProperty(landlordId: string, propertyId: string) {
    const prop = await prisma.property.findFirst({
      where: { id: propertyId, landlordId, isDeleted: false },
    });
    if (!prop) throw new ForbiddenError("Property not found or not owned by you");
    return prop;
  }

  /** Months that a lease overlaps with [yearStart, yearEnd] (fractional, >= 0) */
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

  public async getSummary(
    landlordId: string,
    query: LandlordDashboardQuery,
  ): Promise<LandlordDashboardSummary> {
    if (query.propertyId) {
      await this.assertLandlordOwnsProperty(landlordId, query.propertyId);
    }

    const propScope = this.scopedProperty(landlordId, query.propertyId);
    const { start, end } = this.resolveYear(query.year);

    const [totalProperties, unitGroups, revenueResult, pendingApprovalsCount] =
      await Promise.all([
        prisma.property.count({ where: propScope }),

        prisma.unit.groupBy({
          by: ["status"],
          where: { property: propScope },
          _count: { id: true },
        }),

        prisma.payment.aggregate({
          where: {
            type: "RENT",
            status: "PAID",
            createdAt: { gte: start, lte: end },
            lease: { unit: { property: propScope } },
          },
          _sum: { amount: true },
        }),

        prisma.agentLead.count({
          where: { status: "FORWARDED_TO_LANDLORD", property: propScope },
        }),
      ]);

    const occupiedCount =
      unitGroups.find((g) => g.status === "OCCUPIED")?._count.id ?? 0;
    const totalUnits = unitGroups
      .filter((g) => g.status !== "DELETED")
      .reduce((acc, g) => acc + g._count.id, 0);
    const occupancyRate = totalUnits === 0 ? 0 : Math.round((occupiedCount / totalUnits) * 100);

    return {
      totalProperties,
      occupancyRate,
      revenueCollected: revenueResult._sum.amount ?? 0,
      pendingApprovalsCount,
    };
  }

  public async getRevenueChart(
    landlordId: string,
    query: LandlordDashboardQuery,
  ): Promise<LandlordRevenueByProperty[] | LandlordRevenueByUnit[]> {
    if (query.propertyId) {
      await this.assertLandlordOwnsProperty(landlordId, query.propertyId);
    }

    const propScope = this.scopedProperty(landlordId, query.propertyId);
    const { start, end } = this.resolveYear(query.year);

    if (query.propertyId) {
      // ── Group by unit ───────────────────────────────────────────────────────
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

      const unitResults = units.map((u): LandlordRevenueByUnit => {
        const expected = Math.round(expectedByUnit.get(u.id) ?? (u.baseRent ? u.baseRent * 12 : 0));
        const collected = Math.round(collectedByUnit.get(u.id) ?? 0);
        return {
          unitId: u.id,
          unitName: u.name,
          expectedRent: expected,
          collectedRent: collected,
          collectionRate: expected > 0 ? Math.round((collected / expected) * 100) : 0,
        };
      });

      return unitResults
        .sort((a, b) => b.collectionRate - a.collectionRate)
        .slice(0, 10);
    } else {
      // ── Group by property ───────────────────────────────────────────────────
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

      const propertyResults = properties.map((prop): LandlordRevenueByProperty => {
        const expected = Math.round(expectedByProperty.get(prop.id) ?? 0);
        const collected = Math.round(collectedByProperty.get(prop.id) ?? 0);
        return {
          propertyId: prop.id,
          propertyName: prop.name,
          expectedRevenue: expected,
          collectedRevenue: collected,
          collectionRate: expected > 0 ? Math.round((collected / expected) * 100) : 0,
        };
      });

      return propertyResults
        .sort((a, b) => b.collectionRate - a.collectionRate)
        .slice(0, 10);
    }
  }

}
