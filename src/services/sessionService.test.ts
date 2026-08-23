jest.mock("../config/prisma", () => ({
  prisma: {
    session: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  },
}));

import * as jwt from "jsonwebtoken";
import { SessionService } from "./sessionService";
import { prisma } from "../config/prisma";
import { UnauthorizedError, ForbiddenError } from "../utils/apiError";
import { JWT_PUBLIC_KEY } from "../config/env";

const mockedPrisma = prisma as unknown as {
  session: { findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
};

const REFRESH_TOKEN = "refresh-token-1";

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function baseSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    refreshToken: REFRESH_TOKEN,
    userId: "u1",
    isValid: true,
    createdAt: hoursAgo(0.1),
    lastActiveAt: hoursAgo(0.1),
    user: { userStatus: "ACTIVE", userRole: { roleName: "TENANT" } },
    ...overrides,
  };
}

describe("SessionService.refreshAccessToken — idle/absolute session expiry", () => {
  let service: SessionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionService();
  });

  it("rejects when the refresh token doesn't exist or was already invalidated", async () => {
    mockedPrisma.session.findUnique.mockResolvedValue(null);

    await expect(service.refreshAccessToken(REFRESH_TOKEN)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("rejects a session flagged isValid: false", async () => {
    mockedPrisma.session.findUnique.mockResolvedValue(baseSession({ isValid: false }));

    await expect(service.refreshAccessToken(REFRESH_TOKEN)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("rejects and invalidates the session for a BLOCKED user", async () => {
    mockedPrisma.session.findUnique.mockResolvedValue(
      baseSession({ user: { userStatus: "BLOCKED", userRole: { roleName: "TENANT" } } }),
    );

    await expect(service.refreshAccessToken(REFRESH_TOKEN)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(mockedPrisma.session.updateMany).toHaveBeenCalledWith({
      where: { refreshToken: REFRESH_TOKEN },
      data: { isValid: false },
    });
  });

  it("rejects a session past the 24h absolute lifetime, even if recently active", async () => {
    mockedPrisma.session.findUnique.mockResolvedValue(
      baseSession({ createdAt: hoursAgo(25), lastActiveAt: hoursAgo(0.01) }),
    );

    await expect(service.refreshAccessToken(REFRESH_TOKEN)).rejects.toThrow(
      "Session expired. Please log in again.",
    );
    expect(mockedPrisma.session.updateMany).toHaveBeenCalled();
  });

  it("rejects a session idle for more than 2 hours — regression for the reported 5-day-idle-session finding", async () => {
    // Mirrors the report's exact scenario: a session that's been sitting
    // idle (5 days, in the report) must not still be usable.
    mockedPrisma.session.findUnique.mockResolvedValue(
      baseSession({ createdAt: hoursAgo(23), lastActiveAt: hoursAgo(5 * 24) }),
    );

    await expect(service.refreshAccessToken(REFRESH_TOKEN)).rejects.toThrow(
      "Session expired due to inactivity.",
    );
    expect(mockedPrisma.session.updateMany).toHaveBeenCalledWith({
      where: { refreshToken: REFRESH_TOKEN },
      data: { isValid: false },
    });
  });

  it("issues a new access token, valid ~15 minutes, for a fresh and recently-active session", async () => {
    mockedPrisma.session.findUnique.mockResolvedValue(baseSession());
    mockedPrisma.session.update.mockResolvedValue({});

    const result = await service.refreshAccessToken(REFRESH_TOKEN);

    expect(mockedPrisma.session.update).toHaveBeenCalledWith({
      where: { refreshToken: REFRESH_TOKEN },
      data: { lastActiveAt: expect.any(Date) },
    });

    const publicKey = Buffer.from(JWT_PUBLIC_KEY!, "base64").toString("ascii");
    const decoded = jwt.verify(result.accessToken, publicKey, {
      algorithms: ["RS256"],
    }) as jwt.JwtPayload;
    const ttlSeconds = (decoded.exp as number) - (decoded.iat as number);

    expect(decoded.userId).toBe("u1");
    expect(ttlSeconds).toBeLessThanOrEqual(15 * 60);
  });
});
