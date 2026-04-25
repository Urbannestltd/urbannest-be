import { BASE_URL } from "../../config/env";
import { getPermissionsForRole } from "../../config/rolePermissions";
import transporter from "../../config/nodemailer";
import { prisma } from "../../config/prisma";
import { AdminCreateUserRequest } from "../../dtos/admin/admin";
import { ApiResponse } from "../../dtos/apiResponse";
import { BadRequestError } from "../../utils/apiError";
import bcrypt from "bcrypt";
import { ZeptoMailService } from "../external/zeptoMailService";
import { registrationInviteEmail } from "../../config/emailTemplates";
import { Permission } from "@prisma/client";

export class AdminService {
  private zeptoMailService = new ZeptoMailService();
  public async createUser(
    params: AdminCreateUserRequest,
  ): Promise<ApiResponse<any>> {
    // check if user exists
    const userExists = await prisma.user.findUnique({
      where: { userEmail: params.userEmail, userStatus: { not: "PENDING" } },
    });

    if (userExists) {
      throw new BadRequestError("User with this email already exists");
    }

    // generate bcrypt hash with email as prefix then '$'
    const token: string = `${params.userEmail}$${bcrypt.hashSync(
      Math.floor(100000 + Math.random() * 900000).toString(),
      10,
    )}`;
    await prisma.user.upsert({
      where: { userEmail: params.userEmail },
      update: {
        registrationLinks: {
          create: {
            userRegistrationLinkToken: token,
            userRegistrationLinkExpiresAt: new Date(
              Date.now() + 24 * 60 * 60 * 1000,
            ),
          },
        },
      },
      create: {
        userEmail: params.userEmail,
        userStatus: "PENDING",
        registrationLinks: {
          create: {
            userRegistrationLinkToken: token,
            userRegistrationLinkExpiresAt: new Date(
              Date.now() + 24 * 60 * 60 * 1000,
            ),
          },
        },
        managedProperties: {},
        userRole: {
          connectOrCreate: {
            where: {
              roleName: params.userRole,
            },
            create: {
              roleName: params.userRole ? params.userRole : "TENANT",
            },
          },
        },
      },
    });

    // Look up property and unit names to include in the invite email
    let propertyName: string | undefined;
    let unitName: string | undefined;

    if (params.propertyId) {
      const property = await prisma.property.findUnique({
        where: { id: params.propertyId },
        select: { name: true },
      });
      propertyName = property?.name ?? undefined;
    }

    if (params.unitId) {
      const unit = await prisma.unit.findUnique({
        where: { id: params.unitId },
        select: {
          name: true,
          property: { select: { name: true } },
        },
      });
      unitName = unit?.name ?? undefined;
      // If no propertyId was given but the unit knows its property, use that
      if (!propertyName) propertyName = unit?.property?.name ?? undefined;
    }

    const { subject, html } = registrationInviteEmail(
      `${BASE_URL}/auth?token=${token}`,
      "24 hours",
      params.userRole,
      propertyName,
      unitName,
    );
    await this.zeptoMailService.sendEmail(
      { email: params.userEmail, name: params.userEmail },
      subject,
      html,
    );

    // const mailOptions = {
    //   from: {
    //     address: MAIL_USER as string,
    //     name: "Urbannest Support",
    //   },
    //   to: params.userEmail,
    //   subject: "Complete your Urbannest Registration",
    //   html: `<p>Click <a href="${BASE_URL}/auth?token=${token}">here</a> to complete your registration.<br><br>Please note this link expires in 24 hours, and remember to not share this URL with anyone.<br><br>Best Regards,<br>The Urbannest Team</p>`,
    // };

    // transporter.sendMail(mailOptions, (error, info) => {
    //   if (error) {
    //     new BadRequestError(error.message);
    //   }
    // });

    return {
      success: true,
      message: "Registration initiated",
      data: { userEmail: params.userEmail },
    };
  }

  public async suspendUser(
    userId: string,
    requestingAdminId: string,
  ): Promise<void> {
    if (userId === requestingAdminId) {
      throw new BadRequestError("You cannot suspend your own account");
    }

    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) throw new BadRequestError("User not found");

    await prisma.user.update({
      where: { userId },
      data: { userStatus: "BLOCKED" },
    });
  }

  public async activateUser(
    userId: string,
    requestingAdminId: string,
  ): Promise<void> {
    if (userId === requestingAdminId) {
      throw new BadRequestError("You cannot activate your own account");
    }

    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) throw new BadRequestError("User not found");

    await prisma.user.update({
      where: { userId },
      data: { userStatus: "ACTIVE" },
    });
  }

  public async getSystemSettings() {
    const setting = await prisma.systemSetting.findUnique({
      where: { id: "singleton" },
    });
    return {
      defaultMaintenanceBudget: setting?.defaultMaintenanceBudget ?? null,
    };
  }

  public async updateSystemSettings(params: {
    defaultMaintenanceBudget?: number | null;
  }) {
    const setting = await prisma.systemSetting.upsert({
      where: { id: "singleton" },
      update: {
        ...(params.defaultMaintenanceBudget !== undefined && {
          defaultMaintenanceBudget: params.defaultMaintenanceBudget,
        }),
      },
      create: {
        id: "singleton",
        defaultMaintenanceBudget: params.defaultMaintenanceBudget ?? null,
      },
    });
    return {
      defaultMaintenanceBudget: setting.defaultMaintenanceBudget ?? null,
    };
  }

  private mapUserProperties(u: any) {
    const propertyShape = (p: any) => ({ id: p.id, name: p.name });
    return {
      id: u.userId,
      fullName: u.userFullName,
      email: u.userEmail,
      phone: u.userPhone,
      role: u.userRole.roleName,
      status: u.userStatus,
      profileUrl: u.userProfileUrl,
      dateOfBirth: u.dateOfBirth,
      occupation: u.occupation,
      employer: u.employer,
      emergencyContact: u.userEmergencyContact,
      createdAt: u.userCreatedAt,
      permissions: u.permissions ?? [],
      properties: {
        asLandlord: (u.properties ?? []).map(propertyShape),
        asFacilityManager: (u.managedProperties ?? []).map(propertyShape),
        asAgent: (u.agentedProperties ?? []).map(propertyShape),
      },
    };
  }

  public async getUserMetrics(excludeAdminId: string) {
    const base = { userId: { not: excludeAdminId } };
    const [total, active, suspended] = await Promise.all([
      prisma.user.count({ where: base }),
      prisma.user.count({ where: { ...base, userStatus: "ACTIVE" } }),
      prisma.user.count({ where: { ...base, userStatus: "BLOCKED" } }),
    ]);
    return { total, active, suspended };
  }

  public async getAllUsers(
    excludeAdminId: string,
    filters?: {
      role?: string;
      status?: string;
      createdFrom?: string;
      createdTo?: string;
    },
  ) {
    const propertySelect = { select: { id: true, name: true } };

    const users = await prisma.user.findMany({
      where: {
        ...(filters?.status && { userStatus: filters.status }),
        ...(filters?.role && { userRole: { roleName: filters.role } }),
        ...((filters?.createdFrom || filters?.createdTo) && {
          userCreatedAt: {
            ...(filters.createdFrom && { gte: new Date(filters.createdFrom) }),
            ...(filters.createdTo && { lte: new Date(filters.createdTo) }),
          },
        }),
      },
      include: {
        userRole: true,
        leases: {
          where: { status: "ACTIVE" },
          include: {
            unit: {
              include: {
                property: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
        properties: propertySelect,
        managedProperties: propertySelect,
        agentedProperties: propertySelect,
      },
      orderBy: { userCreatedAt: "desc" },
    });

    const mapped = users.map((u) => this.mapUserProperties(u));

    // Requesting admin is always pinned first
    const adminIdx = mapped.findIndex((u) => u.id === excludeAdminId);
    if (adminIdx > 0) {
      mapped.unshift(...mapped.splice(adminIdx, 1));
    }

    return mapped;
  }

  public async getUserById(userId: string) {
    const propertySelect = { select: { id: true, name: true } };

    const user = await prisma.user.findUnique({
      where: { userId },
      include: {
        userRole: true,
        properties: propertySelect,
        managedProperties: propertySelect,
        agentedProperties: propertySelect,
      },
    });

    if (!user) throw new BadRequestError("User not found");

    return this.mapUserProperties(user);
  }

  public async changePassword(
    adminId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const admin = await prisma.user.findUnique({ where: { userId: adminId } });
    if (!admin) throw new BadRequestError("User not found");

    if (!admin.userPassword)
      throw new BadRequestError("No password set on this account");

    const isMatch = await bcrypt.compare(oldPassword, admin.userPassword);
    if (!isMatch) throw new BadRequestError("Current password is incorrect");

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { userId: adminId },
      data: { userPassword: hashed },
    });
  }

  public async getNotificationSettings(adminId: string) {
    let settings = await prisma.notificationSetting.findUnique({
      where: { userId: adminId },
    });

    if (!settings) {
      settings = await prisma.notificationSetting.create({
        data: { userId: adminId },
      });
    }

    return {
      emailPayments: settings.emailPayments,
      emailLease: settings.emailLease,
      emailMaintenance: settings.emailMaintenance,
      emailVisitors: settings.emailVisitors,
    };
  }

  public async updateNotificationSettings(
    adminId: string,
    params: {
      emailPayments?: boolean;
      emailLease?: boolean;
      emailMaintenance?: boolean;
      emailVisitors?: boolean;
    },
  ) {
    return prisma.notificationSetting.upsert({
      where: { userId: adminId },
      update: {
        ...(params.emailPayments !== undefined && {
          emailPayments: params.emailPayments,
        }),
        ...(params.emailLease !== undefined && {
          emailLease: params.emailLease,
        }),
        ...(params.emailMaintenance !== undefined && {
          emailMaintenance: params.emailMaintenance,
        }),
        ...(params.emailVisitors !== undefined && {
          emailVisitors: params.emailVisitors,
        }),
      },
      create: {
        userId: adminId,
        emailPayments: params.emailPayments ?? true,
        emailLease: params.emailLease ?? true,
        emailMaintenance: params.emailMaintenance ?? true,
        emailVisitors: params.emailVisitors ?? true,
      },
    });
  }

  public async updateUserPermissions(
    targetUserId: string,
    adminId: string,
    permissions: Permission[],
  ): Promise<void> {
    if (targetUserId === adminId) {
      throw new BadRequestError("Cannot modify your own permissions");
    }

    const user = await prisma.user.findUnique({
      where: { userId: targetUserId },
      include: { userRole: { select: { roleName: true } } },
    });
    if (!user) throw new BadRequestError("User not found");

    const allowed = getPermissionsForRole(user.userRole.roleName);
    const invalid = permissions.filter((p) => !allowed.includes(p));
    if (invalid.length > 0) {
      throw new BadRequestError(
        `The following permissions are not valid for role ${user.userRole.roleName}: ${invalid.join(", ")}`,
      );
    }

    await prisma.user.update({
      where: { userId: targetUserId },
      data: { permissions },
    });
  }

  public async getUserActivityLogs(userId: string): Promise<
    {
      id: string;
      userId: string;
      action: string;
      description: string;
      ipAddress: string | null;
      createdAt: Date;
    }[]
  > {
    const logs = await prisma.activityLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      action: log.action,
      description: log.description,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
    }));
  }
}
