import crypto from "crypto";

const {
  publicKey: mockPublicKeyPem,
  privateKey: mockPrivateKeyPem,
} = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const { privateKey: otherPrivateKeyPem } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

jest.mock("../config/env", () => ({
  BASE_URL: "http://localhost",
  GOOGLE_CLIENT_ID: "test-client-id",
  JWT_PRIVATE_KEY: Buffer.from(mockPrivateKeyPem).toString("base64"),
  JWT_PUBLIC_KEY: Buffer.from(mockPublicKeyPem).toString("base64"),
}));

jest.mock("../config/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    session: { create: jest.fn() },
  },
}));

jest.mock("./external/zeptoMailService", () => ({
  ZeptoMailService: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("bcrypt", () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn().mockResolvedValue("hashed-otp"),
}));

import * as jwt from "jsonwebtoken";
import { AuthenticationService } from "./authenticationService";
import { prisma } from "../config/prisma";

const mockedPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; update: jest.Mock };
  session: { create: jest.Mock };
};

function verifyWithPublicKey(token: string) {
  return jwt.verify(token, mockPublicKeyPem, { algorithms: ["RS256"] });
}

describe("AuthenticationService JWT signing", () => {
  let service: AuthenticationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthenticationService();
  });

  it("login() (non-2FA) signs a token that verifies under RS256 with the public key", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      userId: "u1",
      userPassword: "irrelevant-because-bcrypt-is-mocked",
      userStatus: "ACTIVE",
      isTwoFactorEnabled: false,
      userFullName: "Test User",
      userProfileUrl: null,
      userRole: { roleName: "TENANT" },
    });
    mockedPrisma.session.create.mockResolvedValue({});

    const result = await service.login({ email: "test@example.com", password: "pw" });

    expect(result.require2fa).toBe(false);
    if (result.require2fa) throw new Error("expected full login result");

    const decoded = verifyWithPublicKey(result.token) as jwt.JwtPayload;
    expect(decoded.userId).toBe("u1");
    expect(decoded.role).toBe("TENANT");

    // Regression: this was previously "1d" despite a comment saying
    // "15-minute Access Token" — a stale/wrong TTL is exactly how a session
    // ends up outliving its intended idle/absolute policy unnoticed.
    const ttlSeconds = (decoded.exp as number) - (decoded.iat as number);
    expect(ttlSeconds).toBeLessThanOrEqual(15 * 60);
    expect(ttlSeconds).toBeGreaterThan(0);
  });

  it("login() (2FA enabled) signs an RS256 temp token that verifies with the public key", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      userId: "u1",
      userPassword: "irrelevant-because-bcrypt-is-mocked",
      userStatus: "ACTIVE",
      isTwoFactorEnabled: true,
      userFullName: "Test User",
      userEmail: "test@example.com",
      userRole: { roleName: "TENANT" },
    });
    mockedPrisma.user.update.mockResolvedValue({});

    const result = await service.login({ email: "test@example.com", password: "pw" });

    expect(result.require2fa).toBe(true);
    if (!result.require2fa) throw new Error("expected 2FA pending result");

    const decoded = verifyWithPublicKey(result.tempToken) as jwt.JwtPayload;
    expect(decoded.userId).toBe("u1");
    expect(decoded.scope).toBe("2FA_PENDING");
  });

  it("verifyLoginOtp() verifies the RS256 temp token and issues a final token that round-trips through RS256 verification (regression: previously the final token was signed HS256 and could not be verified by the RS256-only route guard)", async () => {
    const tempToken = jwt.sign(
      { userId: "u1", scope: "2FA_PENDING" },
      mockPrivateKeyPem,
      { algorithm: "RS256", expiresIn: "5m" },
    );

    mockedPrisma.user.findUnique.mockResolvedValue({
      userId: "u1",
      userEmail: "test@example.com",
      userFullName: "Test User",
      userProfileUrl: null,
      twoFactorExpiry: new Date(Date.now() + 60_000),
      twoFactorSecret: "hashed-otp",
      userRole: { roleName: "TENANT" },
    });
    mockedPrisma.user.update.mockResolvedValue({});

    const result = await service.verifyLoginOtp(tempToken, "123456");

    const decoded = verifyWithPublicKey(result.token) as jwt.JwtPayload;
    expect(decoded.userId).toBe("u1");
    expect(decoded.role).toBe("TENANT");
  });

  it("verifyLoginOtp() rejects a temp token signed with a different key", async () => {
    const forgedTempToken = jwt.sign(
      { userId: "u1", scope: "2FA_PENDING" },
      otherPrivateKeyPem,
      { algorithm: "RS256", expiresIn: "5m" },
    );

    await expect(service.verifyLoginOtp(forgedTempToken, "123456")).rejects.toThrow(
      "Invalid or expired 2FA session token.",
    );
    expect(mockedPrisma.user.findUnique).not.toHaveBeenCalled();
  });
});
