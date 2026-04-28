import { Get, Query, Route, Security, Tags } from "tsoa";
import { AdminDashboardService } from "../../services/admin/dashboardService";
import { PropertyOverviewResponseDto } from "../../dtos/admin/dashboard.dto";

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

  @Get("properties/overview")
  public async getPropertyOverview(
    @Query() search?: string,
  ): Promise<{ success: boolean; message: string; data: PropertyOverviewResponseDto }> {
    const overview = await this.dashboardService.getPropertyOverview(search);
    return {
      success: true,
      message: "Property overview retrieved successfully",
      data: overview,
    };
  }
}
