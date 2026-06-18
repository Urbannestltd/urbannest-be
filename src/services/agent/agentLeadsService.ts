import { prisma } from "../../config/prisma";
import { BadRequestError, NotFoundError } from "../../utils/apiError";
import { logActivity } from "../../utils/activityLogger";
import type { SubmitLeadRequest, AgentLeadResponse } from "../../dtos/agent/agent.leads.dto";

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
}
