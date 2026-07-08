import { Patch, Path, Route, Controller, Tags, Security, Request } from "tsoa";
import { AdminAgentLeadsService } from "../../services/admin/adminAgentLeadsService";

@Route("admin/agent-leads")
@Tags("Admin - Agent Leads")
@Security("jwt", ["ADMIN"])
export class AdminAgentLeadsController extends Controller {
  private service = new AdminAgentLeadsService();

  /**
   * Converts an Approved (Awaiting Payment) lead into an active tenant:
   * marks the unit Occupied, creates the tenant account + lease + onboarding
   * invite, and moves the agent's commission from Pending to Earned (Confirmed).
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
