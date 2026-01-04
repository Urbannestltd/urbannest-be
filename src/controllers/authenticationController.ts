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

interface Authentication {
  id: number;
  name: string;
  email: string;
}

@Route("auth")
@Tags("Authentication")
export class AuthenticationController extends Controller {
  private authenticationService = new AuthenticationService();

  /**
   * Initiates registration for a new user.
   */
  @Post("register")
  @SuccessResponse("200", "Registration Successful")
  public async register(
    @Body() body: RegisterRequest,
    @Query() token: string
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

  @Post("login")
  @SuccessResponse("200", "Login Successful")
  public async login(@Body() body: LoginRequest) {
    const validatedBody = validate(LoginSchema, body);

    return this.authenticationService.login(validatedBody);
  }

  @Post("google-login")
  @SuccessResponse("200", "Google Login Successful")
  public async googleLogin(@Body() body: GoogleLoginRequest) {
    const validatedBody = validate(GoogleLoginSchema, body);

    return this.authenticationService.loginWithGoogle(validatedBody);
  }

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
    const result = await this.authenticationService.resetPassword(
      validatedBody
    );

    return await this.authenticationService.resetPassword(validatedBody);
  }
}
