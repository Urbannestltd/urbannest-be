import { Controller, Get, Middlewares, Route, Tags, Security } from "tsoa";
import { AdminSupportService } from "../../services/admin/supportService";
import { successResponse } from "../../utils/responseHelper";
import { requireAdmin } from "../../middlewares/permissionMiddleware";

@Route("admin/support")
@Tags("Admin - Support Tickets")
@Security("jwt")
@Middlewares(requireAdmin())
export class AdminSupportController extends Controller {
  private supportService = new AdminSupportService();

  /**
   * List every support ticket submitted across the platform.
   */
  @Get()
  public async list() {
    const result = await this.supportService.listAllTickets();
    return successResponse(result, "Support tickets retrieved");
  }
}
