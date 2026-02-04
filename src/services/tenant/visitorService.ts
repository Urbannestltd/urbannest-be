import { prisma } from "../../config/prisma";
import {
  CreateBulkInviteRequest,
  CreateInviteRequest,
} from "../../dtos/tenant/visitor.dto";
import { NotFoundError, BadRequestError } from "../../utils/apiError";
import { ZeptoMailService } from "./../external/zeptoMailService"; // Reuse your email service
import { InviteFrequency, InviteStatus, VisitorType } from "@prisma/client";

export class VisitorService {
  private emailService = new ZeptoMailService();
  /**
   * Helper: Generate a random 6-digit code
   */
  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * 1. CREATE INVITE
   * Tenant generates a pass for a visitor.
   */
  public async createInvite(tenantId: string, params: CreateInviteRequest) {
    const lease = await prisma.lease.findFirst({
      where: { tenantId, status: "ACTIVE" },
    });
    if (!lease) throw new BadRequestError("Active lease required.");

    // Ensure validFrom < validUntil
    if (new Date(params.startDate) >= new Date(params.endDate)) {
      throw new BadRequestError("End time must be after start time");
    }

    // Uniqueness check loop
    let code = this.generateCode();
    while (
      await prisma.visitorInvite.findUnique({ where: { accessCode: code } })
    ) {
      code = this.generateCode();
    }

    const invite = await prisma.visitorInvite.create({
      data: {
        tenantId,
        unitId: lease.unitId,
        visitorName: params.visitor.name,
        visitorPhone: params.visitor.phone,
        accessCode: code,
        type: params.type as VisitorType,
        frequency: params.frequency as InviteFrequency,
        validFrom: new Date(params.startDate),
        validUntil: new Date(params.endDate),
        status: InviteStatus.UPCOMING,
      },
    });

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
      let code = this.generateCode();
      // ... uniqueness check ...

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

    return { groupName: newGroup.name, count: invitesData.length };
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

    if (invite.status !== "ACTIVE") {
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
    const check = await this.verifyAccessCode(code);

    // Update DB
    const invite = await prisma.visitorInvite.update({
      where: { accessCode: code },
      data: {
        status: InviteStatus.CHECKED_IN, // Mark as Used
        checkedInAt: new Date(),
      },
      include: { tenant: true },
    });

    await this.emailService.sendTemplateEmail(
      {
        email: invite.tenant.userEmail,
        name: invite.tenant.userFullName || "Tenant",
      },
      "VISITOR_ARRIVAL_TEMPLATE_KEY", // <--- Add this to your ZeptoMail Config
      {
        visitor_name: invite.visitorName,
        time: new Date().toLocaleTimeString(),
        location: "Main Gate",
      },
    );

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
    // 1. Fetch GROUPS (and include all their visitors)
    const groups = await prisma.visitorGroup.findMany({
      where: { tenantId },
      include: {
        invites: {
          orderBy: { visitorName: "asc" }, // Sort names inside the group A-Z
        },
      },
    });

    // 2. Fetch SOLO INVITES (Where groupId is null)
    const soloInvites = await prisma.visitorInvite.findMany({
      where: {
        tenantId,
        groupId: null, // Strictly fetch those NOT in a group
      },
    });

    // 3. Normalize Groups into a common "History Item" structure
    const formattedGroups = groups.map((g) => ({
      id: g.id,
      isGroup: true,
      title: g.name, // The Group Name (e.g., "Project Team")
      date: new Date(g.validFrom).toDateString(),
      rawDate: g.validFrom, // Used for sorting below

      // The list of people inside this group
      visitors: g.invites.map((invite) => ({
        name: invite.visitorName,
        phone: invite.visitorPhone || "-",
        code: invite.accessCode,
        status: invite.status,
        checkInTime: invite.checkedInAt
          ? new Date(invite.checkedInAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "-",
        checkOutTime: invite.checkedOutAt
          ? new Date(invite.checkedOutAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "-",
      })),
    }));

    // 4. Normalize Solo Invites into the same structure
    const formattedSolos = soloInvites.map((invite) => ({
      id: invite.id,
      isGroup: false,
      title: invite.visitorName, // The Visitor Name
      date: new Date(invite.validFrom).toDateString(),
      rawDate: invite.validFrom,

      // Single visitor details (sent as an array of 1 for consistent frontend logic)
      visitors: [
        {
          name: invite.visitorName,
          phone: invite.visitorPhone || "-",
          code: invite.accessCode,
          status: invite.status,
          checkInTime: invite.checkedInAt
            ? new Date(invite.checkedInAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "-",
          checkOutTime: invite.checkedOutAt
            ? new Date(invite.checkedOutAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "-",
        },
      ],
    }));

    const combinedHistory = [...formattedGroups, ...formattedSolos].sort(
      (a, b) => b.rawDate.getTime() - a.rawDate.getTime(),
    );

    // Remove 'rawDate' before sending to frontend (optional cleanup)
    return combinedHistory.map(({ rawDate, ...item }) => item);
  }
}
