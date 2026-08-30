# Notifications — Frontend Integration Guide

Covers two things: (1) the generic notification inbox every role now has, and
(2) the admin "Send Notice" feature that writes into it. All endpoints use the
standard response envelope: `{ success: boolean, message: string, data? }`.
Auth: `Authorization: Bearer <jwt>` on every call below.

There is **no real-time push** (no sockets/SSE). New notifications only show
up on the next call to these endpoints — poll them (see "Polling" below).

---

## 1. The `Notification` object

Every endpoint that returns notifications returns objects shaped like this:

```ts
{
  id: string;
  recipientId: string;
  senderId: string | null;       // null = system-generated; set = another user (e.g. admin) authored it
  type: NotificationType;
  title: string;
  body: string;
  entityType: string | null;     // e.g. "MaintenanceRequest", "Lease" — for deep-linking, see table below
  entityId: string | null;
  readAt: string | null;         // ISO datetime, or null if unread
  createdAt: string;             // ISO datetime
}
```

`NotificationType` is one of:

```
NOTICE            // admin-authored official notice — always show this distinctly (see §3)
MAINTENANCE
VISITOR
LEASE
PAYMENT
TICKET_APPROVAL
WALK_IN
AGENT_LEAD
SYSTEM
```

`entityType` (when present) tells you what to deep-link to and matches the
type of resource `entityId` refers to:

| `entityType` | `entityId` is a... | Suggested destination |
|---|---|---|
| `MaintenanceRequest` | ticket id | Maintenance ticket detail / chat |
| `VisitorInvite` | visit id | Visitor detail / walk-in approval screen |
| `Lease` | lease id | Lease detail |
| `Payment` | payment id | Payment/receipt detail |
| `AgentLead` | lead id | Agent lead / landlord approval screen |
| `AgentVisit` | visit id | Agent visit detail |

`entityType`/`entityId` can both be `null` (e.g. every `NOTICE` from Send
Notice has no linked entity — it's just a message).

---

## 2. Inbox endpoints (every role, same shape)

These work identically regardless of role — the backend scopes everything to
the JWT's user, so there's one integration to build, reused across tenant,
admin, FM, front desk, landlord, and agent surfaces.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/notifications` | Full list, most-recent-first. No pagination — returns everything. |
| `GET` | `/notifications?unreadOnly=true` | Same, filtered to unread only. |
| `GET` | `/notifications/unread-count` | `{ count: number }` — for a nav badge. |
| `PATCH` | `/notifications/{id}/read` | Marks one notification read. `403` if it isn't the caller's. |
| `POST` | `/notifications/mark-all-read` | Marks every unread notification for the caller as read. |

**Suggested wiring:**
- A bell/inbox icon in the app shell, badge from `unread-count`.
- Opening the panel/page calls `GET /notifications`; render `readAt == null` rows as unread (bold/dot).
- Mark a notification read either when the user opens it, or on an explicit "mark read" action — call `PATCH /notifications/{id}/read`.
- A "mark all read" button/link → `POST /notifications/mark-all-read`.
- Tapping/clicking a notification with a non-null `entityType`/`entityId` should navigate to the matching screen per the table above.

---

## 3. Admin "Send Notice"

On a tenant's (or any user's) admin profile page, add a **Send Notice**
action that opens a compose form and posts:

```
POST /admin/users/{userId}/notices
{
  "title": string,    // 1–150 chars
  "message": string   // 1–5000 chars
}
```

Response: `{ success: true, message: "Notice sent successfully" }` (no `data`).

Behavior to know about:
- The in-app notification (`type: "NOTICE"`) is **always** created for the recipient, regardless of their email preference.
- The recipient also gets emailed the notice **unless** they've turned off `emailNotices` in their own notification settings (see §4) — there's no way for the admin to force an email past that toggle, and no separate "email sent" confirmation is returned.
- There's no history/list of notices sent *by* an admin from this endpoint — if you want a "notices I've sent" view, that would need to be read back via each recipient's own `GET /notifications` (filtered client-side to `type === "NOTICE"`), since there's no admin-side sent-log endpoint yet.
- `title`/`message` are free text — no markdown/HTML rendering is applied; render as plain text on the receiving end.

---

## 4. Per-user notification preferences (`emailNotices`)

Whether a user's official notices are also emailed to them is controlled by
their own `NotificationSetting.emailNotices` (default `true`). This sits
alongside the existing category toggles (`emailPayments`, `emailLease`,
`emailMaintenance`, `emailVisitors`) that already exist per role's settings
screen:

| Role | Endpoint |
|---|---|
| Tenant | `GET` / `PATCH /tenant/settings/notifications` |
| Facility Manager | FM settings controller (`emailNotices` alongside the existing `email*`/`fmEmail*` toggles) |
| Landlord | Landlord settings controller (same) |
| Admin | `GET` / `PATCH /admin/settings/notifications` (this is the **admin's own** preferences, not a way to manage another user's) |

Add `emailNotices` as a new toggle ("Official notices") wherever the existing
`emailPayments`/`emailLease`/`emailMaintenance`/`emailVisitors` toggles are
rendered today — same pattern, same PATCH call, one more field.

**Known gap:** front-desk currently has no notification-preferences endpoint
at all (existing gap, not new). Front-desk users will always be treated as
opted-in (`emailNotices` defaults to `true`) until that's built — don't wire
a toggle for front-desk yet, there's nowhere to save it.

---

## 5. Polling

No push/SSE exists yet, so:
- Poll `GET /notifications/unread-count` on an interval (e.g. every 30–60s) for the badge.
- Refresh `GET /notifications` when the inbox panel/page is opened, and optionally on the same interval if you want the list itself to update live while open.
- Don't poll faster than needed — there's no server-side rate limiting built specifically for this endpoint, but it's a plain unpaginated `findMany`, so treat it like any other list endpoint (don't hammer it).

---

## 6. Error handling

- `PATCH /notifications/{id}/read` on a notification that isn't the caller's → `403 Forbidden`. Treat as: refresh the list, the id was stale or wrong.
- `POST /admin/users/{userId}/notices` with an invalid `userId` → the request fails (user not found) — the compose form should be scoped to a real profile page, not free-typed IDs, so this should only happen on stale data.
- `title`/`message` outside the length bounds above → `400` with a validation message — enforce the same max lengths client-side to avoid a round-trip.
