import { prisma } from "../../config/prisma";
import { ForbiddenError, NotFoundError, BadRequestError } from "../../utils/apiError";
import { ZeptoMailService } from "../external/zeptoMailService";
import { logActivity } from "../../utils/activityLogger";
import { generateNumericCode } from "../../utils/generateNumericCode";
import {
  agentVisitApprovedEmail,
  agentVisitRejectedEmail,
  agentVisitRescheduledEmail,
} from "../../config/emailTemplates";
import type {
  GetAgentVisitsQuery,
  FmAgentVisitListItem,
  FmAgentVisitDetail,
  VerifyAgentVisitCodeResponse,
} from "../../dtos/facility-manager/fm.agent-visits.dto";

/** Access code is valid until the end of the scheduled visit's calendar day. */
function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

// A visit is just a "request" until the FM approves it; from approval onward
// (including after the agent has checked in) it's a confirmed "inspection".
const APPROVED_STATUSES = ["APPROVED", "CHECKED_IN"];
function accessTypeFor(status: string): "REQUEST" | "INSPECTION" {
  return APPROVED_STATUSES.includes(status) ? "INSPECTION" : "REQUEST";
}

export class FmAgentVisitsService {
  private emailService = new ZeptoMailService();

  private async assertFmOwnsVisit(fmId: string, visitId: string) {
    const visit = await prisma.agentVisit.findUnique({
      where: { id: visitId },
      include: {
        property: { select: { facilityManagerId: true, name: true, address: true } },
        agent: { select: { userFullName: true, userEmail: true, userPhone: true } },
        unit: { select: { name: true } },
      },
    });
    if (!visit) throw new NotFoundError("Visit not found");
    if (visit.property.facilityManagerId !== fmId) {
      throw new ForbiddenError("You do not manage the property for this visit");
    }
    return visit;
  }

  public async getVisits(
    fmId: string,
    filters: GetAgentVisitsQuery,
  ): Promise<FmAgentVisitListItem[]> {
    const managedProperties = await prisma.property.findMany({
      where: { facilityManagerId: fmId, isDeleted: false },
      select: { id: true },
    });
    const propertyIds = managedProperties.map((p) => p.id);

    const visits = await prisma.agentVisit.findMany({
      where: {
        propertyId: filters.propertyId
          ? filters.propertyId
          : { in: propertyIds },
        ...(filters.status && { status: filters.status }),
        ...(filters.dateFrom || filters.dateTo
          ? {
              visitDate: {
                ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
                ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
              },
            }
          : {}),
      },
      include: {
        agent: { select: { userFullName: true, userPhone: true } },
        property: { select: { name: true, address: true } },
        unit: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return visits.map((v) => ({
      id: v.id,
      agentId: v.agentId,
      agentName: v.agent.userFullName,
      agentPhone: v.agent.userPhone,
      propertyId: v.propertyId,
      propertyName: v.property.name,
      propertyAddress: v.property.address,
      unitId: v.unitId,
      unitName: v.unit?.name ?? null,
      visitDate: v.visitDate,
      purpose: v.purpose,
      status: v.status,
      accessType: accessTypeFor(v.status),
      proposedDate: v.proposedDate,
      createdAt: v.createdAt,
    }));
  }

  public async getVisitDetail(fmId: string, visitId: string): Promise<FmAgentVisitDetail> {
    const v = await this.assertFmOwnsVisit(fmId, visitId);
    return {
      id: v.id,
      agentId: v.agentId,
      agentName: v.agent.userFullName,
      agentPhone: v.agent.userPhone,
      propertyId: v.propertyId,
      propertyName: v.property.name,
      propertyAddress: v.property.address,
      unitId: v.unitId,
      unitName: v.unit?.name ?? null,
      visitDate: v.visitDate,
      purpose: v.purpose,
      notes: v.notes,
      status: v.status,
      accessType: accessTypeFor(v.status),
      proposedDate: v.proposedDate,
      rejectionReason: v.rejectionReason,
      accessCode: v.accessCode,
      createdAt: v.createdAt,
    };
  }

  public async approveVisit(fmId: string, visitId: string): Promise<void> {
    const visit = await this.assertFmOwnsVisit(fmId, visitId);

    if (visit.status !== "PENDING") {
      throw new BadRequestError(
        `Cannot approve a visit with status ${visit.status}`,
      );
    }

    // If the agent countered with a new time (proposeNewTime), adopt it as the
    // confirmed visit date instead of the original request's stale visitDate.
    const hasAgentCounterProposal = Boolean(visit.proposedDate && visit.proposedById);
    const effectiveVisitDate = hasAgentCounterProposal ? visit.proposedDate! : visit.visitDate;

    let accessCode = generateNumericCode();
    while (await prisma.agentVisit.findUnique({ where: { accessCode } })) {
      accessCode = generateNumericCode();
    }

    await prisma.agentVisit.update({
      where: { id: visitId },
      data: {
        status: "APPROVED",
        accessCode,
        ...(hasAgentCounterProposal
          ? { visitDate: effectiveVisitDate, proposedDate: null, proposedById: null }
          : {}),
      },
    });

    const visitDateStr = effectiveVisitDate.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const codeValidUntilStr = endOfDay(effectiveVisitDate).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const email = agentVisitApprovedEmail(
      visit.agent.userFullName ?? "Agent",
      visit.property.name ?? visit.property.address,
      visitDateStr,
      accessCode,
      codeValidUntilStr,
    );
    await this.emailService.sendEmail(
      { email: visit.agent.userEmail, name: visit.agent.userFullName ?? undefined },
      email.subject,
      email.html,
    );

    await logActivity({
      userId: fmId,
      action: "AGENT_VISIT_APPROVED",
      description: `Approved agent visit ${visitId} for property ${visit.propertyId}`,
      metadata: { visitId, agentId: visit.agentId },
    });
  }

  public async rejectVisit(
    fmId: string,
    visitId: string,
    reason?: string,
  ): Promise<void> {
    const visit = await this.assertFmOwnsVisit(fmId, visitId);

    if (visit.status !== "PENDING") {
      throw new BadRequestError(
        `Cannot reject a visit with status ${visit.status}`,
      );
    }

    await prisma.agentVisit.update({
      where: { id: visitId },
      data: { status: "REJECTED", rejectionReason: reason ?? null },
    });

    const visitDateStr = visit.visitDate.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const email = agentVisitRejectedEmail(
      visit.agent.userFullName ?? "Agent",
      visit.property.name ?? visit.property.address,
      visitDateStr,
      reason,
    );
    await this.emailService.sendEmail(
      { email: visit.agent.userEmail, name: visit.agent.userFullName ?? undefined },
      email.subject,
      email.html,
    );

    await logActivity({
      userId: fmId,
      action: "AGENT_VISIT_REJECTED",
      description: `Rejected agent visit ${visitId} for property ${visit.propertyId}`,
      metadata: { visitId, agentId: visit.agentId, reason },
    });
  }

  public async rescheduleVisit(
    fmId: string,
    visitId: string,
    proposedDate: string,
  ): Promise<void> {
    const visit = await this.assertFmOwnsVisit(fmId, visitId);

    if (visit.status !== "PENDING") {
      throw new BadRequestError(
        `Cannot reschedule a visit with status ${visit.status}`,
      );
    }

    const newDate = new Date(proposedDate);
    if (newDate <= new Date()) {
      throw new BadRequestError("Proposed date must be in the future");
    }

    await prisma.agentVisit.update({
      where: { id: visitId },
      data: {
        status: "RESCHEDULED_PENDING_AGENT",
        proposedDate: newDate,
        proposedById: fmId,
      },
    });

    const originalDateStr = visit.visitDate.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const proposedDateStr = newDate.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const email = agentVisitRescheduledEmail(
      visit.agent.userFullName ?? "Agent",
      visit.property.name ?? visit.property.address,
      originalDateStr,
      proposedDateStr,
    );
    await this.emailService.sendEmail(
      { email: visit.agent.userEmail, name: visit.agent.userFullName ?? undefined },
      email.subject,
      email.html,
    );

    await logActivity({
      userId: fmId,
      action: "AGENT_VISIT_RESCHEDULED",
      description: `Proposed reschedule for agent visit ${visitId}`,
      metadata: { visitId, agentId: visit.agentId, proposedDate },
    });
  }

  /**
   * Verifies an agent's visit access code at the gate — scoped to properties
   * this FM manages. Marks the visit CHECKED_IN on success (single-use).
   */
  public async checkInAgentVisit(fmId: string, accessCode: string): Promise<VerifyAgentVisitCodeResponse> {
    const visit = await prisma.agentVisit.findUnique({
      where: { accessCode },
      include: {
        agent: { select: { userFullName: true } },
        property: { select: { facilityManagerId: true, name: true } },
      },
    });

    if (!visit) throw new NotFoundError("Invalid access code");
    if (visit.property.facilityManagerId !== fmId) {
      throw new ForbiddenError("You do not manage the property for this visit");
    }
    if (visit.status !== "APPROVED") {
      throw new BadRequestError(`Code is ${visit.status} (already used or not yet approved)`);
    }
    if (new Date() > endOfDay(visit.visitDate)) {
      throw new BadRequestError("Code is expired — it was only valid on the scheduled visit day");
    }

    await prisma.agentVisit.update({
      where: { id: visit.id },
      data: { status: "CHECKED_IN", checkedInAt: new Date() },
    });

    await logActivity({
      userId: fmId,
      action: "AGENT_VISIT_CHECKED_IN",
      description: `Checked in agent visit ${visit.id} for property ${visit.propertyId}`,
      metadata: { visitId: visit.id, agentId: visit.agentId },
    });

    return {
      valid: true,
      agentName: visit.agent.userFullName,
      propertyName: visit.property.name,
    };
  }
}
