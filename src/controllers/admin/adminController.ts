import * as express from "express";
import { Body, SuccessResponse, Route, Controller, Tags, Post } from "tsoa";
import {
  AdminCreateUserRequest,
  AdminCreateUserSchema,
} from "../../dtos/admin/admin";
import { ApiResponse } from "../../dtos/apiResponse";
import { validate } from "../../utils/validate";
import { AdminService } from "../../services/admin/adminService";

@Route("admin")
@Tags("Admin")
export class AdminController extends Controller {
  private adminService = new AdminService();
  @Post("create-user")
  @SuccessResponse("201", "User Created")
  public async createUser(
    @Body() body: AdminCreateUserRequest
  ): Promise<ApiResponse<any>> {
    const validation = await validate(AdminCreateUserSchema, body);

    this.setStatus(201);
    return this.adminService.createUser(validation);
  }
}
