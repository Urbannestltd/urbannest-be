import { Get, Route, Controller, Tags, Security, Request } from "tsoa";
import { FmDashboardService } from "../../services/facility-manager/fmDashboardService";

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
   * Loads independently — call in parallel with /summary and /visitors.
   */
  @Get("tickets")
  public async getRecentTickets(@Request() req: any) {
    const data = await this.fmDashboardService.getRecentTickets(req.user.userId);
    return { success: true, message: "Recent tickets retrieved", data };
  }

  /**
   * Returns all visitors whose window overlaps today for the FM's properties.
   * Loads independently — call in parallel with /summary and /tickets.
   */
  @Get("visitors")
  public async getTodaysVisitors(@Request() req: any) {
    const data = await this.fmDashboardService.getTodaysVisitors(req.user.userId);
    return { success: true, message: "Today's visitors retrieved", data };
  }
}
