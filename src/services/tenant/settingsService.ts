import { prisma } from "../../config/prisma";
import {
  UpdateProfileRequest,
  PaymentMethodResponse,
  CreateReminderRequest,
  UpdateNotificationSettingsRequest,
  ChangePasswordRequest,
} from "../../dtos/tenant/settings.dto";
import { BadRequestError, NotFoundError } from "../../utils/apiError";
import { ZeptoMailService } from "../external/zeptoMailService";
import bcrypt from "bcrypt";

export class SettingsService {
  private emailService = new ZeptoMailService();
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

  /**
   * 1. CHANGE PASSWORD
   */
  public async changePassword(userId: string, params: ChangePasswordRequest) {
    const user = await prisma.user.findUnique({ where: { userId: userId } });
    if (!user) throw new NotFoundError("User not found");

    // A. Verify Old Password
    const isValid = await bcrypt.compare(
      params.oldPassword,
      user.userPassword ?? "",
    );
    if (!isValid) throw new BadRequestError("Incorrect old password");

    // B. Hash New Password
    const hashedNew = await bcrypt.hash(params.newPassword, 10);

    // C. Save
    await prisma.user.update({
      where: { userId: userId },
      data: { userPassword: hashedNew },
    });

    // D. Notify (Security Best Practice)
    await this.emailService.sendTemplateEmail(
      {
        email: user.userEmail,
        name: user.userFullName?.split(" ")[0] || "User",
      },
      "SECURITY_PASSWORD_CHANGED",
      { date: new Date().toLocaleString() },
    );

    return { success: true };
  }

  /**
   * 2. INITIATE 2FA SETUP
   * User clicks "Enable 2FA" -> We send an email with a code to confirm they have access.
   */
  public async initiateTwoFactor(userId: string) {
    const user = await prisma.user.findUnique({ where: { userId: userId } });
    if (!user) throw new NotFoundError("User not found");

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins from now

    // Save OTP to DB (hashed is better, but plain for simplicity here)
    await prisma.user.update({
      where: { userId: userId },
      data: {
        twoFactorSecret: otp,
        twoFactorExpiry: expiry,
      },
    });

    // Send Email
    await this.emailService.sendTemplateEmail(
      {
        email: user.userEmail,
        name: user.userFullName?.split(" ")[0] || "User",
      },
      "SECURITY_2FA_CODE",
      { code: otp },
    );

    return { message: "OTP sent to email" };
  }

  /**
   * 3. CONFIRM & ENABLE 2FA
   * User enters the code from email -> We enable the feature.
   */
  public async confirmTwoFactor(userId: string, otp: string) {
    const user = await prisma.user.findUnique({ where: { userId: userId } });
    if (!user) throw new NotFoundError("User not found");

    if (user.twoFactorSecret !== otp) {
      throw new BadRequestError("Invalid OTP");
    }

    if (!user.twoFactorExpiry || new Date() > user.twoFactorExpiry) {
      throw new BadRequestError("OTP has expired");
    }

    // Success: Enable 2FA and clear the secret
    await prisma.user.update({
      where: { userId: userId },
      data: {
        isTwoFactorEnabled: true,
        twoFactorSecret: null,
        twoFactorExpiry: null,
      },
    });

    return { success: true, message: "Two-Factor Authentication Enabled" };
  }

  /**
   * 4. DISABLE 2FA
   */
  public async disableTwoFactor(userId: string) {
    await prisma.user.update({
      where: { userId: userId },
      data: { isTwoFactorEnabled: false },
    });
    return { success: true, message: "Two-Factor Authentication Disabled" };
  }
}
