import { AdminAgentLeadsService } from "./adminAgentLeadsService";

jest.mock("../../config/prisma", () => ({
  prisma: {
    agentLead: { findUnique: jest.fn(), update: jest.fn() },
    unit: { update: jest.fn() },
    agentFee: { updateMany: jest.fn() },
  },
}));

const mockCreateUser = jest.fn();
jest.mock("./adminService", () => ({
  AdminService: jest.fn().mockImplementation(() => ({
    createUser: mockCreateUser,
  })),
}));

jest.mock("../../utils/activityLogger", () => ({
  logActivity: jest.fn(),
}));

import { prisma } from "../../config/prisma";

const mockedPrisma = prisma as unknown as {
  agentLead: { findUnique: jest.Mock; update: jest.Mock };
  unit: { update: jest.Mock };
  agentFee: { updateMany: jest.Mock };
};

describe("AdminAgentLeadsService.convertToTenant", () => {
  const adminId = "admin-1";
  let service: AdminAgentLeadsService;

  const rawLead = (overrides: Partial<any> = {}) => ({
    id: "lead-1",
    propertyId: "prop-1",
    unitId: "unit-1",
    prospectName: "Chidi Okafor",
    prospectEmail: "chidi@example.com",
    status: "APPROVED",
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateUser.mockResolvedValue({
      success: true,
      message: "Registration initiated",
      data: { userEmail: "chidi@example.com", userId: "new-tenant-1" },
    });
    service = new AdminAgentLeadsService();
  });

  it("creates the tenant, marks the unit Occupied, marks the fee PAID, and locks the lead", async () => {
    mockedPrisma.agentLead.findUnique.mockResolvedValue(rawLead());

    const result = await service.convertToTenant(adminId, "lead-1");

    expect(mockCreateUser).toHaveBeenCalledWith({
      userEmail: "chidi@example.com",
      unitId: "unit-1",
      propertyId: "prop-1",
      userRole: "TENANT",
    });
    expect(mockedPrisma.unit.update).toHaveBeenCalledWith({
      where: { id: "unit-1" },
      data: { status: "OCCUPIED" },
    });
    expect(mockedPrisma.agentFee.updateMany).toHaveBeenCalledWith({
      where: { leadId: "lead-1", status: "PENDING_ADMIN_CONFIRMATION" },
      data: { status: "PAID", confirmedAt: expect.any(Date), paidAt: expect.any(Date) },
    });
    expect(mockedPrisma.agentLead.update).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: { status: "CONVERTED_TO_TENANT" },
    });
    expect(result).toEqual({
      leadId: "lead-1",
      status: "CONVERTED_TO_TENANT",
      unitId: "unit-1",
      tenantUserId: "new-tenant-1",
    });
  });

  it("throws ConflictError (409) when the lead is not APPROVED", async () => {
    mockedPrisma.agentLead.findUnique.mockResolvedValue(rawLead({ status: "FORWARDED_TO_LANDLORD" }));

    await expect(service.convertToTenant(adminId, "lead-1")).rejects.toMatchObject({ statusCode: 409 });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("throws ConflictError (409) when the lead is already CONVERTED_TO_TENANT (workflow lock)", async () => {
    mockedPrisma.agentLead.findUnique.mockResolvedValue(rawLead({ status: "CONVERTED_TO_TENANT" }));

    await expect(service.convertToTenant(adminId, "lead-1")).rejects.toMatchObject({ statusCode: 409 });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("throws BadRequestError (400) when the lead has no associated unit", async () => {
    mockedPrisma.agentLead.findUnique.mockResolvedValue(rawLead({ unitId: null }));

    await expect(service.convertToTenant(adminId, "lead-1")).rejects.toMatchObject({ statusCode: 400 });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("throws BadRequestError (400) when the lead has no prospect email", async () => {
    mockedPrisma.agentLead.findUnique.mockResolvedValue(rawLead({ prospectEmail: null }));

    await expect(service.convertToTenant(adminId, "lead-1")).rejects.toMatchObject({ statusCode: 400 });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("throws NotFoundError (404) when the lead does not exist", async () => {
    mockedPrisma.agentLead.findUnique.mockResolvedValue(null);

    await expect(service.convertToTenant(adminId, "lead-1")).rejects.toMatchObject({ statusCode: 404 });
  });
});
