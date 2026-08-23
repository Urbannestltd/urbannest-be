import { prisma } from "../../config/prisma";
import {
  CreateBulkInviteRequest,
  CreateInviteRequest,
  VisitorPeriodFilter,
  VisitorStatsResponse,
} from "../../dtos/tenant/visitor.dto";
import { NotFoundError, BadRequestError } from "../../utils/apiError";
import { ZeptoMailService } from "./../external/zeptoMailService";
import {
  adminVisitorCheckInEmail,
  visitorCheckInEmail,
  visitorAccessCodeEmail,
  tenantVisitorCodeEmail,
  tenantBulkVisitorCodesEmail,
} from "../../config/emailTemplates";
import { getAdminRecipients } from "../../utils/getAdminRecipients";
import { InviteFrequency, InviteStatus, VisitorType } from "@prisma/client";
import { resolveDateRangePreset } from "../../utils/dateRangePreset";
import { generateNumericCode } from "../../utils/generateNumericCode";

const RECURRING_VALID_MS = 365 * 24 * 60 * 60 * 1000; // 1 year — "open-ended until revoked"

const AUTO_DEDUPE_WINDOW_MS = 10_000;

/**
 * Derives the idempotency key for a createInvite call. Prefers the
 * caller-supplied Idempotency-Key header (namespaced per tenant so two
 * tenants can't collide on the same client-chosen value); falls back to a
 * key auto-derived from the request shape within a short time window, so
 * accidental double-submits are still caught even if the caller never sends
 * the header.
 */
export function buildCreateInviteIdempotencyKey(
  tenantId: string,
  headerKey: string | undefined,
  params: CreateInviteRequest,
): string {
  if (headerKey) return `${tenantId}:${headerKey}`;

  const visitorIdentity =
    params.visitor.email || params.visitor.phone || params.visitor.name;
  const bucket = Math.floor(Date.now() / AUTO_DEDUPE_WINDOW_MS);
  return `${tenantId}:auto:${params.type}:${params.startDate}:${visitorIdentity}:${bucket}`;
}

/**
 * Derives validFrom/validUntil from the request per frequency:
 *  - ONE_OFF: exact window the tenant provided.
 *  - WHOLE_DAY: expands startDate to 00:00–23:59 of that day.
 *  - RECURRING: starts at startDate, open-ended (capped at 1 year out).
 */
function resolveValidityWindow(
  frequency: "ONE_OFF" | "WHOLE_DAY" | "RECURRING",
  startDate: string,
  endDate?: string,
): { validFrom: Date; validUntil: Date } {
  const start = new Date(startDate);

  if (frequency === "WHOLE_DAY") {
    const validFrom = new Date(start);
    validFrom.setHours(0, 0, 0, 0);
    const validUntil = new Date(start);
    validUntil.setHours(23, 59, 59, 999);
    return { validFrom, validUntil };
  }

  if (frequency === "RECURRING") {
    return { validFrom: start, validUntil: new Date(start.getTime() + RECURRING_VALID_MS) };
  }

  // ONE_OFF — endDate is guaranteed present by CreateInviteSchema's refine
  return { validFrom: start, validUntil: new Date(endDate as string) };
}

export class VisitorService {
  private emailService = new ZeptoMailService();

  /**
   * 1. CREATE INVITE
   * Tenant generates a pass for a visitor.
   */
  public async createInvite(tenantId: string, params: CreateInviteRequest) {
    const lease = await prisma.lease.findFirst({
      where: { tenantId, status: "ACTIVE" },
    });
    if (!lease) throw new BadRequestError("Active lease required.");

    const { validFrom, validUntil } = resolveValidityWindow(
      params.frequency,
      params.startDate,
      params.endDate,
    );

    // Ensure validFrom < validUntil (only meaningful to check for ONE_OFF —
    // WHOLE_DAY/RECURRING windows are derived and always valid by construction)
    if (params.frequency === "ONE_OFF" && validFrom >= validUntil) {
      throw new BadRequestError("End time must be after start time");
    }

    // Uniqueness check loop
    let code = generateNumericCode();
    while (
      await prisma.visitorInvite.findUnique({ where: { accessCode: code } })
    ) {
      code = generateNumericCode();
    }

    const invite = await prisma.visitorInvite.create({
      data: {
        tenantId,
        unitId: lease.unitId,
        visitorName: params.visitor.name,
        visitorPhone: params.visitor.phone,
        visitorEmail: params.visitor.email,
        accessCode: code,
        type: params.type as VisitorType,
        frequency: params.frequency as InviteFrequency,
        validFrom,
        validUntil,
        status: InviteStatus.UPCOMING,
      },
      include: { tenant: { select: { userFullName: true, userEmail: true } } },
    });

    // Send code directly to visitor if their email was provided
    if (params.visitor.email) {
      const emailTemplate = visitorAccessCodeEmail(
        invite.visitorName,
        invite.tenant.userFullName ?? "Your host",
        code,
        invite.validFrom,
        invite.validUntil,
      );
      this.emailService
        .sendEmail(
          { email: params.visitor.email, name: invite.visitorName },
          emailTemplate.subject,
          emailTemplate.html,
        )
        .catch(() => {});
    }

    // Also send a copy of the code to the tenant who generated it
    const tenantTpl = tenantVisitorCodeEmail(
      invite.tenant.userFullName ?? "there",
      invite.visitorName,
      code,
      invite.validFrom,
      invite.validUntil,
    );
    this.emailService
      .sendEmail(
        { email: invite.tenant.userEmail, name: invite.tenant.userFullName ?? undefined },
        tenantTpl.subject,
        tenantTpl.html,
      )
      .catch(() => {});

    return {
      code,
      visitorName: invite.visitorName,
      validUntil: invite.validUntil,
      shareMessage: `Hello ${invite.visitorName}, your pass code is *${code}*.`,
    };
  }

  /**
   * 2. CREATE BULK INVITE (For Meetings/Events)
   * Receives a list of names, returns a list of codes.
   */
  //
  public async createBulkInvite(
    tenantId: string,
    params: CreateBulkInviteRequest,
  ) {
    // 1. Create the "Event" container (The Group)
    const newGroup = await prisma.visitorGroup.create({
      data: {
        tenantId,
        unitId: params.unitId, // Ensure you pass unitId
        name: params.groupName, // <--- "Birthday Party"
        validFrom: new Date(params.startDate),
        validUntil: new Date(params.endDate),
      },
    });

    const invitesData = [];

    // 2. Generate Invites linked to this Group
    for (const visitor of params.visitors) {
      let code = generateNumericCode();
      while (await prisma.visitorInvite.findUnique({ where: { accessCode: code } })) {
        code = generateNumericCode();
      }

      invitesData.push({
        tenantId,
        unitId: params.unitId,
        groupId: newGroup.id, // <--- LINK HERE
        visitorName: visitor.name,
        visitorPhone: visitor.phone,
        accessCode: code,
        validFrom: new Date(params.startDate),
        validUntil: new Date(params.endDate),
        type: params.type,
        status: InviteStatus.UPCOMING,
      });
    }

    await prisma.visitorInvite.createMany({ data: invitesData });

    const codes = invitesData.map((i) => ({ name: i.visitorName, code: i.accessCode }));

    // Send the tenant a copy of every code generated for this event
    const tenant = await prisma.user.findUnique({
      where: { userId: tenantId },
      select: { userFullName: true, userEmail: true },
    });
    if (tenant) {
      const tenantTpl = tenantBulkVisitorCodesEmail(
        tenant.userFullName ?? "there",
        newGroup.name,
        codes,
        newGroup.validFrom,
        newGroup.validUntil,
      );
      this.emailService
        .sendEmail(
          { email: tenant.userEmail, name: tenant.userFullName ?? undefined },
          tenantTpl.subject,
          tenantTpl.html,
        )
        .catch(() => {});
    }

    return { groupName: newGroup.name, count: invitesData.length, codes };
  }

  /**
   * 2. VERIFY CODE (Security Guard scans/types this)
   * This is a "ReadOnly" check to see if the person is allowed.
   */
  public async verifyAccessCode(code: string) {
    const invite = await prisma.visitorInvite.findUnique({
      where: { accessCode: code },
      include: {
        tenant: { select: { userFullName: true, userPhone: true } },
        unit: { select: { name: true } },
      },
    });

    if (!invite) throw new NotFoundError("Invalid Access Code");

    // VALIDATION CHECKS
    const now = new Date();

    // Invites are created as UPCOMING (nothing transitions them to ACTIVE ahead
    // of time) — both are valid statuses to check in on; the validFrom/validUntil
    // window below is what actually gates entry.
    if (invite.status !== "ACTIVE" && invite.status !== "UPCOMING") {
      throw new BadRequestError(`Code is ${invite.status} (Used or Revoked)`);
    }

    if (now < invite.validFrom || now > invite.validUntil) {
      throw new BadRequestError("Code is expired or not valid for today.");
    }

    // Success! Show Security who this is for.
    return {
      valid: true,
      visitorName: invite.visitorName,
      tenantName: invite.tenant.userFullName,
      unit: invite.unit.name,
      status: "APPROVED",
    };
  }

  /**
   * 3. CHECK-IN VISITOR
   * Security clicks "Confirm Entry".
   */
  public async checkInVisitor(code: string) {
    // Re-verify logic to be safe
    await this.verifyAccessCode(code);

    // Update DB
    const invite = await prisma.visitorInvite.update({
      where: { accessCode: code },
      data: {
        status: InviteStatus.CHECKED_IN, // Mark as Used
        checkedInAt: new Date(),
      },
      include: { tenant: true },
    });

    const checkin = visitorCheckInEmail(
      invite.tenant.userFullName || "there",
      invite.visitorName,
      new Date().toLocaleTimeString(),
      "Main Gate",
    );
    await this.emailService.sendEmail(
      { email: invite.tenant.userEmail, name: invite.tenant.userFullName ?? undefined },
      checkin.subject,
      checkin.html,
    );

    // Notify admins who have visitor notifications enabled
    const adminRecipients = await getAdminRecipients("emailVisitors");
    if (adminRecipients.length > 0) {
      const lease = await prisma.lease.findFirst({
        where: { tenantId: invite.tenantId, status: "ACTIVE" },
        include: { unit: { include: { property: true } } },
      });
      const checkInTime = new Date().toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });
      for (const admin of adminRecipients) {
        const alert = adminVisitorCheckInEmail(
          admin.name ?? "Admin",
          invite.tenant.userFullName ?? "Tenant",
          invite.visitorName,
          lease?.unit?.name ?? "Unknown Unit",
          lease?.unit?.property?.name ?? "Unknown Property",
          checkInTime,
        );
        await this.emailService.sendEmail(
          { email: admin.email, name: admin.name ?? undefined },
          alert.subject,
          alert.html,
        );
      }
    }

    return { success: true, message: "Visitor checked in successfully" };
  }

  public async checkOutVisitor(accessCode: string) {
    // Find the invite (even if it's already 'COMPLETED')
    const invite = await prisma.visitorInvite.findUnique({
      where: { accessCode },
    });

    if (!invite) throw new NotFoundError("Visitor record not found");
    if (!invite.checkedInAt)
      throw new BadRequestError("Visitor never checked in!");
    if (invite.checkedOutAt)
      throw new BadRequestError("Visitor already checked out.");

    // Update the exit time
    await prisma.visitorInvite.update({
      where: { accessCode },
      data: { checkedOutAt: new Date(), status: InviteStatus.CHECKED_OUT },
    });

    return { success: true, message: "Visitor checked out successfully" };
  }

  /**
   * 4. GET VISITOR HISTORY
   * Returns list of past visitors for the tenant.
   */
  public async getVisitorHistory(tenantId: string) {
    // 1. Fetch invites with their associated Group Name
    const history = await prisma.visitorInvite.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" }, // Newest actions first
      include: {
        // === NEW: Fetch the parent group name ===
        group: {
          select: {
            name: true,
            id: true,
          },
        },
      },
    });

    // 2. Format data, prioritizing Group Name if it exists
    return history.map((record) => {
      // Logic: If it's a group invite, the "Main Title" is the Group Name.
      // If it's a single invite, the "Main Title" is the Visitor Name.
      // But we send both fields so the Frontend can decide how to display it.

      return {
        id: record.id,

        // Display Info
        visitorName: record.visitorName,
        visitorPhone: record.visitorPhone || "-",
        groupName: record.group?.name || null, // e.g., "Project Team Meeting" or null
        isGroupInvite: !!record.groupId,

        // Context
        type: record.type,
        code: record.accessCode,
        date: new Date(record.validFrom).toDateString(),

        // Timestamps for Audit Trail
        checkInTime: record.checkedInAt
          ? new Date(record.checkedInAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "-",

        checkOutTime: record.checkedOutAt
          ? new Date(record.checkedOutAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "-",

        status: record.status,
      };
    });
  }

  public async getVisitorStats(
    period: VisitorPeriodFilter,
    tenantId: string,
  ): Promise<VisitorStatsResponse> {
    const { start: startDate, end: now } = resolveDateRangePreset(period);

    // Overlap with the period window (not createdAt) — a RECURRING/WHOLE_DAY
    // pass created before the window but still valid within it must still
    // count, same fix applied to the FM/FD visitor stats.
    const baseWhere = {
      tenantId,
      validFrom: { lte: now },
      validUntil: { gte: startDate },
    };

    // A rejected/revoked/expired invite was never a real completed visit —
    // don't count it toward "scheduled".
    const FAILED_STATUSES: InviteStatus[] = [
      "REJECTED",
      "REVOKED",
      "EXPIRED",
      "EXPIRED_NO_SHOW",
    ];

    const [totalVisitors, totalScheduled, totalWalkIns] =
      await prisma.$transaction([
        prisma.visitorInvite.count({ where: baseWhere }),

        prisma.visitorInvite.count({
          where: { ...baseWhere, isWalkIn: false, status: { notIn: FAILED_STATUSES } },
        }),

        prisma.visitorInvite.count({
          where: { ...baseWhere, isWalkIn: true },
        }),
      ]);

    return {
      totalVisitors,
      totalScheduled,
      totalWalkIns,
    };
  }
}
