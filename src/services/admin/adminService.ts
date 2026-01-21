import { BASE_URL, MAIL_USER } from "../../config/env";
import transporter from "../../config/nodemailer";
import { prisma } from "../../config/prisma";
import { AdminCreateUserRequest } from "../../dtos/admin/admin";
import { ApiResponse } from "../../dtos/apiResponse";
import { BadRequestError } from "../../utils/apiError";
import bcrypt from "bcrypt";

export class AdminService {
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
        userRole: {
          connectOrCreate: {
            where: {
              roleName: "TENANT",
            },
            create: {
              roleName: "TENANT",
            },
          },
        },
      },
    });

    const mailOptions = {
      from: {
        address: MAIL_USER as string,
        name: "Urbannest Support",
      },
      to: params.userEmail,
      subject: "Complete your Urbannest Registration",
      html: `<p>Click <a href="${BASE_URL}/auth?token=${token}">here</a> to complete your registration.<br><br>Please note this link expires in 24 hours, and remember to not share this URL with anyone.<br><br>Best Regards,<br>The Urbannest Team</p>`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        new BadRequestError(error.message);
      }
    });

    return {
      success: true,
      message: "Registration initiated",
      data: { userEmail: params.userEmail },
    };
  }
}
