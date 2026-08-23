import { Request, Response, NextFunction } from "express";

// Query params that carry a secret and must never be printed in full —
// signed-URL tokens (Supabase, etc.), or a JWT/session token if a client
// sends one via the URL despite the backend no longer accepting it there.
const SENSITIVE_QUERY_PARAMS = ["token", "access_token", "signature", "apikey", "api_key"];

/** Redacts known-sensitive query param values before a URL is logged. */
export function redactSensitiveQueryParams(url: string): string {
  const [path, query] = url.split("?");
  if (!query) return url;

  const params = new URLSearchParams(query);
  for (const key of SENSITIVE_QUERY_PARAMS) {
    if (params.has(key)) params.set(key, "[REDACTED]");
  }
  return `${path}?${params.toString()}`;
}

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${redactSensitiveQueryParams(req.url)}`);
  next();
};
