import {
  Body,
  Get,
  Patch,
  Path,
  Query,
  Route,
  Controller,
  Tags,
  Security,
  Request,
} from "tsoa";
import { FmAgentVisitsService } from "../../services/facility-manager/fmAgentVisitsService";
import {
  GetAgentVisitsQuerySchema,
  RejectVisitSchema,
  RescheduleVisitSchema,
  type RejectVisitRequest,
  type RescheduleVisitRequest,
} from "../../dtos/facility-manager/fm.agent-visits.dto";
import { validate } from "../../utils/validate";

@Route("facility-manager/agent-visits")
@Tags("FM - Agent Visits")
@Security("jwt", ["FACILITY_MANAGER"])
export class FmAgentVisitsController extends Controller {
  private service = new FmAgentVisitsService();

  /**
   * Returns all agent visit requests across the FM's managed properties.
   * Filters: status, propertyId, dateFrom, dateTo.
   * Non-agent (tenant-logged) visits are not included — they remain read-only.
   */
  @Get()
  public async getVisits(
    @Request() req: any,
    @Query() status?: string,
    @Query() propertyId?: string,
    @Query() dateFrom?: string,
    @Query() dateTo?: string,
  ) {
    const filters = validate(GetAgentVisitsQuerySchema, {
      status,
      propertyId,
      dateFrom,
      dateTo,
    });
    const data = await this.service.getVisits(req.user.userId, filters);
    return { success: true, message: "Agent visits retrieved", data };
  }

  /**
   * Returns full detail for a single agent visit request.
   * Returns 403 if the visit does not belong to one of the FM's properties.
   */
  @Get("{visitId}")
  public async getVisitDetail(@Path() visitId: string, @Request() req: any) {
    const data = await this.service.getVisitDetail(req.user.userId, visitId);
    return { success: true, message: "Agent visit detail retrieved", data };
  }

  /**
   * Approves a pending agent visit.
   * The agent is notified by email. Only PENDING visits can be approved.
   */
  @Patch("{visitId}/approve")
  public async approveVisit(@Path() visitId: string, @Request() req: any) {
    await this.service.approveVisit(req.user.userId, visitId);
    return { success: true, message: "Visit approved" };
  }

  /**
   * Rejects a pending agent visit.
   * An optional rejection reason is forwarded to the agent by email.
   * Only PENDING visits can be rejected.
   */
  @Patch("{visitId}/reject")
  public async rejectVisit(
    @Path() visitId: string,
    @Request() req: any,
    @Body() body: RejectVisitRequest,
  ) {
    const { reason } = validate(RejectVisitSchema, body);
    await this.service.rejectVisit(req.user.userId, visitId, reason);
    return { success: true, message: "Visit rejected" };
  }

  /**
   * Proposes a new date for a pending agent visit.
   * Visit status becomes RESCHEDULED_PENDING_AGENT and the agent is notified.
   * The agent must accept or reject the proposed date.
   * Only PENDING visits can be rescheduled.
   */
  @Patch("{visitId}/reschedule")
  public async rescheduleVisit(
    @Path() visitId: string,
    @Request() req: any,
    @Body() body: RescheduleVisitRequest,
  ) {
    const { proposedDate } = validate(RescheduleVisitSchema, body);
    await this.service.rescheduleVisit(req.user.userId, visitId, proposedDate);
    return { success: true, message: "Reschedule proposal sent to agent" };
  }
}
