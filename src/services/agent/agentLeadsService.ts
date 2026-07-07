import { prisma } from "../../config/prisma";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/apiError";
import { logActivity } from "../../utils/activityLogger";
import type {
  SubmitLeadRequest,
  AgentLeadResponse,
  GetLeadsQuery,
  AgentLeadListItem,
  DeleteLeadResponse,
} from "../../dtos/agent/agent.leads.dto";

const STATUS_FILTER_MAP = {
  DRAFT: "PENDING",
  FORWARDED: "FORWARDED_TO_LANDLORD",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export class AgentLeadsService {
  public async submitLead(agentId: string, data: SubmitLeadRequest): Promise<AgentLeadResponse> {
    const property = await prisma.property.findFirst({
      where: { id: data.propertyId, isDeleted: false },
    });
    if (!property) throw new NotFoundError("Property not found");

    if (data.unitId) {
      const unit = await prisma.unit.findFirst({
        where: { id: data.unitId, propertyId: data.propertyId },
      });
      if (!unit) throw new BadRequestError("Unit does not belong to this property");
    }

    const lead = await prisma.agentLead.create({
      data: {
        agentId,
        propertyId: data.propertyId,
        unitId: data.unitId ?? null,
        prospectName: data.prospectName,
        prospectEmail: data.prospectEmail ?? null,
        prospectPhone: data.prospectPhone ?? null,
        proposedRent: data.proposedRent ?? null,
        notes: data.notes ?? null,
        occupation: data.occupation ?? null,
        monthlyIncome: data.monthlyIncome ?? null,
        employerName: data.employerName ?? null,
        employerAddress: data.employerAddress ?? null,
        documents: data.documents ?? [],
      },
    });

    void logActivity({
      userId: agentId,
      action: "AGENT_LEAD_SUBMITTED",
      description: `Agent submitted lead for prospect ${data.prospectName}`,
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
}
