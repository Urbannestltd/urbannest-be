import {
  Get,
  Route,
  Tags,
  Controller,
  Body,
  Request,
  Post,
  SuccessResponse,
} from "tsoa";
import * as express from "express";
import { AuthenticationService } from "../services/authenticationService";
import {
  InitiateRegistrationRequest,
  InitiateRegistrationSchema,
} from "../dtos/auth.dto";
import { validate } from "../utils/validate";
import { ApiResponse } from "../dtos/apiResponse";

// 1. Define the Interface (This becomes your Schema automatically!)
interface User {
  id: number;
  name: string;
  email: string;
}

@Route("users")
@Tags("User")
export class AuthenticationController extends Controller {
  private authenticationService = new AuthenticationService();

  /**
   * Initiates registration for a new user.
   */
  @Post("initiate-registration")
  @SuccessResponse("201", "User Created")
  public async initiateRegistration(
    @Body() body: InitiateRegistrationRequest
  ): Promise<ApiResponse<any>> {
    const validatedBody = validate(InitiateRegistrationSchema, body);

    this.setStatus(201);
    return this.authenticationService.initiateRegistration(validatedBody);
  }

  @Get("{userId}")
  public async getUser(userId: number): Promise<User> {
    return {
      id: userId,
      name: "John Doe",
      email: "john@example.com",
    };
  }
}
