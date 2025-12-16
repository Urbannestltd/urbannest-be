import * as express from "express";
import * as jwt from "jsonwebtoken";
import { UnauthorizedError } from "./utils/apiError";
import { JWTSECRET } from "./config/env";

export function expressAuthentication(
  request: express.Request,
  securityName: string,
  scopes?: string[]
): Promise<any> {
  if (securityName === "jwt") {
    const token =
      request.body?.token ||
      request.query?.token ||
      request.headers?.["x-access-token"] ||
      request.headers?.["authorization"];

    return new Promise((resolve, reject) => {
      if (!token) {
        reject(new UnauthorizedError("No token provided"));
      }

      // Remove 'Bearer ' prefix if present
      const tokenValue = token.startsWith("Bearer ")
        ? token.slice(7, token.length)
        : token;

      jwt.verify(tokenValue, JWTSECRET, function (err: any, decoded: any) {
        if (err) {
          reject(err);
        } else {
          resolve(decoded);
        }
      });
    });
  }

  return Promise.reject({});
}
