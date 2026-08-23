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
    // 1. Extract the token. Deliberately NOT accepted via URL query string —
    // query params end up in browser history, proxy/access logs, and
    // Referer headers on subsequent navigation, none of which redact a JWT.
    const token =
      request.body?.token ||
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

          // Check if the user account is still active, and that the token's
          // role claim still matches the user's current role in the DB
          // (a role change must invalidate any previously issued token's claim).
          prisma.user
            .findUnique({
              where: { userId: decoded.userId },
              select: {
                userStatus: true,
                userRole: { select: { roleName: true } },
              },
            })
            .then((user) => {
              if (!user || user.userStatus === "BLOCKED") {
                return reject(
                  new ForbiddenError(
                    "Your account has been suspended. Please contact support.",
                  ),
                );
              }

              if (decoded.role && decoded.role !== user.userRole?.roleName) {
                return reject(
                  new UnauthorizedError(
                    "Token role does not match current account role",
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
