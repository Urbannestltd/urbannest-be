jest.mock("../config/prisma", () => ({
  prisma: {
    notification: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    notificationSetting: {
      findUnique: jest.fn(),
    },
  },
}));

import { NotificationService } from "./notificationService";
import { prisma } from "../config/prisma";
import { ForbiddenError } from "../utils/apiError";

const mockedPrisma = prisma as unknown as {
  notification: {
    create: jest.Mock;
    createMany: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  notificationSetting: { findUnique: jest.Mock };
};

const USER_A = "user-a";
const USER_B = "user-b";

describe("NotificationService", () => {
  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationService();
  });

  describe("notify", () => {
    it("creates a notification row", async () => {
      mockedPrisma.notification.create.mockResolvedValue({});

      await service.notify({
        recipientId: USER_A,
        type: "NOTICE",
        title: "Hello",
        body: "World",
      });

      expect(mockedPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          recipientId: USER_A,
          senderId: null,
          type: "NOTICE",
          title: "Hello",
          body: "World",
        }),
      });
    });

    it("never throws when the write fails", async () => {
      mockedPrisma.notification.create.mockRejectedValue(new Error("db down"));

      await expect(
        service.notify({ recipientId: USER_A, type: "SYSTEM", title: "x", body: "y" }),
      ).resolves.toBeUndefined();
    });
  });

  describe("isEmailEnabled", () => {
    it("defaults to true when the user has no settings row", async () => {
      mockedPrisma.notificationSetting.findUnique.mockResolvedValue(null);

      await expect(service.isEmailEnabled(USER_A, "emailNotices")).resolves.toBe(true);
    });

    it("respects an explicit opt-out", async () => {
      mockedPrisma.notificationSetting.findUnique.mockResolvedValue({
        emailNotices: false,
      });

      await expect(service.isEmailEnabled(USER_A, "emailNotices")).resolves.toBe(false);
    });
  });

  describe("markRead", () => {
    it("rejects a user marking a notification that isn't theirs", async () => {
      mockedPrisma.notification.findUnique.mockResolvedValue({ recipientId: USER_A });

      await expect(service.markRead(USER_B, "notif-1")).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(mockedPrisma.notification.update).not.toHaveBeenCalled();
    });

    it("marks the notification read for its actual recipient", async () => {
      mockedPrisma.notification.findUnique.mockResolvedValue({ recipientId: USER_A });
      mockedPrisma.notification.update.mockResolvedValue({});

      await service.markRead(USER_A, "notif-1");

      expect(mockedPrisma.notification.update).toHaveBeenCalledWith({
        where: { id: "notif-1" },
        data: { readAt: expect.any(Date) },
      });
    });
  });

  describe("markAllRead", () => {
    it("only touches the caller's own unread notifications", async () => {
      mockedPrisma.notification.updateMany.mockResolvedValue({ count: 3 });

      await service.markAllRead(USER_A);

      expect(mockedPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { recipientId: USER_A, readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });
  });
});
