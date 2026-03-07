import { Get, Route, Security, Tags } from "tsoa";
import { AdminDashboardService } from "../../services/admin/dashboardService";

@Route("admin/dashboard")
@Tags("Admin - Dashboard")
@Security("jwt", ["ADMIN"]) // Keep everything locked down to Admins!
export class AdminDashboardController {
  private dashboardService = new AdminDashboardService();

  @Get("metrics")
  public async getMetrics() {
    const metrics = await this.dashboardService.getDashboardMetrics();
    return {
      success: true,
      message: "Dashboard metrics retrieved successfully",
      data: metrics,
    };
  }

  @Get("tenants/status")
  public async getTenantStatuses() {
    const tenants = await this.dashboardService.getTenantStatuses();
    return {
      success: true,
      message: "Tenant statuses retrieved successfully",
      data: tenants,
    };
  }
}
