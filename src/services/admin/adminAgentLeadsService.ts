import { prisma } from "../../config/prisma";
import { BadRequestError, ConflictError, NotFoundError } from "../../utils/apiError";
import { logActivity } from "../../utils/activityLogger";
import { AdminService } from "./adminService";
import type { ConvertToTenantResponse } from "../../dtos/admin/admin.agent-leads.dto";

export class AdminAgentLeadsService {
  private adminService = new AdminService();

  public async convertToTenant(adminId: string, leadId: string): Promise<ConvertToTenantResponse> {
    const lead = await prisma.agentLead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundError("Lead not found");

    if (lead.status !== "APPROVED") {
      throw new ConflictError("Only leads awaiting payment (Approved) can be converted to a tenant");
    }
    if (!lead.unitId) {
      throw new BadRequestError("Lead has no associated unit to onboard the tenant into");
    }
    if (!lead.prospectEmail) {
      throw new BadRequestError("Lead has no prospect email to send the onboarding invite to");
    }

    // Reuses the existing admin user-creation flow: creates the PENDING tenant
    // user, a default lease on the unit, and sends the onboarding invite email.
    const { data: newUser } = await this.adminService.createUser({
      userEmail: lead.prospectEmail,
      unitId: lead.unitId,
      propertyId: lead.propertyId,
      userRole: "TENANT",
    });

    await prisma.unit.update({
      where: { id: lead.unitId },
      data: { status: "OCCUPIED" },
    });

    await prisma.agentFee.updateMany({
      where: { leadId, status: "PENDING_ADMIN_CONFIRMATION" },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });

    await prisma.agentLead.update({
      where: { id: leadId },
      data: { status: "CONVERTED_TO_TENANT" },
    });

    void logActivity({
      userId: adminId,
      action: "ADMIN_LEAD_CONVERTED_TO_TENANT",
      description: `Converted lead for prospect ${lead.prospectName} into a tenant`,
      metadata: { leadId, unitId: lead.unitId, propertyId: lead.propertyId, tenantUserId: newUser.userId },
    });

    return {
      leadId,
      status: "CONVERTED_TO_TENANT",
      unitId: lead.unitId,
      tenantUserId: newUser.userId,
    };
  }
}
