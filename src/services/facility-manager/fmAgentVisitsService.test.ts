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

  // findUnique is called both to fetch the visit (by id) and, inside approveVisit,
  // to check accessCode uniqueness — must branch on the `where` clause or the
  // uniqueness-check loop never resolves falsy and spins forever.
  const mockFindUniqueFor = (visit: any) => {
    mockedPrisma.agentVisit.findUnique.mockImplementation((args: any) =>
      Promise.resolve(args?.where?.id ? visit : null),
    );
  };

  it("approves using the original visitDate when there is no agent counter-proposal", async () => {
    mockFindUniqueFor(rawVisit());

    await service.approveVisit(fmId, "visit-1");

    expect(mockedPrisma.agentVisit.update).toHaveBeenCalledWith({
      where: { id: "visit-1" },
      data: { status: "APPROVED", accessCode: expect.any(String) },
    });
  });

  it("adopts the agent's counter-proposed date as the new visitDate and clears the proposed fields", async () => {
    const counterDate = new Date(2026, 6, 15);
    mockFindUniqueFor(rawVisit({ proposedDate: counterDate, proposedById: "agent-1" }));

    await service.approveVisit(fmId, "visit-1");

    expect(mockedPrisma.agentVisit.update).toHaveBeenCalledWith({
      where: { id: "visit-1" },
      data: {
        status: "APPROVED",
        accessCode: expect.any(String),
        visitDate: counterDate,
        proposedDate: null,
        proposedById: null,
      },
    });
  });

  it("throws BadRequestError (400) when the visit is not PENDING", async () => {
    mockFindUniqueFor(rawVisit({ status: "APPROVED" }));

    await expect(service.approveVisit(fmId, "visit-1")).rejects.toMatchObject({ statusCode: 400 });
    expect(mockedPrisma.agentVisit.update).not.toHaveBeenCalled();
  });
});

describe("FmAgentVisitsService.checkInAgentVisit", () => {
  const fmId = "fm-1";
  let service: FmAgentVisitsService;

  const rawApprovedVisit = (overrides: Partial<any> = {}) => ({
    id: "visit-1",
    agentId: "agent-1",
    propertyId: "prop-1",
    accessCode: "123456",
    visitDate: new Date(),
    status: "APPROVED",
    property: { facilityManagerId: fmId, name: "Zephyr Towers" },
    agent: { userFullName: "Amaka Agent" },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FmAgentVisitsService();
  });

  it("checks in a valid, same-day APPROVED visit and marks it CHECKED_IN", async () => {
    mockedPrisma.agentVisit.findUnique.mockResolvedValue(rawApprovedVisit());

    const result = await service.checkInAgentVisit(fmId, "123456");

    expect(mockedPrisma.agentVisit.update).toHaveBeenCalledWith({
      where: { id: "visit-1" },
      data: { status: "CHECKED_IN", checkedInAt: expect.any(Date) },
    });
    expect(result).toEqual({ valid: true, agentName: "Amaka Agent", propertyName: "Zephyr Towers" });
  });

  it("throws NotFoundError (404) for an unknown access code", async () => {
    mockedPrisma.agentVisit.findUnique.mockResolvedValue(null);

    await expect(service.checkInAgentVisit(fmId, "000000")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws ForbiddenError (403) when the FM does not manage this visit's property", async () => {
    mockedPrisma.agentVisit.findUnique.mockResolvedValue(
      rawApprovedVisit({ property: { facilityManagerId: "someone-else", name: "Zephyr Towers" } }),
    );

    await expect(service.checkInAgentVisit(fmId, "123456")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("throws BadRequestError (400) when the visit is not APPROVED (e.g. already CHECKED_IN)", async () => {
    mockedPrisma.agentVisit.findUnique.mockResolvedValue(rawApprovedVisit({ status: "CHECKED_IN" }));

    await expect(service.checkInAgentVisit(fmId, "123456")).rejects.toMatchObject({ statusCode: 400 });
    expect(mockedPrisma.agentVisit.update).not.toHaveBeenCalled();
  });

  it("throws BadRequestError (400) when the code is used after the scheduled visit day", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    mockedPrisma.agentVisit.findUnique.mockResolvedValue(rawApprovedVisit({ visitDate: yesterday }));

    await expect(service.checkInAgentVisit(fmId, "123456")).rejects.toMatchObject({ statusCode: 400 });
    expect(mockedPrisma.agentVisit.update).not.toHaveBeenCalled();
  });
});
