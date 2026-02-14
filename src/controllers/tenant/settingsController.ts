import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Route,
  Tags,
  Security,
  Request,
  Path,
  Post,
} from "tsoa";
import { SettingsService } from "../../services/tenant/settingsService";
import {
  UpdateProfileSchema,
  UpdateProfileRequest,
  CreateReminderRequest,
  CreateReminderSchema,
  UpdateNotificationSettingsRequest,
  UpdateNotificationSettingsSchema,
  VerifyTwoFactorSchema,
  VerifyTwoFactorRequest,
  ChangePasswordSchema,
  ChangePasswordRequest,
} from "../../dtos/tenant/settings.dto";
import { successResponse } from "../../utils/responseHelper";
import { validate } from "../../utils/validate";

@Route("settings")
@Tags("Account Settings")
export class SettingsController extends Controller {
  private settingsService = new SettingsService();

  /**
   * Get Profile & Payment Data
   * Used to pre-fill the form fields on load.
   */
  @Get("profile")
  @Security("jwt")
  public async getProfile(@Request() req: any) {
    const result = await this.settingsService.getProfile(req.user.userId);
    return successResponse(result, "Profile retrieved");
  }

  /**
   * Update Personal Info
   * Handles name, phone, emergency contact, and profile picture URL.
   */
  @Patch("profile")
  @Security("jwt")
  public async updateProfile(
    @Request() req: any,
    @Body() body: UpdateProfileRequest,
  ) {
    validate(UpdateProfileSchema, body);
    const result = await this.settingsService.updateProfile(
      req.user.userId,
      body,
    );
    return successResponse(result, "Profile updated successfully");
  }

  /**
   * Remove a Payment Method
   */
  @Delete("payment-methods/{cardId}")
  @Security("jwt")
  public async deleteCard(@Request() req: any, @Path() cardId: string) {
    const result = await this.settingsService.removePaymentMethod(
      req.user.userId,
      cardId,
    );
    return successResponse(result, "Card removed");
  }

  @Get("notifications")
  @Security("jwt")
  public async getNotificationSettings(@Request() req: any) {
    const result = await this.settingsService.getNotificationSettings(
      req.user.userId,
    );
    return successResponse(result, "Preferences retrieved");
  }

  /**
   * Update Notification Preferences
   */
  @Patch("notifications")
  @Security("jwt")
  public async updateNotificationSettings(
    @Request() req: any,
    @Body() body: UpdateNotificationSettingsRequest,
  ) {
    validate(UpdateNotificationSettingsSchema, body);
    const result = await this.settingsService.updateNotificationSettings(
      req.user.userId,
      body,
    );
    return successResponse(result, "Preferences updated");
  }

  /**
   * Create a Custom Reminder
   */
  @Post("reminders")
  @Security("jwt")
  public async createReminder(
    @Request() req: any,
    @Body() body: CreateReminderRequest,
  ) {
    validate(CreateReminderSchema, body);
    const result = await this.settingsService.createReminder(
      req.user.userId,
      body,
    );
    return successResponse(result, "Reminder set");
  }

  /**
   * Get Active Reminders
   */
  @Get("reminders")
  @Security("jwt")
  public async getReminders(@Request() req: any) {
    const result = await this.settingsService.getReminders(req.user.userId);
    return successResponse(result, "Reminders retrieved");
  }

  /**
   * Delete Reminder
   */
  @Delete("reminders/{id}")
  @Security("jwt")
  public async deleteReminder(@Request() req: any, @Path() id: string) {
    const result = await this.settingsService.deleteReminder(
      req.user.userId,
      id,
    );
    return successResponse(result, "Reminder deleted");
  }

  /**
   * Change Password
   */
  @Post("change-password")
  @Security("jwt")
  public async changePassword(
    @Request() req: any,
    @Body() body: ChangePasswordRequest,
  ) {
    validate(ChangePasswordSchema, body);
    const result = await this.settingsService.changePassword(
      req.user.userId,
      body,
    );
    return successResponse(result, "Password changed successfully");
  }

  /**
   * Step 1: Enable 2FA (Requests OTP)
   */
  @Post("2fa/enable")
  @Security("jwt")
  public async enableTwoFactor(@Request() req: any) {
    const result = await this.settingsService.initiateTwoFactor(
      req.user.userId,
    );
    return successResponse(result, "OTP sent to email");
  }

  /**
   * Step 2: Confirm OTP (Actually turns it on)
   */
  @Post("2fa/confirm")
  @Security("jwt")
  public async confirmTwoFactor(
    @Request() req: any,
    @Body() body: VerifyTwoFactorRequest,
  ) {
    validate(VerifyTwoFactorSchema, body);
    const result = await this.settingsService.confirmTwoFactor(
      req.user.userId,
      body.otp,
    );
    return successResponse(result, "2FA enabled successfully");
  }

  /**
   * Disable 2FA
   */
  @Post("2fa/disable")
  @Security("jwt")
  public async disableTwoFactor(@Request() req: any) {
    const result = await this.settingsService.disableTwoFactor(req.user.userId);
    return successResponse(result, "2FA disabled");
  }
}
