import { Patch, Path, Route, Controller, Tags, Security, Request } from "tsoa";
import { AdminAgentFeesService } from "../../services/admin/adminAgentFeesService";

@Route("admin/agent-fees")
@Tags("Admin - Agent Fees")
@Security("jwt", ["ADMIN"])
export class AdminAgentFeesController extends Controller {
  private service = new AdminAgentFeesService();

  /**
   * Marks a CONFIRMED agent fee as PAID. Normally not needed — converting a
   * lead to a tenant (see AdminAgentLeadsController.convertToTenant) now marks
   * the fee PAID directly, in the same step. This endpoint remains as a manual
   * override for a fee that's stuck at CONFIRMED for some other reason.
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
