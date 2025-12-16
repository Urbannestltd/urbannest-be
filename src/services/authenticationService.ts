import { prisma } from "../config/prisma";
import { InitiateRegistrationRequest } from "../dtos/auth.dto";
import {
  UnauthorizedError,
  ConflictError,
  BadRequestError,
} from "../utils/apiError";
import * as jwt from "jsonwebtoken";
import * as bcrypt from "bcrypt";
import { ApiResponse } from "../dtos/apiResponse";

export class AuthenticationService {
  public async initiateRegistration(
    params: InitiateRegistrationRequest
  ): Promise<ApiResponse<any>> {
    const existing = await prisma.user.findUnique({
      where: { userEmail: params.userEmail },
    });

    if (existing) {
      throw new BadRequestError("Email already exists");
    }

    const hashedPassword = await bcrypt.hash(params.userPassword, 10);

    const newUser = await prisma.user.create({
      data: {
        userEmail: params.userEmail,
        userFirstName: params.userFirstName,
        userLastName: params.userLastName,
        userDisplayName: params.userDisplayName,
        userPhone: params.userPhone,
        userPassword: hashedPassword,
        userRole: {
          connectOrCreate: {
            where: { roleName: params.userRoleName },
            create: { roleName: params.userRoleName },
          },
        },
        userStatus: "PENDING",
      },
    });

    return {
      success: true,
      message: "Registration initiated",
      data: { userId: newUser.userId },
    };
  }
}
