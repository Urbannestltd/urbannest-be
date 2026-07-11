import { AgentFeesService } from "./agentFeesService";

jest.mock("../../config/prisma", () => ({
  prisma: {
    agentFee: { groupBy: jest.fn(), findMany: jest.fn() },
  },
}));

import { prisma } from "../../config/prisma";

const mockedPrisma = prisma as unknown as {
  agentFee: { groupBy: jest.Mock; findMany: jest.Mock };
};

describe("AgentFeesService", () => {
  const agentId = "agent-1";
  let service: AgentFeesService;

  const rawFee = (overrides: Partial<any> = {}) => ({
    id: "fee-1",
    amount: 60000,
    status: "PENDING_ADMIN_CONFIRMATION",
    createdAt: new Date(2026, 5, 1),
    property: { name: "Zephyr Towers" },
    lead: { prospectName: "Chidi Okafor", unit: { name: "Unit 4B" } },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AgentFeesService();
  });

  describe("getSummary", () => {
    it("scopes the query to the logged-in agent", async () => {
      mockedPrisma.agentFee.groupBy.mockResolvedValue([]);

      await service.getSummary(agentId);

      expect(mockedPrisma.agentFee.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ["status"],
          where: { agentId },
          _sum: { amount: true },
        }),
      );
    });

    it("maps grouped sums into totalPending/totalApproved/totalPaid", async () => {
      mockedPrisma.agentFee.groupBy.mockResolvedValue([
        { status: "PENDING_ADMIN_CONFIRMATION", _sum: { amount: 60000 } },
        { status: "CONFIRMED", _sum: { amount: 45000 } },
        { status: "PAID", _sum: { amount: 30000 } },
      ]);

      const result = await service.getSummary(agentId);

      expect(result).toEqual({
        totalPending: 60000,
        totalApproved: 45000,
        totalPaid: 30000,
      });
    });

    it("excludes REJECTED fees from all three totals", async () => {
      mockedPrisma.agentFee.groupBy.mockResolvedValue([
        { status: "PENDING_ADMIN_CONFIRMATION", _sum: { amount: 60000 } },
        { status: "REJECTED", _sum: { amount: 15000 } },
      ]);

      const result = await service.getSummary(agentId);

      expect(result.totalPending).toBe(60000);
      expect(result.totalApproved).toBe(0);
      expect(result.totalPaid).toBe(0);
    });

    it("returns all-zero summary when the agent has no fees (empty state)", async () => {
      mockedPrisma.agentFee.groupBy.mockResolvedValue([]);

      const result = await service.getSummary(agentId);

      expect(result).toEqual({
        totalPending: 0,
        totalApproved: 0,
        totalPaid: 0,
      });
    });
  });

  describe("getFees", () => {
    it("scopes to the logged-in agent and sorts newest first", async () => {
      mockedPrisma.agentFee.findMany.mockResolvedValue([]);

      await service.getFees(agentId, {});

      expect(mockedPrisma.agentFee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { agentId },
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("maps DB fields to the list item shape", async () => {
      mockedPrisma.agentFee.findMany.mockResolvedValue([rawFee()]);

      const result = await service.getFees(agentId, {});

      expect(result.fees).toEqual([
        {
          feeId: "fee-1",
          propertyName: "Zephyr Towers",
          unitNumber: "Unit 4B",
          tenantName: "Chidi Okafor",
          amount: 60000,
          status: "PENDING_ADMIN_CONFIRMATION",
          generationDate: rawFee().createdAt,
        },
      ]);
    });

    it("returns null unitNumber when the lead has no unit", async () => {
      mockedPrisma.agentFee.findMany.mockResolvedValue([
        rawFee({ lead: { prospectName: "Chidi Okafor", unit: null } }),
      ]);

      const result = await service.getFees(agentId, {});

      expect(result.fees[0]!.unitNumber).toBeNull();
    });

    it.each([
      ["PENDING", "PENDING_ADMIN_CONFIRMATION"],
      ["APPROVED", "CONFIRMED"],
      ["PAID", "PAID"],
    ])(
      "maps status filter %s to internal status %s",
      async (filterStatus, internalStatus) => {
        mockedPrisma.agentFee.findMany.mockResolvedValue([]);

        await service.getFees(agentId, { status: filterStatus as any });

        expect(mockedPrisma.agentFee.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ status: internalStatus }),
          }),
        );
      },
    );

    it("does not filter by status when status is omitted", async () => {
      mockedPrisma.agentFee.findMany.mockResolvedValue([]);

      await service.getFees(agentId, {});

      const callArgs = mockedPrisma.agentFee.findMany.mock.calls[0]![0];
      expect(callArgs.where).not.toHaveProperty("status");
    });

    it("filters by propertyId when provided", async () => {
      mockedPrisma.agentFee.findMany.mockResolvedValue([]);

      await service.getFees(agentId, { propertyId: "prop-1" });

      expect(mockedPrisma.agentFee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ propertyId: "prop-1" }),
        }),
      );
    });

    it("combines status and propertyId filters", async () => {
      mockedPrisma.agentFee.findMany.mockResolvedValue([]);

      await service.getFees(agentId, {
        status: "APPROVED",
        propertyId: "prop-1",
      });

      expect(mockedPrisma.agentFee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            agentId,
            status: "CONFIRMED",
            propertyId: "prop-1",
          }),
        }),
      );
    });

    it("computes totalAmount as the sum of the filtered fees", async () => {
      mockedPrisma.agentFee.findMany.mockResolvedValue([
        rawFee({ id: "fee-1", amount: 60000 }),
        rawFee({ id: "fee-2", amount: 45000 }),
      ]);

      const result = await service.getFees(agentId, {});

      expect(result.totalAmount).toBe(105000);
    });

    it("returns an empty list and zero totalAmount when the agent has no fees (empty state)", async () => {
      mockedPrisma.agentFee.findMany.mockResolvedValue([]);

      const result = await service.getFees(agentId, {});

      expect(result).toEqual({ fees: [], totalAmount: 0 });
    });

    it("returns an empty list when a filter combination matches nothing (no filter results state)", async () => {
      mockedPrisma.agentFee.findMany.mockResolvedValue([]);

      const result = await service.getFees(agentId, {
        status: "PAID",
        propertyId: "prop-1",
      });

      expect(result).toEqual({ fees: [], totalAmount: 0 });
    });
  });
});
