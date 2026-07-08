import { AgentVisitsService } from "./agentVisitsService";

jest.mock("../../config/prisma", () => ({
  prisma: {
    agentVisit: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), count: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

jest.mock("../../services/external/zeptoMailService", () => ({
  ZeptoMailService: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("../../services/facility-manager/fmSettingsService", () => ({
  getFmNotificationPrefs: jest.fn().mockResolvedValue({
    fmEmailNewAgentVisit: true,
    fmEmailAgentReschedule: true,
  }),
}));

jest.mock("../../utils/activityLogger", () => ({
  logActivity: jest.fn(),
}));

import { prisma } from "../../config/prisma";

const mockedPrisma = prisma as unknown as {
  agentVisit: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
  user: { findUnique: jest.Mock };
};

describe("AgentVisitsService", () => {
  const agentId = "agent-1";
  let service: AgentVisitsService;

  const rawVisit = (overrides: Partial<any> = {}) => ({
    id: "visit-1",
    agentId,
    propertyId: "prop-1",
    unitId: null,
    visitDate: new Date(2026, 6, 10),
    purpose: null,
    status: "PENDING",
    proposedDate: null,
    proposedById: null,
    rejectionReason: null,
    notes: null,
    createdAt: new Date(2026, 6, 1),
    property: {
      name: "Zephyr Towers",
      address: "12 Marina Rd",
      facilityManagerId: "fm-1",
      facilityManager: { userFullName: "Fola FM", userEmail: "fola@fm.com" },
    },
    unit: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AgentVisitsService();
  });

  describe("getVisits", () => {
    it("scopes to the logged-in agent and includes visitType 'INSPECTION' on every item", async () => {
      mockedPrisma.agentVisit.findMany.mockResolvedValue([rawVisit()]);

      const result = await service.getVisits(agentId, {});

      expect(mockedPrisma.agentVisit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ agentId }) }),
      );
      expect(result[0]!.visitType).toBe("INSPECTION");
    });

    it("orders active visits soonest-first, followed by resolved visits most-recent-first", async () => {
      const activeSoon = rawVisit({ id: "active-soon", status: "PENDING", visitDate: new Date(2026, 6, 5) });
      const activeLater = rawVisit({ id: "active-later", status: "APPROVED", visitDate: new Date(2026, 6, 20) });
      const resolvedOld = rawVisit({ id: "resolved-old", status: "CANCELLED", visitDate: new Date(2026, 5, 1) });
      const resolvedRecent = rawVisit({ id: "resolved-recent", status: "REJECTED", visitDate: new Date(2026, 5, 15) });

      // Prisma returns them pre-sorted ascending by visitDate (per orderBy)
      mockedPrisma.agentVisit.findMany.mockResolvedValue([
        resolvedOld,
        resolvedRecent,
        activeSoon,
        activeLater,
      ]);

      const result = await service.getVisits(agentId, {});

      expect(result.map((r) => r.id)).toEqual([
        "active-soon",
        "active-later",
        "resolved-recent",
        "resolved-old",
      ]);
    });
  });

  describe("getSummary", () => {
    it("scopes all three counts to the logged-in agent", async () => {
      mockedPrisma.agentVisit.count.mockResolvedValue(0);

      await service.getSummary(agentId);

      for (const call of mockedPrisma.agentVisit.count.mock.calls) {
        expect(call[0].where.agentId).toBe(agentId);
      }
    });

    it("counts totalUpcoming as active statuses with a future visitDate", async () => {
      mockedPrisma.agentVisit.count.mockResolvedValue(0);

      await service.getSummary(agentId);

      const upcomingCall = mockedPrisma.agentVisit.count.mock.calls[0]![0];
      expect(upcomingCall.where.status).toEqual({ in: ["PENDING", "APPROVED", "RESCHEDULED_PENDING_AGENT"] });
      expect(upcomingCall.where.visitDate).toEqual({ gte: expect.any(Date) });
    });

    it("counts totalPending as status=PENDING only", async () => {
      mockedPrisma.agentVisit.count.mockResolvedValue(0);

      await service.getSummary(agentId);

      const pendingCall = mockedPrisma.agentVisit.count.mock.calls[1]![0];
      expect(pendingCall.where.status).toBe("PENDING");
    });

    it("counts totalCancelledRejected as CANCELLED + REJECTED", async () => {
      mockedPrisma.agentVisit.count.mockResolvedValue(0);

      await service.getSummary(agentId);

      const resolvedCall = mockedPrisma.agentVisit.count.mock.calls[2]![0];
      expect(resolvedCall.where.status).toEqual({ in: ["CANCELLED", "REJECTED"] });
    });

    it("maps counts into the summary shape", async () => {
      mockedPrisma.agentVisit.count
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1);

      const result = await service.getSummary(agentId);

      expect(result).toEqual({ totalUpcoming: 3, totalPending: 2, totalCancelledRejected: 1 });
    });

    it("returns all-zero summary when the agent has no visits (empty state)", async () => {
      mockedPrisma.agentVisit.count.mockResolvedValue(0);

      const result = await service.getSummary(agentId);

      expect(result).toEqual({ totalUpcoming: 0, totalPending: 0, totalCancelledRejected: 0 });
    });
  });

  describe("proposeNewTime", () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    it("stores the counter-proposed date, sets proposedById to the agent, and reverts status to PENDING", async () => {
      mockedPrisma.agentVisit.findUnique.mockResolvedValue(
        rawVisit({ status: "RESCHEDULED_PENDING_AGENT", proposedDate: new Date(2026, 6, 15), proposedById: "fm-1" }),
      );
      mockedPrisma.user.findUnique.mockResolvedValue({ userFullName: "Amaka Agent" });

      await service.proposeNewTime(agentId, "visit-1", futureDate);

      expect(mockedPrisma.agentVisit.update).toHaveBeenCalledWith({
        where: { id: "visit-1" },
        data: {
          status: "PENDING",
          proposedDate: new Date(futureDate),
          proposedById: agentId,
        },
      });
    });

    it("throws BadRequestError (400) when the visit is not RESCHEDULED_PENDING_AGENT", async () => {
      mockedPrisma.agentVisit.findUnique.mockResolvedValue(rawVisit({ status: "PENDING" }));

      await expect(service.proposeNewTime(agentId, "visit-1", futureDate)).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(mockedPrisma.agentVisit.update).not.toHaveBeenCalled();
    });

    it("throws BadRequestError (400) when the proposed date is not in the future", async () => {
      mockedPrisma.agentVisit.findUnique.mockResolvedValue(
        rawVisit({ status: "RESCHEDULED_PENDING_AGENT" }),
      );
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      await expect(service.proposeNewTime(agentId, "visit-1", pastDate)).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(mockedPrisma.agentVisit.update).not.toHaveBeenCalled();
    });

    it("throws ForbiddenError (403) when the visit belongs to another agent", async () => {
      mockedPrisma.agentVisit.findUnique.mockResolvedValue(
        rawVisit({ agentId: "someone-else", status: "RESCHEDULED_PENDING_AGENT" }),
      );

      await expect(service.proposeNewTime(agentId, "visit-1", futureDate)).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });
});
