import { Request, Response, NextFunction } from "express";
import { logActivity } from "../utils/activityLogger";

const LOGGED_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Routes that have no JWT on the request — userId must be pulled from the
// response body instead.  Map: flat route key → extractor function.
const AUTH_BODY_ROUTES: Record<string, (body: any) => string | null> = {
  // Login: userId lives at data.id, but only when 2FA is not required
  "POST /auth/login": (body) =>
    body?.data?.require2fa ? null : (body?.data?.id ?? null),
  // Register: userId lives at data.userId
  "POST /auth/register": (body) => body?.data?.userId ?? null,
};

const EXCLUDED_PREFIXES = ["/docs", "/payments/webhook"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Route → { action, description } lookup
// Key format: "METHOD /normalised/path" (UUIDs stripped, leading slash kept)
// ---------------------------------------------------------------------------
const ROUTE_LABELS: Record<string, { action: string; description: string }> = {
  // ── Admin: Users ──────────────────────────────────────────────────────────
  "POST /admin/create-user": {
    action: "Invited User",
    description: "Sent a registration invite to a new user",
  },
  "PUT /admin/users/suspend": {
    action: "Suspended User",
    description: "Suspended a user account",
  },
  "PUT /admin/users/activate": {
    action: "Activated User",
    description: "Reactivated a user account",
  },
  "PATCH /admin/users/permissions": {
    action: "Updated Permissions",
    description: "Updated access permissions for a user",
  },

  // ── Admin: Settings ───────────────────────────────────────────────────────
  "PATCH /admin/settings/password": {
    action: "Changed Password",
    description: "Changed account password",
  },
  "PATCH /admin/settings/notifications": {
    action: "Updated Notifications",
    description: "Updated email notification preferences",
  },
  "PATCH /admin/settings/system": {
    action: "Updated System Settings",
    description: "Updated global system settings",
  },

  // ── Admin: Properties ─────────────────────────────────────────────────────
  "POST /admin/properties": {
    action: "Created Property",
    description: "Added a new property",
  },
  "PUT /admin/properties": {
    action: "Updated Property",
    description: "Updated property details",
  },
  "DELETE /admin/properties": {
    action: "Deleted Property",
    description: "Removed a property",
  },
  "POST /admin/properties/members": {
    action: "Added Property Member",
    description: "Assigned a member (landlord / FM / agent) to a property",
  },
  "DELETE /admin/properties/members": {
    action: "Removed Property Member",
    description: "Removed a member from a property",
  },

  // ── Admin: Units ──────────────────────────────────────────────────────────
  "POST /admin/units": {
    action: "Added Unit",
    description: "Added a new unit to a property",
  },
  "DELETE /admin/units": {
    action: "Deleted Unit",
    description: "Removed a unit from a property",
  },

  // ── Admin: Leases ─────────────────────────────────────────────────────────
  "POST /admin/leases": {
    action: "Created Lease",
    description: "Created a new lease for a tenant",
  },
  "PATCH /admin/leases": {
    action: "Updated Lease",
    description: "Updated lease terms",
  },
  "POST /admin/leases/renew": {
    action: "Renewed Lease",
    description: "Renewed an expired lease",
  },

  // ── Admin: Maintenance Tickets ────────────────────────────────────────────
  "PUT /admin/properties/tickets/status": {
    action: "Updated Ticket Status",
    description: "Changed the status of a maintenance ticket",
  },
  "PATCH /admin/properties/tickets/budget": {
    action: "Set Ticket Budget",
    description: "Set the budget for a maintenance ticket",
  },
  "POST /admin/properties/tickets/approve": {
    action: "Approved Ticket",
    description: "Approved a maintenance request",
  },
  "POST /admin/properties/tickets/reject": {
    action: "Rejected Ticket",
    description: "Rejected a maintenance request",
  },
  "POST /admin/properties/tickets/rebuttal": {
    action: "Sent Rebuttal",
    description: "Sent a counter-response on a maintenance request",
  },
  "POST /admin/properties/tickets/comments": {
    action: "Commented on Ticket",
    description: "Added a comment to a maintenance ticket",
  },

  // ── Admin: Expenses ───────────────────────────────────────────────────────
  "POST /admin/expenses": {
    action: "Logged Expense",
    description: "Recorded a new property expense",
  },

  // ── Tenant: Authentication ────────────────────────────────────────────────
  "POST /auth/register": {
    action: "Completed Registration",
    description: "Completed account registration",
  },
  "POST /auth/login": {
    action: "Logged In",
    description: "Signed in to the platform",
  },
  "POST /auth/logout": {
    action: "Logged Out",
    description: "Signed out of the platform",
  },
  "POST /auth/forgot-password": {
    action: "Requested Password Reset",
    description: "Requested a password reset link",
  },
  "POST /auth/reset-password": {
    action: "Reset Password",
    description: "Reset account password via email link",
  },

  // ── Tenant: Settings ──────────────────────────────────────────────────────
  "PATCH /tenant/settings/profile": {
    action: "Updated Profile",
    description: "Updated personal profile information",
  },
  "PATCH /tenant/settings/password": {
    action: "Changed Password",
    description: "Changed account password",
  },
  "PATCH /tenant/settings/notifications": {
    action: "Updated Notifications",
    description: "Updated email notification preferences",
  },
  "POST /tenant/settings/two-factor/setup": {
    action: "Enabled 2FA",
    description: "Set up two-factor authentication",
  },
  "DELETE /tenant/settings/two-factor": {
    action: "Disabled 2FA",
    description: "Removed two-factor authentication",
  },

  // ── Tenant: Maintenance ───────────────────────────────────────────────────
  "POST /tenant/maintenance": {
    action: "Submitted Maintenance Request",
    description: "Submitted a new maintenance request",
  },
  "PATCH /tenant/maintenance": {
    action: "Updated Maintenance Request",
    description: "Updated a maintenance request",
  },
  "POST /tenant/maintenance/messages": {
    action: "Replied to Maintenance Ticket",
    description: "Sent a message on a maintenance ticket",
  },

  // ── Tenant: Support ───────────────────────────────────────────────────────
  "POST /tenant/support": {
    action: "Opened Support Ticket",
    description: "Opened a new support ticket",
  },
  "POST /tenant/support/messages": {
    action: "Replied to Support Ticket",
    description: "Sent a reply on a support ticket",
  },

  // ── Tenant: Visitors ──────────────────────────────────────────────────────
  "POST /tenant/visitors": {
    action: "Created Visitor Invite",
    description: "Generated a visitor access invite",
  },
  "POST /tenant/visitors/bulk": {
    action: "Created Bulk Visitor Invites",
    description: "Generated multiple visitor access invites",
  },
  "PUT /tenant/visitors/checkin": {
    action: "Checked In Visitor",
    description: "Checked a visitor in at the gate",
  },
  "PUT /tenant/visitors/checkout": {
    action: "Checked Out Visitor",
    description: "Checked a visitor out at the gate",
  },
  "DELETE /tenant/visitors": {
    action: "Revoked Visitor Invite",
    description: "Revoked a visitor's access invite",
  },

  // ── Tenant: Reminders ─────────────────────────────────────────────────────
  "POST /tenant/reminders": {
    action: "Created Reminder",
    description: "Set a new personal reminder",
  },
  "PATCH /tenant/reminders": {
    action: "Updated Reminder",
    description: "Updated a reminder",
  },
  "DELETE /tenant/reminders": {
    action: "Deleted Reminder",
    description: "Deleted a reminder",
  },

  // ── Payments ──────────────────────────────────────────────────────────────
  "POST /tenant/rent/pay": {
    action: "Initiated Payment",
    description: "Started a rent payment transaction",
  },
  "POST /payments/verify": {
    action: "Verified Payment",
    description: "Completed a payment transaction",
  },
};

// Normalise a live request path by replacing UUIDs and numeric IDs with a
// placeholder so it matches the lookup keys above.
function normalisePath(path: string): string {
  return path
    .split("/")
    .map((s) => (UUID_RE.test(s) || /^\d+$/.test(s) ? ":id" : s))
    .filter((s, i, arr) => !(s === ":id" && arr[i - 1] === ":id")) // collapse consecutive :id
    .join("/");
}

// Build the lookup key and match it against ROUTE_LABELS.
// Strips :id segments from the normalised path so a key like
// "PUT /admin/users/suspend" matches "PUT /admin/users/:id/suspend".
function resolveLabel(
  method: string,
  path: string,
): { action: string; description: string } {
  const normalised = normalisePath(path);
  // Remove :id placeholders to produce a flat key, then try exact match
  const flatKey = `${method} ${normalised.replace(/\/:id/g, "")}`;
  if (ROUTE_LABELS[flatKey]) return ROUTE_LABELS[flatKey]!;

  // Fallback: build a readable sentence from the path segments
  const segments = normalised.split("/").filter((s) => s && s !== ":id");
  const verb =
    method === "POST"
      ? "Created"
      : method === "PUT"
        ? "Updated"
        : method === "PATCH"
          ? "Modified"
          : method === "DELETE"
            ? "Deleted"
            : "Performed action on";
  const subject = segments[segments.length - 1] ?? "resource";
  const readable = subject.replace(/-/g, " ");
  return {
    action: `${verb} ${readable.replace(/\b\w/g, (c) => c.toUpperCase())}`,
    description: `${verb} ${readable}`,
  };
}

export function activityLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!LOGGED_METHODS.has(req.method)) return next();
  if (EXCLUDED_PREFIXES.some((p) => req.path.startsWith(p))) return next();

  // For auth routes that have no JWT, intercept the response body so we can
  // extract the userId from what the handler returns.
  const flatKey = `${req.method} ${normalisePath(req.path).replace(/\/:id/g, "")}`;
  const authExtractor = AUTH_BODY_ROUTES[flatKey];
  let capturedBody: any = null;

  if (authExtractor) {
    const origJson = res.json.bind(res);
    (res as any).json = function (body: any) {
      capturedBody = body;
      return origJson(body);
    };
  }

  res.on("finish", () => {
    if (res.statusCode >= 400) return;

    const user = (req as any).user;
    const userId: string | null =
      user?.userId ?? (authExtractor ? authExtractor(capturedBody) : null);

    if (!userId) return;

    const { action, description } = resolveLabel(req.method, req.path);

    logActivity({
      userId,
      action,
      description,
      ipAddress:
        (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress,
      metadata: {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
      },
    });
  });

  next();
}
