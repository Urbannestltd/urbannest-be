jest.mock("../../config/prisma", () => ({
  prisma: {
    maintenanceRequest: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    maintenanceMessage: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("../external/zeptoMailService", () => ({
  ZeptoMailService: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("../../utils/getAdminRecipients", () => ({
  getAdminRecipients: jest.fn().mockResolvedValue([]),
}));

import { MaintenanceService } from "./maintenanceService";
import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../utils/apiError";

const mockedPrisma = prisma as unknown as {
  maintenanceRequest: { findUnique: jest.Mock; update: jest.Mock; delete: jest.Mock };
  maintenanceMessage: { findMany: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
  $transaction: jest.Mock;
};

// Tenant A owns this ticket; tenant B is the attacker substituting the ID.
const TICKET_ID = "ticket-1";
const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

describe("MaintenanceService — cross-tenant access (BOLA)", () => {
  let service: MaintenanceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MaintenanceService();
  });

  it("markTicketViewed: tenant B requesting tenant A's ticket gets 404, no write happens", async () => {
    mockedPrisma.maintenanceRequest.findUnique.mockResolvedValue({ tenantId: TENANT_A });

    await expect(service.markTicketViewed(TENANT_B, TICKET_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("sendMessage: a user who is neither the ticket's tenant nor its assignee gets 404, no message is created", async () => {
    mockedPrisma.maintenanceRequest.findUnique.mockResolvedValue({
      tenantId: TENANT_A,
      assignedToId: "fm-1",
      tenant: { userEmail: "a@example.com", userFullName: "Tenant A" },
      assignedTo: { userEmail: "fm@example.com", userFullName: "FM" },
    });

    await expect(
      service.sendMessage(TICKET_ID, TENANT_B, { message: "hi" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockedPrisma.maintenanceMessage.create).not.toHaveBeenCalled();
  });

  it("sendMessage: the assigned facility manager (not the tenant) is still allowed to post", async () => {
    const FM_ID = "fm-1";
    mockedPrisma.maintenanceRequest.findUnique.mockResolvedValue({
      tenantId: TENANT_A,
      assignedToId: FM_ID,
      tenant: { userEmail: "a@example.com", userFullName: "Tenant A" },
      assignedTo: { userEmail: "fm@example.com", userFullName: "FM" },
    });
    mockedPrisma.maintenanceMessage.create.mockResolvedValue({
      sender: { userFullName: "FM" },
    });

    await expect(
      service.sendMessage(TICKET_ID, FM_ID, { message: "on it" }),
    ).resolves.toBeDefined();
    expect(mockedPrisma.maintenanceMessage.create).toHaveBeenCalledTimes(1);
  });

  it("getTicketMessages: tenant B requesting tenant A's ticket gets 404", async () => {
    mockedPrisma.maintenanceRequest.findUnique.mockResolvedValue({ tenantId: TENANT_A });

    await expect(service.getTicketMessages(TICKET_ID, TENANT_B)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(mockedPrisma.maintenanceMessage.findMany).not.toHaveBeenCalled();
  });

  it("updateRequest: tenant B requesting tenant A's ticket gets 404, no update happens", async () => {
    mockedPrisma.maintenanceRequest.findUnique.mockResolvedValue({
      tenantId: TENANT_A,
      status: "PENDING",
    });

    await expect(
      service.updateRequest(TICKET_ID, TENANT_B, { subject: "hacked" } as any),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockedPrisma.maintenanceRequest.update).not.toHaveBeenCalled();
  });

  it("deleteRequest: tenant B requesting tenant A's ticket gets 404, no delete happens", async () => {
    mockedPrisma.maintenanceRequest.findUnique.mockResolvedValue({
      tenantId: TENANT_A,
      status: "PENDING",
    });

    await expect(service.deleteRequest(TICKET_ID, TENANT_B)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(mockedPrisma.maintenanceRequest.delete).not.toHaveBeenCalled();
  });
});
