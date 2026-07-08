import { FmAgentVisitsService } from "./fmAgentVisitsService";

jest.mock("../../config/prisma", () => ({
  prisma: {
    agentVisit: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

jest.mock("../external/zeptoMailService", () => ({
  ZeptoMailService: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("../../utils/activityLogger", () => ({
  logActivity: jest.fn(),
}));

import { prisma } from "../../config/prisma";

const mockedPrisma = prisma as unknown as {
  agentVisit: { findUnique: jest.Mock; update: jest.Mock };
};

describe("FmAgentVisitsService.approveVisit", () => {
  const fmId = "fm-1";
  let service: FmAgentVisitsService;

  const rawVisit = (overrides: Partial<any> = {}) => ({
    id: "visit-1",
    agentId: "agent-1",
    propertyId: "prop-1",
    visitDate: new Date(2026, 6, 1),
    status: "PENDING",
    proposedDate: null,
    proposedById: null,
    property: { facilityManagerId: fmId, name: "Zephyr Towers", address: "12 Marina Rd" },
    agent: { userFullName: "Amaka Agent", userEmail: "amaka@agent.com", userPhone: "080" },
    unit: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FmAgentVisitsService();
  });

  it("approves using the original visitDate when there is no agent counter-proposal", async () => {
    mockedPrisma.agentVisit.findUnique.mockResolvedValue(rawVisit());

    await service.approveVisit(fmId, "visit-1");

    expect(mockedPrisma.agentVisit.update).toHaveBeenCalledWith({
      where: { id: "visit-1" },
      data: { status: "APPROVED" },
    });
  });

  it("adopts the agent's counter-proposed date as the new visitDate and clears the proposed fields", async () => {
    const counterDate = new Date(2026, 6, 15);
    mockedPrisma.agentVisit.findUnique.mockResolvedValue(
      rawVisit({ proposedDate: counterDate, proposedById: "agent-1" }),
    );

    await service.approveVisit(fmId, "visit-1");

    expect(mockedPrisma.agentVisit.update).toHaveBeenCalledWith({
      where: { id: "visit-1" },
      data: {
        status: "APPROVED",
        visitDate: counterDate,
        proposedDate: null,
        proposedById: null,
      },
    });
  });

  it("throws BadRequestError (400) when the visit is not PENDING", async () => {
    mockedPrisma.agentVisit.findUnique.mockResolvedValue(rawVisit({ status: "APPROVED" }));

    await expect(service.approveVisit(fmId, "visit-1")).rejects.toMatchObject({ statusCode: 400 });
    expect(mockedPrisma.agentVisit.update).not.toHaveBeenCalled();
  });
});
