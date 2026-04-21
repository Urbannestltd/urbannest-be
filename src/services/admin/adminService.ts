import { BASE_URL, MAIL_USER } from "../../config/env";
import transporter from "../../config/nodemailer";
import { prisma } from "../../config/prisma";
import { AdminCreateUserRequest } from "../../dtos/admin/admin";
import { ApiResponse } from "../../dtos/apiResponse";
import { BadRequestError } from "../../utils/apiError";
import bcrypt from "bcrypt";
import { ZeptoMailService } from "../external/zeptoMailService";
import { EMAIL_TEMPLATES } from "../../config/emailTemplates";

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

    this.zeptoMailService.sendTemplateEmail(
      { email: params.userEmail, name: "Tenant" },
      EMAIL_TEMPLATES.REGISTER_LINK,
      {
        Link: `${BASE_URL}/auth?token=${token}`,
        valid_time: "24 hours",
        support_id: "support@urbannesttech.com",
      },
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
      properties: {
        asLandlord: (u.properties ?? []).map(propertyShape),
        asFacilityManager: (u.managedProperties ?? []).map(propertyShape),
        asAgent: (u.agentedProperties ?? []).map(propertyShape),
      },
    };
  }

  public async getAllUsers(excludeAdminId: string) {
    const propertySelect = { select: { id: true, name: true } };

    const users = await prisma.user.findMany({
      where: { userId: { not: excludeAdminId } },
      include: {
        userRole: true,
        properties: propertySelect,
        managedProperties: propertySelect,
        agentedProperties: propertySelect,
      },
      orderBy: { userCreatedAt: "desc" },
    });

    return users.map((u) => this.mapUserProperties(u));
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

    if (!admin.userPassword) throw new BadRequestError("No password set on this account");

    const isMatch = await bcrypt.compare(oldPassword, admin.userPassword);
    if (!isMatch) throw new BadRequestError("Current password is incorrect");

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { userId: adminId },
      data: { userPassword: hashed },
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
