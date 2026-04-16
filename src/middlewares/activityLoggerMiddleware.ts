import { Request, Response, NextFunction } from "express";
import { logActivity } from "../utils/activityLogger";

const LOGGED_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const EXCLUDED_PREFIXES = ["/docs", "/payments/webhook"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Strips UUIDs and numeric segments then joins into a readable action string.
// e.g. POST /admin/users/abc-123/suspend → POST_ADMIN_USERS_SUSPEND
function deriveAction(method: string, path: string): string {
  const segments = path
    .split("/")
    .filter((s) => s && !UUID_RE.test(s) && !/^\d+$/.test(s));

  return [method, ...segments].join("_").toUpperCase();
}

export function activityLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!LOGGED_METHODS.has(req.method)) return next();
  if (EXCLUDED_PREFIXES.some((p) => req.path.startsWith(p))) return next();

  res.on("finish", () => {
    const user = (req as any).user;

    if (!user?.userId) return;
    if (res.statusCode >= 400) return;

    logActivity({
      userId: user.userId,
      action: deriveAction(req.method, req.path),
      description: `${req.method} ${req.originalUrl}`,
      ipAddress:
        (req.headers["x-forwarded-for"] as string) ||
        req.socket.remoteAddress,
      metadata: {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
      },
    });
  });

  next();
}
