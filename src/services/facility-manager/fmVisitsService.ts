import { prisma } from "../../config/prisma";
import { ForbiddenError } from "../../utils/apiError";
import type {
  GetFmVisitsQuery,
  FmUnifiedVisit,
  NormalizedVisitStatus,
} from "../../dtos/facility-manager/fm.visits.dto";
import { InviteStatus } from "@prisma/client";

// ── Status normalisation ──────────────────────────────────────────────────────

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
      return "COMPLETED";
    case "REVOKED":
      return "CANCELLED";
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

export class FmVisitsService {
  private async getFmPropertyIds(
    fmId: string,
    specificPropertyId?: string,
  ): Promise<{ propertyIds: string[]; unitIds: string[] }> {
    const where: any = { facilityManagerId: fmId, isDeleted: false };
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
    fmId: string,
    filters: GetFmVisitsQuery,
  ): Promise<FmUnifiedVisit[]> {
    const { propertyIds, unitIds } = await this.getFmPropertyIds(
      fmId,
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
        const isPending = av.status === "PENDING";
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
          agentId: av.agentId,
          agentName: av.agent.userFullName,
          purpose: av.purpose,
          proposedDate: av.proposedDate,
          rejectionReason: av.rejectionReason,
          tenantId: null,
          tenantName: null,
          frequency: null,
          canApprove: isPending,
          canReject: isPending,
          canReschedule: isPending,
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
}
