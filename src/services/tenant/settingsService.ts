import { prisma } from "../../config/prisma";
import {
  UpdateProfileRequest,
  PaymentMethodResponse,
  CreateReminderRequest,
  UpdateNotificationSettingsRequest,
} from "../../dtos/tenant/settings.dto";
import { BadRequestError, NotFoundError } from "../../utils/apiError";

export class SettingsService {
  /**
   * 1. GET FULL PROFILE
   * Populates the "Account Information" screen.
   */
  public async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { userId },
      include: {
        paymentMethods: true, // Include saved cards
      },
    });

    if (!user) throw new NotFoundError("User not found");

    return {
      // Personal Info
      userFullName: user.userFullName,
      userEmail: user.userEmail, // Read Only
      userPhone: user.userPhone,
      userEmergencyContact: user.userEmergencyContact,
      userProfileUrl: user.userProfileUrl,

      // Payment Methods List
      savedCards: user.paymentMethods.map((card) => ({
        id: card.id,
        brand: card.cardType,
        last4: card.last4,
        bank: card.bank,
        expiry: `${card.expMonth}/${card.expYear}`,
        isDefault: card.isDefault,
      })),
    };
  }

  /**
   * 2. UPDATE PERSONAL INFO & AVATAR
   * Handles the "Save Changes" button.
   */
  public async updateProfile(userId: string, params: UpdateProfileRequest) {
    const updatedUser = await prisma.user.update({
      where: { userId },
      data: {
        userFullName: params.userFullName,
        userEmail: params.userEmail, // Read Only
        userPhone: params.userPhone,
        userEmergencyContact: params.userEmergencyContact,
        userProfileUrl: params.userProfileUrl,
      },
    });

    return {
      success: true,
      user: {
        userFullName: updatedUser.userFullName,
        userProfileUrl: updatedUser.userProfileUrl,
      },
    };
  }

  /**
   * 3. DELETE SAVED CARD
   * User clicks "Trash" icon on a payment method.
   */
  public async removePaymentMethod(userId: string, cardId: string) {
    // Ensure the card belongs to this user
    const card = await prisma.paymentMethod.findFirst({
      where: { id: cardId, userId },
    });

    if (!card) throw new NotFoundError("Card not found");

    await prisma.paymentMethod.delete({
      where: { id: cardId },
    });

    return { success: true, message: "Payment method removed" };
  }

  public async getNotificationSettings(userId: string) {
    let settings = await prisma.notificationSetting.findUnique({
      where: { userId },
    });

    if (!settings) {
      settings = await prisma.notificationSetting.create({
        data: { userId }, // Defaults are all TRUE
      });
    }

    return {
      emailPayments: settings.emailPayments,
      emailLease: settings.emailLease,
      emailMaintenance: settings.emailMaintenance,
      emailVisitors: settings.emailVisitors,
    };
  }

  /**
   * 5. UPDATE NOTIFICATION PREFERENCES
   * Toggling the checkboxes in the UI.
   */
  public async updateNotificationSettings(
    userId: string,
    params: UpdateNotificationSettingsRequest,
  ) {
    const settings = await prisma.notificationSetting.upsert({
      where: { userId },
      update: {
        emailPayments: params.emailPayments,
        emailLease: params.emailLease,
        emailMaintenance: params.emailMaintenance,
        emailVisitors: params.emailVisitors,
      },
      create: {
        userId,
        emailPayments: params.emailPayments ?? true,
        emailLease: params.emailLease ?? true,
        emailMaintenance: params.emailMaintenance ?? true,
        emailVisitors: params.emailVisitors ?? true,
      },
    });

    return settings;
  }

  /**
   * 6. CREATE REMINDER
   * User adds a personal reminder.
   */
  public async createReminder(userId: string, params: CreateReminderRequest) {
    if (params.dueAt < new Date()) {
      throw new BadRequestError("Reminder time must be in the future.");
    }

    const reminder = await prisma.reminder.create({
      data: {
        userId,
        title: params.title,
        description: params.description,
        dueAt: params.dueAt,
      },
    });

    return reminder;
  }

  /**
   * 7. GET REMINDERS
   * List upcoming reminders.
   */
  public async getReminders(userId: string) {
    return prisma.reminder.findMany({
      where: { userId, isSent: false }, // Only show pending reminders
      orderBy: { dueAt: "asc" },
    });
  }

  /**
   * 8. DELETE REMINDER
   */
  public async deleteReminder(userId: string, reminderId: string) {
    const reminder = await prisma.reminder.findFirst({
      where: { id: reminderId, userId },
    });

    if (!reminder) throw new NotFoundError("Reminder not found");

    await prisma.reminder.delete({ where: { id: reminderId } });

    return { success: true };
  }
}
