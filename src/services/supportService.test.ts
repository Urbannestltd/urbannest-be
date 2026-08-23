jest.mock("../config/prisma", () => ({
  prisma: {
    supportTicket: { findUnique: jest.fn(), create: jest.fn() },
    supportMessage: { create: jest.fn() },
    user: { findUnique: jest.fn() },
    lease: { findFirst: jest.fn() },
    property: { findFirst: jest.fn() },
  },
}));

jest.mock("./external/zeptoMailService", () => ({
  ZeptoMailService: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("../utils/activityLogger", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

import { SupportService } from "./supportService";
import { prisma } from "../config/prisma";
import { NotFoundError } from "../utils/apiError";
import { logActivity } from "../utils/activityLogger";

const mockedPrisma = prisma as unknown as {
  supportTicket: { findUnique: jest.Mock; create: jest.Mock };
  supportMessage: { create: jest.Mock };
  user: { findUnique: jest.Mock };
  lease: { findFirst: jest.Mock };
  property: { findFirst: jest.Mock };
};

const TICKET_ID = "ticket-1";
const OWNER_ID = "user-a";
const ATTACKER_ID = "user-b";

describe("SupportService — cross-user access (BOLA)", () => {
  let service: SupportService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SupportService();
  });

  describe("getTicketDetails", () => {
    it("rejects a non-owner, non-staff requester with 404", async () => {
      mockedPrisma.supportTicket.findUnique.mockResolvedValue({
        id: TICKET_ID,
        userId: OWNER_ID,
        messages: [],
      });

      await expect(
        service.getTicketDetails(TICKET_ID, ATTACKER_ID, "TENANT"),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("allows the owner, without logging an admin-access event", async () => {
      mockedPrisma.supportTicket.findUnique.mockResolvedValue({
        id: TICKET_ID,
        userId: OWNER_ID,
        messages: [],
      });

      await expect(
        service.getTicketDetails(TICKET_ID, OWNER_ID, "TENANT"),
      ).resolves.toMatchObject({ id: TICKET_ID });
      expect(logActivity).not.toHaveBeenCalled();
    });

    it("allows staff (ADMIN role) even though they don't own the ticket, and logs the access", async () => {
      const ADMIN_ID = "admin-1";
      mockedPrisma.supportTicket.findUnique.mockResolvedValue({
        id: TICKET_ID,
        userId: OWNER_ID,
        messages: [],
      });

      await expect(
        service.getTicketDetails(TICKET_ID, ADMIN_ID, "ADMIN"),
      ).resolves.toMatchObject({ id: TICKET_ID });
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: ADMIN_ID,
          action: "ADMIN_VIEWED_SUPPORT_TICKET",
          metadata: { ticketId: TICKET_ID, ticketOwnerId: OWNER_ID },
        }),
      );
    });

    it("rejects a non-existent ticketId with 404", async () => {
      mockedPrisma.supportTicket.findUnique.mockResolvedValue(null);

      await expect(
        service.getTicketDetails(TICKET_ID, OWNER_ID, "TENANT"),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("replyToTicket", () => {
    it("rejects a non-owner, non-staff sender with 404, no message created", async () => {
      mockedPrisma.supportTicket.findUnique.mockResolvedValue({
        id: TICKET_ID,
        userId: OWNER_ID,
        subject: "Help",
        submitter: { userEmail: "a@example.com", userFullName: "Owner" },
      });

      await expect(
        service.replyToTicket(TICKET_ID, ATTACKER_ID, "TENANT", { message: "butting in" }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(mockedPrisma.supportMessage.create).not.toHaveBeenCalled();
    });

    it("allows the owner to reply, without logging an admin-access event", async () => {
      mockedPrisma.supportTicket.findUnique.mockResolvedValue({
        id: TICKET_ID,
        userId: OWNER_ID,
        subject: "Help",
        submitter: { userEmail: "a@example.com", userFullName: "Owner" },
      });
      mockedPrisma.supportMessage.create.mockResolvedValue({ id: "msg-1" });

      await expect(
        service.replyToTicket(TICKET_ID, OWNER_ID, "TENANT", { message: "more info" }),
      ).resolves.toBeDefined();
      expect(logActivity).not.toHaveBeenCalled();
    });

    it("allows staff (ADMIN role) to reply even though they don't own the ticket, and logs the access", async () => {
      const ADMIN_ID = "admin-1";
      mockedPrisma.supportTicket.findUnique.mockResolvedValue({
        id: TICKET_ID,
        userId: OWNER_ID,
        subject: "Help",
        submitter: { userEmail: "a@example.com", userFullName: "Owner" },
      });
      mockedPrisma.supportMessage.create.mockResolvedValue({ id: "msg-1" });

      await expect(
        service.replyToTicket(TICKET_ID, ADMIN_ID, "ADMIN", { message: "we're on it" }),
      ).resolves.toBeDefined();
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: ADMIN_ID,
          action: "ADMIN_REPLIED_SUPPORT_TICKET",
          metadata: { ticketId: TICKET_ID, ticketOwnerId: OWNER_ID },
        }),
      );
    });
  });

  describe("createTicket — category is open-ended", () => {
    beforeEach(() => {
      mockedPrisma.user.findUnique.mockResolvedValue({
        userId: OWNER_ID,
        userFullName: "Owner",
        userEmail: "a@example.com",
        userPhone: "08000000000",
      });
      mockedPrisma.lease.findFirst.mockResolvedValue(null);
      mockedPrisma.property.findFirst.mockResolvedValue(null);
      mockedPrisma.supportTicket.create.mockResolvedValue({
        id: TICKET_ID,
        createdAt: new Date(),
      });
    });

    it("accepts a category value that isn't one of the old fixed enum options", async () => {
      await expect(
        service.createTicket(OWNER_ID, "TENANT", {
          category: "Something Custom",
          subject: "A subject long enough",
          message: "A message long enough to pass validation",
        }),
      ).resolves.toBeDefined();

      expect(mockedPrisma.supportTicket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ category: "Something Custom" }),
        }),
      );
    });
  });
});
