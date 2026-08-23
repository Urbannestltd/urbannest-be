/**
 * Task 3 regression coverage: N concurrent identical POST /tenant/visitors/invite
 * requests (e.g. a double-tap or a client retry racing the original request)
 * must produce exactly one invite record and one email, not one per request.
 *
 * The IdempotencyKey.key column is unique at the DB level; this mock models
 * that guarantee with an in-memory map so the "first writer wins, everyone
 * else gets a unique-constraint violation" behavior is exercised the same
 * way it would be against real Postgres.
 */
const mockIdempotencyStore = new Map<string, any>();

jest.mock("../../config/prisma", () => {
  const { Prisma } = require("@prisma/client");

  return {
    prisma: {
      user: { findUnique: jest.fn() },
      lease: { findFirst: jest.fn() },
      visitorInvite: { findUnique: jest.fn(), create: jest.fn() },
      idempotencyKey: {
        create: jest.fn(async ({ data }: any) => {
          if (mockIdempotencyStore.has(data.key)) {
            throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
              code: "P2002",
              clientVersion: "6.19.1",
            });
          }
          const row = { ...data, status: "PROCESSING", responseBody: null };
          mockIdempotencyStore.set(data.key, row);
          return row;
        }),
        findUnique: jest.fn(async ({ where }: any) => mockIdempotencyStore.get(where.key) ?? null),
        update: jest.fn(async ({ where, data }: any) => {
          const existing = mockIdempotencyStore.get(where.key);
          const updated = { ...existing, ...data };
          mockIdempotencyStore.set(where.key, updated);
          return updated;
        }),
        delete: jest.fn(async ({ where }: any) => {
          mockIdempotencyStore.delete(where.key);
        }),
      },
    },
  };
});

const mockSendEmail = jest.fn().mockResolvedValue(undefined);
jest.mock("../../services/external/zeptoMailService", () => ({
  ZeptoMailService: jest.fn().mockImplementation(() => ({ sendEmail: mockSendEmail })),
  zeptoMailService: { sendEmail: mockSendEmail },
}));

import request from "supertest";
import * as jwt from "jsonwebtoken";
import app from "../../app";
import { prisma } from "../../config/prisma";
import { JWT_PRIVATE_KEY } from "../../config/env";
import { Permission } from "@prisma/client";

const mockedPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  lease: { findFirst: jest.Mock };
  visitorInvite: { findUnique: jest.Mock; create: jest.Mock };
};

const privateKeyPem = Buffer.from(JWT_PRIVATE_KEY!, "base64").toString("ascii");
const token = jwt.sign({ userId: "tenant-1", role: "TENANT" }, privateKeyPem, {
  algorithm: "RS256",
  expiresIn: "1h",
});

const inviteBody = {
  visitor: { name: "Jane Doe", phone: "08000000000" },
  type: "GUEST",
  frequency: "ONE_OFF",
  startDate: new Date(Date.now() + 60_000).toISOString(),
  endDate: new Date(Date.now() + 120_000).toISOString(),
};

describe("POST /tenant/visitors/invite — idempotency under concurrency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIdempotencyStore.clear();

    mockedPrisma.user.findUnique.mockResolvedValue({
      userStatus: "ACTIVE",
      userRole: { roleName: "TENANT" },
      permissions: [Permission.VISITOR_ALLOWANCE],
    });
    mockedPrisma.lease.findFirst.mockResolvedValue({ unitId: "unit-1" });
    mockedPrisma.visitorInvite.findUnique.mockResolvedValue(null);
    mockedPrisma.visitorInvite.create.mockResolvedValue({
      visitorName: "Jane Doe",
      validFrom: new Date(),
      validUntil: new Date(),
      tenant: { userFullName: "Test Tenant", userEmail: "tenant@example.com" },
    });
  });

  it("N concurrent identical requests with the same Idempotency-Key produce exactly one invite and one email", async () => {
    const CONCURRENCY = 5;
    const idempotencyKey = "click-1";

    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        request(app)
          .post("/tenant/visitors/invite")
          .set("Authorization", `Bearer ${token}`)
          .set("Idempotency-Key", idempotencyKey)
          .send(inviteBody),
      ),
    );

    // A duplicate can land one of two ways depending on timing: 409 if it
    // arrives while the original is still in flight, or a replayed 200 with
    // the original's cached response if it arrives after the original
    // completed. Both are correct idempotent outcomes — what must hold
    // regardless of timing is that exactly one invite was actually created.
    for (const res of responses) {
      expect([200, 409]).toContain(res.status);
    }
    const succeeded = responses.filter((r) => r.status === 200);
    expect(succeeded.length).toBeGreaterThanOrEqual(1);
    const distinctCodes = new Set(succeeded.map((r) => r.body.data.code));
    expect(distinctCodes.size).toBe(1);

    expect(mockedPrisma.visitorInvite.create).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("a request with a different Idempotency-Key is treated as a separate invite", async () => {
    await request(app)
      .post("/tenant/visitors/invite")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "click-1")
      .send(inviteBody);

    await request(app)
      .post("/tenant/visitors/invite")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "click-2")
      .send(inviteBody);

    expect(mockedPrisma.visitorInvite.create).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });
});
