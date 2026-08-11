import { prisma } from "../../config/prisma";
import { BadRequestError, NotFoundError } from "../../utils/apiError";
import bcrypt from "bcrypt";
import { logActivity } from "../../utils/activityLogger";
import { ZeptoMailService } from "../external/zeptoMailService";
import { passwordChangedEmail } from "../../config/emailTemplates";

export class FdSettingsService {
  private emailService = new ZeptoMailService();

  private async fetchFullProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { userId },
      include: {
        userRole: { select: { roleName: true } },
        frontDeskProperties: { select: { id: true, name: true } },
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
      assignedProperties: user.frontDeskProperties,
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
      action: "FD_PROFILE_UPDATED",
      description: "Front desk officer updated their profile",
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
      action: "FD_PASSWORD_CHANGED",
      description: "Front desk officer changed their password",
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
}
