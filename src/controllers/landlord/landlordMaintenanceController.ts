import { Get, Query, Route, Controller, Tags, Security, Request } from "tsoa";
import { LandlordMaintenanceService } from "../../services/landlord/landlordMaintenanceService";
import {
  LandlordMaintenanceQuerySchema,
  type LandlordMaintenanceSummary,
} from "../../dtos/landlord/landlord.maintenance.dto";
import { validate } from "../../utils/validate";

@Route("landlord/maintenance")
@Tags("Landlord - Maintenance")
@Security("jwt", ["LANDLORD"])
export class LandlordMaintenanceController extends Controller {
  private service = new LandlordMaintenanceService();

  /**
   * Returns a maintenance overview for all properties owned by the landlord.
   *
   * Metrics:
   *  - openTickets: active (non-resolved/fixed/cancelled) maintenance requests
   *  - totalExpenses: sum of non-rejected expense amounts for the selected year
   *  - avgResolutionDays: average days to resolve/fix tickets in the selected year
   *  - chart: per-property breakdown of ticket count and total maintenance cost
   *
   * Filters:
   *  - category: MaintenanceCategory enum (PLUMBING | ELECTRICAL | HVAC | APPLIANCE |
   *    STRUCTURAL | PEST_CONTROL | CLEANING | SAFETY_SECURITY | OTHER)
   *  - year: calendar year (defaults to current year)
   *
   * Note: openTickets reflects current state (all years); the year filter applies
   * to totalExpenses, avgResolutionDays, and the chart.
   */
  @Get("overview")
  public async getOverview(
    @Request() req: any,
    @Query() category?: string,
    @Query() year?: number,
  ): Promise<{ success: boolean; data: LandlordMaintenanceSummary }> {
    const query = validate(LandlordMaintenanceQuerySchema, { category, year });
    const data = await this.service.getOverview(req.user.userId, query);
    return { success: true, data };
  }
}
