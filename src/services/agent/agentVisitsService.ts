import { prisma } from "../../config/prisma";
import { NotFoundError, BadRequestError, ForbiddenError } from "../../utils/apiError";
import { ZeptoMailService } from "../external/zeptoMailService";
import { logActivity } from "../../utils/activityLogger";
import {
  fmAgentVisitScheduledEmail,
  fmAgentVisitCancelledEmail,
  fmRescheduleAcceptedEmail,
  fmRescheduleRejectedEmail,
} from "../../config/emailTemplates";
import type {
  ScheduleVisitRequest,
  GetVisitsQuery,
  AgentVisitListItem,
  AgentVisitDetail,
} from "../../dtos/agent/agent.visits.dto";

export class AgentVisitsService {
  private emailService = new ZeptoMailService();

  private async assertAgentOwnsVisit(agentId: string, visitId: string) {
    const visit = await prisma.agentVisit.findUnique({
      where: { id: visitId },
      include: {
        property: {
          select: {
            name: true,
            address: true,
            facilityManagerId: true,
            facilityManager: {
              select: { userFullName: true, userEmail: true },
            },
          },
        },
        unit: { select: { name: true } },
      },
    });
    if (!visit) throw new NotFoundError("Visit not found");
    if (visit.agentId !== agentId) {
      throw new ForbiddenError("You do not own this visit request");
    }
    return visit;
  }

  public async scheduleVisit(agentId: string, params: ScheduleVisitRequest) {
    const visitDate = new Date(params.visitDate);
    if (visitDate <= new Date()) {
      throw new BadRequestError("Visit date must be in the future");
    }

    const property = await prisma.property.findFirst({
      where: { id: params.propertyId, isDeleted: false },
      select: {
        id: true,
        name: true,
        address: true,
        facilityManagerId: true,
        facilityManager: {
          select: { userFullName: true, userEmail: true },
        },
      },
    });
    if (!property) throw new NotFoundError("Property not found");

    if (params.unitId) {
      const unit = await prisma.unit.findFirst({
        where: { id: params.unitId, propertyId: params.propertyId },
      });
      if (!unit) throw new NotFoundError("Unit not found in this property");
    }

    const visit = await prisma.agentVisit.create({
      data: {
        agentId,
        propertyId: params.propertyId,
        unitId: params.unitId ?? null,
        visitDate,
        purpose: params.purpose ?? null,
        notes: params.notes ?? null,
        status: "PENDING",
      },
    });

    const agent = await prisma.user.findUnique({
      where: { userId: agentId },
      select: { userFullName: true },
    });

    if (property.facilityManager) {
      const visitDateStr = visitDate.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      const email = fmAgentVisitScheduledEmail(
        property.facilityManager.userFullName ?? "Facility Manager",
        agent?.userFullName ?? "Agent",
        property.name ?? property.address,
        visitDateStr,
      );
      await this.emailService.sendEmail(
        {
          email: property.facilityManager.userEmail,
          name: property.facilityManager.userFullName ?? undefined,
        },
        email.subject,
        email.html,
      );
    }

    await logActivity({
      userId: agentId,
      action: "AGENT_VISIT_SCHEDULED",
      description: `Scheduled visit for property ${params.propertyId}`,
      metadata: { visitId: visit.id, propertyId: params.propertyId },
    });

    return { visitId: visit.id, status: visit.status };
  }

  public async getVisits(
    agentId: string,
    filters: GetVisitsQuery,
  ): Promise<AgentVisitListItem[]> {
    const visits = await prisma.agentVisit.findMany({
      where: {
        agentId,
        ...(filters.status && { status: filters.status }),
      },
      include: {
        property: { select: { name: true, address: true } },
        unit: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return visits.map((v) => ({
      id: v.id,
      propertyId: v.propertyId,
      propertyName: v.property.name,
      propertyAddress: v.property.address,
      unitId: v.unitId,
      unitName: v.unit?.name ?? null,
      visitDate: v.visitDate,
      purpose: v.purpose,
      status: v.status,
      proposedDate: v.proposedDate,
      rejectionReason: v.rejectionReason,
      createdAt: v.createdAt,
    }));
  }

  public async getVisitDetail(
    agentId: string,
    visitId: string,
  ): Promise<AgentVisitDetail> {
    const v = await this.assertAgentOwnsVisit(agentId, visitId);
    return {
      id: v.id,
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

  public async cancelVisit(agentId: string, visitId: string): Promise<void> {
    const visit = await this.assertAgentOwnsVisit(agentId, visitId);

    if (!["PENDING", "APPROVED", "RESCHEDULED_PENDING_AGENT"].includes(visit.status)) {
      throw new BadRequestError(
        `Cannot cancel a visit with status ${visit.status}`,
      );
    }

    await prisma.agentVisit.update({
      where: { id: visitId },
      data: { status: "CANCELLED" },
    });

    if (visit.property.facilityManager) {
      const visitDateStr = visit.visitDate.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      const agent = await prisma.user.findUnique({
        where: { userId: agentId },
        select: { userFullName: true },
      });
      const email = fmAgentVisitCancelledEmail(
        visit.property.facilityManager.userFullName ?? "Facility Manager",
        agent?.userFullName ?? "Agent",
        visit.property.name ?? visit.property.address,
        visitDateStr,
      );
      await this.emailService.sendEmail(
        {
          email: visit.property.facilityManager.userEmail,
          name: visit.property.facilityManager.userFullName ?? undefined,
        },
        email.subject,
        email.html,
      );
    }

    await logActivity({
      userId: agentId,
      action: "AGENT_VISIT_CANCELLED",
      description: `Cancelled visit ${visitId}`,
      metadata: { visitId },
    });
  }

  public async acceptReschedule(agentId: string, visitId: string): Promise<void> {
    const visit = await this.assertAgentOwnsVisit(agentId, visitId);

    if (visit.status !== "RESCHEDULED_PENDING_AGENT") {
      throw new BadRequestError(
        `No pending reschedule proposal found for this visit`,
      );
    }
    if (!visit.proposedDate) {
      throw new BadRequestError("No proposed date found");
    }

    await prisma.agentVisit.update({
      where: { id: visitId },
      data: {
        status: "APPROVED",
        visitDate: visit.proposedDate,
        proposedDate: null,
        proposedById: null,
      },
    });

    if (visit.property.facilityManager && visit.proposedDate) {
      const agent = await prisma.user.findUnique({
        where: { userId: agentId },
        select: { userFullName: true },
      });
      const newDateStr = visit.proposedDate.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      const email = fmRescheduleAcceptedEmail(
        visit.property.facilityManager.userFullName ?? "Facility Manager",
        agent?.userFullName ?? "Agent",
        visit.property.name ?? visit.property.address,
        newDateStr,
      );
      await this.emailService.sendEmail(
        {
          email: visit.property.facilityManager.userEmail,
          name: visit.property.facilityManager.userFullName ?? undefined,
        },
        email.subject,
        email.html,
      );
    }

    await logActivity({
      userId: agentId,
      action: "AGENT_VISIT_RESCHEDULE_ACCEPTED",
      description: `Accepted reschedule for visit ${visitId}`,
      metadata: { visitId },
    });
  }

  public async rejectReschedule(agentId: string, visitId: string): Promise<void> {
    const visit = await this.assertAgentOwnsVisit(agentId, visitId);

    if (visit.status !== "RESCHEDULED_PENDING_AGENT") {
      throw new BadRequestError(
        `No pending reschedule proposal found for this visit`,
      );
    }

    await prisma.agentVisit.update({
      where: { id: visitId },
      data: {
        status: "REJECTED",
        proposedDate: null,
        proposedById: null,
      },
    });

    if (visit.property.facilityManager) {
      const agent = await prisma.user.findUnique({
        where: { userId: agentId },
        select: { userFullName: true },
      });
      const email = fmRescheduleRejectedEmail(
        visit.property.facilityManager.userFullName ?? "Facility Manager",
        agent?.userFullName ?? "Agent",
        visit.property.name ?? visit.property.address,
      );
      await this.emailService.sendEmail(
        {
          email: visit.property.facilityManager.userEmail,
          name: visit.property.facilityManager.userFullName ?? undefined,
        },
        email.subject,
        email.html,
      );
    }

    await logActivity({
      userId: agentId,
      action: "AGENT_VISIT_RESCHEDULE_REJECTED",
      description: `Rejected reschedule for visit ${visitId}`,
      metadata: { visitId },
    });
  }
}
