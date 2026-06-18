import {
  Body,
  Post,
  Route,
  Controller,
  Tags,
  Security,
  Request,
  SuccessResponse,
} from "tsoa";
import { AgentLeadsService } from "../../services/agent/agentLeadsService";
import {
  SubmitLeadSchema,
  type SubmitLeadRequest,
  type AgentLeadResponse,
} from "../../dtos/agent/agent.leads.dto";
import { validate } from "../../utils/validate";

@Route("agent/leads")
@Tags("Agent - Leads")
@Security("jwt", ["AGENT"])
export class AgentLeadsController extends Controller {
  private service = new AgentLeadsService();

  /**
   * Submits a tenant prospect lead to the landlord of the given property for review.
   * The lead will appear in the landlord's pending approvals dashboard widget.
   * proposedRent is the monthly rent amount (annualRent = proposedRent × 12).
   */
  @SuccessResponse(201, "Lead submitted")
  @Post()
  public async submitLead(
    @Request() req: any,
    @Body() body: SubmitLeadRequest,
  ): Promise<{ success: boolean; message: string; data: AgentLeadResponse }> {
    const data = validate(SubmitLeadSchema, body);
    const result = await this.service.submitLead(req.user.userId, data);
    this.setStatus(201);
    return { success: true, message: "Lead submitted successfully", data: result };
  }
}
