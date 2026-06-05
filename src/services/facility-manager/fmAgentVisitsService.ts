import { prisma } from "../../config/prisma";
import { ForbiddenError, NotFoundError, BadRequestError } from "../../utils/apiError";
import { ZeptoMailService } from "../external/zeptoMailService";
import { logActivity } from "../../utils/activityLogger";
import {
  agentVisitApprovedEmail,
  agentVisitRejectedEmail,
  agentVisitRescheduledEmail,
} from "../../config/emailTemplates";
import type {
  GetAgentVisitsQuery,
  FmAgentVisitListItem,
  FmAgentVisitDetail,
} from "../../dtos/facility-manager/fm.agent-visits.dto";

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
      proposedDate: v.proposedDate,
      rejectionReason: v.rejectionReason,
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

    await prisma.agentVisit.update({
      where: { id: visitId },
      data: { status: "APPROVED" },
    });

    const visitDateStr = visit.visitDate.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const email = agentVisitApprovedEmail(
      visit.agent.userFullName ?? "Agent",
      visit.property.name ?? visit.property.address,
      visitDateStr,
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
}
