import { Get, Patch, Path, Query, Route, Controller, Tags, Security, Request } from "tsoa";
import { AdminAgentLeadsService } from "../../services/admin/adminAgentLeadsService";
import { AdminAgentLeadsQuerySchema } from "../../dtos/admin/admin.agent-leads.dto";
import { validate } from "../../utils/validate";

@Route("admin/agent-leads")
@Tags("Admin - Agent Leads")
@Security("jwt", ["ADMIN"])
export class AdminAgentLeadsController extends Controller {
  private service = new AdminAgentLeadsService();

  /**
   * Lists agent leads across the platform, newest first. Optional filters:
   *  - status: PENDING | FORWARDED_TO_LANDLORD | APPROVED | REJECTED | CONVERTED_TO_TENANT | WITHDRAWN
   *  - propertyId / agentId: scope to a specific property or agent
   *
   * The common case is `?status=APPROVED` — leads a landlord has approved and
   * are now awaiting manual rent payment confirmation before conversion.
   */
  @Get()
  public async listLeads(
    @Query() status?: string,
    @Query() propertyId?: string,
    @Query() agentId?: string,
  ) {
    const query = validate(AdminAgentLeadsQuerySchema, { status, propertyId, agentId });
    const data = await this.service.listLeads(query);
    return { success: true, message: "Leads retrieved", data };
  }

  /**
   * Converts an Approved (Awaiting Payment) lead into an active tenant:
   * marks the unit Occupied, creates the tenant account + lease + onboarding
   * invite, and moves the agent's commission from PENDING_ADMIN_CONFIRMATION to
   * CONFIRMED. The agent still sees this as "Pending" — only a separate, explicit
   * admin action (mark-paid) flips it to PAID once the commission is actually sent.
   * Permanently locks the lead — no further workflow actions are possible
   * once it reaches CONVERTED_TO_TENANT.
   */
  @Patch("{leadId}/convert-to-tenant")
  public async convertToTenant(
    @Path() leadId: string,
    @Request() req: any,
  ) {
    const data = await this.service.convertToTenant(req.user.userId, leadId);
    return { success: true, message: "Lead converted to tenant", data };
  }
}
