import { Get, Query, Route, Controller, Tags, Security, Request } from "tsoa";
import { AgentDashboardService } from "../../services/agent/agentDashboardService";
import { AgentDashboardQuerySchema } from "../../dtos/agent/agent.dashboard.dto";
import { validate } from "../../utils/validate";

@Route("agent/dashboard")
@Tags("Agent - Dashboard")
@Security("jwt", ["AGENT"])
export class AgentDashboardController extends Controller {
  private service = new AgentDashboardService();

  /**
   * Returns the 4 summary cards for the agent dashboard, scoped to the logged-in agent.
   * Optional filter: ?period=MONTH|QUARTER|YEAR (default YEAR)
   */
  @Get("summary")
  public async getSummary(
    @Request() req: any,
    @Query() period?: string,
  ) {
    const query = validate(AgentDashboardQuerySchema, { period });
    const data = await this.service.getSummary(req.user.userId, query);
    return { success: true, message: "Dashboard summary retrieved", data };
  }

  /**
   * Returns monthly active-lead counts across the selected period.
   * Optional filter: ?period=MONTH|QUARTER|YEAR (default YEAR)
   */
  @Get("charts/active-leads")
  public async getActiveLeadsChart(
    @Request() req: any,
    @Query() period?: string,
  ) {
    const query = validate(AgentDashboardQuerySchema, { period });
    const data = await this.service.getActiveLeadsChart(req.user.userId, query);
    return { success: true, message: "Active leads chart retrieved", data };
  }

  /**
   * Returns monthly total-vs-converted lead counts across the selected period.
   * Optional filter: ?period=MONTH|QUARTER|YEAR (default YEAR)
   */
  @Get("charts/leads-conversion")
  public async getLeadsConversionChart(
    @Request() req: any,
    @Query() period?: string,
  ) {
    const query = validate(AgentDashboardQuerySchema, { period });
    const data = await this.service.getLeadsConversionChart(req.user.userId, query);
    return { success: true, message: "Leads conversion chart retrieved", data };
  }

  /**
   * Returns upcoming visits from today onward, sorted chronologically.
   * Always ignores the dashboard period filter.
   */
  @Get("upcoming-visits")
  public async getUpcomingVisits(@Request() req: any) {
    const data = await this.service.getUpcomingVisits(req.user.userId);
    return { success: true, message: "Upcoming visits retrieved", data };
  }
}
