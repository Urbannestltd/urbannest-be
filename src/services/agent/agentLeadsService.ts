import axios from "axios";
import { prisma } from "../../config/prisma";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../utils/apiError";
import { logActivity } from "../../utils/activityLogger";
import { ZeptoMailService } from "../external/zeptoMailService";
import { landlordLeadForwardedEmail } from "../../config/emailTemplates";
import type {
  SubmitLeadRequest,
  AgentLeadResponse,
  GetLeadsQuery,
  AgentLeadListItem,
  DeleteLeadResponse,
  AgentLeadDetail,
  ForwardLeadResponse,
  ResubmitLeadResponse,
  UpdateLeadRequest,
  AgentLeadDocumentItem,
} from "../../dtos/agent/agent.leads.dto";
import type { UploadDocumentRequest } from "../../dtos/agent/agent.lead-documents.dto";

const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const STATUS_FILTER_MAP = {
  DRAFT: "PENDING",
  FORWARDED: "FORWARDED_TO_LANDLORD",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export class AgentLeadsService {
  private emailService = new ZeptoMailService();

  public async submitLead(agentId: string, data: SubmitLeadRequest): Promise<AgentLeadResponse> {
    const property = await prisma.property.findFirst({
      where: { id: data.propertyId, isDeleted: false },
    });
    if (!property) throw new NotFoundError("Property not found");
    if (property.agentId !== agentId) {
      throw new ForbiddenError("You are not assigned to this property");
    }

    // Wrapped in a transaction so the vacancy re-check and lead creation are
    // as close to atomic as this ORM allows, minimizing the race window
    // described by the "unit taken" conflict scenario.
    const lead = await prisma.$transaction(async (tx) => {
      const unit = await tx.unit.findFirst({
        where: { id: data.unitId, propertyId: data.propertyId },
      });
      if (!unit) throw new BadRequestError("Unit does not belong to this property");
      if (unit.status !== "AVAILABLE") {
        throw new ConflictError("This unit is no longer available. Please select a different unit.");
      }

      return tx.agentLead.create({
        data: {
          agentId,
          propertyId: data.propertyId,
          unitId: data.unitId,
          prospectName: data.prospectName,
          prospectEmail: data.prospectEmail,
          prospectPhone: data.prospectPhone,
          proposedRent: data.proposedRent,
          notes: data.notes ?? null,
          occupation: data.occupation ?? null,
          employerName: data.employerName ?? null,
          employmentDuration: data.employmentDuration ?? null,
          annualIncome: data.annualIncome ?? null,
          status: "PENDING",
        },
      });
    });

    void logActivity({
      userId: agentId,
      action: "AGENT_LEAD_ADDED",
      description: `Agent added lead for prospect ${data.prospectName}`,
      metadata: { leadId: lead.id, propertyId: data.propertyId, unitId: data.unitId },
    });

    return {
      id: lead.id,
      agentId: lead.agentId,
      propertyId: lead.propertyId,
      unitId: lead.unitId,
      prospectName: lead.prospectName,
      prospectEmail: lead.prospectEmail,
      prospectPhone: lead.prospectPhone,
      proposedRent: lead.proposedRent,
      notes: lead.notes,
      status: lead.status,
      createdAt: lead.createdAt,
    };
  }

  public async getLeads(agentId: string, query: GetLeadsQuery): Promise<AgentLeadListItem[]> {
    const leads = await prisma.agentLead.findMany({
      where: {
        agentId,
        ...(query.status !== "ALL" ? { status: STATUS_FILTER_MAP[query.status] } : {}),
        ...(query.propertyId ? { propertyId: query.propertyId } : {}),
        ...(query.search
          ? { prospectName: { contains: query.search, mode: "insensitive" } }
          : {}),
      },
      select: {
        id: true,
        prospectName: true,
        status: true,
        createdAt: true,
        property: { select: { name: true } },
        unit: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return leads.map((l) => ({
      leadId: l.id,
      prospectName: l.prospectName,
      propertyName: l.property.name,
      unitNumber: l.unit?.name ?? null,
      status: l.status,
      dateAdded: l.createdAt,
    }));
  }

  public async deleteLead(agentId: string, leadId: string): Promise<DeleteLeadResponse> {
    const lead = await prisma.agentLead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundError("Lead not found");
    if (lead.agentId !== agentId) {
      throw new ForbiddenError("You do not own this lead");
    }
    if (lead.status !== "PENDING") {
      throw new BadRequestError("Only draft leads can be deleted");
    }

    await prisma.agentLead.delete({ where: { id: leadId } });

    void logActivity({
      userId: agentId,
      action: "AGENT_LEAD_DELETED",
      description: `Agent deleted draft lead for prospect ${lead.prospectName}`,
      metadata: { leadId, propertyId: lead.propertyId },
    });

    return { leadId };
  }

  private async fetchOwnedLead(agentId: string, leadId: string) {
    const lead = await prisma.agentLead.findUnique({
      where: { id: leadId },
      include: {
        property: { select: { name: true, landlordId: true, landlord: { select: { userFullName: true, userEmail: true } } } },
        unit: { select: { name: true } },
        documents: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!lead) throw new NotFoundError("Lead not found");
    if (lead.agentId !== agentId) {
      throw new ForbiddenError("You do not own this lead");
    }
    return lead;
  }

  private assertLeadIsDraft(status: string) {
    if (status !== "PENDING") {
      throw new ConflictError(
        `This lead is ${status === "FORWARDED_TO_LANDLORD" ? "Forwarded" : status} and is read-only`,
      );
    }
  }

  public async getLeadDetail(agentId: string, leadId: string): Promise<AgentLeadDetail> {
    const lead = await this.fetchOwnedLead(agentId, leadId);
    return {
      id: lead.id,
      propertyId: lead.propertyId,
      propertyName: lead.property.name,
      unitId: lead.unitId,
      unitNumber: lead.unit?.name ?? null,
      prospectName: lead.prospectName,
      prospectEmail: lead.prospectEmail,
      prospectPhone: lead.prospectPhone,
      proposedRent: lead.proposedRent,
      notes: lead.notes,
      occupation: lead.occupation,
      employerName: lead.employerName,
      employerAddress: lead.employerAddress,
      employmentDuration: lead.employmentDuration,
      annualIncome: lead.annualIncome,
      documents: lead.documents.map((d) => ({
        id: d.id,
        category: d.category,
        type: d.type,
        url: d.url,
        fileName: d.fileName,
        fileSizeBytes: d.fileSizeBytes,
        createdAt: d.createdAt,
      })),
      status: lead.status,
      rejectionReason: lead.rejectionReason,
      decidedAt: lead.decidedAt,
      createdAt: lead.createdAt,
    };
  }

  public async updateLead(
    agentId: string,
    leadId: string,
    data: UpdateLeadRequest,
  ): Promise<void> {
    const lead = await this.fetchOwnedLead(agentId, leadId);
    this.assertLeadIsDraft(lead.status);

    await prisma.agentLead.update({
      where: { id: leadId },
      data,
    });
  }

  public async forwardLead(agentId: string, leadId: string): Promise<ForwardLeadResponse> {
    const lead = await this.fetchOwnedLead(agentId, leadId);

    if (lead.status !== "PENDING") {
      throw new ConflictError("Only draft leads can be forwarded");
    }
    if (lead.documents.length === 0) {
      throw new BadRequestError("At least one document is required to forward this lead");
    }

    await prisma.agentLead.update({
      where: { id: leadId },
      data: { status: "FORWARDED_TO_LANDLORD" },
    });

    if (lead.property.landlordId) {
      const agent = await prisma.user.findUnique({
        where: { userId: agentId },
        select: { userFullName: true },
      });
      const email = landlordLeadForwardedEmail(
        lead.property.landlord?.userFullName ?? "Landlord",
        agent?.userFullName ?? "Agent",
        lead.prospectName,
        lead.property.name ?? lead.propertyId,
        lead.unit?.name ?? null,
      );
      if (lead.property.landlord) {
        await this.emailService.sendEmail(
          { email: lead.property.landlord.userEmail, name: lead.property.landlord.userFullName ?? undefined },
          email.subject,
          email.html,
        );
      }
    }

    void logActivity({
      userId: agentId,
      action: "AGENT_LEAD_FORWARDED",
      description: `Forwarded lead for prospect ${lead.prospectName} to landlord`,
      metadata: { leadId, propertyId: lead.propertyId },
    });

    return { leadId, status: "FORWARDED_TO_LANDLORD" };
  }

  public async resubmitLead(agentId: string, leadId: string): Promise<ResubmitLeadResponse> {
    const lead = await this.fetchOwnedLead(agentId, leadId);

    if (lead.status !== "REJECTED") {
      throw new ConflictError("Only rejected leads can be resubmitted");
    }

    // If a fee was ever created for this lead, it was rejected via the
    // post-approval "Safety Switch" — that rejection is terminal.
    const existingFee = await prisma.agentFee.findUnique({ where: { leadId } });
    if (existingFee) {
      throw new ConflictError(
        "This application was rejected after approval and can no longer be resubmitted",
      );
    }

    await prisma.agentLead.update({
      where: { id: leadId },
      data: { status: "PENDING", rejectionReason: null, decidedAt: null },
    });

    void logActivity({
      userId: agentId,
      action: "AGENT_LEAD_RESUBMITTED",
      description: `Reverted lead for prospect ${lead.prospectName} to draft for resubmission`,
      metadata: { leadId, propertyId: lead.propertyId },
    });

    return { leadId, status: "PENDING" };
  }

  private extractExtension(fileName: string): string {
    const match = fileName.toLowerCase().match(/\.[a-z0-9]+$/);
    return match ? match[0] : "";
  }

  public async uploadDocument(
    agentId: string,
    leadId: string,
    data: UploadDocumentRequest,
  ): Promise<AgentLeadDocumentItem> {
    const lead = await this.fetchOwnedLead(agentId, leadId);
    this.assertLeadIsDraft(lead.status);

    const extension = this.extractExtension(data.fileName);
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      throw new BadRequestError(
        `Unsupported file format. Allowed formats: ${ALLOWED_EXTENSIONS.join(", ")}`,
      );
    }

    let fileSizeBytes: number;
    try {
      const head = await axios.head(data.url, { timeout: 10000 });
      const contentLength = head.headers["content-length"];
      fileSizeBytes = contentLength ? parseInt(contentLength, 10) : 0;
    } catch {
      throw new BadRequestError("Unable to verify the uploaded file. Please try again.");
    }

    if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestError(
        `File exceeds the maximum allowed size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
      );
    }

    const document = await prisma.agentLeadDocument.create({
      data: {
        leadId,
        category: data.category,
        type: data.type,
        url: data.url,
        fileName: data.fileName,
        fileSizeBytes,
      },
    });

    void logActivity({
      userId: agentId,
      action: "AGENT_LEAD_DOCUMENT_UPLOADED",
      description: `Uploaded ${data.type} document for lead ${leadId}`,
      metadata: { leadId, documentId: document.id, category: data.category, type: data.type },
    });

    return {
      id: document.id,
      category: document.category,
      type: document.type,
      url: document.url,
      fileName: document.fileName,
      fileSizeBytes: document.fileSizeBytes,
      createdAt: document.createdAt,
    };
  }

  public async deleteDocument(agentId: string, leadId: string, documentId: string): Promise<void> {
    const lead = await this.fetchOwnedLead(agentId, leadId);
    this.assertLeadIsDraft(lead.status);

    const document = lead.documents.find((d) => d.id === documentId);
    if (!document) throw new NotFoundError("Document not found");

    await prisma.agentLeadDocument.delete({ where: { id: documentId } });

    void logActivity({
      userId: agentId,
      action: "AGENT_LEAD_DOCUMENT_DELETED",
      description: `Deleted document for lead ${leadId}`,
      metadata: { leadId, documentId },
    });
  }
}
