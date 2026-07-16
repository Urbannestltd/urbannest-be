import { Get, Query, Route, Controller, Tags, Security, Request } from "tsoa";
import { AgentFeesService } from "../../services/agent/agentFeesService";
import { GetFeesQuerySchema } from "../../dtos/agent/agent.fees.dto";
import { validate } from "../../utils/validate";

@Route("agent/fees")
@Tags("Agent - Fees")
@Security("jwt", ["AGENT"])
export class AgentFeesController extends Controller {
  private service = new AgentFeesService();

  /**
   * Returns the agent's aggregate commission totals: pending (covers both
   * awaiting admin confirmation and confirmed-but-not-yet-disbursed) and paid.
   */
  @Get("summary")
  public async getSummary(@Request() req: any) {
    const data = await this.service.getSummary(req.user.userId);
    return { success: true, message: "Fee summary retrieved", data };
  }

  /**
   * Returns the agent's own commission ledger, sorted newest first.
   * Read-only historical audit view — no mutation actions.
   * Optional filters:
   *  - status: PENDING | PAID
   *  - propertyId: scope to a specific assigned property
   */
  @Get()
  public async getFees(
    @Request() req: any,
    @Query() status?: string,
    @Query() propertyId?: string,
  ) {
    const query = validate(GetFeesQuerySchema, { status, propertyId });
    const data = await this.service.getFees(req.user.userId, query);
    return { success: true, message: "Fees retrieved", data };
  }
}
