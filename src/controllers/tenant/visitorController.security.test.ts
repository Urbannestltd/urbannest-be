/**
 * Task 2 regression coverage: POST /tenant/visitors/invite must reject an
 * invalid/missing token before any invite is created or email sent — auth
 * has to be true short-circuiting middleware, not a check whose result can
 * be ignored downstream.
 */
jest.mock("../../config/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    lease: { findFirst: jest.fn() },
    visitorInvite: { findUnique: jest.fn(), create: jest.fn() },
  },
}));

// Every ZeptoMailService instance (including unrelated module-level singletons
// created elsewhere in the app on import) shares this spy, so we can assert on
// the one that matters — whether *this* request's flow ever sent mail.
const mockSendEmail = jest.fn().mockResolvedValue(undefined);
jest.mock("../../services/external/zeptoMailService", () => ({
  ZeptoMailService: jest.fn().mockImplementation(() => ({
    sendEmail: mockSendEmail,
  })),
  zeptoMailService: { sendEmail: mockSendEmail },
}));

import request from "supertest";
import app from "../../app";
import { prisma } from "../../config/prisma";

const mockedPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  lease: { findFirst: jest.Mock };
  visitorInvite: { findUnique: jest.Mock; create: jest.Mock };
};

const validInviteBody = {
  visitor: { name: "Jane Doe", phone: "08000000000" },
  type: "GUEST",
  frequency: "ONE_OFF",
  startDate: new Date(Date.now() + 60_000).toISOString(),
  endDate: new Date(Date.now() + 120_000).toISOString(),
};

describe("POST /tenant/visitors/invite — auth enforcement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects a request with no token, and never touches the DB or email", async () => {
    const res = await request(app)
      .post("/tenant/visitors/invite")
      .send(validInviteBody);

    expect(res.status).toBe(401);
    expect(mockedPrisma.lease.findFirst).not.toHaveBeenCalled();
    expect(mockedPrisma.visitorInvite.create).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("rejects a request with a garbage/invalid token, and never touches the DB or email", async () => {
    const res = await request(app)
      .post("/tenant/visitors/invite")
      .set("Authorization", "Bearer not-a-real-jwt")
      .send(validInviteBody);

    expect(res.status).toBe(401);
    expect(mockedPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockedPrisma.lease.findFirst).not.toHaveBeenCalled();
    expect(mockedPrisma.visitorInvite.create).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("rejects a request with an expired token, and never touches the DB or email", async () => {
    const jwt = await import("jsonwebtoken");
    const crypto = await import("crypto");
    const { privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    // Signed with an unrelated keypair, not the server's real JWT_PRIVATE_KEY —
    // equivalent to an attacker-forged or stale token from the caller's perspective.
    const expiredToken = jwt.sign({ userId: "u1", role: "TENANT" }, privateKey, {
      algorithm: "RS256",
      expiresIn: -10,
    });

    const res = await request(app)
      .post("/tenant/visitors/invite")
      .set("Authorization", `Bearer ${expiredToken}`)
      .send(validInviteBody);

    expect(res.status).toBe(401);
    expect(mockedPrisma.visitorInvite.create).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
