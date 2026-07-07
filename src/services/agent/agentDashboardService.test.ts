import { AgentDashboardService } from "./agentDashboardService";

jest.mock("../../config/prisma", () => ({
  prisma: {
    property: { count: jest.fn() },
    agentLead: { count: jest.fn(), findMany: jest.fn() },
    agentFee: { aggregate: jest.fn() },
    agentVisit: { findMany: jest.fn() },
  },
}));

import { prisma } from "../../config/prisma";

const mockedPrisma = prisma as unknown as {
  property: { count: jest.Mock };
  agentLead: { count: jest.Mock; findMany: jest.Mock };
  agentFee: { aggregate: jest.Mock };
  agentVisit: { findMany: jest.Mock };
};

describe("AgentDashboardService", () => {
  const agentId = "agent-1";
  let service: AgentDashboardService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AgentDashboardService();
  });

  describe("getSummary", () => {
    it("aggregates all four cards scoped to the agent", async () => {
      mockedPrisma.property.count.mockResolvedValue(3);
      mockedPrisma.agentLead.count.mockResolvedValueOnce(5); // active leads
      mockedPrisma.agentFee.aggregate.mockResolvedValue({ _sum: { amount: 450.5 } });
      mockedPrisma.agentLead.count.mockResolvedValueOnce(2); // converted leads

      const result = await service.getSummary(agentId, { period: "YEAR" });

      expect(result).toEqual({
        assignedPropertiesCount: 3,
        activeLeadsCount: 5,
        pendingFeesAmount: 450.5,
        leadsConvertedCount: 2,
      });
      expect(mockedPrisma.property.count).toHaveBeenCalledWith({
        where: { agentId, isDeleted: false },
      });
    });

    it("falls back pendingFeesAmount to 0 when there are no pending fees", async () => {
      mockedPrisma.property.count.mockResolvedValue(0);
      mockedPrisma.agentLead.count.mockResolvedValue(0);
      mockedPrisma.agentFee.aggregate.mockResolvedValue({ _sum: { amount: null } });

      const result = await service.getSummary(agentId, { period: "MONTH" });

      expect(result.pendingFeesAmount).toBe(0);
    });

    it("returns an all-zero summary for an agent with no data (empty state)", async () => {
      mockedPrisma.property.count.mockResolvedValue(0);
      mockedPrisma.agentLead.count.mockResolvedValue(0);
      mockedPrisma.agentFee.aggregate.mockResolvedValue({ _sum: { amount: null } });

      const result = await service.getSummary(agentId, { period: "YEAR" });

      expect(result).toEqual({
        assignedPropertiesCount: 0,
        activeLeadsCount: 0,
        pendingFeesAmount: 0,
        leadsConvertedCount: 0,
      });
    });
  });

  describe("getActiveLeadsChart", () => {
    const now = new Date();
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const firstMonthOfQuarter = new Date(now.getFullYear(), quarterStartMonth, 1);
    const secondMonthOfQuarter = new Date(now.getFullYear(), quarterStartMonth + 1, 1);
    const firstMonthKey = `${firstMonthOfQuarter.getFullYear()}-${String(firstMonthOfQuarter.getMonth() + 1).padStart(2, "0")}`;
    const secondMonthKey = `${secondMonthOfQuarter.getFullYear()}-${String(secondMonthOfQuarter.getMonth() + 1).padStart(2, "0")}`;

    it("buckets leads by month and zero-fills months with no activity", async () => {
      mockedPrisma.agentLead.findMany.mockResolvedValue([
        { createdAt: new Date(firstMonthOfQuarter.getFullYear(), firstMonthOfQuarter.getMonth(), 5) },
        { createdAt: new Date(firstMonthOfQuarter.getFullYear(), firstMonthOfQuarter.getMonth(), 20) },
        { createdAt: secondMonthOfQuarter },
      ]);

      const result = await service.getActiveLeadsChart(agentId, { period: "QUARTER" });

      const first = result.find((r) => r.month === firstMonthKey);
      const second = result.find((r) => r.month === secondMonthKey);

      expect(first?.count).toBe(2);
      expect(second?.count).toBe(1);
    });

    it("returns zero-filled buckets for every month in range when there are no leads (empty state)", async () => {
      mockedPrisma.agentLead.findMany.mockResolvedValue([]);

      const result = await service.getActiveLeadsChart(agentId, { period: "QUARTER" });

      expect(result.length).toBeGreaterThan(0);
      expect(result.every((point) => point.count === 0)).toBe(true);
    });
  });

  describe("getLeadsConversionChart", () => {
    it("computes total vs converted counts per month", async () => {
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      mockedPrisma.agentLead.findMany.mockResolvedValue([
        { createdAt: new Date(now.getFullYear(), now.getMonth(), 5), status: "APPROVED" },
        { createdAt: new Date(now.getFullYear(), now.getMonth(), 10), status: "FORWARDED_TO_LANDLORD" },
        { createdAt: new Date(now.getFullYear(), now.getMonth(), 15), status: "REJECTED" },
      ]);

      const result = await service.getLeadsConversionChart(agentId, { period: "MONTH" });

      const current = result.find((r) => r.month === monthKey);
      expect(current?.totalLeads).toBe(3);
      expect(current?.convertedLeads).toBe(1);
    });
  });

  describe("getUpcomingVisits", () => {
    it("returns visits sorted chronologically, scoped to the agent, excluding cancelled/rejected", async () => {
      const visits = [
        { id: "v1", visitDate: new Date(2026, 6, 10), status: "PENDING", property: { name: "Prop A" } },
        { id: "v2", visitDate: new Date(2026, 6, 8), status: "APPROVED", property: { name: "Prop B" } },
      ];
      mockedPrisma.agentVisit.findMany.mockResolvedValue(visits);

      const result = await service.getUpcomingVisits(agentId);

      expect(mockedPrisma.agentVisit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            agentId,
            status: { in: ["PENDING", "APPROVED", "RESCHEDULED_PENDING_AGENT"] },
          }),
          orderBy: { visitDate: "asc" },
        }),
      );
      expect(result).toEqual([
        { visitId: "v1", propertyName: "Prop A", visitDate: visits[0]!.visitDate, status: "PENDING" },
        { visitId: "v2", propertyName: "Prop B", visitDate: visits[1]!.visitDate, status: "APPROVED" },
      ]);
    });

    it("returns an empty array when the agent has no upcoming visits (empty state)", async () => {
      mockedPrisma.agentVisit.findMany.mockResolvedValue([]);

      const result = await service.getUpcomingVisits(agentId);

      expect(result).toEqual([]);
    });
  });
});
