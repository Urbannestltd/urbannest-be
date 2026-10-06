# Urbannest Backend Handoff

Last updated: 2026-10-06

This document is a complete orientation guide for the Urbannest backend. It covers architecture, local setup, key modules, auth, data model, business logic, jobs, integrations, deployment, testing, known issues, ownership, and recommended next steps. It is written so a new backend engineer can set up, deploy, troubleshoot, and safely recover the service without relying on undocumented knowledge.

**Revision note (2026-10-06):** following a second review pass, this revision closes out the items that were purely technical: removed the unrelated `origin` git remote, restricted CORS to the known dev/prod frontend URLs (overridable via `ALLOWED_ORIGINS`), wired rate limiting to Upstash Redis with an in-memory fallback, added a `/health` endpoint, added `.env.example`, and hardened `prisma/seed.ts` against running in production. The force-push prod deploy flow was confirmed by the owner as approved, as-is. What's left — the ownership/access/escalation table, the actual database backup/restore procedure, the approved migration rollback process, and payment/upload operational policy — are organizational facts and decisions, not code gaps, and are called out explicitly below as `[TODO: owner to fill in]`. This document should not be treated as final until those are filled in.

---

## 1. Backend Architecture

The backend is an Express 5 API with TSOA for controller based routing and OpenAPI generation, backed by Prisma 6 over PostgreSQL.

**Request flow**

```
Controller (@Route, @Post/@Get, decorators)
  -> Service (business logic)
    -> Prisma client (src/config/prisma.ts)
      -> PostgreSQL
```

**How TSOA fits in**

- Controllers live in `src/controllers/**` and use decorators (`@Route`, `@Tags`, `@Post`, `@Get`, `@Security`, `@Middlewares`, `@Body`, `@Query`).
- `tsoa.json` points at `src/server.ts` as the entry point, globs `src/controllers/**/*.ts`, and outputs generated code to `src/build/` (`routes.ts` and `swagger.json`).
- These generated files are gitignored and rebuilt automatically. Run `npm run tsoa` after pulling changes or editing any controller or DTO, otherwise routes and the OpenAPI spec go stale.
- `npm run build` runs `tsoa spec-and-routes && tsc`. `postinstall` also runs `prisma generate && tsoa spec-and-routes`, so a fresh `npm install` regenerates everything.

**Deployment target**

- Vercel serverless (`vercel.json`), built from `src/server.ts` via the `@vercel/node` builder with a catch-all route.
- Cron jobs cannot run as long-lived processes on serverless, so scheduled work is exposed as HTTP endpoints (`/cron/*`) that Vercel's own cron scheduler calls. See section 9.

---

## 2. Local Development Setup

**Supported versions**

- Node.js: **v22.x** (the environment this was last verified against was v22.21.0). No `.nvmrc` or `engines` field is committed yet — `[TODO: owner to fill in]` add one of these to pin the version for new contributors.
- npm: **v10.x** (verified against 10.9.4).
- PostgreSQL: any version compatible with Prisma 6 (check `prisma/schema.prisma` for the `provider`/`previewFeatures` in use if you need an exact minimum).

**Setup steps**

```bash
git clone <repo-url>
cd urbannest_be
npm install                 # also runs postinstall -> prisma generate && tsoa spec-and-routes
cp .env.example .env        # fill in real values (see table below for what each var is for)
npx prisma migrate deploy   # apply existing migrations to your local database
npx prisma db seed          # optional: seed demo data (NEVER run against production, see section 7)
npm run dev                 # starts nodemon locally
```

Swagger UI becomes available at `http://localhost:<PORT>/docs` once the server is running (see section 4).

**Required environment variables**

`.env.example` is now committed at the repo root with every variable name below (no values). Copy it to `.env` and fill in real values.

| Variable | Purpose |
|---|---|
| `PORT` | Local server port |
| `NODE_ENV` | `development` / `production` / etc. |
| `JWT_SECRET` | Legacy/shared JWT secret (confirm still in use alongside RS256 keys below) |
| `JWT_PRIVATE_KEY` | RS256 private key for signing access tokens |
| `JWT_PUBLIC_KEY` | RS256 public key for verifying access tokens |
| `DATABASE_URL` | Prisma pooled connection string |
| `DIRECT_URL` | Prisma direct (non-pooled) connection string, used for migrations |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google login (currently not live, see section 10) |
| `RESEND_API_KEY` | Secondary/legacy email provider |
| `MAIL_USER` / `MAIL_PASS` | Legacy mail credentials (confirm still in use) |
| `BASE_URL` / `API_BASE_URL` | Base URLs used in emails/links and outbound calls |
| `VTPASS_PUBLIC_KEY` / `VTPASS_SECRET_KEY` / `VTPASS_API_KEY` | VTpass utility bill integration |
| `PAYSTACK_SECRET_KEY` / `PAYSTACK_BASE_URL` | Paystack payment integration |
| `ZEPTOMAIL_BASE_URL` / `ZEPTOMAIL_API_KEY` / `ZEPTOMAIL_FROM_NAME` / `ZEPTOMAIL_FROM_EMAIL` | Primary transactional email provider |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | File storage (signed uploads) |
| `CRON_SECRET` | Bearer secret that authorizes Vercel's calls to `/cron/*` endpoints (see section 9) |
| `ALLOWED_ORIGINS` | Optional comma-separated CORS allowlist override (see section 5) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Optional — shared rate-limit store (see section 5) |

Get actual values from `[TODO: owner to fill in — name the secrets manager / vault / 1Password entry / whoever holds these]`. Do not commit real values anywhere, including in this document.

---

## 3. Key Modules and Services

The codebase is organized primarily by **role**. Each role has its own controller, service, and DTO folders under `src/controllers`, `src/services`, and `src/dtos`.

| Role folder | Covers |
|---|---|
| `admin` | Platform-wide oversight: agent fees and leads, dashboards, expenses, leases, payments, properties, support, tickets, units |
| `agent` | Agent-facing dashboard, fees, leads, property listings, and property visit scheduling |
| `facility-manager` (`fm*`) | Agent visit approvals, dashboard, gate operations, property settings, maintenance tickets, visitor management, walk-ins |
| `front-desk` (`fd*`) | A lighter counterpart to facility-manager: gate, properties, settings, visits, walk-ins |
| `landlord` | Approvals, dashboard, financials, maintenance, properties, tenants, units |
| `tenant` | Dashboard, departure, lease, maintenance, rent, settings, utility payments, visitor invites, walk-in approval |

**Root-level controllers** (not role-scoped): `authenticationController`, `departureController`, `notificationController`, `paymentController` (Paystack), `storageController` (Supabase signed uploads), `supportController` and `supportTicketResolveController`, `visitorApprovalController`.

**Shared services**

- `src/services/external/` — third-party integrations: `storageService.ts` (Supabase), `vtPassService.ts` (utility bill payments), `zeptoMailService.ts` (transactional email).
- `src/services/workers/` — background job logic: `reminderWorker.ts`, `walkInTimeoutWorker.ts`, `noShowWorker.ts`.
- `src/jobs/scheduler.ts` — wires the workers into `node-cron` for local/dev use.
- `src/services/notificationService.ts` — shared notification singleton used across every role's services.

---

## 4. API Endpoints and Documentation

- Every endpoint is defined once via TSOA decorators on a controller method; the route table and OpenAPI spec are both generated from that single source of truth.
- Swagger UI is served at **`/docs`** (wired in `src/app.ts`) on whichever host you're running against, e.g. `http://localhost:<PORT>/docs` locally, or the dev/prod Vercel deployment URL + `/docs` — `[TODO: owner to fill in]` the actual dev and prod deployment URLs so this doc can link them directly.
- The raw OpenAPI JSON is generated to `src/build/swagger.json` (gitignored, regenerated on build).
- To regenerate docs after a controller or DTO change, run:

```
npm run tsoa
```

- Authentication for `@Security("jwt")` routes is centrally handled by `expressAuthentication` in `src/authentication.ts`, referenced from `tsoa.json` as the `authenticationModule`.

**Key contracts to know before integrating against this API** (full request/response shapes are in Swagger; this is the summary a new engineer needs to orient):

- **Login / auth:** `POST /auth/login` returns either a normal access+refresh token pair, or `{ require2fa: true, tempToken }` when 2FA is enabled for the account (see section 5).
- **Refresh token:** access tokens are short-lived; `src/services/sessionService.ts` (`refreshAccessToken`) exchanges a valid refresh token for a new access token, backed by the `Session` Prisma model. `invalidateSession` / `invalidateAllUserSessions` handle logout and forced logout (e.g. on role change or block).
- **2FA:** `POST /auth/verify-2fa` takes the `tempToken` from login plus an OTP, handled by `authenticationService.verifyLoginOtp`.
- **Payments:** Paystack webhook at `POST /payments/webhook` (see section 10) is the source of truth for payment status; it's server-to-server, not something a frontend calls directly. Client-initiated flows go through `paymentController`, which calls `PaymentService.verifyPayment`. That method is idempotent by design: it looks up the local `payment` record by `reference` first, and short-circuits with `"Transaction already processed"` if it's already `PAID`, so a retried webhook or a duplicate client-side verify call cannot double-process the same payment. On webhook signature failure it returns `400`; on a downstream business error during a `charge.success` event it still returns `200` to Paystack (since Paystack retries on 5xx, not on business-logic failures) and logs the error server-side instead — meaning **a failed verification inside a successful webhook delivery will not be retried by Paystack and needs to be caught by watching logs**, not by webhook retry behavior. `[TODO: owner to fill in]` who is actually responsible for noticing and manually reconciling that case today (no alerting is wired to it, see section 11), and what the expected SLA is.
- **Uploads:** `POST /storage/sign-url` (`storageController`) returns a signed Supabase upload URL scoped to `{folder}/{userId}/...`; the client uploads directly to Supabase with that URL rather than routing file bytes through this API. Restrictions actually enforced in code (`src/utils/fileUploadValidation.ts`): filename max 255 chars, no path-traversal/null-byte characters, and an **extension allow-list** (`jpg, jpeg, png, gif, webp, heic, heif, pdf, doc, docx, mp4, mov, webm`) — anything else is rejected with 400 before a signed URL is ever issued. Not enforced in code: there is no file **size** limit applied here (any size limit would currently come only from the Supabase bucket's own configuration, which lives outside this repo), and `createUploadUrl` does not pass an explicit expiry to Supabase's `createSignedUploadUrl`, so the signed URL's lifetime is whatever Supabase's platform default is for that call (confirm the current value in the Supabase dashboard rather than assuming). There is no retention/deletion job in this codebase — uploaded files are never automatically cleaned up. `[TODO: owner to fill in]`: the intended max file size, the actual signed-URL expiry if a specific value is required, and whether a retention/cleanup policy is expected (e.g. deleting orphaned uploads, or files tied to closed tickets after N days).

---

## 5. Authentication and Authorization

**Token verification** (`src/authentication.ts`)

- JWTs are RS256 signed and verified with `jwt.verify(token, publicKey, { algorithms: ["RS256"] })`. The algorithm is explicitly pinned, which prevents algorithm-confusion attacks.
- The token is read from the request body, `x-access-token` header, or `authorization` header only. It is deliberately never accepted via a query string, since query params leak into browser history, proxy logs, and Referer headers.
- After the signature check, the middleware re-verifies against the database on every request:
  - Rejects if the user's `userStatus` is `BLOCKED`.
  - Rejects if the token's `role` claim no longer matches the user's current role in the database, so a role change invalidates any previously issued token.

**Permission middleware** (`src/middlewares/permissionMiddleware.ts`)

- `requirePermission(...permissions)` — caller must have all listed permissions.
- `requireAnyPermission(...permissions)` — caller must have at least one.
- `requireAdmin()` — caller must have the `ADMIN` role.
- All three fetch permissions fresh from the database per request (nothing is cached in the token), and all three bypass unconditionally for `ADMIN`.

**Role and permission mapping** (`src/config/rolePermissions.ts`)

- Documents the canonical permission set per role (LANDLORD, FACILITY_MANAGER, etc.). This drives the frontend's permission-assignment UI; enforcement itself happens through the middleware above and the `Permission` enum in the database.

**Sessions and refresh tokens** (`src/services/sessionService.ts`)

- `refreshAccessToken`, `invalidateSession`, `invalidateAllUserSessions` implement a refresh-token session model backed by the `Session` Prisma model.

**Two-factor authentication**

- `POST /auth/login` returns `{ require2fa: true }` when 2FA is required.
- The frontend then calls `POST /auth/verify-2fa` with a `tempToken` and OTP, handled by `authenticationService.verifyLoginOtp`.

**Hardening applied this cycle**

- Added IP-keyed rate limiting to `login`, `verify-2fa`, `forgot-password`, and `reset-password`. These endpoints previously had no rate limiting at all, leaving them open to brute-force, OTP-guessing, and credential-stuffing attempts.
- Fixed `resetPassword` calling the reset service twice in the controller. Because the reset token is marked used after the first call, the second call always threw `"Invalid token"`, meaning every password reset was silently succeeding server-side but returning an error to the user.
- Fixed a fail-open bug in the Vercel cron guard (`verifyCronSecret` in `src/app.ts`): if `CRON_SECRET` was unset in the environment, the check was skipped entirely instead of blocking the request. It now fails closed.
- **CORS restricted** (`src/app.ts`): `cors()` previously allowed any origin unconditionally. It now validates `Origin` against an allowlist defaulting to the known dev (`https://urbannest-frontend-chi.vercel.app`) and prod (`https://www.urbannesttech.com`) frontend URLs, overridable via the `ALLOWED_ORIGINS` env var (comma-separated) without a code change. Requests with no `Origin` header (server-to-server calls, webhooks, curl) are still allowed through, since this API is bearer-token authenticated rather than cookie/session based.
- **Rate limiting now supports a shared store** (`src/middlewares/rateLimitMiddleware.ts`): when `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are set, all rate limiters switch to Upstash Redis sliding-window limits, which hold across every Vercel serverless instance rather than one warm process. If those env vars are unset, the limiters fall back to the previous in-memory behavior automatically (a startup warning is logged). **As of this writing, no Upstash database has actually been created** — `[TODO: owner to fill in]` create a free Upstash Redis database (see section 16) and set the two env vars in Vercel to activate the shared store.
- **Health check added:** `GET /health` (`src/app.ts`) runs `SELECT 1` against the database and returns `200 {status: "ok"}` or `503 {status: "error"}`. Use this for uptime monitoring / load balancer liveness probes once one is configured (see section 11).

---

## 6. Database Structure and Relationships

Schema: `prisma/schema.prisma` (1,121 lines). Major model groups:

**Identity and access**
`user`, `role`, `privilege`, `Session`, `otpLogs`, `userRegistrationLink`, `passwordReset`, `SystemSetting`

**Property domain**
`property`, `unit`, `lease`, `utilityProfile`, `utilityBill`

**Payments**
`payment`, `PaymentMethod`

**Visitors and access control**
`VisitorGroup`, `VisitorInvite`, `AgentVisit`

**Agent and leads**
`AgentLead`, `AgentLeadReferee`, `AgentLeadDocument`, `AgentFee`

**Support and maintenance**
`SupportTicket` (category is now an open-ended `String`, not an enum), `SupportMessage`, `MaintenanceRequest`, `MaintenanceMessage`

**Financial operations**
`Expense`, `BudgetAdjustment`

**Cross-cutting**
`ActivityLog`, `Notification`, `NotificationSetting`, `Reminder`, `IdempotencyKey`

**Key enums**

`UserStatus`, `RoleType`, `PropertyType`, `UnitStatus`, `UnitType`, `LeaseStatus`, `PaymentStatus`, `PaymentType`, `UtilityType`, `VisitorType`, `InviteFrequency`, `InviteStatus`, `AgentVisitStatus`, `AgentLeadStatus`, `AgentFeeStatus`, `ExpenseStatus`, `ExpenseCategory`, `SupportStatus`, `SupportPriority`, `MaintenanceCategory`, `MaintenancePriority`, `MaintenanceStatus`, `MaintenanceApprovalStatus`, `Permission` (backs the entire RBAC system), `NotificationType`, `IdempotencyStatus`.

---

## 7. Database Migrations and Seeding

- 45 migrations under `prisma/migrations/`, timestamp-prefixed with descriptive names, e.g. `20260823174828_support_ticket_category_open_ended`, `20260830111251_add_notification_system`, `20260911215605_add_maintenance_status_changed_at`. These map closely to recent commit history.
- Apply pending migrations (staging/production, non-interactive):

```
npx prisma migrate deploy
```

- During local development, to create a new migration from a schema change:

```
npx prisma migrate dev --name <description>
```

- **Rollback:** Prisma does not generate down-migrations automatically. To roll back a bad migration in a live environment: (1) restore the database from the most recent backup taken before the migration ran (see below), or (2) hand-write a new forward migration that reverses the schematic change and `migrate deploy` it. There is currently no scripted rollback path — `[TODO: owner to fill in]` if one exists (a runbook, a script) or confirm hand-written forward-fix is the accepted approach.
- **Backup/restore:** `[TODO: owner to fill in]` — document the actual mechanism (managed Postgres provider's automatic backups? `pg_dump` on a schedule? where backups live and who can trigger a restore, and the RPO/RTO expectation). This is required before anyone can safely run a migration against production.
- `prisma/seed.ts` (535 lines) seeds privileges, permissions, roles, and demo accounts.
- Every seeded account uses the same default password: `Password1$` (bcrypt-hashed). **This must never be run against a production database.**
- **Fixed:** `prisma/seed.ts` now throws immediately (`assertNotProduction()`) if `NODE_ENV === "production"`, before any seeding logic runs, so it can no longer be pointed at a production database by accident. Tracked in section 13 (#5, "Fixed this cycle").
- Run seeding with:

```
npx prisma db seed
```

which resolves to `ts-node prisma/seed.ts` as configured in `package.json`.

---

## 8. Important Business Logic

**Lease lifecycle** (`src/services/admin/leaseService.ts`)

- `createLease`, `updateLease`, `renewLease`, and `terminateLease`.
- Termination runs a single Prisma transaction that marks the lease `TERMINATED`, the unit `AVAILABLE`, and the tenant's user record `UNASSIGNED`, then sends notifications and emails.

**Utility payments** (`src/services/tenant/utilityService.ts`)

- `initiatePurchase` attributes each utility purchase to the tenant's currently active lease, integrating with VTpass for the actual bill/meter transaction.

**Maintenance requests**

- Now track a `statusChangedAt` timestamp, added to support better status history and reporting.

**Notifications** (`src/services/notificationService.ts`)

- A shared singleton exposing `notify`, `notifyMany`, `isEmailEnabled`, `list`, `unreadCount`, `markRead`, `markAllRead`, backed by the `Notification` and `NotificationSetting` models.

**Agent visit management**

- Facility manager side (`fmAgentVisitsService.ts`): `approveVisit`, `rejectVisit`, `rescheduleVisit`, `checkInAgentVisit`.
- Agent side (`agentVisitsService.ts`): `scheduleVisit`, `cancelVisit`, `acceptReschedule`, `rejectReschedule`, `proposeNewTime`.

**Support tickets**

- The `category` field was changed from a fixed enum to an open-ended string, so tickets are no longer constrained to a predefined list of categories.

---

## 9. Background Jobs, Cron Jobs, and Queues

There is no message queue in this system. Scheduled work runs two different ways depending on environment:

**Local and non-Vercel environments**

- `src/jobs/scheduler.ts` runs `node-cron` on a one-minute interval, driving `ReminderWorker`, `WalkInTimeoutWorker`, and `NoShowWorker`.
- `src/server.ts` only starts this scheduler when `process.env.VERCEL !== "1"`, correctly avoiding a persistent in-process scheduler inside a stateless serverless function.

**Vercel (production and dev deploys)**

- `vercel.json` defines `crons[]` entries that call `/cron/reminders`, `/cron/walk-in-timeout`, and `/cron/no-show` on a schedule.
- The dev deploy (Hobby plan) is limited to once-daily crons (`0 0 * * *`); the prod deploy (Pro plan) runs every minute (`* * * * *`). The push scripts (`push-to-dev.sh` / `push-to-prod.sh`) adjust `vercel.json` accordingly before pushing.
- These endpoints are protected by `verifyCronSecret` in `src/app.ts`, which checks `Authorization: Bearer <CRON_SECRET>` and now fails closed if the secret is missing.

---

## 10. Third-Party Integrations

| Service | Purpose | Location |
|---|---|---|
| Paystack | Payment processing | Webhook at `POST /payments/webhook` in `src/app.ts`, registered before `express.json()` so the raw body can be used to verify the HMAC-SHA512 signature (`x-paystack-signature`) before parsing |
| ZeptoMail | Primary transactional email | `src/services/external/zeptoMailService.ts` |
| Resend | Secondary/legacy email path | `src/config/resend.ts` (confirm current usage before relying on it) |
| Supabase | File storage via signed upload URLs | `src/services/external/storageService.ts`, exposed through `POST /storage/sign-url`. Uploads are namespaced under `{folder}/{userId}/...` with filename and folder validation |
| VTpass | Utility bill and meter verification/purchase | `src/services/external/vtPassService.ts` |
| Google | Google login (not yet live) | `google-auth-library` dependency present; `googleLogin` in `authenticationController.ts` is currently commented out |

---

## 11. Build, Deployment, and Recovery

**npm scripts**

| Script | Purpose |
|---|---|
| `postinstall` | `prisma generate && tsoa spec-and-routes` |
| `build` | `tsoa spec-and-routes && tsc` |
| `start` | Runs `dist/server.js` |
| `dev` | `nodemon` for local development |
| `test` | `jest` |
| `push:dev` | Runs `scripts/push-to-dev.sh` |
| `push:prod` | Runs `scripts/push-to-prod.sh` |

**Environments**

| Environment | Remote | Branch | Plan | Cron |
|---|---|---|---|---|
| Local | — | any | — | `node-cron` in-process (see section 9) |
| Dev | `dev` (`Urbannestltd/urbannest-be`) | pushed to `dev/main` | Vercel Hobby (free) | Daily (`0 0 * * *`) |
| Staging | `[TODO: owner to fill in — does a staging environment exist, or does "dev" serve that role?]` | | | |
| Prod | `prod` (`kctconsultingltd/urbannest-be`, via SSH alias `github-kct`) | local `deploy-to-prod` branch, force-pushed to `prod/main` | Vercel Pro | Every minute (`* * * * *`) |

**Deploying**

Always deploy through `npm run push:dev` or `npm run push:prod`, never a raw `git push`. Both scripts refuse to run with a dirty working tree.

- `push:dev` (`scripts/push-to-dev.sh`): fetches `dev/main`, merges it into your current branch if it's ahead, normalizes `vercel.json` crons to daily, then pushes your branch straight to `dev/main` (fast-forward or normal push — not force).
- `push:prod` (`scripts/push-to-prod.sh`): checks out the local `deploy-to-prod` branch, merges your current branch into it under a separate "KCT Consulting" git identity, restores the every-minute cron schedule, and **force-pushes** `deploy-to-prod` to `prod/main`.

**Force-push approval and recovery:**

- **Confirmed by the project owner (2026-10-06): the force-push prod deploy flow is the approved process, as-is — no script change.** The prod deploy path force-pushes over `prod/main` on every release via `scripts/push-to-prod.sh`.
- **Recovery if a force-push overwrites needed history:** the previous tip of `prod/main` remains reachable locally via the reflog on whichever machine ran the push (`git reflog`, or `git log deploy-to-prod` before the next force-push overwrites that local branch too). This is a known limitation of the approved flow — recovery currently depends on whoever ran the push still having the old commit in their local reflog/branches. No automated backup tag is created before a force-push; if this limitation becomes a problem in practice, the fix is cheap (tag `prod/main`'s tip before pushing), but it is intentionally not implemented since the owner confirmed the current flow as-is.

**Git origin — fixed:**

- The `origin` remote previously pointed to an unrelated repository (`QucoonAI/qorpy-zoho-middleware`), left over from initial repo setup. It has been removed (`git remote remove origin`) since only `dev` and `prod` are ever pushed to. `git remote -v` now shows only `dev` and `prod`.

**Rollback (application code):**

- Dev: re-run `push:dev` from the last known-good commit/branch.
- Prod: re-run `push:prod` from the last known-good commit — this force-pushes a fresh `deploy-to-prod` over the bad release. There is no one-command "revert last deploy"; `[TODO: owner to fill in]` if a faster path (e.g. Vercel's own "redeploy previous build" from its dashboard) is the preferred first response before rebuilding from git.

**Monitoring and health checks:**

- **`GET /health` is now implemented** (`src/app.ts`): runs `SELECT 1` against the database and returns `200 {status:"ok", db:"up"}` or `503 {status:"error", db:"down"}`. Point an uptime checker (e.g. a Vercel/UptimeRobot/Better Uptime monitor) at `<deployment-url>/health` once you know which monitoring tool the org uses.
- There is still no application monitoring/alerting/APM (error tracking, log aggregation) wired into the codebase itself. `[TODO: owner to fill in]` if monitoring exists at the Vercel or infra level outside this codebase (uptime checks, log drains, error tracking) — until confirmed, assume there is none beyond Vercel's own function logs/dashboard.

---

## 12. Testing

- Framework: Jest with `ts-jest`, configured in `jest.config.js` (`testMatch: ["**/*.test.ts"]`, rooted at `src/`).
- 28 test files, 231 tests, all passing.
- Pattern: each test file mocks Prisma directly (`jest.mock("../../config/prisma", () => ({ prisma: { ...jest.fn() } }))`) and uses `supertest` to exercise the real Express `app` at the HTTP layer.
- Run the suite with:

```
npm test
```

**Fixed this cycle:** `leaseController.test.ts` had a stale Prisma mock missing `user.update`. A recent change to `terminateLease` added a `prisma.user.update` call (to reset the tenant to `UNASSIGNED`) inside its transaction, but the test's mock was never updated to match, causing 3 real test failures. The mock now declares `user.update`.

---

## 13. Known Issues and Limitations

**Fixed this cycle**

1. Stale Prisma mock in `leaseController.test.ts` causing 3 failing tests.
2. `resetPassword` in the controller called the service twice, making every real password reset return a client-facing error despite succeeding server-side.
3. No rate limiting on `login`, `verify-2fa`, `forgot-password`, `reset-password`. Added IP-keyed limiters (`loginRateLimit`, `otpRateLimit`, `passwordResetRateLimit` in `src/middlewares/rateLimitMiddleware.ts`).
4. `verifyCronSecret` in `src/app.ts` failed open (allowed unauthenticated cron access) if `CRON_SECRET` was unset. Now fails closed.
5. `prisma/seed.ts` had no guard against running against production — added `assertNotProduction()`, which throws immediately if `NODE_ENV === "production"`, before any seed logic executes.
6. The `origin` git remote pointed to an unrelated repository — removed; `dev` and `prod` are the only remotes now.
7. CORS was fully open — restricted to an allowlist (dev + prod frontend URLs, overridable via `ALLOWED_ORIGINS`). See section 5.
8. Rate limiting had no shared-store option — `rateLimitMiddleware.ts` now uses Upstash Redis when `UPSTASH_REDIS_REST_URL`/`_TOKEN` are set, falling back to in-memory otherwise. **The Upstash database itself has not been created yet**, so until that env is configured, limits still only hold per-instance — see section 5 and section 16.
9. No health-check endpoint existed — added `GET /health` (DB connectivity check). See section 11.
10. `.env.example` did not exist — added at the repo root with every required variable name.

**Flagged, not yet addressed**

11. Two files tracked in git look like scratch or debug artifacts rather than application code: `testArrears.ts` and `migration_results.json`, both at the repo root.
12. No ESLint or Prettier configuration exists anywhere in the repo.
13. Dead code: the old commented-out `login`, `verify-otp`, and `google-login` implementations still sit in `authenticationController.ts`.
14. Seed data uses one shared default password (`Password1$`) for every account. Fine for local development, must never be pointed at a production database — now enforced at runtime (see #5 above); the shared password itself remains a local-only convenience, not something to change.
15. No application-level monitoring/alerting/APM beyond the new `/health` endpoint and Vercel's own dashboard/logs (see section 11).
16. Database backup/restore procedure and production migration rollback process are still undocumented/undecided — this requires the project owner to state what the organization actually does today (or formally decide, if nothing exists yet), not a code fix. See section 11.
17. Ownership, access, and escalation contacts (section 15) are still a placeholder — requires the project owner to fill in names/contacts for each system.
18. The force-push prod deploy flow is confirmed as the approved process (owner decision, 2026-10-06), but recovery still depends on someone's local reflog rather than an automated backup — accepted as a known limitation of the approved flow, not scheduled for a fix. See section 11.
19. Payment and upload sections (section 4) describe the code paths but don't yet state operational policy: webhook callback configuration/retry handling, who owns payment reconciliation, upload size/type restrictions, signed-URL expiry, file retention rules, or failure-recovery steps for a stuck/failed upload or payment. These are organizational/product decisions, not something inferable from the code alone — see section 4.

---

## 14. Troubleshooting and Common Issues

**Centralized error handling** (`src/middlewares/errorHandler.ts`)

- `ValidateError` (TSOA validation failures) returns 422 with field-level details.
- Any error with a `.statusCode` (the custom `ApiError` hierarchy) returns that status and message.
- Everything else is logged via `console.error` and masked as a generic 500. No stack traces are ever leaked to clients.

**Error types** (`src/utils/apiError.ts`)

- A clean `ApiError` base class with `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, and `InternalServerError` subclasses, each correctly restoring the prototype chain for reliable `instanceof` checks.

**If routes seem stale or missing:** run `npm run tsoa` to regenerate `src/build/routes.ts` and `src/build/swagger.json`. These files are gitignored and not committed.

**If a deploy behaves unexpectedly:** confirm which remote you pushed to (`dev` vs `prod`) and check `vercel.json`'s cron schedule matches the target plan tier. See section 11 for the full deploy/rollback/recovery procedure.

**If you need to reach someone about an incident:** see section 15 (Ownership, Access, and Escalation) — `[TODO: owner to fill in]` before this is usable in a real incident.

---

## 15. Ownership, Access, and Escalation

`[TODO: owner to fill in — this entire section is a placeholder and must be completed before handoff is final.]`

| Area | Owner | Contact |
|---|---|---|
| Backend codebase / architecture decisions | | |
| Database (production access, backup/restore authority) | | |
| Vercel project (dev) | | |
| Vercel project (prod, KCT org) | | |
| Third-party accounts: Paystack | | |
| Third-party accounts: ZeptoMail / Resend | | |
| Third-party accounts: Supabase | | |
| Third-party accounts: VTpass | | |
| DNS / domain | | |
| Secrets storage (where `.env` values actually live) | | |

**Access needed by an incoming engineer**, at minimum: GitHub access to `Urbannestltd/urbannest-be` and `kctconsultingltd/urbannest-be` (or documented equivalent if repos are reorganized per section 11), Vercel project access for both dev and prod, database credentials/console access, and read access to the third-party dashboards above.

**Escalation:** `[TODO: owner to fill in — who is the on-call/first point of contact if production is down outside business hours, and how are they reached?]`

---

## 16. Areas of Technical Debt

- No lint or format tooling at all. This is the single biggest cross-cutting gap in baseline tooling.
- A handful of large service files that are candidates for splitting if they keep growing: `fmTicketsService.ts` (1,015 lines), `adminService.ts` (894 lines), `ticketService.ts` (743 lines), `propertyService.ts` (680 lines), `unitService.ts` (581 lines), `agentLeadsService.ts` (573 lines).
- Rate limiting now supports Upstash Redis in code, but no Upstash database has actually been provisioned yet — until it is, the shared-store benefit is theoretical, not real (see section 5).
- The role-based duplication across controller/service/DTO trees (admin, agent, facility-manager, front-desk, landlord, tenant) is a structural design choice rather than accidental duplication, and did not surface obvious copy-paste logic worth flagging beyond that pattern.
- Application-level monitoring/alerting/APM is still absent beyond the new `/health` endpoint (see section 11).
- No documented database backup/restore or migration rollback procedure — this is an organizational gap, not a code gap, and needs the project owner's input (see section 7 and section 11).
- Payment reconciliation and upload retention/size-limit policy are undocumented — see section 4.

---

## 17. Recommended Future Improvements

Ordered roughly by priority for a first 30 days of ownership. Items marked **(owner input needed)** are blocked on organizational facts/decisions, not more code:

1. **(owner input needed)** State the actual database backup/restore procedure (how, where, who can restore, whether it's tested, RPO/RTO) and confirm the production migration rollback approach — section 7.
2. **(owner input needed)** Fill in the ownership/access/escalation table and named environment-variable sources — section 15.
3. **(owner input needed)** Decide payment reconciliation ownership and upload size-limit/retention policy — section 4.
4. Create the Upstash Redis database and set `UPSTASH_REDIS_REST_URL`/`_TOKEN` in Vercel for both dev and prod so the already-wired shared rate-limit store actually takes effect — section 5.
5. Wire up whatever monitoring/alerting/APM is standard for this org's infra, pointed at the new `/health` endpoint — section 11.
6. Add account lockout in addition to the existing rate limiting, keyed by user rather than IP, after N consecutive failed login attempts.
7. Add ESLint and Prettier with sensible defaults for this stack.
8. Clean up the two stray tracked root files (`testArrears.ts`, `migration_results.json`).
9. Remove or finish the commented-out Google login path in `authenticationController.ts` rather than leaving it as dead code.
10. Consider splitting `fmTicketsService.ts` if it continues to grow.

---

## 18. Release Checklist

Use before pushing to `prod`:

- [ ] Working tree clean; all intended changes committed to the source branch.
- [ ] `npm test` passes locally.
- [ ] `npm run tsoa` run if any controller/DTO changed, and generated routes/swagger reviewed if relevant.
- [ ] Any new Prisma migration tested locally with `npx prisma migrate dev`, and reviewed for backward compatibility with the currently-running prod code (no destructive column drops without a prior deploy that stops using them).
- [ ] If the migration is non-trivial: production backup confirmed fresh before deploying (see section 7 — `[TODO: owner to fill in]` once a backup procedure exists).
- [ ] New/changed environment variables added to prod's Vercel project settings *before* deploying code that depends on them.
- [ ] Deploy via `npm run push:prod` only (never raw `git push` to `prod`).
- [ ] After deploy: confirm `/docs` loads on the prod URL, confirm `vercel.json` crons show `* * * * *` (every-minute) post-push.
- [ ] Smoke-test the primary affected flow against prod (or staging, once one exists).
- [ ] If anything looks wrong: follow the rollback procedure in section 11 immediately rather than pushing a fast follow-up fix.
