import {
  Get,
  Route,
  Tags,
  Controller,
  Body,
  Request,
  Post,
  SuccessResponse,
  Query,
} from "tsoa";
import * as express from "express";
import { AuthenticationService } from "../services/authenticationService";
import {
  ForgotPasswordRequest,
  ForgotPasswordSchema,
  GoogleLoginRequest,
  GoogleLoginSchema,
  RegisterRequest,
  RegisterSchema,
  LoginRequest,
  LoginSchema,
  ResetPasswordRequest,
  ResetPasswordSchema,
  VerifyOtpRequest,
  VerifyOtpSchema,
} from "../dtos/auth.dto";
import { validate } from "../utils/validate";
import { ApiResponse } from "../dtos/apiResponse";
import { successResponse } from "../utils/responseHelper";
import {
  VerifyTwoFactorRequest,
  VerifyTwoFactorSchema,
} from "../dtos/tenant/settings.dto";
import { SessionService } from "../services/sessionService";
import { RefreshTokenRequest } from "../dtos/session.dto";

@Route("auth")
@Tags("Authentication")
export class AuthenticationController extends Controller {
  private authenticationService = new AuthenticationService();
  private sessionService = new SessionService();

  /**
   * Initiates registration for a new user.
   */
  @Post("register")
  @SuccessResponse("200", "Registration Successful")
  public async register(
    @Body() body: RegisterRequest,
    @Query() token: string,
  ): Promise<ApiResponse<any>> {
    const validatedBody = validate(RegisterSchema, body);

    this.setStatus(201);
    return this.authenticationService.register(validatedBody, token);
  }

  // @Post("verify-otp")
  // @SuccessResponse("200", "Account Verified")
  // public async verifyOtp(@Body() body: VerifyOtpRequest) {
  //   const validatedBody = validate(VerifyOtpSchema, body);

  //   return this.authenticationService.verifyOtp(validatedBody);
  // }

  // @Post("login")
  // @SuccessResponse("200", "Login Successful")
  // public async login(@Body() body: LoginRequest) {
  //   const validatedBody = validate(LoginSchema, body);

  //   return this.authenticationService.login(validatedBody);
  // }

  @Post("login")
  public async login(@Body() body: LoginRequest) {
    validate(LoginSchema, body);
    const result = await this.authenticationService.login(body);

    if (result.require2fa) {
      return successResponse(result, "2FA Code Sent to Email");
    }

    return successResponse(result, "Login successful");
  }

  /**
   * Step 2: Verify 2FA OTP
   * Only called if Step 1 returned "require2fa: true".
   */
  @Post("verify-2fa")
  public async verifyTwoFactor(@Body() body: VerifyTwoFactorRequest) {
    // Schema: { userId: string, otp: string }
    // Note: In a real app, 'userId' might be passed via a temporary JWT from Step 1,
    // but passing it in the body is fine for this flow.
    validate(VerifyTwoFactorSchema, body);

    const result = await this.authenticationService.verifyLoginOtp(
      body.tempToken,
      body.otp,
    );
    return successResponse(result, "2FA Verified. Login Complete.");
  }

  // @Post("google-login")
  // @SuccessResponse("200", "Google Login Successful")
  // public async googleLogin(@Body() body: GoogleLoginRequest) {
  //   const validatedBody = validate(GoogleLoginSchema, body);

  // return this.authenticationService.loginWithGoogle(validatedBody);
  // }

  @Post("forgot-password")
  @SuccessResponse("200", "Email Sent")
  public async forgotPassword(@Body() body: ForgotPasswordRequest) {
    const validatedBody = validate(ForgotPasswordSchema, body);

    return await this.authenticationService.forgotPassword(validatedBody);
  }

  /**
   * Resets the password using a valid token.
   */
  @Post("reset-password")
  @SuccessResponse("200", "Password Reset Successful")
  public async resetPassword(@Body() body: ResetPasswordRequest) {
    const validatedBody = validate(ResetPasswordSchema, body);
    const result =
      await this.authenticationService.resetPassword(validatedBody);

    return await this.authenticationService.resetPassword(validatedBody);
  }

  @Post("refresh")
  @SuccessResponse("200", "Token refreshed successfully")
  public async refreshToken(@Body() body: RefreshTokenRequest) {
    try {
      const result = await this.sessionService.refreshAccessToken(
        body.refreshToken,
      );
      return { success: true, data: result };
    } catch (error: any) {
      this.setStatus(401);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log out a user
   * This permanently invalidates the session in the database.
   */
  @Post("logout")
  @SuccessResponse("200", "Logged out successfully")
  public async logout(@Body() body: RefreshTokenRequest) {
    // Note: You will need a quick helper method in your SessionService
    // to find and invalidate the session using the refreshToken.
    await this.sessionService.invalidateSession(body.refreshToken);

    return { success: true, message: "Logged out successfully" };
  }
}
