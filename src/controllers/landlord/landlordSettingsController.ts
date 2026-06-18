import { Body, Get, Patch, Route, Controller, Tags, Security, Request } from "tsoa";
import { LandlordSettingsService } from "../../services/landlord/landlordSettingsService";
import {
  LandlordChangePasswordSchema,
  LandlordUpdateNotificationPreferencesSchema,
  LandlordUpdateProfileSchema,
  LandlordUpdateTwoFaSchema,
  type LandlordChangePasswordRequest,
  type LandlordUpdateNotificationPreferencesRequest,
  type LandlordUpdateProfileRequest,
  type LandlordUpdateTwoFaRequest,
} from "../../dtos/landlord/landlord.settings.dto";
import { validate } from "../../utils/validate";

@Route("landlord")
@Tags("Landlord - Settings")
@Security("jwt", ["LANDLORD"])
export class LandlordSettingsController extends Controller {
  private service = new LandlordSettingsService();

  /**
   * Returns the landlord's profile: name, email, phone, emergency contact,
   * profile photo URL, role, and 2FA status.
   */
  @Get("profile")
  public async getProfile(@Request() req: any) {
    const data = await this.service.getProfile(req.user.userId);
    return { success: true, message: "Profile retrieved", data };
  }

  /**
   * Updates the landlord's personal information.
   * All fields are optional — send only the fields to change.
   * Email uniqueness is enforced across the platform.
   */
  @Patch("profile")
  public async updateProfile(
    @Request() req: any,
    @Body() body: LandlordUpdateProfileRequest,
  ) {
    const validated = validate(LandlordUpdateProfileSchema, body);
    const data = await this.service.updateProfile(req.user.userId, validated);
    return { success: true, message: "Profile updated", data };
  }

  /**
   * Changes the landlord's password.
   * Requires the current password for verification.
   * Sends a confirmation email on success.
   */
  @Patch("settings/password")
  public async changePassword(
    @Request() req: any,
    @Body() body: LandlordChangePasswordRequest,
  ) {
    const { oldPassword, newPassword } = validate(LandlordChangePasswordSchema, body);
    await this.service.changePassword(req.user.userId, oldPassword, newPassword);
    return { success: true, message: "Password changed successfully" };
  }

  /**
   * Returns the landlord's current notification preferences.
   * Preferences are created with all defaults enabled on first call.
   */
  @Get("settings/notifications")
  public async getNotificationPreferences(@Request() req: any) {
    const data = await this.service.getNotificationPreferences(req.user.userId);
    return { success: true, message: "Notification preferences retrieved", data };
  }

  /**
   * Updates the landlord's notification preferences.
   * All fields are optional — send only the ones to change.
   *
   * Fields:
   *  - emailPayments: payment received / overdue alerts
   *  - emailLease: lease expiry / renewal alerts
   *  - emailMaintenance: maintenance ticket activity
   *  - emailVisitors: visitor check-in notifications
   *  - pushPayments: push notifications for payments
   *  - pushMaintenance: push notifications for maintenance
   */
  @Patch("settings/notifications")
  public async updateNotificationPreferences(
    @Request() req: any,
    @Body() body: LandlordUpdateNotificationPreferencesRequest,
  ) {
    const validated = validate(LandlordUpdateNotificationPreferencesSchema, body);
    const data = await this.service.updateNotificationPreferences(req.user.userId, validated);
    return { success: true, message: "Notification preferences updated", data };
  }

  /**
   * Returns the landlord's current two-factor authentication status.
   */
  @Get("settings/2fa")
  public async getTwoFaStatus(@Request() req: any) {
    const data = await this.service.getTwoFaStatus(req.user.userId);
    return { success: true, message: "2FA status retrieved", data };
  }

  /**
   * Enables or disables two-factor authentication for the landlord's account.
   * When 2FA is enabled, an OTP will be required at each login.
   * When disabled, any pending OTP state is cleared.
   */
  @Patch("settings/2fa")
  public async updateTwoFa(
    @Request() req: any,
    @Body() body: LandlordUpdateTwoFaRequest,
  ) {
    const { enabled } = validate(LandlordUpdateTwoFaSchema, body);
    const data = await this.service.updateTwoFa(req.user.userId, enabled);
    return {
      success: true,
      message: `Two-factor authentication ${enabled ? "enabled" : "disabled"}`,
      data,
    };
  }
}
