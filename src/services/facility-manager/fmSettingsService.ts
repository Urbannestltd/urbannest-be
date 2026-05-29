import { prisma } from "../../config/prisma";
import { BadRequestError, NotFoundError } from "../../utils/apiError";
import bcrypt from "bcrypt";

export class FmSettingsService {
  public async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { userId },
      include: {
        managedProperties: { select: { id: true, name: true } },
        managedUnits: { select: { id: true, name: true } },
      },
    });

    if (!user) throw new NotFoundError("User not found");

    return {
      userId: user.userId,
      userFullName: user.userFullName,
      userEmail: user.userEmail,
      userPhone: user.userPhone,
      userEmergencyContact: user.userEmergencyContact,
      userProfileUrl: user.userProfileUrl,
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
    const updated = await prisma.user.update({
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

    return {
      userFullName: updated.userFullName,
      userPhone: updated.userPhone,
      userEmergencyContact: updated.userEmergencyContact,
      userProfileUrl: updated.userProfileUrl,
    };
  }

  public async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) throw new NotFoundError("User not found");

    if (!user.userPassword)
      throw new BadRequestError("No password set on this account");

    const isMatch = await bcrypt.compare(oldPassword, user.userPassword);
    if (!isMatch) throw new BadRequestError("Current password is incorrect");

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { userId },
      data: { userPassword: hashed },
    });
  }
}
