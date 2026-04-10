import * as express from "express";
import {
  Body,
  Get,
  Path,
  Put,
  SuccessResponse,
  Route,
  Controller,
  Tags,
  Post,
  Security,
} from "tsoa";
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

  @Put("users/{userId}/suspend")
  public async suspendUser(@Path() userId: string) {
    await this.adminService.suspendUser(userId);
    return { success: true, message: "User suspended successfully" };
  }

  @Put("users/{userId}/activate")
  public async activateUser(@Path() userId: string) {
    await this.adminService.activateUser(userId);
    return { success: true, message: "User activated successfully" };
  }

  @Get("users/{userId}/activity")
  public async getUserActivity(@Path() userId: string) {
    const logs = await this.adminService.getUserActivityLogs(userId);
    return { success: true, message: "Activity logs retrieved", data: logs };
  }
}
