import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ConflictError } from "./apiError";

const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Runs `fn` exactly once per idempotency key, even under concurrent callers.
 *
 * The IdempotencyKey.key column is unique, so Postgres — not application
 * logic — decides who wins a race: the first insert succeeds, every other
 * concurrent insert for the same key fails with a unique-constraint
 * violation (P2002) and is treated as a duplicate rather than re-running
 * `fn`. A completed duplicate returns the original response; one still in
 * flight is rejected with 409 so the caller can retry.
 */
export async function withIdempotency<T>(
  key: string,
  tenantId: string,
  endpoint: string,
  fn: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  try {
    await prisma.idempotencyKey.create({
      data: { key, tenantId, endpoint, expiresAt: new Date(Date.now() + ttlMs) },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.idempotencyKey.findUnique({ where: { key } });
      if (existing?.status === "COMPLETED") {
        return existing.responseBody as T;
      }
      throw new ConflictError(
        "A matching request is already being processed. Please wait before retrying.",
      );
    }
    throw err;
  }

  try {
    const result = await fn();
    await prisma.idempotencyKey.update({
      where: { key },
      data: { status: "COMPLETED", responseBody: result as Prisma.InputJsonValue },
    });
    return result;
  } catch (err) {
    // Release the key on failure so a genuine retry (after a real business
    // error, not a duplicate) isn't blocked until TTL expiry.
    await prisma.idempotencyKey.delete({ where: { key } }).catch(() => {});
    throw err;
  }
}
