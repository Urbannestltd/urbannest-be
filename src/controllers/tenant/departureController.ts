import {
  Controller,
  Post,
  Path,
  Middlewares,
  Route,
  Tags,
  Security,
  Request,
} from "tsoa";
import { confirmVisitorDeparture } from "../../services/facility-manager/fmGateService";
import { Permission } from "@prisma/client";
import { requirePermission } from "../../middlewares/permissionMiddleware";

@Route("tenant/visit-departures")
@Tags("Tenant - Departure Confirmation")
@Security("jwt", ["TENANT"])
@Middlewares(requirePermission(Permission.VISITOR_ALLOWANCE))
export class TenantDepartureController extends Controller {
  /**
   * Confirms that a visitor has departed via the tenant's app.
   * Sets status to CHECKED_OUT and records the exit timestamp.
   * The invite must belong to the authenticated tenant and be in CHECKED_IN state.
   */
  @Post("{inviteId}/confirm")
  public async confirmDeparture(
    @Path() inviteId: string,
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    await confirmVisitorDeparture(inviteId, req.user.userId);
    return { success: true, message: "Departure confirmed" };
  }
}
