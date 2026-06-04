import { Get, Route, Controller, Tags, Security, Request, Query } from "tsoa";
import { FmDashboardService } from "../../services/facility-manager/fmDashboardService";
import {
  GetDashboardTicketsQuerySchema,
  GetDashboardVisitorsQuerySchema,
} from "../../dtos/facility-manager/fm.dashboard.dto";
import { validate } from "../../utils/validate";

@Route("facility-manager/dashboard")
@Tags("FM - Dashboard")
@Security("jwt", ["FACILITY_MANAGER"])
export class FmDashboardController extends Controller {
  private fmDashboardService = new FmDashboardService();

  /**
   * Returns the four summary card counts for the FM dashboard top row.
   * Loads independently — call in parallel with /tickets and /visitors.
   */
  @Get("summary")
  public async getSummary(@Request() req: any) {
    const data = await this.fmDashboardService.getSummary(req.user.userId);
    return { success: true, message: "Dashboard summary retrieved", data };
  }

  /**
   * Returns the 5 most recent open maintenance tickets for the FM's properties.
   * Optional filter: ?priority=HIGH,MEDIUM,LOW (comma-separated, case-insensitive).
   */
  @Get("tickets")
  public async getRecentTickets(
    @Request() req: any,
    @Query() priority?: string,
  ) {
    const { priority: priorities } = validate(
      GetDashboardTicketsQuerySchema,
      { priority },
    );
    const data = await this.fmDashboardService.getRecentTickets(req.user.userId, priorities);
    return { success: true, message: "Recent tickets retrieved", data };
  }

  /**
   * Returns all visitors whose window overlaps today for the FM's properties.
   * Optional filter: ?frequency=ONE_OFF,WHOLE_DAY (comma-separated, case-insensitive).
   */
  @Get("visitors")
  public async getTodaysVisitors(
    @Request() req: any,
    @Query() frequency?: string,
  ) {
    const { frequency: frequencies } = validate(
      GetDashboardVisitorsQuerySchema,
      { frequency },
    );
    const data = await this.fmDashboardService.getTodaysVisitors(req.user.userId, frequencies);
    return { success: true, message: "Today's visitors retrieved", data };
  }
}
