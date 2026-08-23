jest.mock("../config/prisma", () => ({
  prisma: {
    supportTicket: { findUnique: jest.fn() },
    supportMessage: { create: jest.fn() },
  },
}));

jest.mock("./external/zeptoMailService", () => ({
  ZeptoMailService: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { SupportService } from "./supportService";
import { prisma } from "../config/prisma";
import { NotFoundError } from "../utils/apiError";

const mockedPrisma = prisma as unknown as {
  supportTicket: { findUnique: jest.Mock };
  supportMessage: { create: jest.Mock };
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

    it("allows the owner", async () => {
      mockedPrisma.supportTicket.findUnique.mockResolvedValue({
        id: TICKET_ID,
        userId: OWNER_ID,
        messages: [],
      });

      await expect(
        service.getTicketDetails(TICKET_ID, OWNER_ID, "TENANT"),
      ).resolves.toMatchObject({ id: TICKET_ID });
    });

    it("allows staff (ADMIN role) even though they don't own the ticket", async () => {
      mockedPrisma.supportTicket.findUnique.mockResolvedValue({
        id: TICKET_ID,
        userId: OWNER_ID,
        messages: [],
      });

      await expect(
        service.getTicketDetails(TICKET_ID, ATTACKER_ID, "ADMIN"),
      ).resolves.toMatchObject({ id: TICKET_ID });
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

    it("allows the owner to reply", async () => {
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
    });

    it("allows staff (ADMIN role) to reply even though they don't own the ticket", async () => {
      mockedPrisma.supportTicket.findUnique.mockResolvedValue({
        id: TICKET_ID,
        userId: OWNER_ID,
        subject: "Help",
        submitter: { userEmail: "a@example.com", userFullName: "Owner" },
      });
      mockedPrisma.supportMessage.create.mockResolvedValue({ id: "msg-1" });

      await expect(
        service.replyToTicket(TICKET_ID, ATTACKER_ID, "ADMIN", { message: "we're on it" }),
      ).resolves.toBeDefined();
    });
  });
});
