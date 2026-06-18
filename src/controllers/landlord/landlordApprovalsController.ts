import { Body, Get, Post, Path, Query, Route, Controller, Tags, Security, Request } from "tsoa";
import { LandlordApprovalsService } from "../../services/landlord/landlordApprovalsService";
import {
  ApprovalsListQuerySchema,
  RejectApplicationBodySchema,
  type ApprovalListItem,
  type ApprovalHistoryItem,
  type ApplicantDossier,
  type RejectApplicationBody,
} from "../../dtos/landlord/landlord.approvals.dto";
import { validate } from "../../utils/validate";

@Route("landlord/approvals")
@Tags("Landlord - Approvals")
@Security("jwt", ["LANDLORD"])
export class LandlordApprovalsController extends Controller {
  private service = new LandlordApprovalsService();

  /**
   * Returns all pending tenant applications forwarded by agents to this landlord.
   * Status filter: FORWARDED_TO_LANDLORD only.
   *
   * Filters:
   *  - propertyId: scope to a specific property
   *  - agentId: scope to a specific forwarding agent
   *  - dateFrom / dateTo: filter by date forwarded (ISO 8601)
   */
  @Get()
  public async listPending(
    @Request() req: any,
    @Query() propertyId?: string,
    @Query() agentId?: string,
    @Query() dateFrom?: string,
    @Query() dateTo?: string,
  ): Promise<{ success: boolean; data: ApprovalListItem[] }> {
    const query = validate(ApprovalsListQuerySchema, { propertyId, agentId, dateFrom, dateTo });
    const data = await this.service.listPending(req.user.userId, query);
    return { success: true, data };
  }

  /**
   * Returns historical (decided) applications — APPROVED and REJECTED.
   * Each item includes the decision outcome, timestamp, and rejection reason if applicable.
   *
   * Filters: propertyId, agentId, dateFrom, dateTo (same as pending list).
   */
  @Get("history")
  public async listHistory(
    @Request() req: any,
    @Query() propertyId?: string,
    @Query() agentId?: string,
    @Query() dateFrom?: string,
    @Query() dateTo?: string,
  ): Promise<{ success: boolean; data: ApprovalHistoryItem[] }> {
    const query = validate(ApprovalsListQuerySchema, { propertyId, agentId, dateFrom, dateTo });
    const data = await this.service.listHistory(req.user.userId, query);
    return { success: true, data };
  }

  /**
   * Returns the full applicant dossier for a specific application.
   * Includes: occupation, monthly/annual income estimate, employer details, and attached documents.
   * Returns 403 if the application belongs to a property not owned by this landlord.
   * Document access is recorded in the audit log.
   */
  @Get("{leadId}")
  public async getDossier(
    @Path() leadId: string,
    @Request() req: any,
  ): Promise<{ success: boolean; data: ApplicantDossier }> {
    const data = await this.service.getDossier(req.user.userId, leadId);
    return { success: true, data };
  }

  /**
   * Approves a pending application.
   * - Sets status to APPROVED with a decision timestamp.
   * - Notifies the forwarding agent by email.
   * - Notifies the prospect by email if an email address is on file.
   * - Triggers the agent fee workflow (activity log).
   * Returns 409 if the application has already been actioned.
   */
  @Post("{leadId}/approve")
  public async approve(
    @Path() leadId: string,
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    await this.service.approve(req.user.userId, leadId);
    return { success: true, message: "Application approved" };
  }

  /**
   * Rejects a pending application. Rejection reason is mandatory.
   * - Sets status to REJECTED with reason and decision timestamp.
   * - Notifies the forwarding agent by email.
   * - Notifies the prospect by email if an email address is on file.
   * Returns 409 if the application has already been actioned.
   */
  @Post("{leadId}/reject")
  public async reject(
    @Path() leadId: string,
    @Request() req: any,
    @Body() body: RejectApplicationBody,
  ): Promise<{ success: boolean; message: string }> {
    const { reason } = validate(RejectApplicationBodySchema, body);
    await this.service.reject(req.user.userId, leadId, reason);
    return { success: true, message: "Application rejected" };
  }
}
