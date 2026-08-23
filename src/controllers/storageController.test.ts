/**
 * Task 6 regression coverage: the literal PoC from the security report
 * (uploading a .php file to a publicly-accessible storage path) must be
 * rejected server-side before a signed upload URL is ever generated.
 */
const mockCreateSignedUploadUrl = jest.fn().mockResolvedValue({
  data: { signedUrl: "https://example.com/upload", path: "x", token: "t" },
  error: null,
});

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn().mockImplementation(() => ({
    storage: {
      from: jest.fn().mockReturnValue({
        createSignedUploadUrl: mockCreateSignedUploadUrl,
        getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: "https://example.com/x" } }),
      }),
    },
  })),
}));

jest.mock("../config/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
}));

import request from "supertest";
import * as jwt from "jsonwebtoken";
import app from "../app";
import { prisma } from "../config/prisma";
import { JWT_PRIVATE_KEY } from "../config/env";

const mockedPrisma = prisma as unknown as { user: { findUnique: jest.Mock } };

const privateKeyPem = Buffer.from(JWT_PRIVATE_KEY!, "base64").toString("ascii");
const token = jwt.sign({ userId: "user-1", role: "TENANT" }, privateKeyPem, {
  algorithm: "RS256",
  expiresIn: "1h",
});

describe("POST /storage/sign-url — file type validation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.user.findUnique.mockResolvedValue({
      userStatus: "ACTIVE",
      userRole: { roleName: "TENANT" },
    });
  });

  it("rejects a .php upload without ever requesting a signed URL", async () => {
    const res = await request(app)
      .post("/storage/sign-url")
      .set("Authorization", `Bearer ${token}`)
      .send({ filename: "leak.php", folder: "maintenance" });

    expect(res.status).toBe(400);
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects a path-traversal folder", async () => {
    const res = await request(app)
      .post("/storage/sign-url")
      .set("Authorization", `Bearer ${token}`)
      .send({ filename: "photo.jpg", folder: "../../etc" });

    expect(res.status).toBe(400);
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("allows an expected image type through to the signed-URL step", async () => {
    const res = await request(app)
      .post("/storage/sign-url")
      .set("Authorization", `Bearer ${token}`)
      .send({ filename: "photo.jpg", folder: "maintenance" });

    expect(res.status).toBe(200);
    expect(mockCreateSignedUploadUrl).toHaveBeenCalledTimes(1);
  });
});
