jest.mock("../config/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
}));

import express from "express";
import request from "supertest";
import { Permission } from "@prisma/client";
import { prisma } from "../config/prisma";
import { requirePermission, requireAnyPermission, requireAdmin } from "./permissionMiddleware";

const mockedPrisma = prisma as unknown as { user: { findUnique: jest.Mock } };

function buildApp(userId: string | undefined, middleware: express.RequestHandler) {
  const app = express();
  app.use((req, _res, next) => {
    if (userId) (req as any).user = { userId };
    next();
  });
  app.use(middleware);
  app.get("/protected", (_req, res) => res.status(200).json({ ok: true }));
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.statusCode || 500).json({ message: err.message });
  });
  return app;
}

describe("requirePermission — role/permission segregation", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects with 403 when there's no authenticated user on the request", async () => {
    const app = buildApp(undefined, requirePermission(Permission.ACCESS_TENANT_PORTAL));
    const res = await request(app).get("/protected");
    expect(res.status).toBe(403);
  });

  it("rejects a TENANT-role user who lacks the required permission with 403", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      userRole: { roleName: "TENANT" },
      permissions: [Permission.REQUEST_MAINTENANCE], // missing ACCESS_TENANT_PORTAL
    });
    const app = buildApp("tenant-1", requirePermission(Permission.ACCESS_TENANT_PORTAL));

    const res = await request(app).get("/protected");

    expect(res.status).toBe(403);
  });

  it("allows a TENANT-role user who has the required permission", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      userRole: { roleName: "TENANT" },
      permissions: [Permission.ACCESS_TENANT_PORTAL],
    });
    const app = buildApp("tenant-1", requirePermission(Permission.ACCESS_TENANT_PORTAL));

    const res = await request(app).get("/protected");

    expect(res.status).toBe(200);
  });

  it("lets an ADMIN-role user through regardless of their permissions array (bypass)", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      userRole: { roleName: "ADMIN" },
      permissions: [],
    });
    const app = buildApp("admin-1", requirePermission(Permission.ACCESS_TENANT_PORTAL));

    const res = await request(app).get("/protected");

    expect(res.status).toBe(200);
  });
});

describe("requireAnyPermission", () => {
  beforeEach(() => jest.clearAllMocks());

  it("allows a user who has at least one of the listed permissions", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      userRole: { roleName: "FACILITY_MANAGER" },
      permissions: [Permission.MANAGE_TICKETS],
    });
    const app = buildApp(
      "fm-1",
      requireAnyPermission(Permission.VIEW_MAINTENANCE_TICKETS, Permission.MANAGE_TICKETS),
    );

    const res = await request(app).get("/protected");

    expect(res.status).toBe(200);
  });

  it("rejects a user who has none of the listed permissions", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      userRole: { roleName: "TENANT" },
      permissions: [],
    });
    const app = buildApp(
      "tenant-1",
      requireAnyPermission(Permission.VIEW_MAINTENANCE_TICKETS, Permission.MANAGE_TICKETS),
    );

    const res = await request(app).get("/protected");

    expect(res.status).toBe(403);
  });
});

describe("requireAdmin — admin-only endpoints reject non-admin roles", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects a TENANT-role user with 403", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ userRole: { roleName: "TENANT" } });
    const app = buildApp("tenant-1", requireAdmin());

    const res = await request(app).get("/protected");

    expect(res.status).toBe(403);
  });

  it("rejects a LANDLORD-role user with 403", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ userRole: { roleName: "LANDLORD" } });
    const app = buildApp("landlord-1", requireAdmin());

    const res = await request(app).get("/protected");

    expect(res.status).toBe(403);
  });

  it("allows an ADMIN-role user", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ userRole: { roleName: "ADMIN" } });
    const app = buildApp("admin-1", requireAdmin());

    const res = await request(app).get("/protected");

    expect(res.status).toBe(200);
  });
});
