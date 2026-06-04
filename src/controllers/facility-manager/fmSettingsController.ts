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
  type ChangePasswordRequest,
  type UpdateProfileRequest,
} from "../../dtos/facility-manager/fm.settings.dto";
import { validate } from "../../utils/validate";

@Route("facility-manager")
@Tags("FM - Settings")
@Security("jwt", ["FACILITY_MANAGER"])
export class FmSettingsController extends Controller {
  private fmSettingsService = new FmSettingsService();

  @Get("profile")
  public async getProfile(@Request() req: any) {
    const data = await this.fmSettingsService.getProfile(req.user.userId);
    return { success: true, message: "Profile retrieved", data };
  }

  @Patch("profile")
  public async updateProfile(
    @Request() req: any,
    @Body() body: UpdateProfileRequest,
  ) {
    const validated = validate(UpdateProfileSchema, body);
    const data = await this.fmSettingsService.updateProfile(req.user.userId, validated);
    return { success: true, message: "Profile updated", data };
  }

  @Patch("settings/password")
  public async changePassword(
    @Request() req: any,
    @Body() body: ChangePasswordRequest,
  ) {
    const validated = validate(ChangePasswordSchema, body);
    await this.fmSettingsService.changePassword(
      req.user.userId,
      validated.oldPassword,
      validated.newPassword,
    );
    return { success: true, message: "Password changed successfully" };
  }
}
