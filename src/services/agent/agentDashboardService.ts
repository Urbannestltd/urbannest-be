import { prisma } from "../../config/prisma";
import type {
  AgentDashboardQuery,
  AgentDashboardSummary,
  MonthlyLeadPoint,
  MonthlyConversionPoint,
  UpcomingVisitItem,
} from "../../dtos/agent/agent.dashboard.dto";

const ACTIVE_LEAD_STATUSES = ["PENDING", "FORWARDED_TO_LANDLORD"] as const;
const UPCOMING_VISIT_STATUSES = ["PENDING", "APPROVED", "RESCHEDULED_PENDING_AGENT"] as const;

export class AgentDashboardService {

  /** Resolves the selected period into a date range anchored on today (not a selectable year). */
  private resolvePeriod(period: AgentDashboardQuery["period"]): { start: Date; end: Date } {
    const now = new Date();
    const y = now.getFullYear();

    if (period === "MONTH") {
      const m = now.getMonth();
      return {
        start: new Date(y, m, 1),
        end: new Date(y, m + 1, 0, 23, 59, 59, 999),
      };
    }

    if (period === "QUARTER") {
      const q = Math.floor(now.getMonth() / 3);
      const startMonth = q * 3;
      return {
        start: new Date(y, startMonth, 1),
        end: new Date(y, startMonth + 3, 0, 23, 59, 59, 999),
      };
    }

    return {
      start: new Date(y, 0, 1),
      end: new Date(y, 11, 31, 23, 59, 59, 999),
    };
  }

  /** Builds an ordered list of "YYYY-MM" keys spanning [start, end], inclusive. */
  private monthKeysInRange(start: Date, end: Date): string[] {
    const keys: string[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return keys;
  }

  private monthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  public async getSummary(
    agentId: string,
    query: AgentDashboardQuery,
  ): Promise<AgentDashboardSummary> {
    const { start, end } = this.resolvePeriod(query.period);

    const [assignedPropertiesCount, activeLeadsCount, pendingFeesResult, leadsConvertedCount] =
      await Promise.all([
        prisma.property.count({
          where: { agentId, isDeleted: false },
        }),

        prisma.agentLead.count({
          where: {
            agentId,
            status: { in: [...ACTIVE_LEAD_STATUSES] },
            createdAt: { gte: start, lte: end },
          },
        }),

        prisma.agentFee.aggregate({
          where: {
            agentId,
            status: "PENDING_ADMIN_CONFIRMATION",
            createdAt: { gte: start, lte: end },
          },
          _sum: { amount: true },
        }),

        prisma.agentLead.count({
          where: {
            agentId,
            status: "APPROVED",
            decidedAt: { gte: start, lte: end },
          },
        }),
      ]);

    return {
      assignedPropertiesCount,
      activeLeadsCount,
      pendingFeesAmount: pendingFeesResult._sum.amount ?? 0,
      leadsConvertedCount,
    };
  }

  public async getActiveLeadsChart(
    agentId: string,
    query: AgentDashboardQuery,
  ): Promise<MonthlyLeadPoint[]> {
    const { start, end } = this.resolvePeriod(query.period);

    const leads = await prisma.agentLead.findMany({
      where: {
        agentId,
        status: { in: [...ACTIVE_LEAD_STATUSES] },
        createdAt: { gte: start, lte: end },
      },
      select: { createdAt: true },
    });

    const countByMonth = new Map<string, number>();
    for (const lead of leads) {
      const key = this.monthKey(lead.createdAt);
      countByMonth.set(key, (countByMonth.get(key) ?? 0) + 1);
    }

    return this.monthKeysInRange(start, end).map((month) => ({
      month,
      count: countByMonth.get(month) ?? 0,
    }));
  }

  public async getLeadsConversionChart(
    agentId: string,
    query: AgentDashboardQuery,
  ): Promise<MonthlyConversionPoint[]> {
    const { start, end } = this.resolvePeriod(query.period);

    const leads = await prisma.agentLead.findMany({
      where: {
        agentId,
        createdAt: { gte: start, lte: end },
      },
      select: { createdAt: true, status: true },
    });

    const totalByMonth = new Map<string, number>();
    const convertedByMonth = new Map<string, number>();
    for (const lead of leads) {
      const key = this.monthKey(lead.createdAt);
      totalByMonth.set(key, (totalByMonth.get(key) ?? 0) + 1);
      if (lead.status === "APPROVED") {
        convertedByMonth.set(key, (convertedByMonth.get(key) ?? 0) + 1);
      }
    }

    return this.monthKeysInRange(start, end).map((month) => ({
      month,
      totalLeads: totalByMonth.get(month) ?? 0,
      convertedLeads: convertedByMonth.get(month) ?? 0,
    }));
  }

  /** Ignores the period filter by design — always shows from today onward. */
  public async getUpcomingVisits(agentId: string): Promise<UpcomingVisitItem[]> {
    const visits = await prisma.agentVisit.findMany({
      where: {
        agentId,
        visitDate: { gte: new Date() },
        status: { in: [...UPCOMING_VISIT_STATUSES] },
      },
      include: {
        property: { select: { name: true } },
      },
      orderBy: { visitDate: "asc" },
    });

    return visits.map((v) => ({
      visitId: v.id,
      propertyName: v.property.name,
      visitDate: v.visitDate,
      status: v.status,
    }));
  }
}
