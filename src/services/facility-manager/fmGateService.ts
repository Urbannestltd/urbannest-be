import { randomUUID } from "crypto";
import { prisma } from "../../config/prisma";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/apiError";
import { ZeptoMailService } from "../external/zeptoMailService";
import { logActivity } from "../../utils/activityLogger";
import {
  tenantVisitorArrivalEmail,
  tenantDepartureVerificationEmail,
} from "../../config/emailTemplates";
import type { GateVisitorProfile, PinLookupResult } from "../../dtos/facility-manager/fm.gate.dto";

export class FmGateService {
  private emailService = new ZeptoMailService();

  private buildProfile(invite: any, now: Date): GateVisitorProfile {
    const inWindow = invite.validFrom <= now && invite.validUntil >= now;
    const canCheckIn =
      (invite.status === "UPCOMING" || invite.status === "ACTIVE") && inWindow;
    const canCheckOut = invite.status === "CHECKED_IN";
    const canRequestDeparture = invite.status === "CHECKED_IN";

    return {
      inviteId: invite.id,
      visitorName: invite.visitorName,
      visitorPhone: invite.visitorPhone,
      visitorType: invite.type,
      frequency: invite.frequency,
      status: invite.status,
      scheduledFrom: invite.validFrom,
      scheduledUntil: invite.validUntil,
      hostTenant: {
        id: invite.tenant.userId,
        name: invite.tenant.userFullName,
        unit: invite.unit.name,
        property: invite.unit.property.name ?? "Unknown",
      },
      canCheckIn,
      canCheckOut,
      canRequestDeparture,
      departureRequestPending: !!invite.departureRequestAt,
      checkedInAt: invite.checkedInAt,
      checkedOutAt: invite.checkedOutAt,
    };
  }

  private async loadInviteWithContext(where: object) {
    return prisma.visitorInvite.findFirst({
      where,
      include: {
        tenant: {
          select: {
            userId: true,
            userFullName: true,
            userEmail: true,
          },
        },
        unit: {
          select: {
            name: true,
            property: {
              select: {
                id: true,
                name: true,
                facilityManagerId: true,
              },
            },
          },
        },
      },
    });
  }

  private async assertFmManagesInvite(fmId: string, inviteId: string) {
    const invite = await this.loadInviteWithContext({ id: inviteId });
    if (!invite) throw new NotFoundError("Visit record not found");
    if (invite.unit.property.facilityManagerId !== fmId) {
      throw new ForbiddenError("You do not manage the property for this visit");
    }
    return invite;
  }

  public async lookupByPin(fmId: string, code: string): Promise<PinLookupResult> {
    const invite = await this.loadInviteWithContext({ accessCode: code, isWalkIn: false });

    if (!invite) {
      void logActivity({
        userId: fmId,
        action: "GATE_PIN_INVALID",
        description: `PIN lookup failed — code not found: ${code}`,
      });
      return {
        ok: false,
        profile: null,
        error: { code: "INVALID", message: "Invalid code. No visitor record found." },
      };
    }

    if (invite.unit.property.facilityManagerId !== fmId) {
      throw new ForbiddenError("This invite does not belong to one of your properties");
    }

    void logActivity({
      userId: fmId,
      action: "GATE_PIN_LOOKUP",
      description: `PIN lookup for visitor ${invite.visitorName}`,
      metadata: { inviteId: invite.id },
    });

    const now = new Date();
    const profile = this.buildProfile(invite, now);

    // Determine any error conditions
    if (invite.status === "REVOKED") {
      return {
        ok: false,
        profile,
        error: { code: "REVOKED", message: "Access revoked by host. Contact the tenant." },
      };
    }

    if (
      invite.status === "EXPIRED" ||
      invite.status === "EXPIRED_NO_SHOW" ||
      invite.validUntil < now
    ) {
      return {
        ok: false,
        profile,
        error: { code: "EXPIRED", message: "Pass expired. Contact the host to reissue." },
      };
    }

    if (invite.validFrom > now) {
      return {
        ok: false,
        profile,
        error: {
          code: "NOT_YET_ACTIVE",
          message: `Code not active yet. Valid from ${invite.validFrom.toLocaleString("en-GB")}.`,
        },
      };
    }

    if (invite.status === "CHECKED_IN") {
      return {
        ok: false,
        profile,
        error: {
          code: "ALREADY_CHECKED_IN",
          message: "Visitor is already checked in. Use the departure flow if they are leaving.",
        },
      };
    }

    if (
      invite.status === "CHECKED_OUT" ||
      invite.status === "COMPLETED"
    ) {
      return {
        ok: false,
        profile,
        error: { code: "ALREADY_DEPARTED", message: "Visitor has already departed." },
      };
    }

    return { ok: true, profile, error: null };
  }

  public async checkIn(fmId: string, inviteId: string): Promise<void> {
    const invite = await this.assertFmManagesInvite(fmId, inviteId);

    if (invite.status !== "UPCOMING" && invite.status !== "ACTIVE") {
      throw new BadRequestError(
        `Cannot check in visitor with status "${invite.status}". Must be UPCOMING or ACTIVE.`,
      );
    }

    const now = new Date();
    if (invite.validFrom > now) {
      throw new BadRequestError("This pass is not yet active.");
    }
    if (invite.validUntil < now) {
      throw new BadRequestError("This pass has expired.");
    }

    await prisma.visitorInvite.update({
      where: { id: inviteId },
      data: { status: "CHECKED_IN" as any, checkedInAt: now },
    });

    // Notify tenant asynchronously
    const emailTemplate = tenantVisitorArrivalEmail(
      invite.tenant.userFullName ?? "Tenant",
      invite.visitorName,
      invite.visitorPhone,
      invite.unit.name,
    );
    this.emailService
      .sendEmail(
        { email: invite.tenant.userEmail, name: invite.tenant.userFullName ?? undefined },
        emailTemplate.subject,
        emailTemplate.html,
      )
      .catch(() => {});

    void logActivity({
      userId: fmId,
      action: "GATE_CHECK_IN",
      description: `Visitor ${invite.visitorName} checked in`,
      metadata: { inviteId },
    });
  }

  public async checkOut(fmId: string, inviteId: string): Promise<void> {
    const invite = await this.assertFmManagesInvite(fmId, inviteId);

    if (invite.status !== "CHECKED_IN") {
      throw new BadRequestError(
        `Cannot check out visitor with status "${invite.status}". Must be CHECKED_IN.`,
      );
    }

    await prisma.visitorInvite.update({
      where: { id: inviteId },
      data: { status: "CHECKED_OUT" as any, checkedOutAt: new Date() },
    });

    void logActivity({
      userId: fmId,
      action: "GATE_CHECK_OUT",
      description: `Visitor ${invite.visitorName} checked out`,
      metadata: { inviteId },
    });
  }

  public async requestDeparture(fmId: string, inviteId: string): Promise<void> {
    const invite = await this.assertFmManagesInvite(fmId, inviteId);

    if (invite.status !== "CHECKED_IN") {
      throw new BadRequestError("Departure verification can only be requested for checked-in visitors.");
    }
    if (invite.departureRequestAt) {
      throw new BadRequestError("A departure confirmation request has already been sent.");
    }

    const departureToken = randomUUID();
    await prisma.visitorInvite.update({
      where: { id: inviteId },
      data: { departureToken, departureRequestAt: new Date() },
    });

    const baseUrl = process.env.API_BASE_URL ?? "http://localhost:3000";
    const confirmUrl = `${baseUrl}/visit-departures/confirm?token=${departureToken}`;

    const emailTemplate = tenantDepartureVerificationEmail(
      invite.tenant.userFullName ?? "Tenant",
      invite.visitorName,
      confirmUrl,
    );
    this.emailService
      .sendEmail(
        { email: invite.tenant.userEmail, name: invite.tenant.userFullName ?? undefined },
        emailTemplate.subject,
        emailTemplate.html,
      )
      .catch(() => {});

    void logActivity({
      userId: fmId,
      action: "GATE_DEPARTURE_REQUESTED",
      description: `Departure verification requested for visitor ${invite.visitorName}`,
      metadata: { inviteId },
    });
  }
}

// ---------------------------------------------------------------------------
// Shared departure confirmation — used by both public token and authenticated app paths
// ---------------------------------------------------------------------------
export async function confirmVisitorDeparture(
  inviteId: string,
  tenantId: string,
): Promise<void> {
  const invite = await prisma.visitorInvite.findUnique({
    where: { id: inviteId },
    select: { id: true, status: true, visitorName: true, tenantId: true },
  });
  if (!invite) throw new NotFoundError("Visit record not found");
  if (invite.tenantId !== tenantId) throw new ForbiddenError("This visit does not belong to you");
  if (invite.status !== "CHECKED_IN") {
    throw new BadRequestError("Visitor is not currently checked in");
  }

  await prisma.visitorInvite.update({
    where: { id: inviteId },
    data: {
      status: "CHECKED_OUT" as any,
      checkedOutAt: new Date(),
      departureToken: null,
    },
  });

  void logActivity({
    userId: tenantId,
    action: "GATE_DEPARTURE_CONFIRMED",
    description: `Departure confirmed for visitor ${invite.visitorName}`,
    metadata: { inviteId },
  });
}
