import {
  Body,
  Get,
  Patch,
  Post,
  Path,
  Query,
  Route,
  Controller,
  Tags,
  Security,
  Request,
} from "tsoa";
import { AgentVisitsService } from "../../services/agent/agentVisitsService";
import {
  ScheduleVisitSchema,
  GetVisitsQuerySchema,
  type ScheduleVisitRequest,
} from "../../dtos/agent/agent.visits.dto";
import { validate } from "../../utils/validate";

@Route("agent/visits")
@Tags("Agent - Visits")
@Security("jwt", ["AGENT"])
export class AgentVisitsController extends Controller {
  private service = new AgentVisitsService();

  /**
   * Schedules a new visit request for a property.
   * The FM managing the property is notified by email.
   * Visit is created with PENDING status.
   */
  @Post()
  public async scheduleVisit(
    @Request() req: any,
    @Body() body: ScheduleVisitRequest,
  ) {
    const params = validate(ScheduleVisitSchema, body);
    const data = await this.service.scheduleVisit(req.user.userId, params);
    return { success: true, message: "Visit request submitted", data };
  }

  /**
   * Returns all of the agent's visit requests.
   * Optional filter: ?status=PENDING|APPROVED|REJECTED|RESCHEDULED_PENDING_AGENT|CANCELLED
   */
  @Get()
  public async getVisits(
    @Request() req: any,
    @Query() status?: string,
  ) {
    const filters = validate(GetVisitsQuerySchema, { status });
    const data = await this.service.getVisits(req.user.userId, filters);
    return { success: true, message: "Visits retrieved", data };
  }

  /**
   * Returns full detail for a single visit request owned by the agent.
   */
  @Get("{visitId}")
  public async getVisitDetail(
    @Path() visitId: string,
    @Request() req: any,
  ) {
    const data = await this.service.getVisitDetail(req.user.userId, visitId);
    return { success: true, message: "Visit detail retrieved", data };
  }

  /**
   * Cancels a visit request.
   * The FM is notified by email.
   * Allowed for PENDING, APPROVED, and RESCHEDULED_PENDING_AGENT visits.
   */
  @Patch("{visitId}/cancel")
  public async cancelVisit(
    @Path() visitId: string,
    @Request() req: any,
  ) {
    await this.service.cancelVisit(req.user.userId, visitId);
    return { success: true, message: "Visit cancelled" };
  }

  /**
   * Accepts the FM's proposed reschedule date.
   * Visit status changes to APPROVED with the new date. FM is notified.
   * Only valid when visit status is RESCHEDULED_PENDING_AGENT.
   */
  @Patch("{visitId}/accept-reschedule")
  public async acceptReschedule(
    @Path() visitId: string,
    @Request() req: any,
  ) {
    await this.service.acceptReschedule(req.user.userId, visitId);
    return { success: true, message: "Reschedule accepted, visit confirmed" };
  }

  /**
   * Rejects the FM's proposed reschedule date.
   * Visit status changes to REJECTED. FM is notified.
   * Only valid when visit status is RESCHEDULED_PENDING_AGENT.
   */
  @Patch("{visitId}/reject-reschedule")
  public async rejectReschedule(
    @Path() visitId: string,
    @Request() req: any,
  ) {
    await this.service.rejectReschedule(req.user.userId, visitId);
    return { success: true, message: "Reschedule rejected, visit closed" };
  }
}
