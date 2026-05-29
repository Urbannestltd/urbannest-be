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

@Route("facility-manager")
@Tags("Facility Manager")
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
    @Body()
    body: {
      userFullName?: string;
      userPhone?: string;
      userEmergencyContact?: string;
      userProfileUrl?: string;
    },
  ) {
    const data = await this.fmSettingsService.updateProfile(req.user.userId, body);
    return { success: true, message: "Profile updated", data };
  }

  @Patch("settings/password")
  public async changePassword(
    @Request() req: any,
    @Body() body: { oldPassword: string; newPassword: string },
  ) {
    await this.fmSettingsService.changePassword(
      req.user.userId,
      body.oldPassword,
      body.newPassword,
    );
    return { success: true, message: "Password changed successfully" };
  }
}
