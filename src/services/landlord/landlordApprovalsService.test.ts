import { LandlordApprovalsService } from "./landlordApprovalsService";

jest.mock("../../config/prisma", () => ({
  prisma: {
    agentLead: { findUnique: jest.fn(), update: jest.fn() },
    agentFee: { create: jest.fn(), updateMany: jest.fn() },
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
  agentLead: { findUnique: jest.Mock; update: jest.Mock };
  agentFee: { create: jest.Mock; updateMany: jest.Mock };
};

describe("LandlordApprovalsService.reject", () => {
  const landlordId = "landlord-1";
  let service: LandlordApprovalsService;

  const rawLead = (overrides: Partial<any> = {}) => ({
    id: "lead-1",
    agentId: "agent-1",
    propertyId: "prop-1",
    unitId: "unit-1",
    prospectName: "Chidi Okafor",
    prospectEmail: "chidi@example.com",
    proposedRent: 500000,
    status: "FORWARDED_TO_LANDLORD",
    agent: { userId: "agent-1", userFullName: "Amaka Agent", userEmail: "amaka@agent.com" },
    property: { id: "prop-1", name: "Zephyr Towers", landlordId },
    unit: { id: "unit-1", name: "Unit 4B", baseRent: 500000 },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LandlordApprovalsService();
  });

  it("rejects a FORWARDED_TO_LANDLORD lead without touching any fee", async () => {
    mockedPrisma.agentLead.findUnique.mockResolvedValue(rawLead());

    await service.reject(landlordId, "lead-1", "Insufficient income");

    expect(mockedPrisma.agentLead.update).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: { status: "REJECTED", rejectionReason: "Insufficient income", decidedAt: expect.any(Date) },
    });
    expect(mockedPrisma.agentFee.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an APPROVED lead (Safety Switch) and reverses its pending fee", async () => {
    mockedPrisma.agentLead.findUnique.mockResolvedValue(rawLead({ status: "APPROVED" }));

    await service.reject(landlordId, "lead-1", "Deal fell through before signing");

    expect(mockedPrisma.agentLead.update).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: {
        status: "REJECTED",
        rejectionReason: "Deal fell through before signing",
        decidedAt: expect.any(Date),
      },
    });
    expect(mockedPrisma.agentFee.updateMany).toHaveBeenCalledWith({
      where: { leadId: "lead-1", status: "PENDING_ADMIN_CONFIRMATION" },
      data: { status: "REJECTED" },
    });
  });

  it("throws ConflictError (409) when the lead is neither FORWARDED_TO_LANDLORD nor APPROVED", async () => {
    mockedPrisma.agentLead.findUnique.mockResolvedValue(rawLead({ status: "REJECTED" }));

    await expect(service.reject(landlordId, "lead-1", "reason")).rejects.toMatchObject({ statusCode: 409 });
    expect(mockedPrisma.agentLead.update).not.toHaveBeenCalled();
  });

  it("throws ConflictError (409) when the lead is already CONVERTED_TO_TENANT", async () => {
    mockedPrisma.agentLead.findUnique.mockResolvedValue(rawLead({ status: "CONVERTED_TO_TENANT" }));

    await expect(service.reject(landlordId, "lead-1", "reason")).rejects.toMatchObject({ statusCode: 409 });
    expect(mockedPrisma.agentLead.update).not.toHaveBeenCalled();
  });

  it("throws ForbiddenError (403) when the landlord does not own the property", async () => {
    mockedPrisma.agentLead.findUnique.mockResolvedValue(
      rawLead({ property: { id: "prop-1", name: "Zephyr Towers", landlordId: "someone-else" } }),
    );

    await expect(service.reject(landlordId, "lead-1", "reason")).rejects.toMatchObject({ statusCode: 403 });
  });
});
