import { Permission } from "@prisma/client";

/**
 * Canonical permission sets per role.
 *
 * Each entry lists the permissions an admin can grant (or revoke) for a user
 * of that role. These drive the checkbox UI on the frontend — only permissions
 * valid for the user's role should be shown.
 *
 * Role names match the `roleName` values stored in the `role` table.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ LANDLORD                                                             │
 * │   VIEW_FINANCIALS_AND_REPORTS  — revenue reports & financials        │
 * │   MANAGE_PROPERTIES_AND_UNITS  — add/edit/delete properties & units  │
 * │   VIEW_TENANTS_AND_LEASES      — view tenant profiles & leases       │
 * │   VIEW_MAINTENANCE_TICKETS     — read-only ticket access             │
 * │   APPROVE_MAJOR_MAINTENANCE    — approve/reject high-cost work       │
 * ├──────────────────────────────────────────────────────────────────────┤
 * │ FACILITY_MANAGER                                                     │
 * │   MANAGE_TICKETS               — update status, set budget, comment  │
 * │   MANAGE_PROPERTIES_AND_UNITS  — add/edit/delete properties & units  │
 * │   APPROVE_MINOR_MAINTENANCE    — approve routine/low-cost work       │
 * │   VIEW_TENANTS_AND_LEASES      — view tenant profiles & leases       │
 * ├──────────────────────────────────────────────────────────────────────┤
 * │ TENANT                                                               │
 * │   ACCESS_TENANT_PORTAL         — dashboard, lease info, settings     │
 * │   PAY_RENT_ONLINE              — rent & utility payments             │
 * │   REQUEST_MAINTENANCE          — submit & track maintenance tickets  │
 * │   VISITOR_ALLOWANCE            — invite & manage visitors            │
 * └──────────────────────────────────────────────────────────────────────┘
 */
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  LANDLORD: [
    Permission.VIEW_FINANCIALS_AND_REPORTS,
    Permission.MANAGE_PROPERTIES_AND_UNITS,
    Permission.VIEW_TENANTS_AND_LEASES,
    Permission.VIEW_MAINTENANCE_TICKETS,
    Permission.APPROVE_MAJOR_MAINTENANCE,
  ],

  FACILITY_MANAGER: [
    Permission.MANAGE_TICKETS,
    Permission.MANAGE_PROPERTIES_AND_UNITS,
    Permission.APPROVE_MINOR_MAINTENANCE,
    Permission.VIEW_TENANTS_AND_LEASES,
  ],

  TENANT: [
    Permission.ACCESS_TENANT_PORTAL,
    Permission.PAY_RENT_ONLINE,
    Permission.REQUEST_MAINTENANCE,
    Permission.VISITOR_ALLOWANCE,
  ],
};

/**
 * Returns the available permissions for a given role.
 * Returns an empty array for roles without a permission set (e.g. ADMIN, AGENT).
 */
export function getPermissionsForRole(roleName: string): Permission[] {
  return ROLE_PERMISSIONS[roleName] ?? [];
}
