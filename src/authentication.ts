import * as express from "express";
import * as jwt from "jsonwebtoken";
import { ForbiddenError, UnauthorizedError } from "./utils/apiError";
import { JWTSECRET } from "./config/env";

export function expressAuthentication(
  request: express.Request,
  securityName: string,
  scopes?: string[],
): Promise<any> {
  if (securityName === "jwt") {
    const token =
      request.body?.token ||
      request.query?.token ||
      request.headers?.["x-access-token"] ||
      request.headers?.["authorization"];

    return new Promise((resolve, reject) => {
      // 1. Stop execution immediately if there's no token
      if (!token) {
        return reject(new UnauthorizedError("No token provided"));
      }

      // 2. Type-safety check: Ensure the secret exists before verifying
      if (!JWTSECRET) {
        return reject(
          new ForbiddenError(
            "Server Configuration Error: JWT Secret is missing.",
          ),
        );
      }

      // 3. Remove 'Bearer ' prefix if present safely
      const tokenValue = token.startsWith("Bearer ")
        ? token.slice(7, token.length)
        : token;

      // TypeScript now knows JWTSECRET is a string here
      jwt.verify(tokenValue, JWTSECRET, function (err: any, decoded: any) {
        if (err) {
          reject(new UnauthorizedError("Invalid or expired token"));
        } else {
          // Optional: If you need to check scopes/roles later, you do it here using the `decoded` payload
          resolve(decoded);
        }
      });
    });
  }

  return Promise.reject({});
}
