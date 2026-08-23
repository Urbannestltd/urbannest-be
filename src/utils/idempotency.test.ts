jest.mock("../config/prisma", () => ({
  prisma: {
    idempotencyKey: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { Prisma } from "@prisma/client";
import { withIdempotency } from "./idempotency";
import { prisma } from "../config/prisma";
import { ConflictError } from "./apiError";

const mockedPrisma = prisma as unknown as {
  idempotencyKey: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.19.1",
  });
}

describe("withIdempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("runs fn and marks the key COMPLETED on success", async () => {
    mockedPrisma.idempotencyKey.create.mockResolvedValue({});
    mockedPrisma.idempotencyKey.update.mockResolvedValue({});
    const fn = jest.fn().mockResolvedValue({ ok: true });

    const result = await withIdempotency("k1", "tenant1", "POST /x", fn);

    expect(result).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.idempotencyKey.update).toHaveBeenCalledWith({
      where: { key: "k1" },
      data: { status: "COMPLETED", responseBody: { ok: true } },
    });
  });

  it("returns the cached response for a key that already completed, without re-running fn", async () => {
    mockedPrisma.idempotencyKey.create.mockRejectedValue(uniqueViolation());
    mockedPrisma.idempotencyKey.findUnique.mockResolvedValue({
      status: "COMPLETED",
      responseBody: { code: "123456" },
    });
    const fn = jest.fn();

    const result = await withIdempotency("k1", "tenant1", "POST /x", fn);

    expect(result).toEqual({ code: "123456" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("rejects with ConflictError when a matching request is still in flight", async () => {
    mockedPrisma.idempotencyKey.create.mockRejectedValue(uniqueViolation());
    mockedPrisma.idempotencyKey.findUnique.mockResolvedValue({
      status: "PROCESSING",
      responseBody: null,
    });
    const fn = jest.fn();

    await expect(withIdempotency("k1", "tenant1", "POST /x", fn)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("releases the key when fn throws, so a real retry isn't blocked", async () => {
    mockedPrisma.idempotencyKey.create.mockResolvedValue({});
    mockedPrisma.idempotencyKey.delete.mockResolvedValue({});
    const fn = jest.fn().mockRejectedValue(new Error("business error"));

    await expect(withIdempotency("k1", "tenant1", "POST /x", fn)).rejects.toThrow(
      "business error",
    );
    expect(mockedPrisma.idempotencyKey.delete).toHaveBeenCalledWith({ where: { key: "k1" } });
  });
});
