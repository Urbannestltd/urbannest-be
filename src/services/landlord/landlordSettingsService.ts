import { prisma } from "../../config/prisma";
import { BadRequestError, NotFoundError } from "../../utils/apiError";
import bcrypt from "bcrypt";
import { logActivity } from "../../utils/activityLogger";
import { ZeptoMailService } from "../external/zeptoMailService";
import { passwordChangedEmail } from "../../config/emailTemplates";
import type {
  LandlordUpdateProfileRequest,
  LandlordUpdateNotificationPreferencesRequest,
  LandlordProfileResponse,
  LandlordNotificationPreferences,
  LandlordTwoFaStatusResponse,
} from "../../dtos/landlord/landlord.settings.dto";

export class LandlordSettingsService {
  private emailService = new ZeptoMailService();

  private async fetchUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { userId },
      include: { userRole: { select: { roleName: true } } },
    });
    if (!user) throw new NotFoundError("User not found");
    return user;
  }

  private mapProfile(user: any): LandlordProfileResponse {
    return {
      userId: user.userId,
      userFullName: user.userFullName,
      userEmail: user.userEmail,
      userPhone: user.userPhone,
      userEmergencyContact: user.userEmergencyContact,
      userProfileUrl: user.userProfileUrl,
      role: user.userRole.roleName,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
    };
  }

  // ── Profile ────────────────────────────────────────────────────────────────

  public async getProfile(userId: string): Promise<LandlordProfileResponse> {
    const user = await this.fetchUser(userId);
    return this.mapProfile(user);
  }

  public async updateProfile(
    userId: string,
    params: LandlordUpdateProfileRequest,
  ): Promise<LandlordProfileResponse> {
    if (params.userEmail) {
      const existing = await prisma.user.findFirst({
        where: { userEmail: params.userEmail, userId: { not: userId } },
        select: { userId: true },
      });
      if (existing) throw new BadRequestError("Email address is already in use");
    }

    await prisma.user.update({
      where: { userId },
      data: {
        ...(params.userFullName !== undefined && { userFullName: params.userFullName }),
        ...(params.userEmail !== undefined && { userEmail: params.userEmail }),
        ...(params.userPhone !== undefined && { userPhone: params.userPhone }),
        ...(params.userEmergencyContact !== undefined && {
          userEmergencyContact: params.userEmergencyContact,
        }),
        ...(params.userProfileUrl !== undefined && { userProfileUrl: params.userProfileUrl }),
      },
    });

    await logActivity({
      userId,
      action: "LANDLORD_PROFILE_UPDATED",
      description: "Landlord updated their profile",
      metadata: { fields: Object.keys(params) },
    });

    return this.getProfile(userId);
  }

  // ── Password ───────────────────────────────────────────────────────────────

  public async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) throw new NotFoundError("User not found");
    if (!user.userPassword) throw new BadRequestError("No password set on this account");

    const isMatch = await bcrypt.compare(oldPassword, user.userPassword);
    if (!isMatch) throw new BadRequestError("Current password is incorrect");

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { userId },
      data: { userPassword: hashed },
    });

    await logActivity({
      userId,
      action: "LANDLORD_PASSWORD_CHANGED",
      description: "Landlord changed their password",
      metadata: {},
    });

    const email = passwordChangedEmail(
      user.userFullName?.split(" ")[0] || "there",
      new Date().toLocaleString(),
    );
    await this.emailService.sendEmail(
      { email: user.userEmail, name: user.userFullName ?? undefined },
      email.subject,
      email.html,
    );
  }

  // ── Notification Preferences ───────────────────────────────────────────────

  public async getNotificationPreferences(userId: string): Promise<LandlordNotificationPreferences> {
    let settings = await prisma.notificationSetting.findUnique({ where: { userId } });
    if (!settings) {
      settings = await prisma.notificationSetting.create({ data: { userId } });
    }
    return {
      emailPayments: settings.emailPayments,
      emailLease: settings.emailLease,
      emailMaintenance: settings.emailMaintenance,
      emailVisitors: settings.emailVisitors,
      pushPayments: settings.pushPayments,
      pushMaintenance: settings.pushMaintenance,
    };
  }

  public async updateNotificationPreferences(
    userId: string,
    params: LandlordUpdateNotificationPreferencesRequest,
  ): Promise<LandlordNotificationPreferences> {
    const settings = await prisma.notificationSetting.upsert({
      where: { userId },
      update: {
        ...(params.emailPayments !== undefined && { emailPayments: params.emailPayments }),
        ...(params.emailLease !== undefined && { emailLease: params.emailLease }),
        ...(params.emailMaintenance !== undefined && { emailMaintenance: params.emailMaintenance }),
        ...(params.emailVisitors !== undefined && { emailVisitors: params.emailVisitors }),
        ...(params.pushPayments !== undefined && { pushPayments: params.pushPayments }),
        ...(params.pushMaintenance !== undefined && { pushMaintenance: params.pushMaintenance }),
      },
      create: { userId },
    });

    await logActivity({
      userId,
      action: "LANDLORD_NOTIFICATION_PREFERENCES_UPDATED",
      description: "Landlord updated notification preferences",
      metadata: { changes: params },
    });

    return {
      emailPayments: settings.emailPayments,
      emailLease: settings.emailLease,
      emailMaintenance: settings.emailMaintenance,
      emailVisitors: settings.emailVisitors,
      pushPayments: settings.pushPayments,
      pushMaintenance: settings.pushMaintenance,
    };
  }

  // ── Two-Factor Authentication ──────────────────────────────────────────────

  public async getTwoFaStatus(userId: string): Promise<LandlordTwoFaStatusResponse> {
    const user = await prisma.user.findUnique({
      where: { userId },
      select: { isTwoFactorEnabled: true },
    });
    if (!user) throw new NotFoundError("User not found");
    return { isTwoFactorEnabled: user.isTwoFactorEnabled };
  }

  public async updateTwoFa(userId: string, enabled: boolean): Promise<LandlordTwoFaStatusResponse> {
    await prisma.user.update({
      where: { userId },
      data: {
        isTwoFactorEnabled: enabled,
        // Clear any pending OTP state when disabling
        ...(!enabled && { twoFactorSecret: null, twoFactorExpiry: null }),
      },
    });

    await logActivity({
      userId,
      action: enabled ? "LANDLORD_2FA_ENABLED" : "LANDLORD_2FA_DISABLED",
      description: `Landlord ${enabled ? "enabled" : "disabled"} two-factor authentication`,
      metadata: {},
    });

    return { isTwoFactorEnabled: enabled };
  }
}
