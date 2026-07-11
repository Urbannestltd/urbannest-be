import { Patch, Path, Route, Controller, Tags, Security, Request } from "tsoa";
import { AdminAgentFeesService } from "../../services/admin/adminAgentFeesService";

@Route("admin/agent-fees")
@Tags("Admin - Agent Fees")
@Security("jwt", ["ADMIN"])
export class AdminAgentFeesController extends Controller {
  private service = new AdminAgentFeesService();

  /**
   * Marks a CONFIRMED agent fee as PAID, once the admin has actually sent
   * the commission to the agent. Fees are auto-moved to CONFIRMED when their
   * lead is converted to a tenant (see AdminAgentLeadsController.convertToTenant).
   */
  @Patch("{feeId}/mark-paid")
  public async markPaid(
    @Path() feeId: string,
    @Request() req: any,
  ) {
    const data = await this.service.markPaid(req.user.userId, feeId);
    return { success: true, message: "Agent fee marked as paid", data };
  }
}
