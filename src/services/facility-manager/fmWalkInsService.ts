import { randomUUID } from "crypto";
import { prisma } from "../../config/prisma";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../utils/apiError";
import { ZeptoMailService } from "../external/zeptoMailService";
import { logActivity } from "../../utils/activityLogger";
import { notificationService } from "../notificationService";
import {
  tenantWalkInApprovalEmail,
  fmWalkInTimedOutEmail,
  visitorAccessCodeEmail,
} from "../../config/emailTemplates";
import type {
  RegisterWalkInRequest,
  WalkInListQuery,
  WalkInListItem,
  WalkInStatus,
  RepeatVisitorProfile,
} from "../../dtos/facility-manager/fm.walk-ins.dto";

const APPROVAL_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export class FmWalkInsService {
  private emailService = new ZeptoMailService();

  private secondsUntilExpiry(expiresAt: Date | null): number | null {
    if (!expiresAt) return null;
    const diff = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    return diff > 0 ? diff : 0;
  }

  private async assertFmOwnsVisit(fmId: string, visitId: string) {
    const visit = await prisma.visitorInvite.findUnique({
      where: { id: visitId },
      include: {
        unit: {
          select: {
            id: true,
            name: true,
            property: {
              select: {
                id: true,
                name: true,
                facilityManagerId: true,
                type: true,
              },
            },
          },
        },
        tenant: { select: { userFullName: true, userEmail: true } },
        registeredByFm: { select: { userFullName: true } },
      },
    });
    if (!visit) throw new NotFoundError("Walk-in visit not found");
    if (!visit.isWalkIn)
      throw new BadRequestError("This is not a walk-in visit");
    if (visit.unit.property.facilityManagerId !== fmId) {
      throw new ForbiddenError("You do not manage the property for this visit");
    }

    // Self-heal: don't leave a stale "PENDING" past its approval deadline
    // sitting there until the next cron sweep — resolve it right now.
    if (
      visit.status === "PENDING" &&
      visit.approvalExpiresAt &&
      visit.approvalExpiresAt <= new Date()
    ) {
      const newStatus = await resolveExpiredWalkIn(visit.id);
      if (newStatus) {
        (visit as any).status = newStatus;
        if (newStatus === "CHECKED_IN") visit.checkedInAt = new Date();
      }
    }

    return visit;
  }

  public async registerWalkIn(
    fmId: string,
    data: RegisterWalkInRequest,
  ): Promise<WalkInListItem> {
    // Validate unit belongs to an FM-managed property
    const unit = await prisma.unit.findUnique({
      where: { id: data.unitId },
      include: {
        property: {
          select: { id: true, name: true, facilityManagerId: true, type: true },
        },
      },
    });
    if (!unit) throw new NotFoundError("Unit not found");
    if (unit.property.facilityManagerId !== fmId) {
      throw new ForbiddenError("You do not manage this unit");
    }

    // Find the active lease to get the tenant
    const activeLease = await prisma.lease.findFirst({
      where: { unitId: data.unitId, status: "ACTIVE" },
      include: {
        tenant: {
          select: { userId: true, userFullName: true, userEmail: true },
        },
      },
    });
    if (!activeLease)
      throw new BadRequestError("No active tenant found for this unit");

    const fm = await prisma.user.findUnique({
      where: { userId: fmId },
      select: { userFullName: true },
    });

    const approvalToken = randomUUID();
    const approvalExpiresAt = new Date(Date.now() + APPROVAL_WINDOW_MS);
    const now = new Date();

    const visit = await prisma.visitorInvite.create({
      data: {
        tenantId: activeLease.tenant.userId,
        unitId: data.unitId,
        visitorName: data.visitorName,
        visitorPhone: data.visitorPhone ?? null,
        visitorEmail: data.visitorEmail ?? null,
        accessCode: randomUUID(),
        validFrom: now,
        validUntil: approvalExpiresAt,
        type: data.visitorType as any,
        frequency: "ONE_OFF",
        status: "PENDING",
        isWalkIn: true,
        registeredByFmId: fmId,
        approvalToken,
        approvalExpiresAt,
        fallbackRule: data.fallbackRule ?? null,
      },
      include: {
        unit: {
          select: {
            id: true,
            name: true,
            property: { select: { id: true, name: true } },
          },
        },
        tenant: { select: { userFullName: true } },
      },
    });

    // Send approval email to tenant
    const baseUrl = process.env.API_BASE_URL ?? "http://localhost:3000";
    const approveUrl = `${baseUrl}/visitor-approval/approve?token=${approvalToken}`;
    const rejectUrl = `${baseUrl}/visitor-approval/reject?token=${approvalToken}`;

    const emailTemplate = tenantWalkInApprovalEmail(
      activeLease.tenant.userFullName ?? "Tenant",
      data.visitorName,
      data.visitorPhone ?? null,
      unit.name,
      unit.property.name ?? "Your property",
      approveUrl,
      rejectUrl,
    );

    this.emailService
      .sendEmail(
        {
          email: activeLease.tenant.userEmail,
          name: activeLease.tenant.userFullName ?? undefined,
        },
        emailTemplate.subject,
        emailTemplate.html,
      )
      .then(() =>
        logActivity({
          userId: fmId,
          action: "WALK_IN_APPROVAL_SENT",
          description: `Approval email sent to tenant for walk-in visitor ${data.visitorName}`,
          metadata: { visitId: visit.id },
        }),
      )
      .catch((err: any) =>
        logActivity({
          userId: fmId,
          action: "WALK_IN_APPROVAL_SEND_FAILED",
          description: `Approval email to tenant failed for walk-in visitor ${data.visitorName}: ${err?.message ?? "unknown error"}`,
          metadata: { visitId: visit.id },
        }),
      );

    void logActivity({
      userId: fmId,
      action: "WALK_IN_REGISTERED",
      description: `Walk-in visitor ${data.visitorName} registered by ${fm?.userFullName ?? "FM"} for unit ${unit.name}`,
      metadata: { visitId: visit.id, unitId: data.unitId },
    });

    await notificationService.notify({
      recipientId: activeLease.tenant.userId,
      senderId: fmId,
      type: "WALK_IN",
      title: "Walk-In Visitor Awaiting Your Approval",
      body: `${data.visitorName} is waiting at ${unit.name} — approve or reject within the time window`,
      entityType: "VisitorInvite",
      entityId: visit.id,
    });

    return this.mapVisit(visit);
  }

  public async checkOut(fmId: string, visitId: string): Promise<void> {
    const visit = await this.assertFmOwnsVisit(fmId, visitId);
    if (visit.status !== "CHECKED_IN") {
      throw new BadRequestError("Only checked-in visitors can be checked out");
    }
    await prisma.visitorInvite.update({
      where: { id: visitId },
      data: { status: "CHECKED_OUT", checkedOutAt: new Date() },
    });
    void logActivity({
      userId: fmId,
      action: "WALK_IN_CHECKED_OUT",
      description: `Walk-in visitor ${visit.visitorName} checked out`,
      metadata: { visitId },
    });
  }

  public async getWalkInStatus(
    fmId: string,
    visitId: string,
  ): Promise<WalkInStatus> {
    const visit = await this.assertFmOwnsVisit(fmId, visitId);
    return {
      id: visit.id,
      status: visit.status,
      approvalExpiresAt: visit.approvalExpiresAt,
      secondsUntilExpiry:
        visit.status === "PENDING"
          ? this.secondsUntilExpiry(visit.approvalExpiresAt)
          : null,
      checkedInAt: visit.checkedInAt,
      checkedOutAt: visit.checkedOutAt,
    };
  }

  public async listWalkIns(
    fmId: string,
    filters: WalkInListQuery,
  ): Promise<WalkInListItem[]> {
    const managedProperties = await prisma.property.findMany({
      where: { facilityManagerId: fmId, isDeleted: false },
      select: { id: true },
    });
    const propertyIds = managedProperties.map((p) => p.id);

    const visits = await prisma.visitorInvite.findMany({
      where: {
        isWalkIn: true,
        unit: {
          propertyId: { in: propertyIds },
          ...(filters.unitId ? { id: filters.unitId } : {}),
        },
        ...(filters.status ? { status: filters.status as any } : {}),
        ...(filters.search
          ? {
              OR: [
                {
                  visitorName: {
                    contains: filters.search,
                    mode: "insensitive",
                  },
                },
                {
                  visitorPhone: {
                    contains: filters.search,
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {}),
        ...(filters.dateFrom || filters.dateTo
          ? {
              createdAt: {
                ...(filters.dateFrom
                  ? { gte: new Date(filters.dateFrom) }
                  : {}),
                ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
              },
            }
          : {}),
      },
      include: {
        unit: {
          select: {
            id: true,
            name: true,
            property: { select: { id: true, name: true } },
          },
        },
        tenant: { select: { userFullName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    for (const v of visits) {
      if (v.status === "PENDING" && v.approvalExpiresAt && v.approvalExpiresAt <= new Date()) {
        const newStatus = await resolveExpiredWalkIn(v.id);
        if (newStatus) {
          (v as any).status = newStatus;
          if (newStatus === "CHECKED_IN") v.checkedInAt = new Date();
        }
      }
    }

    return visits.map((v) => this.mapVisit(v));
  }

  public async getRepeatVisitorProfiles(
    fmId: string,
    search: string,
  ): Promise<RepeatVisitorProfile[]> {
    const managedProperties = await prisma.property.findMany({
      where: { facilityManagerId: fmId, isDeleted: false },
      select: { id: true },
    });
    const propertyIds = managedProperties.map((p) => p.id);

    const visits = await prisma.visitorInvite.findMany({
      where: {
        isWalkIn: true,
        unit: { propertyId: { in: propertyIds } },
        OR: [
          { visitorName: { contains: search, mode: "insensitive" } },
          { visitorPhone: { contains: search, mode: "insensitive" } },
        ],
      },
      include: {
        unit: {
          select: {
            id: true,
            name: true,
            property: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Deduplicate by name+phone — keep only the most recent visit per unique visitor
    const seen = new Map<string, RepeatVisitorProfile>();
    for (const v of visits) {
      const key = `${v.visitorName.toLowerCase()}|${v.visitorPhone ?? ""}`;
      if (!seen.has(key)) {
        seen.set(key, {
          visitorName: v.visitorName,
          visitorPhone: v.visitorPhone,
          visitorType: v.type,
          lastVisitDate: v.createdAt,
          lastUnitId: v.unitId,
          lastUnitName: v.unit.name,
          lastPropertyId: v.unit.property.id,
          lastPropertyName: v.unit.property.name,
          totalVisits: visits.filter(
            (x) => x.visitorName.toLowerCase() === v.visitorName.toLowerCase() &&
                   (x.visitorPhone ?? "") === (v.visitorPhone ?? ""),
          ).length,
        });
      }
    }

    return Array.from(seen.values());
  }

  private mapVisit(visit: any): WalkInListItem {
    return {
      id: visit.id,
      visitorName: visit.visitorName,
      visitorPhone: visit.visitorPhone,
      visitorType: visit.type,
      frequency: visit.frequency,
      status: visit.status,
      unitId: visit.unit.id,
      unitName: visit.unit.name,
      propertyId: visit.unit.property.id,
      propertyName: visit.unit.property.name,
      tenantName: visit.tenant?.userFullName ?? null,
      fallbackRule: visit.fallbackRule,
      approvalExpiresAt: visit.approvalExpiresAt,
      secondsUntilExpiry:
        visit.status === "PENDING"
          ? this.secondsUntilExpiry(visit.approvalExpiresAt)
          : null,
      checkedInAt: visit.checkedInAt,
      checkedOutAt: visit.checkedOutAt,
      createdAt: visit.createdAt,
    };
  }
}

// ---------------------------------------------------------------------------
// Shared approval logic reused by both token-based and app-based approval
// ---------------------------------------------------------------------------

export async function resolveWalkInApproval(
  visitId: string,
  action: "approve" | "reject",
  actorId: string,
): Promise<void> {
  const visit = await prisma.visitorInvite.findUnique({
    where: { id: visitId },
    select: {
      id: true,
      status: true,
      visitorName: true,
      approvalExpiresAt: true,
      tenantId: true,
    },
  });
  if (!visit) throw new NotFoundError("Walk-in visit not found");
  if (visit.status !== "PENDING") {
    throw new BadRequestError("This walk-in request has already been resolved");
  }
  if (visit.approvalExpiresAt && visit.approvalExpiresAt < new Date()) {
    throw new BadRequestError("Approval window has expired");
  }

  const newStatus = action === "approve" ? "CHECKED_IN" : "REJECTED";
  await prisma.visitorInvite.update({
    where: { id: visitId },
    data: {
      status: newStatus as any,
      checkedInAt: action === "approve" ? new Date() : undefined,
      approvalToken: null,
    },
  });

  void logActivity({
    userId: actorId,
    action: action === "approve" ? "WALK_IN_APPROVED" : "WALK_IN_REJECTED",
    description: `Walk-in visitor ${visit.visitorName} ${action === "approve" ? "approved" : "rejected"} by tenant`,
    metadata: { visitId },
  });
}

// ---------------------------------------------------------------------------
// Timeout resolution — shared by the cron sweep (walkInTimeoutWorker) AND by
// lazy resolution on read (FD/FM getWalkInStatus, listWalkIns), so a walk-in
// past its approval deadline resolves immediately the next time anyone looks
// at it, instead of waiting for the next cron run (which on Vercel's Hobby
// plan for dev only fires once daily — see vercel.json).
// ---------------------------------------------------------------------------

const timeoutEmailService = new ZeptoMailService();

type WalkInForTimeout = {
  id: string;
  visitorName: string;
  fallbackRule: string | null;
  tenantId: string;
  unit: { name: string; property: { type: string | null } };
  tenant: { userFullName: string | null };
  registeredByFm: { userId: string; userFullName: string | null; userEmail: string } | null;
  registeredByFd: { userId: string; userFullName: string | null; userEmail: string } | null;
};

async function applyWalkInTimeout(
  visit: WalkInForTimeout,
): Promise<"CHECKED_IN" | "REJECTED"> {
  const isCommercial = visit.unit.property.type === "COMMERCIAL";
  const newStatus: "CHECKED_IN" | "REJECTED" =
    isCommercial && visit.fallbackRule === "SEND_UP" ? "CHECKED_IN" : "REJECTED";

  await prisma.visitorInvite.update({
    where: { id: visit.id },
    data: {
      status: newStatus as any,
      checkedInAt: newStatus === "CHECKED_IN" ? new Date() : undefined,
      approvalToken: null,
    },
  });

  const registrant = visit.registeredByFm ?? visit.registeredByFd;
  void logActivity({
    userId: registrant?.userId ?? visit.tenantId,
    action: "WALK_IN_TIMEOUT_APPLIED",
    description: `Walk-in for ${visit.visitorName} auto-resolved to ${newStatus} after approval timeout`,
    metadata: { visitId: visit.id, appliedRule: newStatus },
  });

  if (registrant?.userEmail) {
    const emailTemplate = fmWalkInTimedOutEmail(
      registrant.userFullName ?? "Facility Manager",
      visit.visitorName,
      visit.tenant.userFullName ?? "Tenant",
      visit.unit.name,
      newStatus,
    );
    await timeoutEmailService
      .sendEmail(
        { email: registrant.userEmail, name: registrant.userFullName ?? undefined },
        emailTemplate.subject,
        emailTemplate.html,
      )
      .catch(() => {});

    await notificationService.notify({
      recipientId: registrant.userId,
      type: "WALK_IN",
      title: "Walk-In Approval Timed Out",
      body: `${visit.visitorName}'s walk-in for ${visit.tenant.userFullName ?? "a tenant"} auto-resolved to ${newStatus} after the approval window expired`,
      entityType: "VisitorInvite",
      entityId: visit.id,
    });
  }

  return newStatus;
}

/**
 * If the given walk-in is still PENDING and past its approval deadline,
 * resolves it (commercial send-up rule or reject) and returns the new
 * status. Returns null if there was nothing to resolve.
 */
export async function resolveExpiredWalkIn(
  visitId: string,
): Promise<"CHECKED_IN" | "REJECTED" | null> {
  const visit = await prisma.visitorInvite.findUnique({
    where: { id: visitId },
    include: {
      unit: { select: { name: true, property: { select: { type: true } } } },
      tenant: { select: { userFullName: true } },
      registeredByFm: { select: { userId: true, userFullName: true, userEmail: true } },
      registeredByFd: { select: { userId: true, userFullName: true, userEmail: true } },
    },
  });
  if (!visit || visit.status !== "PENDING") return null;
  if (!visit.approvalExpiresAt || visit.approvalExpiresAt > new Date()) return null;

  return applyWalkInTimeout(visit);
}
