import { prisma } from "../../config/prisma";
import { BadRequestError, NotFoundError } from "../../utils/apiError";
import bcrypt from "bcrypt";
import { logActivity } from "../../utils/activityLogger";
import { ZeptoMailService } from "../external/zeptoMailService";
import { passwordChangedEmail } from "../../config/emailTemplates";
import type {
  FmUpdateNotificationPreferencesRequest,
  FmNotificationPreferences,
} from "../../dtos/facility-manager/fm.settings.dto";

const CRITICAL_FLAGS: Array<keyof FmUpdateNotificationPreferencesRequest> = [
  "fmEmailBudgetResponse",
  "fmEmailNewAgentVisit",
];

const CRITICAL_WARNINGS: Record<string, string> = {
  fmEmailBudgetResponse:
    "Disabling budget response notifications may cause you to miss time-sensitive approval decisions.",
  fmEmailNewAgentVisit:
    "Disabling new agent visit notifications may cause you to miss visit requests requiring action.",
};

export class FmSettingsService {
  private emailService = new ZeptoMailService();

  private async fetchFullProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { userId },
      include: {
        userRole: { select: { roleName: true } },
        managedProperties: { select: { id: true, name: true } },
        managedUnits: { select: { id: true, name: true } },
      },
    });
    if (!user) throw new NotFoundError("User not found");
    return user;
  }

  public async getProfile(userId: string) {
    const user = await this.fetchFullProfile(userId);
    return {
      userId: user.userId,
      userFullName: user.userFullName,
      userEmail: user.userEmail,
      userPhone: user.userPhone,
      userEmergencyContact: user.userEmergencyContact,
      userProfileUrl: user.userProfileUrl,
      role: user.userRole.roleName,
      managedProperties: user.managedProperties,
      managedUnits: user.managedUnits,
    };
  }

  public async updateProfile(
    userId: string,
    params: {
      userFullName?: string;
      userPhone?: string;
      userEmergencyContact?: string;
      userProfileUrl?: string;
    },
  ) {
    await prisma.user.update({
      where: { userId },
      data: {
        ...(params.userFullName !== undefined && { userFullName: params.userFullName }),
        ...(params.userPhone !== undefined && { userPhone: params.userPhone }),
        ...(params.userEmergencyContact !== undefined && {
          userEmergencyContact: params.userEmergencyContact,
        }),
        ...(params.userProfileUrl !== undefined && { userProfileUrl: params.userProfileUrl }),
      },
    });

    await logActivity({
      userId,
      action: "FM_PROFILE_UPDATED",
      description: "Facility manager updated their profile",
      metadata: { fields: Object.keys(params) },
    });

    return this.getProfile(userId);
  }

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
      action: "FM_PASSWORD_CHANGED",
      description: "Facility manager changed their password",
      metadata: {},
    });

    const pwChanged = passwordChangedEmail(
      user.userFullName?.split(" ")[0] || "there",
      new Date().toLocaleString(),
    );
    await this.emailService.sendEmail(
      { email: user.userEmail, name: user.userFullName ?? undefined },
      pwChanged.subject,
      pwChanged.html,
    );
  }

  public async getNotificationPreferences(userId: string): Promise<FmNotificationPreferences> {
    let settings = await prisma.notificationSetting.findUnique({ where: { userId } });
    if (!settings) {
      settings = await prisma.notificationSetting.create({ data: { userId } });
    }
    return {
      fmEmailNewTicket: settings.fmEmailNewTicket,
      fmEmailTenantMessage: settings.fmEmailTenantMessage,
      fmEmailAdminNote: settings.fmEmailAdminNote,
      fmEmailBudgetResponse: settings.fmEmailBudgetResponse,
      fmEmailNewAgentVisit: settings.fmEmailNewAgentVisit,
      fmEmailAgentReschedule: settings.fmEmailAgentReschedule,
      warnings: [],
    };
  }

  public async updateNotificationPreferences(
    userId: string,
    params: FmUpdateNotificationPreferencesRequest,
  ): Promise<FmNotificationPreferences> {
    const settings = await prisma.notificationSetting.upsert({
      where: { userId },
      update: {
        ...(params.fmEmailNewTicket !== undefined && { fmEmailNewTicket: params.fmEmailNewTicket }),
        ...(params.fmEmailTenantMessage !== undefined && {
          fmEmailTenantMessage: params.fmEmailTenantMessage,
        }),
        ...(params.fmEmailAdminNote !== undefined && { fmEmailAdminNote: params.fmEmailAdminNote }),
        ...(params.fmEmailBudgetResponse !== undefined && {
          fmEmailBudgetResponse: params.fmEmailBudgetResponse,
        }),
        ...(params.fmEmailNewAgentVisit !== undefined && {
          fmEmailNewAgentVisit: params.fmEmailNewAgentVisit,
        }),
        ...(params.fmEmailAgentReschedule !== undefined && {
          fmEmailAgentReschedule: params.fmEmailAgentReschedule,
        }),
      },
      create: { userId },
    });

    const warnings: string[] = [];
    for (const flag of CRITICAL_FLAGS) {
      if (params[flag] === false && CRITICAL_WARNINGS[flag]) {
        warnings.push(CRITICAL_WARNINGS[flag] as string);
      }
    }

    await logActivity({
      userId,
      action: "FM_NOTIFICATION_PREFERENCES_UPDATED",
      description: "Facility manager updated notification preferences",
      metadata: { changes: params },
    });

    return {
      fmEmailNewTicket: settings.fmEmailNewTicket,
      fmEmailTenantMessage: settings.fmEmailTenantMessage,
      fmEmailAdminNote: settings.fmEmailAdminNote,
      fmEmailBudgetResponse: settings.fmEmailBudgetResponse,
      fmEmailNewAgentVisit: settings.fmEmailNewAgentVisit,
      fmEmailAgentReschedule: settings.fmEmailAgentReschedule,
      warnings,
    };
  }
}

/**
 * Returns the FM's notification preferences for a given user ID.
 * Defaults to all enabled if no record exists (does not create one).
 */
export async function getFmNotificationPrefs(fmId: string) {
  const settings = await prisma.notificationSetting.findUnique({ where: { userId: fmId } });
  return {
    fmEmailNewTicket: settings?.fmEmailNewTicket ?? true,
    fmEmailTenantMessage: settings?.fmEmailTenantMessage ?? true,
    fmEmailAdminNote: settings?.fmEmailAdminNote ?? true,
    fmEmailBudgetResponse: settings?.fmEmailBudgetResponse ?? true,
    fmEmailNewAgentVisit: settings?.fmEmailNewAgentVisit ?? true,
    fmEmailAgentReschedule: settings?.fmEmailAgentReschedule ?? true,
  };
}
