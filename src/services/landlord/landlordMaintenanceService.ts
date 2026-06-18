import { prisma } from "../../config/prisma";
import type { LandlordMaintenanceQuery, LandlordMaintenanceSummary } from "../../dtos/landlord/landlord.maintenance.dto";

const RESOLVED_STATUSES = ["RESOLVED", "FIXED"] as const;
const OPEN_EXCLUDE_STATUSES = ["RESOLVED", "FIXED", "CANCELLED"] as const;

function resolveYear(year?: number): { start: Date; end: Date } {
  const y = year ?? new Date().getFullYear();
  return {
    start: new Date(y, 0, 1),
    end: new Date(y, 11, 31, 23, 59, 59, 999),
  };
}

export class LandlordMaintenanceService {
  public async getOverview(
    landlordId: string,
    query: LandlordMaintenanceQuery,
  ): Promise<LandlordMaintenanceSummary> {
    const { start, end } = resolveYear(query.year);
    const categoryFilter = query.category ? { category: query.category as any } : {};

    // Get all property IDs for this landlord once — used for ticket aggregation
    const properties = await prisma.property.findMany({
      where: { landlordId, isDeleted: false },
      select: { id: true, name: true },
    });
    const propertyIds = properties.map((p) => p.id);

    if (propertyIds.length === 0) {
      return {
        openTickets: 0,
        totalExpenses: 0,
        avgResolutionDays: 0,
        chart: [],
      };
    }

    // Unit IDs for ticket queries (MaintenanceRequest links to unit, not property)
    const units = await prisma.unit.findMany({
      where: { propertyId: { in: propertyIds }, status: { not: "DELETED" } },
      select: { id: true, propertyId: true },
    });
    const unitIds = units.map((u) => u.id);
    const unitPropertyMap = new Map(units.map((u) => [u.id, u.propertyId]));

    const [openTickets, expenseAgg, resolvedTickets, ticketsByYear, expensesByProperty] =
      await Promise.all([
        // 1. Open ticket count (not year-filtered — reflects current state)
        prisma.maintenanceRequest.count({
          where: {
            unitId: { in: unitIds },
            status: { notIn: OPEN_EXCLUDE_STATUSES as any },
            ...categoryFilter,
          },
        }),

        // 2. Total expenses for the year (non-REJECTED, scoped to landlord properties)
        prisma.expense.aggregate({
          _sum: { amount: true },
          where: {
            status: { not: "REJECTED" },
            propertyId: { in: propertyIds },
            date: { gte: start, lte: end },
            ...(query.category
              ? { maintenanceRequest: { category: query.category as any } }
              : {}),
          },
        }),

        // 3. Resolved/Fixed tickets in the year for avg resolution time
        prisma.maintenanceRequest.findMany({
          where: {
            unitId: { in: unitIds },
            status: { in: RESOLVED_STATUSES as any },
            updatedAt: { gte: start, lte: end },
            ...categoryFilter,
          },
          select: { createdAt: true, updatedAt: true },
        }),

        // 4. All tickets in the year for bar chart (ticket count per property)
        prisma.maintenanceRequest.findMany({
          where: {
            unitId: { in: unitIds },
            createdAt: { gte: start, lte: end },
            ...categoryFilter,
          },
          select: { unitId: true },
        }),

        // 5. Expenses per property for bar chart
        prisma.expense.findMany({
          where: {
            status: { not: "REJECTED" },
            propertyId: { in: propertyIds },
            date: { gte: start, lte: end },
            ...(query.category
              ? { maintenanceRequest: { category: query.category as any } }
              : {}),
          },
          select: { propertyId: true, amount: true },
        }),
      ]);

    // Avg resolution time in days
    let avgResolutionDays = 0;
    if (resolvedTickets.length > 0) {
      const totalMs = resolvedTickets.reduce((sum, t) => {
        return sum + (t.updatedAt.getTime() - t.createdAt.getTime());
      }, 0);
      avgResolutionDays = Math.round(
        totalMs / resolvedTickets.length / (1000 * 60 * 60 * 24),
      );
    }

    // Bar chart — aggregate per property in memory
    const ticketCountByProperty = new Map<string, number>();
    for (const ticket of ticketsByYear) {
      const propId = unitPropertyMap.get(ticket.unitId);
      if (!propId) continue;
      ticketCountByProperty.set(propId, (ticketCountByProperty.get(propId) ?? 0) + 1);
    }

    const costByProperty = new Map<string, number>();
    for (const expense of expensesByProperty) {
      if (!expense.propertyId) continue;
      costByProperty.set(
        expense.propertyId,
        (costByProperty.get(expense.propertyId) ?? 0) + expense.amount,
      );
    }

    const chart = properties.map((p) => ({
      propertyId: p.id,
      propertyName: p.name,
      ticketCount: ticketCountByProperty.get(p.id) ?? 0,
      totalCost: Math.round((costByProperty.get(p.id) ?? 0) * 100) / 100,
    }));

    return {
      openTickets,
      totalExpenses: Math.round((expenseAgg._sum.amount ?? 0) * 100) / 100,
      avgResolutionDays,
      chart,
    };
  }
}
