import { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ForbiddenError } from "../utils/apiError";

type EmailPreferenceField =
  | "emailPayments"
  | "emailLease"
  | "emailMaintenance"
  | "emailVisitors"
  | "emailNotices";

interface NotifyParams {
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  senderId?: string;
  entityType?: string;
  entityId?: string;
}

export class NotificationService {
  /**
   * Creates the in-app notification row. Additive only — never touches email
   * sending, never resolves recipients. Never throws: a failure here must
   * not break the domain action it's attached to.
   */
  public async notify(params: NotifyParams): Promise<void> {
    try {
      await prisma.notification.create({
        data: {
          recipientId: params.recipientId,
          senderId: params.senderId ?? null,
          type: params.type,
          title: params.title,
          body: params.body,
          entityType: params.entityType ?? null,
          entityId: params.entityId ?? null,
        },
      });
    } catch (err) {
      console.error("[NotificationService.notify] failed", err);
    }
  }

  /** Fan-out variant, e.g. one row per admin from getAdminRecipients(). */
  public async notifyMany(paramsList: NotifyParams[]): Promise<void> {
    if (paramsList.length === 0) return;
    try {
      await prisma.notification.createMany({
        data: paramsList.map((p) => ({
          recipientId: p.recipientId,
          senderId: p.senderId ?? null,
          type: p.type,
          title: p.title,
          body: p.body,
          entityType: p.entityType ?? null,
          entityId: p.entityId ?? null,
        })),
      });
    } catch (err) {
      console.error("[NotificationService.notifyMany] failed", err);
    }
  }

  /**
   * Same "no settings row = all defaults true" semantics as getAdminRecipients,
   * scoped to a single user.
   */
  public async isEmailEnabled(
    userId: string,
    field: EmailPreferenceField,
  ): Promise<boolean> {
    const settings = await prisma.notificationSetting.findUnique({
      where: { userId },
      select: { [field]: true } as Prisma.NotificationSettingSelect,
    });
    if (!settings) return true;
    return (settings as unknown as Record<EmailPreferenceField, boolean>)[
      field
    ];
  }

  public async list(userId: string, opts?: { unreadOnly?: boolean }) {
    return prisma.notification.findMany({
      where: {
        recipientId: userId,
        ...(opts?.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  public async unreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { recipientId: userId, readAt: null },
    });
  }

  public async markRead(userId: string, notificationId: string): Promise<void> {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      select: { recipientId: true },
    });
    if (!notification || notification.recipientId !== userId) {
      throw new ForbiddenError("This notification does not belong to you");
    }
    await prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  public async markAllRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}

export const notificationService = new NotificationService();
