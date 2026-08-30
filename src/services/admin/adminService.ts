import { BASE_URL } from "../../config/env";
import { getPermissionsForRole } from "../../config/rolePermissions";
import transporter from "../../config/nodemailer";
import { prisma } from "../../config/prisma";
import { AdminCreateUserRequest } from "../../dtos/admin/admin";
import { ApiResponse } from "../../dtos/apiResponse";
import { BadRequestError } from "../../utils/apiError";
import { SessionService } from "../sessionService";
import bcrypt from "bcrypt";
import { ZeptoMailService } from "../external/zeptoMailService";
import { registrationInviteEmail, officialNoticeEmail } from "../../config/emailTemplates";
import { Permission } from "@prisma/client";
import { date } from "zod";
import { logActivity } from "../../utils/activityLogger";
import { notificationService } from "../notificationService";
import { SendNoticeDto } from "../../dtos/admin/notice.dto";
import { NotFoundError } from "../../utils/apiError";

export class AdminService {
  private zeptoMailService = new ZeptoMailService();

  private readonly SLA = {
    EMERGENCY: { responseHours: 1, fixHours: 4 },
    HIGH: { responseHours: 4, fixHours: 24 },
    MEDIUM: { responseHours: 24, fixHours: 72 },
    LOW: { responseHours: 72, fixHours: 168 },
  };

  /**
   * Per-property maintenance metrics for a facility manager, shown on their
   * admin user-detail page. "Last inspection" has no dedicated tracking in
   * the system — it's approximated as the FM's most recent message on any
   * ticket for that property (their last hands-on engagement with it).
   */
  private async getFmPropertyMetrics(
    facilityManagerId: string,
    propertyId: string,
  ) {
    const [tickets, lastFmMessage] = await Promise.all([
      prisma.maintenanceRequest.findMany({
        where: { unit: { propertyId } },
        select: {
          status: true,
          priority: true,
          createdAt: true,
          messages: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      }),
      prisma.maintenanceMessage.findFirst({
        where: {
          senderId: facilityManagerId,
          ticket: { unit: { propertyId } },
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

    const now = new Date();
    const activeOrders = tickets.filter(
      (t) => !["RESOLVED", "FIXED", "CANCELLED"].includes(t.status),
    ).length;

    const responseTimes = tickets
      .filter((t) => t.messages.length > 0)
      .map(
        (t) =>
          (t.messages[0]!.createdAt.getTime() - t.createdAt.getTime()) / 60000,
      );
    const responseTimeMinutes =
      responseTimes.length > 0
        ? Math.round(
            responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
          )
        : null;

    let maintenanceScore: number | null = null;
    if (tickets.length > 0) {
      const onTimeCount = tickets.filter((t) => {
        const sla =
          this.SLA[t.priority as keyof typeof this.SLA] ?? this.SLA.MEDIUM;
        const deadline = new Date(
          t.createdAt.getTime() + sla.responseHours * 60 * 60 * 1000,
        );
        const firstMessage = t.messages[0] ?? null;
        const isResolved = ["RESOLVED", "FIXED", "CANCELLED"].includes(
          t.status,
        );
        const isLate = firstMessage
          ? firstMessage.createdAt > deadline
          : !isResolved && now > deadline;
        return !isLate;
      }).length;
      const resolvedCount = tickets.filter((t) =>
        ["RESOLVED", "FIXED"].includes(t.status),
      ).length;

      const responseComplianceRate = onTimeCount / tickets.length;
      const resolutionRate = resolvedCount / tickets.length;
      maintenanceScore = Math.round(
        ((responseComplianceRate + resolutionRate) / 2) * 100,
      );
    }

    return {
      responseTimeMinutes,
      maintenanceScore,
      activeOrders,
      lastInspection: lastFmMessage?.createdAt ?? null,
    };
  }

  /**
   * Per-property metrics for a landlord, shown on their admin user-detail
   * page: assigned value, status, open lead count, and date listed.
   * "Status" has no stored field on `property` — it's derived from whether
   * any non-deleted unit is currently AVAILABLE.
   */
  private async getLandlordPropertyMetrics(propertyIds: string[]) {
    const metrics = new Map<
      string,
      {
        assignedValue: number;
        status: "Available" | "Off Market";
        numberOfLeads: number;
        dateListed: Date;
      }
    >();
    if (propertyIds.length === 0) return metrics;

    const properties = await prisma.property.findMany({
      where: { id: { in: propertyIds } },
      select: {
        id: true,
        price: true,
        createdAt: true,
        units: {
          where: { status: { not: "DELETED" } },
          select: { status: true },
        },
        _count: {
          select: {
            agentLeads: { where: { status: { notIn: ["WITHDRAWN", "REJECTED"] } } },
          },
        },
      },
    });

    for (const p of properties) {
      metrics.set(p.id, {
        assignedValue: p.price ?? 0,
        status: p.units.some((u) => u.status === "AVAILABLE")
          ? "Available"
          : "Off Market",
        numberOfLeads: p._count.agentLeads,
        dateListed: p.createdAt,
      });
    }
    return metrics;
  }

  public async createUser(
    params: AdminCreateUserRequest,
    adminId?: string,
  ): Promise<ApiResponse<any>> {
    // check if user exists (including PENDING users so we can track isNewUser)
    const existingUser = await prisma.user.findUnique({
      where: { userEmail: params.userEmail },
    });

    // Gracefully handle re-inviting a previously deleted account.
    // The delete flow anonymises the email, but if it didn't complete
    // (e.g. migration not yet deployed when the delete ran), the original
    // email may still be on the record. Free it up now so the upsert
    // below creates a completely fresh record.
    if (existingUser?.isDeleted || existingUser?.userStatus === "DELETED") {
      await prisma.user.update({
        where: { userId: existingUser.userId },
        data: { userEmail: `deleted_${existingUser.userId}@deleted.invalid` },
      });
      // Fall through as a brand-new user — upsert will take the create path
    }

    const isCleanSlate =
      !existingUser ||
      existingUser.isDeleted ||
      existingUser.userStatus === "DELETED";

    if (!isCleanSlate && existingUser!.userStatus !== "PENDING") {
      throw new BadRequestError("A user with this email already exists");
    }

    const isNewUser = isCleanSlate;

    const isTenantRole = !params.userRole || params.userRole === "TENANT";

    if (isTenantRole && !params.unitId) {
      throw new BadRequestError("unitId is required when creating a tenant");
    }

    let getUnit: Awaited<ReturnType<typeof prisma.unit.findUnique>> = null;
    if (params.unitId) {
      getUnit = await prisma.unit.findUnique({
        where: { id: params.unitId },
        include: { property: true },
      });
      if (!getUnit) {
        throw new BadRequestError("Specified unit does not exist");
      }
    }

    // generate bcrypt hash with email as prefix then '$'
    const token: string = `${params.userEmail}$${bcrypt.hashSync(
      Math.floor(100000 + Math.random() * 900000).toString(),
      10,
    )}`;
    const newUser = await prisma.user.upsert({
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
        permissions: getPermissionsForRole(params.userRole ?? "TENANT"),
        registrationLinks: {
          create: {
            userRegistrationLinkToken: token,
            userRegistrationLinkExpiresAt: new Date(
              Date.now() + 24 * 60 * 60 * 1000,
            ),
          },
        },
        ...(getUnit && {
          leases: {
            create: {
              unitId: getUnit.id,
              rentAmount: getUnit.baseRent || 0,
              serviceCharge: 0,
              startDate: new Date(),
              endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            },
          },
        }),
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

    // Auto-create an initial PAID payment for the default lease (new users only)
    const baseRent = getUnit?.baseRent ?? 0;
    if (isNewUser && getUnit && baseRent > 0) {
      const defaultLease = await prisma.lease.findFirst({
        where: { tenantId: newUser.userId, unitId: getUnit.id },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      if (defaultLease) {
        await prisma.payment.create({
          data: {
            userId: newUser.userId,
            leaseId: defaultLease.id,
            amount: baseRent,
            dueDate: new Date(),
            paidDate: new Date(),
            status: "PAID",
            reference: `DEFAULT-${newUser.userId}-${Date.now()}`,
            type: "RENT",
            metadata: {
              note: "Auto-generated initial payment on default lease creation",
            },
          },
        });
      }
    }

    // Look up property and unit names to include in the invite email
    let propertyName: string | undefined;
    let unitName: string | undefined;

    if (params.propertyId) {
      const property = await prisma.property.findUnique({
        where: { id: params.propertyId },
        select: { name: true },
      });
      if (!property)
        throw new BadRequestError("Specified property does not exist");
      propertyName = property.name ?? undefined;

      // A propertyId + one of these roles means "assign this new/invited user to
      // this property" — not just a label for the invite email. Without this,
      // the property field is accepted by the API but silently has no effect.
      const propertyAssignmentField = {
        LANDLORD: "landlordId",
        FACILITY_MANAGER: "facilityManagerId",
        AGENT: "agentId",
        FRONT_DESK: "frontDeskId",
      }[params.userRole as string];

      if (propertyAssignmentField) {
        await prisma.property.update({
          where: { id: params.propertyId },
          data: { [propertyAssignmentField]: newUser.userId },
        });
        if (adminId) {
          void logActivity({
            userId: adminId,
            action: "ADMIN_ASSIGNED_PROPERTY_MEMBER",
            description: `Assigned user ${newUser.userId} as ${params.userRole} on property ${params.propertyId} at creation`,
            metadata: {
              propertyId: params.propertyId,
              role: params.userRole,
              assignedUserId: newUser.userId,
            },
          });
        }
      }
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
      data: { userEmail: params.userEmail, userId: newUser.userId },
    };
  }

  private sessionService = new SessionService();

  public async suspendUser(
    userId: string,
    requestingAdminId: string,
  ): Promise<void> {
    if (userId === requestingAdminId) {
      throw new BadRequestError("You cannot suspend your own account");
    }

    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user || user.isDeleted) throw new BadRequestError("User not found");

    await Promise.all([
      prisma.user.update({
        where: { userId },
        data: { userStatus: "BLOCKED" },
      }),
      this.sessionService.invalidateAllUserSessions(userId),
    ]);
  }

  public async activateUser(
    userId: string,
    requestingAdminId: string,
  ): Promise<void> {
    if (userId === requestingAdminId) {
      throw new BadRequestError("You cannot activate your own account");
    }

    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user || user.isDeleted) throw new BadRequestError("User not found");

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

    // Apply the new global budget to all open tickets that have not been
    // custom-set. approvalStatus being null means the budget (if any) was
    // only ever auto-filled by the global default, never touched by an admin.
    if (params.defaultMaintenanceBudget != null) {
      await prisma.maintenanceRequest.updateMany({
        where: {
          status: { in: ["PENDING", "IN_PROGRESS", "WORK_SCHEDULED"] },
          approvalStatus: null,
        },
        data: { budget: params.defaultMaintenanceBudget },
      });
    }

    return {
      defaultMaintenanceBudget: setting.defaultMaintenanceBudget ?? null,
    };
  }

  private mapUserProperties(u: any) {
    const propertyShape = (p: any) => ({ id: p.id, name: p.name });
    const activeLease = (u.leases ?? []).find(
      (l: any) => l.status === "ACTIVE",
    );

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
      currentUnit: activeLease
        ? {
            leaseId: activeLease.id,
            unitId: activeLease.unit.id,
            unitName: activeLease.unit.name,
            unitFloor: activeLease.unit.floor,
            propertyId: activeLease.unit.property.id,
            propertyName: activeLease.unit.property.name,
            propertyImages: activeLease.unit.property.images,
            dateListed: activeLease.unit.property.createdAt,
            dateMovedIn: activeLease.startDate,
          }
        : null,
    };
  }

  public async getUserMetrics(excludeAdminId: string) {
    const base = { userId: { not: excludeAdminId }, isDeleted: false };
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
      search?: string;
    },
  ) {
    const propertySelect = {
      where: { isDeleted: false },
      select: { id: true, name: true },
    };
    const q = filters?.search?.trim();

    const users = await prisma.user.findMany({
      where: {
        isDeleted: false,
        // When no status filter is applied, hide INACTIVE users (displaced tenants) by default
        ...(filters?.status
          ? { userStatus: filters.status }
          : { userStatus: { not: "INACTIVE" } }),
        ...(filters?.role && { userRole: { roleName: filters.role } }),
        ...((filters?.createdFrom || filters?.createdTo) && {
          userCreatedAt: {
            ...(filters.createdFrom && { gte: new Date(filters.createdFrom) }),
            ...(filters.createdTo && { lte: new Date(filters.createdTo) }),
          },
        }),
        ...(q && {
          OR: [
            { userFullName: { contains: q, mode: "insensitive" } },
            { userEmail: { contains: q, mode: "insensitive" } },
            { userPhone: { contains: q, mode: "insensitive" } },
          ],
        }),
      },
      include: {
        userRole: true,
        leases: {
          where: { status: "ACTIVE" },
          orderBy: { createdAt: "desc" },
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
    const propertySelect = {
      where: { isDeleted: false },
      select: { id: true, name: true },
    };

    const user = await prisma.user.findUnique({
      where: { userId, isDeleted: false },
      include: {
        userRole: true,
        leases: {
          where: { status: "ACTIVE" },
          orderBy: { createdAt: "desc" },
          include: {
            unit: {
              include: {
                property: { select: { id: true, name: true } },
              },
            },
          },
        },
        properties: propertySelect,
        managedProperties: propertySelect,
        agentedProperties: propertySelect,
      },
    });

    if (!user) throw new BadRequestError("User not found");

    const mapped = this.mapUserProperties(user);

    if (mapped.properties.asLandlord.length > 0) {
      const landlordMetrics = await this.getLandlordPropertyMetrics(
        mapped.properties.asLandlord.map((p: { id: string }) => p.id),
      );
      mapped.properties.asLandlord = mapped.properties.asLandlord.map(
        (p: { id: string; name: string }) => ({
          ...p,
          ...landlordMetrics.get(p.id),
        }),
      );
    }

    if (mapped.properties.asFacilityManager.length > 0) {
      const metrics = await Promise.all(
        mapped.properties.asFacilityManager.map((p: { id: string }) =>
          this.getFmPropertyMetrics(userId, p.id),
        ),
      );
      mapped.properties.asFacilityManager =
        mapped.properties.asFacilityManager.map(
          (p: { id: string; name: string }, i: number) => ({
            ...p,
            ...metrics[i],
          }),
        );
    }

    return mapped;
  }

  /**
   * Admin-authored "Send Notice" — always creates the in-app notification;
   * emails the recipient too unless they've turned off `emailNotices`.
   */
  public async sendNotice(userId: string, adminId: string, dto: SendNoticeDto) {
    const recipient = await prisma.user.findUnique({
      where: { userId },
      select: { userEmail: true, userFullName: true },
    });
    if (!recipient) throw new NotFoundError("User not found");

    await notificationService.notify({
      recipientId: userId,
      senderId: adminId,
      type: "NOTICE",
      title: dto.title,
      body: dto.message,
    });

    if (await notificationService.isEmailEnabled(userId, "emailNotices")) {
      const { subject, html } = officialNoticeEmail(
        recipient.userFullName ?? "there",
        dto.title,
        dto.message,
      );
      await this.zeptoMailService.sendEmail(
        { email: recipient.userEmail, name: recipient.userFullName ?? undefined },
        subject,
        html,
      );
    }
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

  public async deleteUser(
    userId: string,
    requestingAdminId: string,
  ): Promise<void> {
    if (userId === requestingAdminId) {
      throw new BadRequestError("You cannot delete your own account");
    }

    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) throw new BadRequestError("User not found");
    if (user.isDeleted) throw new BadRequestError("User is already deleted");

    await prisma.$transaction(async (tx) => {
      // Anonymize email so the original can be re-used on a new account
      const anonymizedEmail = `deleted_${userId}@deleted.invalid`;

      await tx.user.update({
        where: { userId },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          userStatus: "DELETED",
          userEmail: anonymizedEmail,
        },
      });

      // Invalidate all active sessions
      await tx.session.updateMany({
        where: { userId, isValid: true },
        data: { isValid: false },
      });

      // Remove from property assignments
      await tx.property.updateMany({
        where: { landlordId: userId },
        data: { landlordId: null },
      });
      await tx.property.updateMany({
        where: { facilityManagerId: userId },
        data: { facilityManagerId: null },
      });
      await tx.property.updateMany({
        where: { agentId: userId },
        data: { agentId: null },
      });

      // Remove from unit assignments
      await tx.unit.updateMany({
        where: { landlordId: userId },
        data: { landlordId: null },
      });
      await tx.unit.updateMany({
        where: { facilityManagerId: userId },
        data: { facilityManagerId: null },
      });

      // Terminate active leases
      await tx.lease.updateMany({
        where: { tenantId: userId, status: "ACTIVE" },
        data: { status: "TERMINATED" },
      });

      // Cancel open maintenance requests raised by this tenant
      await tx.maintenanceRequest.updateMany({
        where: {
          tenantId: userId,
          status: { notIn: ["RESOLVED", "FIXED", "CANCELLED"] },
        },
        data: { status: "CANCELLED" },
      });

      // Unassign maintenance requests assigned to this user
      await tx.maintenanceRequest.updateMany({
        where: { assignedToId: userId },
        data: { assignedToId: null },
      });
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
