import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { Request, Response, NextFunction } from "express";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Shared Upstash Redis client, used when UPSTASH_REDIS_REST_URL /
 * UPSTASH_REDIS_REST_TOKEN are configured. This makes rate limits hold
 * across all Vercel serverless instances, not just one warm process.
 *
 * When those env vars are absent (e.g. local dev, or before the Upstash
 * database has been provisioned), every limiter below falls back to
 * express-rate-limit's in-memory store, which only enforces per-process.
 */
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = upstashUrl && upstashToken ? new Redis({ url: upstashUrl, token: upstashToken }) : null;

if (!redis) {
  console.warn(
    "[RateLimit] UPSTASH_REDIS_REST_URL/TOKEN not set — rate limiting is in-memory only and does not hold across serverless instances.",
  );
}

type LimitOptions = { windowMs: number; max: number; message: string };

function upstashMiddleware(prefix: string, options: LimitOptions, keyFn: (req: Request) => string) {
  const limiter = new Ratelimit({
    redis: redis!,
    limiter: Ratelimit.slidingWindow(options.max, `${options.windowMs} ms`),
    prefix: `ratelimit:${prefix}`,
  });

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { success } = await limiter.limit(keyFn(req));
      if (!success) {
        res.status(429).json({ success: false, message: options.message });
        return;
      }
      next();
    } catch (err: any) {
      // Fail open on Upstash outage rather than blocking all traffic.
      console.error(`[RateLimit] Upstash check failed for ${prefix}:`, err.message);
      next();
    }
  };
}

/**
 * Per-authenticated-user rate limiter. Runs after auth middleware (tsoa
 * applies @Middlewares after @Security), so req.user is already set.
 */
export function perUserRateLimit(options: LimitOptions) {
  const keyFn = (req: Request) => (req as any).user?.userId ?? (req.ip ? ipKeyGenerator(req.ip) : "anonymous");

  if (redis) {
    return upstashMiddleware("user", options, keyFn);
  }

  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyFn,
    message: { success: false, message: options.message },
  });
}

export const visitorInviteRateLimit = perUserRateLimit({
  windowMs: 60_000,
  max: 10,
  message: "Too many visitor invite requests. Please wait a moment and try again.",
});

/**
 * IP-keyed rate limiter for unauthenticated endpoints (login, password reset,
 * OTP verification) where there is no req.user yet to key on. Guards against
 * credential-stuffing / brute-force and OTP-guessing.
 */
export function ipRateLimit(options: LimitOptions) {
  const keyFn = (req: Request) => (req.ip ? ipKeyGenerator(req.ip) : "anonymous");

  if (redis) {
    return upstashMiddleware("ip", options, keyFn);
  }

  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyFn,
    message: { success: false, message: options.message },
  });
}

export const loginRateLimit = ipRateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  message: "Too many login attempts. Please wait a few minutes and try again.",
});

export const otpRateLimit = ipRateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  message: "Too many verification attempts. Please wait a few minutes and try again.",
});

export const passwordResetRateLimit = ipRateLimit({
  windowMs: 15 * 60_000,
  max: 5,
  message: "Too many password reset requests. Please wait a few minutes and try again.",
});
