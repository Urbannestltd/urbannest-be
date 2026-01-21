import { Controller, Get, Route, Tags, Security, Request, Path } from "tsoa";
import { LeaseService } from "../../services/tenant/leaseService";
import { successResponse } from "../../utils/responseHelper";

@Route("leases")
@Tags("Lease Management")
export class LeaseController extends Controller {
  private leaseService = new LeaseService();

  /**
   * GET /leases/current
   * Used for the main dashboard card
   */
  @Get("current")
  @Security("jwt")
  public async getCurrentLease(@Request() req: any) {
    const userId = req.user.userId; // Matches your JWT payload
    const data = await this.leaseService.getMyActiveLease(userId);
    return successResponse(data);
  }

  /**
   * GET /leases/{id}/download
   * Used for the "Download" button
   */
  @Get("{leaseId}/download")
  @Security("jwt")
  public async downloadLease(@Path() leaseId: string, @Request() req: any) {
    const userId = req.user.userId;
    const data = await this.leaseService.getLeaseDownloadUrl(leaseId, userId);
    return successResponse(data, "Download link generated");
  }
}
