import { Get, Query, Route, Controller, Tags, Security, Request } from "tsoa";
import { LandlordDashboardService } from "../../services/landlord/landlordDashboardService";
import {
  LandlordDashboardQuerySchema,
  type LandlordDashboardSummary,
  type LandlordRevenueByProperty,
  type LandlordRevenueByUnit,
} from "../../dtos/landlord/landlord.dashboard.dto";
import { validate } from "../../utils/validate";

@Route("landlord/dashboard")
@Tags("Landlord - Dashboard")
@Security("jwt", ["LANDLORD"])
export class LandlordDashboardController extends Controller {
  private service = new LandlordDashboardService();

  /**
   * Returns the four portfolio KPI cards for the landlord dashboard.
   * - totalProperties: count of non-deleted properties owned by the landlord
   * - occupancyRate: percentage of units that are OCCUPIED (0–100)
   * - revenueCollected: sum of PAID RENT payments within the selected calendar year
   * - pendingApprovalsCount: agent leads awaiting the landlord's decision
   *
   * Filters: propertyId scopes all metrics to one property. year defaults to current calendar year.
   */
  @Get()
  public async getSummary(
    @Request() req: any,
    @Query() propertyId?: string,
    @Query() year?: number,
  ): Promise<{ success: boolean; data: LandlordDashboardSummary }> {
    const query = validate(LandlordDashboardQuerySchema, { propertyId, year });
    const data = await this.service.getSummary(req.user.userId, query);
    return { success: true, data };
  }

  /**
   * Returns revenue chart data for the financial widget.
   *
   * Without propertyId: groups by property — returns expected vs collected per property.
   * With propertyId: groups by unit within that property — returns expected vs collected per unit.
   *
   * expectedRevenue/expectedRent is calculated from ACTIVE lease rentAmounts
   * weighted by months the lease overlaps with the selected calendar year.
   */
  @Get("revenue-chart")
  public async getRevenueChart(
    @Request() req: any,
    @Query() propertyId?: string,
    @Query() year?: number,
  ): Promise<{ success: boolean; data: LandlordRevenueByProperty[] | LandlordRevenueByUnit[] }> {
    const query = validate(LandlordDashboardQuerySchema, { propertyId, year });
    const data = await this.service.getRevenueChart(req.user.userId, query);
    return { success: true, data };
  }
}
