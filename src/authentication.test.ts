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

jest.mock("./config/env", () => ({
  JWT_PUBLIC_KEY: Buffer.from(mockPublicKeyPem).toString("base64"),
}));

jest.mock("./config/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
}));

import * as jwt from "jsonwebtoken";
import { expressAuthentication } from "./authentication";
import { prisma } from "./config/prisma";
import { UnauthorizedError, ForbiddenError } from "./utils/apiError";

const mockedPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
};

function signToken(
  payload: object,
  options: jwt.SignOptions = {},
  key: string = mockPrivateKeyPem,
) {
  return jwt.sign(payload, key, {
    algorithm: "RS256",
    expiresIn: "1h",
    ...options,
  });
}

function makeRequest(token: string): any {
  return { headers: { authorization: `Bearer ${token}` }, body: {}, query: {} };
}

describe("expressAuthentication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolves for a valid token whose role matches the current DB role", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      userStatus: "ACTIVE",
      userRole: { roleName: "TENANT" },
    });
    const token = signToken({ userId: "u1", role: "TENANT" });

    const decoded = await expressAuthentication(makeRequest(token), "jwt");

    expect(decoded.userId).toBe("u1");
  });

  it("rejects a token signed with a different key (forged/re-signed token)", async () => {
    const token = signToken({ userId: "u1", role: "TENANT" }, {}, otherPrivateKeyPem);

    await expect(expressAuthentication(makeRequest(token), "jwt")).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(mockedPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an expired token", async () => {
    const token = signToken({ userId: "u1", role: "TENANT" }, { expiresIn: -10 });

    await expect(expressAuthentication(makeRequest(token), "jwt")).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("rejects when the token's role is not among the route's declared scopes", async () => {
    const token = signToken({ userId: "u1", role: "TENANT" });

    await expect(
      expressAuthentication(makeRequest(token), "jwt", ["ADMIN"]),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects when the token's role no longer matches the user's current DB role", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      userStatus: "ACTIVE",
      userRole: { roleName: "ADMIN" },
    });
    const token = signToken({ userId: "u1", role: "TENANT" });

    await expect(expressAuthentication(makeRequest(token), "jwt")).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("rejects a blocked user", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      userStatus: "BLOCKED",
      userRole: { roleName: "TENANT" },
    });
    const token = signToken({ userId: "u1", role: "TENANT" });

    await expect(expressAuthentication(makeRequest(token), "jwt")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
