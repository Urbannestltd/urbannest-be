/**
 * Regression: POST /admin/leases/{leaseId}/terminate must succeed with no
 * request body at all. `reason` was already optional on TerminateLeaseDto,
 * but the tsoa-generated route still marked the body PARAMETER itself as
 * required, so omitting the body entirely (no reason typed) was rejected
 * before ever reaching the service.
 */
jest.mock("../../config/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    lease: { findUnique: jest.fn(), update: jest.fn() },
    unit: { update: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

jest.mock("../../services/external/zeptoMailService", () => ({
  ZeptoMailService: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("../../utils/getAdminRecipients", () => ({
  getAdminRecipients: jest.fn().mockResolvedValue([]),
}));

import request from "supertest";
import * as jwt from "jsonwebtoken";
import app from "../../app";
import { prisma } from "../../config/prisma";
import { JWT_PRIVATE_KEY } from "../../config/env";
import { Permission, LeaseStatus } from "@prisma/client";

const mockedPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  lease: { findUnique: jest.Mock; update: jest.Mock };
  unit: { update: jest.Mock };
};

const privateKeyPem = Buffer.from(JWT_PRIVATE_KEY!, "base64").toString("ascii");
const token = jwt.sign({ userId: "admin-1", role: "ADMIN" }, privateKeyPem, {
  algorithm: "RS256",
  expiresIn: "1h",
});

const LEASE_ID = "lease-1";

describe("POST /admin/leases/{leaseId}/terminate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.user.findUnique.mockResolvedValue({
      userStatus: "ACTIVE",
      userRole: { roleName: "ADMIN" },
      permissions: [Permission.VIEW_TENANTS_AND_LEASES],
    });
    mockedPrisma.lease.findUnique.mockResolvedValue({
      id: LEASE_ID,
      unitId: "unit-1",
      status: LeaseStatus.ACTIVE,
      tenant: { userId: "tenant-1", userFullName: "Tenant", userEmail: "t@example.com" },
      unit: { id: "unit-1", name: "Unit 1", property: { name: "Property 1" } },
    });
  });

  it("terminates the lease with no request body at all (no reason)", async () => {
    const res = await request(app)
      .post(`/admin/leases/${LEASE_ID}/terminate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it("terminates the lease with an empty JSON body", async () => {
    const res = await request(app)
      .post(`/admin/leases/${LEASE_ID}/terminate`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
  });

  it("still accepts a body with a reason", async () => {
    const res = await request(app)
      .post(`/admin/leases/${LEASE_ID}/terminate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "Non-payment" });

    expect(res.status).toBe(200);
  });
});
