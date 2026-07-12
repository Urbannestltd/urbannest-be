import {
  Body,
  Delete,
  Get,
  Patch,
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
  UpdateLeadSchema,
  type SubmitLeadRequest,
  type AgentLeadResponse,
  type UpdateLeadRequest,
} from "../../dtos/agent/agent.leads.dto";
import {
  UploadDocumentSchema,
  type UploadDocumentRequest,
} from "../../dtos/agent/agent.lead-documents.dto";
import { validate } from "../../utils/validate";

@Route("agent/leads")
@Tags("Agent - Leads")
@Security("jwt", ["AGENT"])
export class AgentLeadsController extends Controller {
  private service = new AgentLeadsService();

  /**
   * Creates a new lead in Draft status for a vacant unit on one of the agent's
   * assigned properties. Returns 403 if the property isn't assigned to this
   * agent, and 409 if the selected unit is no longer vacant (race condition
   * against another booking/status change).
   */
  @SuccessResponse(201, "Lead added")
  @Post()
  public async submitLead(
    @Request() req: any,
    @Body() body: SubmitLeadRequest,
  ): Promise<{ success: boolean; message: string; data: AgentLeadResponse }> {
    const data = validate(SubmitLeadSchema, body);
    const result = await this.service.submitLead(req.user.userId, data);
    this.setStatus(201);
    return { success: true, message: "Lead added", data: result };
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
   * Deletes a lead owned by the agent.
   * Allowed for any status up to a landlord decision (PENDING, FORWARDED_TO_LANDLORD,
   * REJECTED, WITHDRAWN). Returns 409 once the landlord has approved it (APPROVED
   * or CONVERTED_TO_TENANT) — an approved lead is no longer solely under the agent's control.
   */
  @Delete("{leadId}")
  public async deleteLead(
    @Path() leadId: string,
    @Request() req: any,
  ) {
    const data = await this.service.deleteLead(req.user.userId, leadId);
    return { success: true, message: "Lead deleted", data };
  }

  /**
   * Returns full detail for a single lead owned by the agent, including
   * landlord rejection remarks (if any) and the staged documents array.
   */
  @Get("{leadId}")
  public async getLeadDetail(
    @Path() leadId: string,
    @Request() req: any,
  ) {
    const data = await this.service.getLeadDetail(req.user.userId, leadId);
    return { success: true, message: "Lead detail retrieved", data };
  }

  /**
   * Forwards a draft lead to the landlord for review.
   * Only valid when status is DRAFT (PENDING) and at least one document is staged.
   * The landlord is notified by email.
   */
  @Patch("{leadId}/forward")
  public async forwardLead(
    @Path() leadId: string,
    @Request() req: any,
  ) {
    const data = await this.service.forwardLead(req.user.userId, leadId);
    return { success: true, message: "Lead forwarded to landlord", data };
  }

  /**
   * Reverts a rejected lead back to Draft so the agent can edit and resubmit it.
   * Only valid for leads rejected before ever being approved — a lead rejected
   * after approval (the "Safety Switch") is terminal and cannot be resubmitted.
   */
  @Patch("{leadId}/resubmit")
  public async resubmitLead(
    @Path() leadId: string,
    @Request() req: any,
  ) {
    const data = await this.service.resubmitLead(req.user.userId, leadId);
    return { success: true, message: "Lead reverted to draft", data };
  }

  /**
   * Partially updates a Draft lead's contact info, rent offer, notes, or
   * employment details — powers the client's debounced auto-save.
   * Only valid while the lead is in Draft status (409 otherwise).
   */
  @Patch("{leadId}")
  public async updateLead(
    @Path() leadId: string,
    @Request() req: any,
    @Body() body: UpdateLeadRequest,
  ) {
    const data = validate(UpdateLeadSchema, body);
    await this.service.updateLead(req.user.userId, leadId, data);
    return { success: true, message: "Changes saved" };
  }

  /**
   * Uploads a document (ID, Proof of Income, or Proof of Address) to a Draft lead.
   * The file itself must already be uploaded to storage (via POST /storage/sign-url);
   * this endpoint records its metadata after validating format/size/category.
   * Only valid while the lead is in Draft status (409 otherwise).
   */
  @SuccessResponse(201, "Document uploaded")
  @Post("{leadId}/documents")
  public async uploadDocument(
    @Path() leadId: string,
    @Request() req: any,
    @Body() body: UploadDocumentRequest,
  ) {
    const data = validate(UploadDocumentSchema, body);
    const result = await this.service.uploadDocument(req.user.userId, leadId, data);
    this.setStatus(201);
    return { success: true, message: "Document uploaded", data: result };
  }

  /**
   * Deletes a document from a Draft lead.
   * Only valid while the lead is in Draft status — rejected with 409 for
   * Forwarded, Approved, Rejected, or Converted leads.
   */
  @Delete("{leadId}/documents/{documentId}")
  public async deleteDocument(
    @Path() leadId: string,
    @Path() documentId: string,
    @Request() req: any,
  ) {
    await this.service.deleteDocument(req.user.userId, leadId, documentId);
    return { success: true, message: "Document deleted" };
  }
}
