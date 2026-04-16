import * as express from "express";
import * as jwt from "jsonwebtoken";
import { ForbiddenError, UnauthorizedError } from "./utils/apiError";
import { JWT_PUBLIC_KEY } from "./config/env";
import { prisma } from "./config/prisma";

export function expressAuthentication(
  request: express.Request,
  securityName: string,
  scopes?: string[],
): Promise<any> {
  if (securityName === "jwt") {
    // 1. Extract the token
    const token =
      request.body?.token ||
      request.query?.token ||
      request.headers?.["x-access-token"] ||
      request.headers?.["authorization"];

    return new Promise((resolve, reject) => {
      if (!token) {
        return reject(new UnauthorizedError("No token provided"));
      }

      if (!JWT_PUBLIC_KEY) {
        return reject(
          new ForbiddenError(
            "Server Configuration Error: JWT Public Key is missing.",
          ),
        );
      }

      const publicKey = Buffer.from(JWT_PUBLIC_KEY, "base64").toString("ascii");

      const tokenValue = token.startsWith("Bearer ")
        ? token.slice(7, token.length)
        : token;

      // 6. Verify the token securely
      jwt.verify(
        tokenValue,
        publicKey,
        { algorithms: ["RS256"] },
        function (err: any, decoded: any) {
          if (err) {
            return reject(new UnauthorizedError("Invalid or expired token"));
          }

          if (scopes && scopes.length > 0) {
            if (!decoded.role || !scopes.includes(decoded.role)) {
              return reject(
                new ForbiddenError(
                  "Insufficient permissions to access this resource",
                ),
              );
            }
          }

          // Check if the user account is still active
          prisma.user
            .findUnique({
              where: { userId: decoded.userId },
              select: { userStatus: true },
            })
            .then((user) => {
              if (!user || user.userStatus === "BLOCKED") {
                return reject(
                  new ForbiddenError(
                    "Your account has been suspended. Please contact support.",
                  ),
                );
              }
              resolve(decoded);
            })
            .catch(() => reject(new UnauthorizedError("Could not verify account status")));
        },
      );
    });
  }

  return Promise.reject({});
}
