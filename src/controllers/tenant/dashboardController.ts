import { Controller, Get, Middlewares, Route, Tags, Security, Request, Query } from "tsoa";
import { DashboardService } from "../../services/tenant/dashboardService";
import { successResponse } from "../../utils/responseHelper";
import { Permission } from "@prisma/client";
import { requirePermission } from "../../middlewares/permissionMiddleware";

@Route("tenant/dashboard")
@Tags("Tenant - Dashboard")
@Middlewares(requirePermission(Permission.ACCESS_TENANT_PORTAL))
export class DashboardController extends Controller {
  private service = new DashboardService();

  @Get("overview")
  @Security("jwt")
  public async getDashboardOverview(
    @Request() req: any,
    @Query() days: number = 7, // Default to 7 if the frontend doesn't provide it
  ) {
    const data = await this.service.getTenantDashboard(req.user.userId, days);
    return successResponse(data, "Dashboard data retrieved successfully");
  }
}
