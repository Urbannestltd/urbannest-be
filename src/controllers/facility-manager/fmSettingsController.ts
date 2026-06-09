import {
  Body,
  Get,
  Patch,
  Route,
  Controller,
  Tags,
  Security,
  Request,
} from "tsoa";
import { FmSettingsService } from "../../services/facility-manager/fmSettingsService";
import {
  ChangePasswordSchema,
  UpdateProfileSchema,
  UpdateNotificationPreferencesSchema,
  type FmChangePasswordRequest,
  type FmUpdateProfileRequest,
  type FmUpdateNotificationPreferencesRequest,
} from "../../dtos/facility-manager/fm.settings.dto";
import { validate } from "../../utils/validate";

@Route("facility-manager")
@Tags("FM - Settings")
@Security("jwt", ["FACILITY_MANAGER"])
export class FmSettingsController extends Controller {
  private fmSettingsService = new FmSettingsService();

  /**
   * Returns the FM's full profile including managed properties, units, and role.
   */
  @Get("profile")
  public async getProfile(@Request() req: any) {
    const data = await this.fmSettingsService.getProfile(req.user.userId);
    return { success: true, message: "Profile retrieved", data };
  }

  /**
   * Updates the FM's profile (name, phone, emergency contact, profile photo URL).
   * Returns the full updated profile state.
   */
  @Patch("profile")
  public async updateProfile(
    @Request() req: any,
    @Body() body: FmUpdateProfileRequest,
  ) {
    const validated = validate(UpdateProfileSchema, body);
    const data = await this.fmSettingsService.updateProfile(req.user.userId, validated);
    return { success: true, message: "Profile updated", data };
  }

  /**
   * Changes the FM's password. Requires current password verification.
   * Does not invalidate existing sessions.
   */
  @Patch("settings/password")
  public async changePassword(
    @Request() req: any,
    @Body() body: FmChangePasswordRequest,
  ) {
    const validated = validate(ChangePasswordSchema, body);
    await this.fmSettingsService.changePassword(
      req.user.userId,
      validated.oldPassword,
      validated.newPassword,
    );
    return { success: true, message: "Password changed successfully" };
  }

  /**
   * Returns the FM's current notification preferences.
   */
  @Get("settings/notifications")
  public async getNotificationPreferences(@Request() req: any) {
    const data = await this.fmSettingsService.getNotificationPreferences(req.user.userId);
    return { success: true, message: "Notification preferences retrieved", data };
  }

  /**
   * Updates the FM's notification preferences.
   * Returns the updated preferences and any critical-toggle warnings.
   */
  @Patch("settings/notifications")
  public async updateNotificationPreferences(
    @Request() req: any,
    @Body() body: FmUpdateNotificationPreferencesRequest,
  ) {
    const validated = validate(UpdateNotificationPreferencesSchema, body);
    const data = await this.fmSettingsService.updateNotificationPreferences(
      req.user.userId,
      validated,
    );
    return { success: true, message: "Notification preferences updated", data };
  }
}
