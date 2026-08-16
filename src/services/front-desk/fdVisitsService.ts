import { prisma } from "../../config/prisma";
import { ForbiddenError } from "../../utils/apiError";
import type {
  GetFmVisitsQuery,
  FmUnifiedVisit,
  FmVisitorStats,
  FmVisitorStatsPeriod,
  NormalizedVisitStatus,
} from "../../dtos/facility-manager/fm.visits.dto";
import { InviteStatus } from "@prisma/client";

// ── Status normalisation ──────────────────────────────────────────────────────
// (mirrors fmVisitsService.ts — kept in sync manually since FD and FM read the
// same underlying VisitorInvite/AgentVisit records, just scoped differently)

function normalizeInviteStatus(
  rawStatus: InviteStatus,
): NormalizedVisitStatus {
  switch (rawStatus) {
    case "UPCOMING":
    case "ACTIVE":
      return "UPCOMING";
    case "CHECKED_IN":
      return "ACTIVE";
    case "CHECKED_OUT":
    case "COMPLETED":
    case "EXPIRED":
    case "EXPIRED_NO_SHOW":
      return "COMPLETED";
    case "REVOKED":
    case "REJECTED":
      return "CANCELLED";
    case "PENDING":
      return "PENDING_APPROVAL";
    default:
      return "COMPLETED";
  }
}

function normalizeAgentVisitStatus(
  rawStatus: string,
  visitDate: Date,
  now: Date,
): NormalizedVisitStatus {
  switch (rawStatus) {
    case "PENDING":
      return "PENDING_APPROVAL";
    case "APPROVED":
      return visitDate > now ? "UPCOMING" : "COMPLETED";
    case "REJECTED":
      return "REJECTED";
    case "RESCHEDULED_PENDING_AGENT":
      return "RESCHEDULED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "CANCELLED";
  }
}

// ── Sort helper ───────────────────────────────────────────────────────────────

const STATUS_SORT_PRIORITY: Record<NormalizedVisitStatus, number> = {
  PENDING_APPROVAL: 0,
  UPCOMING: 1,
  ACTIVE: 2,
  RESCHEDULED: 3,
  COMPLETED: 4,
  REJECTED: 5,
  CANCELLED: 6,
};

// ── Service ───────────────────────────────────────────────────────────────────

export class FdVisitsService {
  private async getFdPropertyIds(
    fdId: string,
    specificPropertyId?: string,
  ): Promise<{ propertyIds: string[]; unitIds: string[] }> {
    const where: any = { frontDeskId: fdId, isDeleted: false };
    if (specificPropertyId) where.id = specificPropertyId;

    const properties = await prisma.property.findMany({
      where,
      select: { id: true, units: { select: { id: true } } },
    });

    if (specificPropertyId && properties.length === 0) {
      throw new ForbiddenError("You do not manage this property");
    }

    return {
      propertyIds: properties.map((p) => p.id),
      unitIds: properties.flatMap((p) => p.units.map((u) => u.id)),
    };
  }

  public async getVisits(
    fdId: string,
    filters: GetFmVisitsQuery,
  ): Promise<FmUnifiedVisit[]> {
    const { propertyIds, unitIds } = await this.getFdPropertyIds(
      fdId,
      filters.propertyId,
    );

    if (propertyIds.length === 0) return [];

    const now = new Date();
    const dateFilter =
      filters.dateFrom || filters.dateTo
        ? {
            ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
            ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
          }
        : undefined;

    const results: FmUnifiedVisit[] = [];

    // ── 1. Tenant-created visits (VisitorInvite) ──────────────────────────────
    if (!filters.visitType || filters.visitType === "TENANT") {
      const invites = await prisma.visitorInvite.findMany({
        where: {
          unitId: { in: unitIds },
          ...(dateFilter ? { validFrom: dateFilter } : {}),
          ...(filters.search
            ? {
                visitorName: {
                  contains: filters.search,
                  mode: "insensitive",
                },
              }
            : {}),
        },
        include: {
          tenant: {
            select: { userFullName: true, userPhone: true },
          },
          unit: {
            select: {
              name: true,
              property: {
                select: { id: true, name: true, address: true },
              },
            },
          },
        },
        orderBy: { validFrom: "desc" },
      });

      for (const inv of invites) {
        const normalizedStatus = normalizeInviteStatus(inv.status);
        results.push({
          id: inv.id,
          visitType: "TENANT",
          normalizedStatus,
          rawStatus: inv.status,
          visitorName: inv.visitorName,
          visitorPhone: inv.visitorPhone,
          propertyId: inv.unit.property.id,
          propertyName: inv.unit.property.name,
          propertyAddress: inv.unit.property.address,
          unitId: inv.unitId,
          unitName: inv.unit.name,
          visitDate: inv.validFrom,
          scheduledUntil: inv.validUntil,
          agentId: null,
          agentName: null,
          purpose: null,
          proposedDate: null,
          rejectionReason: null,
          tenantId: inv.tenantId,
          tenantName: inv.tenant.userFullName,
          frequency: inv.frequency,
          canApprove: false,
          canReject: false,
          canReschedule: false,
          checkedInAt: inv.checkedInAt,
          checkedOutAt: inv.checkedOutAt,
          createdAt: inv.createdAt,
        });
      }
    }

    // ── 2. Agent-requested visits (AgentVisit) ────────────────────────────────
    if (!filters.visitType || filters.visitType === "AGENT") {
      const agentVisits = await prisma.agentVisit.findMany({
        where: {
          propertyId: { in: propertyIds },
          ...(dateFilter ? { visitDate: dateFilter } : {}),
          ...(filters.search
            ? {
                agent: {
                  userFullName: {
                    contains: filters.search,
                    mode: "insensitive",
                  },
                },
              }
            : {}),
        },
        include: {
          agent: {
            select: { userFullName: true, userPhone: true },
          },
          property: {
            select: { id: true, name: true, address: true },
          },
          unit: { select: { name: true } },
        },
        orderBy: { visitDate: "desc" },
      });

      for (const av of agentVisits) {
        const normalizedStatus = normalizeAgentVisitStatus(
          av.status,
          av.visitDate,
          now,
        );
        // FD is read-only for agent visits — only FM can approve/reject/reschedule
        results.push({
          id: av.id,
          visitType: "AGENT",
          normalizedStatus,
          rawStatus: av.status,
          visitorName: av.agent.userFullName ?? "Unknown Agent",
          visitorPhone: av.agent.userPhone,
          propertyId: av.propertyId,
          propertyName: av.property.name,
          propertyAddress: av.property.address,
          unitId: av.unitId,
          unitName: av.unit?.name ?? null,
          visitDate: av.visitDate,
          scheduledUntil: null,
          agentId: av.agentId,
          agentName: av.agent.userFullName,
          purpose: av.purpose,
          proposedDate: av.proposedDate,
          rejectionReason: av.rejectionReason,
          tenantId: null,
          tenantName: null,
          frequency: null,
          canApprove: false,
          canReject: false,
          canReschedule: false,
          checkedInAt: null,
          checkedOutAt: null,
          createdAt: av.createdAt,
        });
      }
    }

    // ── 3. Apply in-memory status filter ─────────────────────────────────────
    const filtered = filters.status
      ? results.filter((v) => v.normalizedStatus === filters.status)
      : results;

    // ── 4. Sort: upcoming first (by visitDate ASC), then past (by visitDate DESC)
    filtered.sort((a, b) => {
      const aFuture = a.visitDate > now;
      const bFuture = b.visitDate > now;

      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;

      if (aFuture && bFuture) {
        const priorityDiff =
          STATUS_SORT_PRIORITY[a.normalizedStatus] -
          STATUS_SORT_PRIORITY[b.normalizedStatus];
        if (priorityDiff !== 0) return priorityDiff;
        return a.visitDate.getTime() - b.visitDate.getTime();
      }

      return b.visitDate.getTime() - a.visitDate.getTime();
    });

    return filtered;
  }

  public async getStats(fdId: string): Promise<FmVisitorStats> {
    const { unitIds } = await this.getFdPropertyIds(fdId);

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const start15 = new Date(now);
    start15.setDate(now.getDate() - 15);
    start15.setHours(0, 0, 0, 0);

    const start30 = new Date(now);
    start30.setDate(now.getDate() - 30);
    start30.setHours(0, 0, 0, 0);

    // Bucket by the visit's actual valid window (overlap), not by createdAt —
    // a RECURRING pass created weeks ago but still valid today must still
    // count as "today", not just on the day it was originally created.
    const records = await prisma.visitorInvite.findMany({
      where: {
        unitId: { in: unitIds },
        validFrom: { lte: endOfToday },
        validUntil: { gte: start30 },
      },
      select: { validUntil: true, isWalkIn: true, status: true },
    });

    // A rejected/revoked/expired invite was never a real completed visit —
    // don't count it toward "scheduled". EXPIRED_NO_SHOW is tracked
    // separately via `noShows` instead of being folded into `scheduled`.
    const FAILED_STATUSES = new Set(["REJECTED", "REVOKED", "EXPIRED", "EXPIRED_NO_SHOW"]);

    const compute = (from: Date): FmVisitorStatsPeriod => {
      const slice = records.filter((r) => r.validUntil >= from);
      return {
        total: slice.length,
        scheduled: slice.filter((r) => !r.isWalkIn && !FAILED_STATUSES.has(r.status)).length,
        walkIns: slice.filter((r) => r.isWalkIn).length,
        noShows: slice.filter(
          (r) => !r.isWalkIn && r.status === "EXPIRED_NO_SHOW",
        ).length,
      };
    };

    return {
      today: compute(startOfToday),
      last15Days: compute(start15),
      last30Days: compute(start30),
    };
  }
}
