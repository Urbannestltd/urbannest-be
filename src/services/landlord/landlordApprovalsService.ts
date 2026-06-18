import { prisma } from "../../config/prisma";
import { ConflictError, ForbiddenError, NotFoundError } from "../../utils/apiError";
import { ZeptoMailService } from "../external/zeptoMailService";
import { logActivity } from "../../utils/activityLogger";
import {
  landlordLeadApprovedAgentEmail,
  landlordLeadRejectedAgentEmail,
  landlordLeadApprovedProspectEmail,
  landlordLeadRejectedProspectEmail,
} from "../../config/emailTemplates";
import type {
  ApprovalsListQuery,
  ApprovalListItem,
  ApprovalHistoryItem,
  ApplicantDossier,
} from "../../dtos/landlord/landlord.approvals.dto";

const LEAD_INCLUDE = {
  agent: { select: { userId: true, userFullName: true, userEmail: true } },
  property: { select: { id: true, name: true, landlordId: true } },
  unit: { select: { id: true, name: true, baseRent: true } },
} as const;

export class LandlordApprovalsService {
  private emailService = new ZeptoMailService();

  private scopedProperty(landlordId: string, specificId?: string) {
    return {
      landlordId,
      isDeleted: false,
      ...(specificId ? { id: specificId } : {}),
    };
  }

  private annualRent(proposedRent: number | null, baseRent: number | null | undefined): number | null {
    if (proposedRent != null) return Math.round(proposedRent * 12);
    if (baseRent != null) return Math.round(baseRent * 12);
    return null;
  }

  private mapToListItem(l: any): ApprovalListItem {
    return {
      leadId: l.id,
      applicantName: l.prospectName,
      propertyId: l.property.id,
      propertyName: l.property.name,
      unitId: l.unit?.id ?? null,
      unitName: l.unit?.name ?? null,
      annualRent: this.annualRent(l.proposedRent, l.unit?.baseRent),
      agentId: l.agent.userId,
      agentName: l.agent.userFullName,
      dateForwarded: l.createdAt,
    };
  }

  private buildDateFilter(dateFrom?: Date, dateTo?: Date) {
    if (!dateFrom && !dateTo) return {};
    return { createdAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } };
  }

  private async fetchLeadWithOwnershipCheck(landlordId: string, leadId: string) {
    const lead = await prisma.agentLead.findUnique({
      where: { id: leadId },
      include: LEAD_INCLUDE,
    });
    if (!lead) throw new NotFoundError("Application not found");
    if (lead.property.landlordId !== landlordId) {
      throw new ForbiddenError("You do not own the property for this application");
    }
    return lead;
  }

  public async listPending(landlordId: string, query: ApprovalsListQuery): Promise<ApprovalListItem[]> {
    const leads = await prisma.agentLead.findMany({
      where: {
        status: "FORWARDED_TO_LANDLORD",
        property: this.scopedProperty(landlordId, query.propertyId),
        ...(query.agentId ? { agentId: query.agentId } : {}),
        ...this.buildDateFilter(query.dateFrom, query.dateTo),
      },
      include: LEAD_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    return leads.map((l) => this.mapToListItem(l));
  }

  public async listHistory(landlordId: string, query: ApprovalsListQuery): Promise<ApprovalHistoryItem[]> {
    const leads = await prisma.agentLead.findMany({
      where: {
        status: { in: ["APPROVED", "REJECTED"] },
        property: this.scopedProperty(landlordId, query.propertyId),
        ...(query.agentId ? { agentId: query.agentId } : {}),
        ...this.buildDateFilter(query.dateFrom, query.dateTo),
      },
      include: LEAD_INCLUDE,
      orderBy: { decidedAt: "desc" },
    });
    return leads.map((l): ApprovalHistoryItem => ({
      ...this.mapToListItem(l),
      outcome: l.status as "APPROVED" | "REJECTED",
      decidedAt: l.decidedAt,
      rejectionReason: l.rejectionReason,
    }));
  }

  public async getDossier(landlordId: string, leadId: string): Promise<ApplicantDossier> {
    const lead = await this.fetchLeadWithOwnershipCheck(landlordId, leadId);

    void logActivity({
      userId: landlordId,
      action: "LANDLORD_DOSSIER_VIEWED",
      description: `Landlord viewed dossier for prospect ${lead.prospectName}`,
      metadata: { leadId, propertyId: lead.propertyId },
    });

    return {
      leadId: lead.id,
      applicantName: lead.prospectName,
      applicantEmail: lead.prospectEmail,
      applicantPhone: lead.prospectPhone,
      occupation: lead.occupation,
      monthlyIncome: lead.monthlyIncome,
      annualIncome: lead.monthlyIncome != null ? Math.round(lead.monthlyIncome * 12) : null,
      employerName: lead.employerName,
      employerAddress: lead.employerAddress,
      documents: lead.documents,
      proposedRent: lead.proposedRent,
      notes: lead.notes,
      propertyId: lead.property.id,
      propertyName: lead.property.name,
      unitId: lead.unit?.id ?? null,
      unitName: lead.unit?.name ?? null,
      agentId: lead.agent.userId,
      agentName: lead.agent.userFullName,
      status: lead.status,
      dateForwarded: lead.createdAt,
    };
  }

  public async approve(landlordId: string, leadId: string): Promise<void> {
    const lead = await this.fetchLeadWithOwnershipCheck(landlordId, leadId);

    if (lead.status !== "FORWARDED_TO_LANDLORD") {
      throw new ConflictError("This application has already been actioned");
    }

    await prisma.agentLead.update({
      where: { id: leadId },
      data: { status: "APPROVED", decidedAt: new Date() },
    });

    const agentTpl = landlordLeadApprovedAgentEmail(
      lead.agent.userFullName ?? "Agent",
      lead.prospectName,
      lead.property.name ?? lead.propertyId,
      lead.unit?.name ?? null,
    );
    this.emailService
      .sendEmail(
        { email: lead.agent.userEmail, name: lead.agent.userFullName ?? undefined },
        agentTpl.subject,
        agentTpl.html,
      )
      .catch(() => {});

    if (lead.prospectEmail) {
      const prospectTpl = landlordLeadApprovedProspectEmail(
        lead.prospectName,
        lead.property.name ?? lead.propertyId,
        lead.unit?.name ?? null,
        "Our facility management team will contact you shortly to complete your onboarding.",
      );
      this.emailService
        .sendEmail(
          { email: lead.prospectEmail, name: lead.prospectName },
          prospectTpl.subject,
          prospectTpl.html,
        )
        .catch(() => {});
    }

    void logActivity({
      userId: landlordId,
      action: "LANDLORD_LEAD_APPROVED",
      description: `Approved application for prospect ${lead.prospectName}`,
      metadata: { leadId, propertyId: lead.propertyId, unitId: lead.unitId },
    });

    void logActivity({
      userId: landlordId,
      action: "AGENT_FEE_TRIGGERED",
      description: `Agent fee workflow triggered for agent ${lead.agent.userId}`,
      metadata: { leadId, agentId: lead.agent.userId, propertyId: lead.propertyId },
    });
  }

  public async reject(landlordId: string, leadId: string, reason: string): Promise<void> {
    const lead = await this.fetchLeadWithOwnershipCheck(landlordId, leadId);

    if (lead.status !== "FORWARDED_TO_LANDLORD") {
      throw new ConflictError("This application has already been actioned");
    }

    await prisma.agentLead.update({
      where: { id: leadId },
      data: { status: "REJECTED", rejectionReason: reason, decidedAt: new Date() },
    });

    const agentTpl = landlordLeadRejectedAgentEmail(
      lead.agent.userFullName ?? "Agent",
      lead.prospectName,
      lead.property.name ?? lead.propertyId,
      lead.unit?.name ?? null,
      reason,
    );
    this.emailService
      .sendEmail(
        { email: lead.agent.userEmail, name: lead.agent.userFullName ?? undefined },
        agentTpl.subject,
        agentTpl.html,
      )
      .catch(() => {});

    if (lead.prospectEmail) {
      const prospectTpl = landlordLeadRejectedProspectEmail(
        lead.prospectName,
        lead.property.name ?? lead.propertyId,
        lead.unit?.name ?? null,
        reason,
      );
      this.emailService
        .sendEmail(
          { email: lead.prospectEmail, name: lead.prospectName },
          prospectTpl.subject,
          prospectTpl.html,
        )
        .catch(() => {});
    }

    void logActivity({
      userId: landlordId,
      action: "LANDLORD_LEAD_REJECTED",
      description: `Rejected application for prospect ${lead.prospectName}`,
      metadata: { leadId, propertyId: lead.propertyId, reason },
    });
  }
}
