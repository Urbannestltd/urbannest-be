import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { Request } from "express";

/**
 * Per-authenticated-user rate limiter. Runs after auth middleware (tsoa
 * applies @Middlewares after @Security), so req.user is already set.
 *
 * Uses express-rate-limit's default in-memory store, which is per-process —
 * on serverless (this app deploys to Vercel) that means the limit is only
 * enforced within a single warm instance, not globally across all
 * concurrent invocations. Still meaningfully cuts down on burst abuse from
 * a single client hitting a warm instance; revisit with a shared store
 * (Redis/Upstash) if stronger guarantees are needed.
 */
export function perUserRateLimit(options: { windowMs: number; max: number; message: string }) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) =>
      (req as any).user?.userId ?? (req.ip ? ipKeyGenerator(req.ip) : "anonymous"),
    message: { success: false, message: options.message },
  });
}

export const visitorInviteRateLimit = perUserRateLimit({
  windowMs: 60_000,
  max: 10,
  message: "Too many visitor invite requests. Please wait a moment and try again.",
});
