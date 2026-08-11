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
import { FdSettingsService } from "../../services/front-desk/fdSettingsService";
import {
  ChangePasswordSchema,
  UpdateProfileSchema,
  type FdChangePasswordRequest,
  type FdUpdateProfileRequest,
} from "../../dtos/front-desk/fd.settings.dto";
import { validate } from "../../utils/validate";

@Route("front-desk")
@Tags("FD - Settings")
@Security("jwt", ["FRONT_DESK"])
export class FdSettingsController extends Controller {
  private fdSettingsService = new FdSettingsService();

  /**
   * Returns the front desk officer's profile including assigned properties and role.
   */
  @Get("profile")
  public async getProfile(@Request() req: any) {
    const data = await this.fdSettingsService.getProfile(req.user.userId);
    return { success: true, message: "Profile retrieved", data };
  }

  /**
   * Updates the front desk officer's profile (name, phone, emergency contact, profile photo URL).
   * Returns the full updated profile state.
   */
  @Patch("profile")
  public async updateProfile(
    @Request() req: any,
    @Body() body: FdUpdateProfileRequest,
  ) {
    const validated = validate(UpdateProfileSchema, body);
    const data = await this.fdSettingsService.updateProfile(req.user.userId, validated);
    return { success: true, message: "Profile updated", data };
  }

  /**
   * Changes the front desk officer's password. Requires current password verification.
   * Does not invalidate existing sessions.
   */
  @Patch("settings/password")
  public async changePassword(
    @Request() req: any,
    @Body() body: FdChangePasswordRequest,
  ) {
    const validated = validate(ChangePasswordSchema, body);
    await this.fdSettingsService.changePassword(
      req.user.userId,
      validated.oldPassword,
      validated.newPassword,
    );
    return { success: true, message: "Password changed successfully" };
  }
}
