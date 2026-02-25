import { prisma } from "../config/prisma";
import {
  ForgotPasswordRequest,
  GoogleLoginRequest,
  RegisterRequest,
  LoginRequest,
  ResetPasswordRequest,
  VerifyOtpRequest,
  TempTokenPayload,
} from "../dtos/auth.dto";
import {
  UnauthorizedError,
  ConflictError,
  BadRequestError,
  NotFoundError,
} from "../utils/apiError";
import * as jwt from "jsonwebtoken";
import crypto from "crypto";
import * as bcrypt from "bcrypt";
import { ApiResponse } from "../dtos/apiResponse";
import {
  GOOGLE_CLIENT_ID,
  JWT_PRIVATE_KEY,
  JWTSECRET,
  MAIL_USER,
} from "../config/env";
import { OAuth2Client } from "google-auth-library";
import sendEmail from "../config/resend";
import transporter from "../config/nodemailer";
import { JwtPayload } from "jsonwebtoken";
import { ZeptoMailService } from "./external/zeptoMailService";

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

export class AuthenticationService {
  private emailService = new ZeptoMailService();
  private get jwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("FATAL: JWT_SECRET environment variable is not defined.");
    }
    return secret;
  }
  public async register(
    params: RegisterRequest,
    token: string,
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

  public async verifyOtp(params: { email: string; otp: string }) {
    const user = await prisma.user.findUnique({
      where: { userEmail: params.email },
      select: {
        userId: true,
        otpLogs: {
          where: {
            otpLogStatus: "ACTIVE",
            otpLogExpiry: { gt: new Date() },
          },
          // Ensure we get the most recently generated OTP if multiple exist
          orderBy: { otpLogCreatedAt: "desc" },
          take: 1,
          select: {
            otpLogId: true,
            otpLogHash: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundError("User not found");

    const latestOtp = user.otpLogs[0];

    // Early return if no active OTP exists
    if (!latestOtp) {
      throw new BadRequestError("Invalid or Expired OTP, Please try again");
    }

    const otpHashCompare = await bcrypt.compare(
      params.otp,
      latestOtp.otpLogHash,
    );

    if (!otpHashCompare) {
      throw new BadRequestError("Invalid or Expired OTP, Please try again");
    }

    // Use a transaction to guarantee data integrity
    await prisma.$transaction([
      prisma.user.update({
        where: { userId: user.userId },
        data: { userStatus: "ACTIVE" },
      }),
      prisma.otpLogs.update({
        where: { otpLogId: latestOtp.otpLogId },
        data: { otpLogStatus: "INACTIVE" },
      }),
    ]);

    return { success: true, message: "Account verified successfully" };
  }

  // public async login(params: LoginRequest) {
  //   const user = await prisma.user.findUnique({
  //     where: { userEmail: params.email },
  //     include: { userRole: true },
  //   });

  //   if (
  //     !user ||
  //     !(await bcrypt.compare(params.password, user.userPassword ?? ""))
  //   ) {
  //     throw new UnauthorizedError("Invalid email or password");
  //   }

  //   if (user?.userStatus !== "ACTIVE") {
  //     throw new UnauthorizedError("Account is not active.");
  //   }

  //   // --- SECURITY ENFORCEMENT ---
  //   // Extract and validate the RS256 Private Key early so we can use it for both tokens
  //   if (!JWT_PRIVATE_KEY) {
  //     throw new Error(
  //       "FATAL: JWT_PRIVATE_KEY environment variable is not defined.",
  //     );
  //   }
  //   const privateKey = Buffer.from(JWT_PRIVATE_KEY, "base64").toString("ascii");

  //   // === NEW: 2FA CHECK ===
  //   if (user.isTwoFactorEnabled) {
  //     // 1. Generate a random 6-digit code
  //     const otp = Math.floor(100000 + Math.random() * 900000).toString();
  //     const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

  //     // 2. Save it to the database
  //     await prisma.user.update({
  //       where: { userId: user.userId },
  //       data: {
  //         twoFactorSecret: otp,
  //         twoFactorExpiry: expiry,
  //       },
  //     });

  //     // 3. Sign tempToken using RS256 instead of the vulnerable HS256 secret
  //     const tempToken = jwt.sign(
  //       { userId: user.userId, scope: "2FA_PENDING" },
  //       privateKey,
  //       { algorithm: "RS256", expiresIn: "5m" }, // Short life
  //     );

  //     // 4. Send the Email
  //     await this.emailService.sendTemplateEmail(
  //       { email: user.userEmail, name: user.userFullName ?? "Tenant" },
  //       "LOGIN_OTP_TEMPLATE",
  //       { code: otp },
  //     );

  //     // 5. Return a "Partial Login" response
  //     return {
  //       require2fa: true,
  //       message: "OTP sent to email",
  //       tempToken,
  //     };
  //   }

  //   // 1. Generate 15-minute Access Token
  //   const token = jwt.sign(
  //     { userId: user.userId, role: user.userRole.roleName },
  //     privateKey,
  //     { algorithm: "RS256", expiresIn: "15m" },
  //   );

  //   // 2. Generate Cryptographically Secure Refresh Token
  //   const refreshToken = crypto.randomBytes(64).toString("hex");

  //   // 3. Create Server-Side Session
  //   await prisma.session.create({
  //     data: {
  //       userId: user.userId,
  //       refreshToken: refreshToken,
  //     },
  //   });

  //   // 4. Return FULL payload
  //   return {
  //     require2fa: false,
  //     token,
  //     refreshToken,
  //     user: {
  //       id: user.userId,
  //       name: user.userFullName,
  //       role: user.userRole.roleName,
  //       profilePicUrl: user.userProfileUrl,
  //     },
  //   };
  // }

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

    if (user?.userStatus !== "ACTIVE") {
      throw new UnauthorizedError("Account is not active.");
    }

    // --- SECURITY ENFORCEMENT ---
    if (!process.env.JWT_PRIVATE_KEY) {
      throw new Error(
        "FATAL: JWT_PRIVATE_KEY environment variable is not defined.",
      );
    }
    const privateKey = Buffer.from(
      process.env.JWT_PRIVATE_KEY,
      "base64",
    ).toString("ascii");

    // === 2FA CHECK ===
    if (user.isTwoFactorEnabled) {
      // 1. Generate a cryptographically secure 6-digit code
      const otp = crypto.randomInt(100000, 1000000).toString();

      // Align expiry to 5 minutes for both DB and Token
      const expiry = new Date(Date.now() + 5 * 60 * 1000);

      // 2. Hash the OTP BEFORE saving to the database
      const saltRounds = 10;
      const hashedOtp = await bcrypt.hash(otp, saltRounds);

      // 3. Save the HASHED secret to the database
      await prisma.user.update({
        where: { userId: user.userId },
        data: {
          twoFactorSecret: hashedOtp, // Now matches your verifyLoginOtp logic!
          twoFactorExpiry: expiry,
        },
      });

      // 4. Sign tempToken using RS256
      const tempToken = jwt.sign(
        { userId: user.userId, scope: "2FA_PENDING" },
        privateKey,
        { algorithm: "RS256", expiresIn: "5m" }, // Matches the 5m DB expiry
      );

      // 5. Send the Email (Send the raw 'otp', NOT the hash)
      await this.emailService.sendTemplateEmail(
        { email: user.userEmail, name: user.userFullName ?? "Tenant" },
        "LOGIN_OTP_TEMPLATE",
        { code: otp }, // The user gets the readable code
      );

      // 6. Return a "Partial Login" response
      return {
        require2fa: true,
        message: "OTP sent to email",
        tempToken,
      };
    }

    // === NO 2FA (STANDARD LOGIN) ===

    // 1. Generate 15-minute Access Token
    console.log("🚨🚨🚨 HIT THE NEW LOGIN SERVICE 🚨🚨🚨");
    const token = jwt.sign(
      { userId: user.userId, role: user.userRole.roleName },
      privateKey,
      { algorithm: "RS256", expiresIn: "15m" },
    );

    // 2. Generate Cryptographically Secure Refresh Token
    const refreshToken = crypto.randomBytes(64).toString("hex");

    // 3. Create Server-Side Session
    await prisma.session.create({
      data: {
        userId: user.userId,
        refreshToken: refreshToken,
      },
    });

    // 4. Return FULL payload
    return {
      require2fa: false,
      token,
      refreshToken,
      user: {
        id: user.userId,
        name: user.userFullName,
        role: user.userRole.roleName,
        profilePicUrl: user.userProfileUrl,
      },
    };
  }

  public async verifyLoginOtp(tempToken: string, otp: string) {
    let decoded: TempTokenPayload;

    try {
      // Strictly use the getter to avoid fallback to "secret"
      decoded = jwt.verify(tempToken, this.jwtSecret) as TempTokenPayload;
    } catch (err) {
      throw new UnauthorizedError("Invalid or expired 2FA session token.");
    }

    if (decoded.scope !== "2FA_PENDING") {
      throw new UnauthorizedError("Invalid token scope.");
    }

    const userId = decoded.userId;

    const user = await prisma.user.findUnique({
      where: { userId },
      include: { userRole: true },
    });

    if (!user) throw new UnauthorizedError("User not found");

    // Check expiry BEFORE running expensive bcrypt operations
    if (!user.twoFactorExpiry || new Date() > user.twoFactorExpiry) {
      throw new UnauthorizedError("OTP has expired. Please login again.");
    }

    if (!user.twoFactorSecret) {
      throw new UnauthorizedError("No active 2FA request found.");
    }

    // Hash comparison for the 2FA secret
    const isOtpValid = await bcrypt.compare(otp, user.twoFactorSecret);

    if (!isOtpValid) {
      throw new UnauthorizedError("Invalid OTP code");
    }

    // Clear the OTP data
    await prisma.user.update({
      where: { userId },
      data: { twoFactorSecret: null, twoFactorExpiry: null },
    });

    // Issue the REAL Access Token
    const finalToken = jwt.sign(
      {
        userId: user.userId,
        email: user.userEmail,
        role: user.userRole.roleName,
      },
      this.jwtSecret,
      { expiresIn: "15m" },
    );

    return {
      token: finalToken,
      user: {
        id: user.userId,
        name: user.userFullName,
        role: user.userRole.roleName,
        profilePicUrl: user.userProfileUrl,
      },
    };
  }

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
