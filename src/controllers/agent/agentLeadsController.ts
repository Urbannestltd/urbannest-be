import {
  Body,
  Delete,
  Get,
  Path,
  Post,
  Query,
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
  GetLeadsQuerySchema,
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

  /**
   * Returns the agent's own lead submissions, sorted newest first.
   * Optional filters:
   *  - search: prospect name (case-insensitive)
   *  - status: ALL (default) | DRAFT | FORWARDED | APPROVED | REJECTED
   *  - propertyId: scope to a specific assigned property
   */
  @Get()
  public async getLeads(
    @Request() req: any,
    @Query() search?: string,
    @Query() status?: string,
    @Query() propertyId?: string,
  ) {
    const query = validate(GetLeadsQuerySchema, { search, status, propertyId });
    const data = await this.service.getLeads(req.user.userId, query);
    return { success: true, message: "Leads retrieved", data };
  }

  /**
   * Deletes a draft lead owned by the agent.
   * Only leads with status DRAFT (PENDING) can be deleted — once forwarded to a
   * landlord, the lead is no longer solely under the agent's control.
   */
  @Delete("{leadId}")
  public async deleteLead(
    @Path() leadId: string,
    @Request() req: any,
  ) {
    const data = await this.service.deleteLead(req.user.userId, leadId);
    return { success: true, message: "Lead deleted", data };
  }
}
