import { prisma } from "../config/prisma";
import {
  ForgotPasswordRequest,
  GoogleLoginRequest,
  RegisterRequest,
  LoginRequest,
  ResetPasswordRequest,
  VerifyOtpRequest,
} from "../dtos/auth.dto";
import {
  UnauthorizedError,
  ConflictError,
  BadRequestError,
  NotFoundError,
} from "../utils/apiError";
import * as jwt from "jsonwebtoken";
import * as bcrypt from "bcrypt";
import { ApiResponse } from "../dtos/apiResponse";
import { GOOGLE_CLIENT_ID, JWTSECRET, MAIL_USER } from "../config/env";
import { OAuth2Client } from "google-auth-library";
import sendEmail from "../config/resend";
import transporter from "../config/nodemailer";

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

export class AuthenticationService {
  public async register(
    params: RegisterRequest,
    token: string
  ): Promise<ApiResponse<any>> {
    const hashedPassword = await bcrypt.hash(params.userPassword, 10);

    const email = token.split("$$")[0];

    const userExists = await prisma.user.findUnique({
      where: { userEmail: email, userStatus: "ACTIVE" },
    });

    if (userExists)
      throw new BadRequestError("User with this email already exists");

    const regLinkCheck = await prisma.userRegistrationLink.findUnique({
      where: { userRegistrationLinkToken: token },
    });

    if (!regLinkCheck)
      throw new BadRequestError("Invalid registration token provided");

    if (regLinkCheck.userRegistrationLinkExpiresAt < new Date())
      throw new BadRequestError("Registration token has expired");

    const newUser = await prisma.user.update({
      where: { userEmail: email },
      data: {
        userFullName: params.userFullName,
        userPhone: params.userPhone,
        userPassword: hashedPassword,
        registrationLinks: {
          update: {
            where: { userRegistrationLinkToken: token },
            data: { userRegistrationLinkUsed: true },
          },
        },
        userRole: {
          connectOrCreate: {
            where: {
              roleName: params.userRoleName,
            },
            create: {
              roleName: params.userRoleName,
            },
          },
        },
        userStatus: "ACTIVE",
      },
    });

    // console.log(`[EMAIL SERVICE] Sending OTP to ${params.userEmail}: ${otp}`);
    // sendEmail(
    //   params.userEmail,
    //   "Verify your Email for Urbannest",
    //   `<p>Your OTP code is: <strong>${otp}</strong></p><p>This code will expire in 10 minutes.</p><br><br>Best Regards,<br>The Urbannest Team`
    // );

    // const mailOptions = {
    //   from: {
    //     address: MAIL_USER as string,
    //     name: "Urbannest Support",
    //   },
    //   to: params.userEmail,
    //   subject: "Verify your Email for Urbannest",
    //   html: `<p>Your OTP code is: <strong>${otp}</strong></p><p>This code will expire in 10 minutes.</p><br><br>Best Regards,<br>The Urbannest Team`,
    // };

    // transporter.sendMail(mailOptions, (error, info) => {
    //   if (error) {
    //     new BadRequestError(error.message);
    //   }
    // });

    return {
      success: true,
      message: "Registration completed successfully",
      data: { userId: newUser.userId },
    };
  }

  public async verifyOtp(params: VerifyOtpRequest) {
    const user = await prisma.user.findUnique({
      where: { userEmail: params.email },
      select: {
        userId: true,
        otpLogs: {
          where: {
            AND: [{ otpLogStatus: "ACTIVE", otpLogExpiry: { gt: new Date() } }],
          },
          select: {
            otpLogId: true,
            otpLogHash: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundError("User not found");

    const otpCompare: string = user.otpLogs[0]?.otpLogHash ?? "";

    const otpHashCompare = await bcrypt.compare(params.otp, otpCompare);

    if (!otpHashCompare) {
      throw new BadRequestError("Invalid or Expired OTP, Please try again");
    }

    await prisma.user.update({
      where: { userId: user.userId },
      data: {
        userStatus: "ACTIVE",
      },
    });

    await prisma.otpLogs.update({
      where: {
        otpLogId: user.otpLogs[0]?.otpLogId ?? "",
      },
      data: {
        otpLogStatus: "INACTIVE",
      },
    });

    return { success: true, message: "Account verified successfully" };
  }

  public async login(params: LoginRequest) {
    const user = await prisma.user.findUnique({
      where: { userEmail: params.email },
      include: { userRole: true },
    });

    if (
      !user ||
      !(await bcrypt.compare(params.password, user.userPassword ?? ""))
    ) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (user.userStatus !== "ACTIVE") {
      throw new UnauthorizedError(
        "Account is not active. Please verify your email."
      );
    }

    const token = jwt.sign(
      {
        userId: user.userId,
        email: user.userEmail,
        role: user.userRole.roleName,
      },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "1h" }
    );

    return {
      token,
      user: {
        id: user.userId,
        name: user.userFullName,
        role: user.userRole.roleName,
      },
    };
  }

  // public async loginWithGoogle(params: GoogleLoginRequest) {
  //   const ticket = await googleClient.verifyIdToken({
  //     idToken: params.idToken,
  //     audience: process.env.GOOGLE_CLIENT_ID,
  //   });

  //   const payload = ticket.getPayload();
  //   if (!payload || !payload.email) {
  //     throw new BadRequestError("Invalid Google Token");
  //   }

  //   console.log(payload);

  //   const { email, sub: googleId, given_name, family_name, name } = payload;

  //   let user = await prisma.user.findUnique({
  //     where: { userEmail: email },
  //     include: { userRole: true },
  //   });

  //   if (!user) {
  //     user = await prisma.user.create({
  //       data: {
  //         userEmail: email,
  //         userFullName: name || `${given_name} ${family_name}`,
  //         userStatus: "ACTIVE",
  //         userGoogleId: googleId,
  //         userRole: {
  //           connectOrCreate: {
  //             where: { roleName: "TENANT" },
  //             create: { roleName: "TENANT" },
  //           },
  //         },
  //       },
  //       include: { userRole: true },
  //     });
  //   } else if (!user.userGoogleId) {
  //     user = await prisma.user.update({
  //       where: { userId: user.userId },
  //       data: { userGoogleId: googleId },
  //       include: { userRole: true },
  //     });
  //   }

  //   const token = jwt.sign(
  //     {
  //       userId: user?.userId,
  //       email: user?.userEmail ?? "",
  //       role: user?.userRole?.roleName ?? "",
  //     },
  //     JWTSECRET || "secret",
  //     { expiresIn: "1h" }
  //   );

  //   return {
  //     token,
  //     user: {
  //       id: user.userId,
  //       name: user.userFullName,
  //       role: user.userRole?.roleName,
  //     },
  //   };
  // }

  public async forgotPassword(params: ForgotPasswordRequest) {
    const user = await prisma.user.findUnique({
      where: { userEmail: params.email },
    });

    if (!user) {
      return { message: "If that email exists, a reset link has been sent." };
    }

    await prisma.passwordReset.deleteMany({
      where: { passwordResetUserId: user.userId },
    });

    // 2. Generate Token
    const resetToken = crypto.randomUUID().toString();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // 3. Create the Token Record
    await prisma.passwordReset.create({
      data: {
        passwordResetToken: resetToken,
        passwordResetUserId: user.userId,
        passwordResetExpiresAt: expiresAt,
        // ipAddress: req.ip // You can pass this if you want
      },
    });

    const resetLink = `http://localhost:3000/auth/reset-password?token=${resetToken}`;
    // console.log(`[EMAIL] Link: ${resetLink}`);
    // await sendEmail(
    //   params.email,
    //   "Password Reset",
    //   `<p>Click <a href="${resetLink}">here</a> to reset your password.<br><br>Best Regards,<br>The Urbannest Team</p>`
    // );

    const mailOptions = {
      from: {
        address: MAIL_USER as string,
        name: "Urbannest Support",
      },
      to: params.email,
      subject: "Password Reset for Urbannest Account",
      html: `<p>Click <a href="${resetLink}">here</a> to reset your password.<br><br>Best Regards,<br>The Urbannest Team</p>`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        new BadRequestError(error.message);
      }
    });
    return { message: "If that email exists, a reset link has been sent." };
  }

  public async resetPassword(params: ResetPasswordRequest) {
    const tokenRecord = await prisma.passwordReset.findUnique({
      where: { passwordResetToken: params.token, passwordResetUsed: false },
      include: { passwordResetUser: true },
    });

    if (!tokenRecord) {
      throw new BadRequestError("Invalid token");
    }

    if (tokenRecord.passwordResetExpiresAt < new Date()) {
      throw new BadRequestError("Token has expired");
    }

    const hashedPassword = await bcrypt.hash(params.newPassword, 10);

    await prisma.user.update({
      where: { userId: tokenRecord.passwordResetUserId },
      data: { userPassword: hashedPassword },
    });

    await prisma.passwordReset.update({
      where: { passwordResetId: tokenRecord.passwordResetId },
      data: {
        passwordResetUsed: true,
      },
    });

    return { success: true, message: "Password reset successful" };
  }
}
