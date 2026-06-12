import { randomUUID } from "crypto";
import { prisma } from "../../config/prisma";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/apiError";
import { ZeptoMailService } from "../external/zeptoMailService";
import { logActivity } from "../../utils/activityLogger";
import {
  tenantWalkInApprovalEmail,
  fmWalkInTimedOutEmail,
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
    if (!visit.isWalkIn) throw new BadRequestError("This is not a walk-in visit");
    if (visit.unit.property.facilityManagerId !== fmId) {
      throw new ForbiddenError("You do not manage the property for this visit");
    }
    return visit;
  }

  public async registerWalkIn(fmId: string, data: RegisterWalkInRequest): Promise<WalkInListItem> {
    // Validate unit belongs to an FM-managed property
    const unit = await prisma.unit.findUnique({
      where: { id: data.unitId },
      include: {
        property: { select: { id: true, name: true, facilityManagerId: true, type: true } },
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
        tenant: { select: { userId: true, userFullName: true, userEmail: true } },
      },
    });
    if (!activeLease) throw new BadRequestError("No active tenant found for this unit");

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
        { email: activeLease.tenant.userEmail, name: activeLease.tenant.userFullName ?? undefined },
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
      .catch(() => {});

    void logActivity({
      userId: fmId,
      action: "WALK_IN_REGISTERED",
      description: `Walk-in visitor ${data.visitorName} registered by ${fm?.userFullName ?? "FM"} for unit ${unit.name}`,
      metadata: { visitId: visit.id, unitId: data.unitId },
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

  public async getWalkInStatus(fmId: string, visitId: string): Promise<WalkInStatus> {
    const visit = await this.assertFmOwnsVisit(fmId, visitId);
    return {
      id: visit.id,
      status: visit.status,
      approvalExpiresAt: visit.approvalExpiresAt,
      secondsUntilExpiry:
        visit.status === "PENDING" ? this.secondsUntilExpiry(visit.approvalExpiresAt) : null,
      checkedInAt: visit.checkedInAt,
      checkedOutAt: visit.checkedOutAt,
    };
  }

  public async listWalkIns(fmId: string, filters: WalkInListQuery): Promise<WalkInListItem[]> {
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
                { visitorName: { contains: filters.search, mode: "insensitive" } },
                { visitorPhone: { contains: filters.search, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(filters.dateFrom || filters.dateTo
          ? {
              createdAt: {
                ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
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

    return visits.map((v) => this.mapVisit(v));
  }

  public async getRepeatVisitorProfile(
    fmId: string,
    search: string,
  ): Promise<RepeatVisitorProfile | null> {
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
        unit: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (visits.length === 0 || !visits[0]) return null;

    const last = visits[0];
    return {
      visitorName: last.visitorName,
      visitorPhone: last.visitorPhone,
      visitorType: last.type,
      lastVisitDate: last.createdAt,
      lastUnitId: last.unitId,
      lastUnitName: last.unit.name,
      totalVisits: visits.length,
    };
  }

  private mapVisit(visit: any): WalkInListItem {
    return {
      id: visit.id,
      visitorName: visit.visitorName,
      visitorPhone: visit.visitorPhone,
      visitorType: visit.type,
      status: visit.status,
      unitId: visit.unit.id,
      unitName: visit.unit.name,
      propertyId: visit.unit.property.id,
      propertyName: visit.unit.property.name,
      tenantName: visit.tenant?.userFullName ?? null,
      fallbackRule: visit.fallbackRule,
      approvalExpiresAt: visit.approvalExpiresAt,
      secondsUntilExpiry:
        visit.status === "PENDING" ? this.secondsUntilExpiry(visit.approvalExpiresAt) : null,
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
