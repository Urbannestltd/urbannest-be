import {
  Body,
  Get,
  Path,
  Put,
  Query,
  SuccessResponse,
  Route,
  Controller,
  Tags,
  Post,
  Security,
  Request,
  Patch,
} from "tsoa";
import { Permission } from "@prisma/client";
import {
  AdminCreateUserRequest,
  AdminCreateUserSchema,
} from "../../dtos/admin/admin";
import { ApiResponse } from "../../dtos/apiResponse";
import { validate } from "../../utils/validate";
import { AdminService } from "../../services/admin/adminService";

@Route("admin")
@Tags("Admin")
@Security("jwt", ["ADMIN"])
export class AdminController extends Controller {
  private adminService = new AdminService();
  @Post("create-user")
  @SuccessResponse("201", "User Created")
  public async createUser(
    @Body() body: AdminCreateUserRequest,
  ): Promise<ApiResponse<any>> {
    const validation = await validate(AdminCreateUserSchema, body);

    this.setStatus(201);
    return this.adminService.createUser(validation);
  }

  @Get("users/metrics")
  public async getUserMetrics(@Request() req: any) {
    const data = await this.adminService.getUserMetrics(req.user.userId);
    return { success: true, message: "User metrics retrieved", data };
  }

  @Get("users")
  public async getAllUsers(
    @Request() req: any,
    @Query() role?: string,
    @Query() status?: string,
    @Query() createdFrom?: string,
    @Query() createdTo?: string,
  ) {
    const data = await this.adminService.getAllUsers(req.user.userId, {
      role,
      status,
      createdFrom,
      createdTo,
    });
    return { success: true, message: "Users retrieved", data };
  }

  @Put("users/{userId}/suspend")
  public async suspendUser(@Path() userId: string, @Request() req: any) {
    await this.adminService.suspendUser(userId, req.user.userId);
    return { success: true, message: "User suspended successfully" };
  }

  @Put("users/{userId}/activate")
  public async activateUser(@Path() userId: string, @Request() req: any) {
    await this.adminService.activateUser(userId, req.user.userId);
    return { success: true, message: "User activated successfully" };
  }

  @Get("users/{userId}")
  public async getUserById(@Path() userId: string) {
    const data = await this.adminService.getUserById(userId);
    return { success: true, message: "User retrieved", data };
  }

  @Get("settings/system")
  public async getSystemSettings() {
    const data = await this.adminService.getSystemSettings();
    return { success: true, message: "System settings retrieved", data };
  }

  @Patch("settings/system")
  public async updateSystemSettings(
    @Body() body: { defaultMaintenanceBudget?: number | null },
  ) {
    const data = await this.adminService.updateSystemSettings(body);
    return { success: true, message: "System settings updated", data };
  }

  @Get("settings/notifications")
  public async getNotificationSettings(@Request() req: any) {
    const data = await this.adminService.getNotificationSettings(
      req.user.userId,
    );
    return { success: true, message: "Notification settings retrieved", data };
  }

  @Patch("settings/notifications")
  public async updateNotificationSettings(
    @Request() req: any,
    @Body()
    body: {
      emailPayments?: boolean;
      emailLease?: boolean;
      emailMaintenance?: boolean;
      emailVisitors?: boolean;
    },
  ) {
    const data = await this.adminService.updateNotificationSettings(
      req.user.userId,
      body,
    );
    return { success: true, message: "Notification settings updated", data };
  }

  @Patch("settings/password")
  public async changePassword(
    @Request() req: any,
    @Body() body: { oldPassword: string; newPassword: string },
  ) {
    await this.adminService.changePassword(
      req.user.userId,
      body.oldPassword,
      body.newPassword,
    );
    return { success: true, message: "Password changed successfully" };
  }

  @Get("users/{userId}/activity")
  public async getUserActivity(@Path() userId: string) {
    const logs = await this.adminService.getUserActivityLogs(userId);
    return { success: true, message: "Activity logs retrieved", data: logs };
  }

  @Patch("users/{userId}/permissions")
  public async updateUserPermissions(
    @Path() userId: string,
    @Request() req: any,
    @Body() body: { permissions: Permission[] },
  ) {
    await this.adminService.updateUserPermissions(
      userId,
      req.user.userId,
      body.permissions,
    );
    return { success: true, message: "Permissions updated successfully" };
  }
}
