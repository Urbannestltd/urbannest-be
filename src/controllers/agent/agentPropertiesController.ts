import { Get, Query, Route, Controller, Tags, Security, Request } from "tsoa";
import { AgentPropertiesService } from "../../services/agent/agentPropertiesService";
import { AgentPropertiesQuerySchema } from "../../dtos/agent/agent.properties.dto";
import { validate } from "../../utils/validate";

@Route("agent/properties")
@Tags("Agent - Properties")
@Security("jwt", ["AGENT"])
export class AgentPropertiesController extends Controller {
  private service = new AgentPropertiesService();

  /**
   * Returns properties assigned to the logged-in agent, sorted by most recently added.
   * Optional filters:
   *  - search: filters by property name (case-insensitive)
   *  - availability: ALL (default) | AVAILABLE | FULLY_OCCUPIED
   */
  @Get()
  public async getAssignedProperties(
    @Request() req: any,
    @Query() search?: string,
    @Query() availability?: string,
  ) {
    const query = validate(AgentPropertiesQuerySchema, { search, availability });
    const data = await this.service.getAssignedProperties(req.user.userId, query);
    return { success: true, message: "Assigned properties retrieved", data };
  }
}
