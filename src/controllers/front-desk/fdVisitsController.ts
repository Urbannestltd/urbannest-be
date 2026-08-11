import {
  Get,
  Query,
  Route,
  Controller,
  Tags,
  Security,
  Request,
} from "tsoa";
import { FdVisitsService } from "../../services/front-desk/fdVisitsService";
import {
  GetFmVisitsQuerySchema,
  type FmVisitorStats,
} from "../../dtos/facility-manager/fm.visits.dto";
import { validate } from "../../utils/validate";

@Route("front-desk/visits")
@Tags("FD - Visits")
@Security("jwt", ["FRONT_DESK"])
export class FdVisitsController extends Controller {
  private service = new FdVisitsService();

  /**
   * Returns visitor statistics for the FD's assigned properties.
   * Counts are broken down by period (today, last 15 days, last 30 days).
   * noShows counts only scheduled visitors (isWalkIn: false) with status EXPIRED_NO_SHOW.
   * Walk-in visitors are excluded from noShows — they cannot cancel.
   */
  @Get("stats")
  public async getStats(
    @Request() req: any,
  ): Promise<{ success: boolean; data: FmVisitorStats }> {
    const data = await this.service.getStats(req.user.userId);
    return { success: true, data };
  }

  /**
   * Returns a unified list of all visits (tenant-created + agent-requested)
   * across the FD's assigned properties, sorted with upcoming visits first.
   * Read-only for FD — canApprove/canReject/canReschedule are always false;
   * approval flows are handled via the walk-in / gate endpoints.
   *
   * Filters:
   *  - propertyId: restrict to a single property
   *  - visitType: "TENANT" | "AGENT"
   *  - status: "PENDING_APPROVAL" | "UPCOMING" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "REJECTED" | "RESCHEDULED"
   *  - dateFrom / dateTo: ISO 8601 date range on visitDate
   *  - search: partial match on visitor name (tenant visits) or agent name (agent visits)
   */
  @Get()
  public async getVisits(
    @Request() req: any,
    @Query() propertyId?: string,
    @Query() visitType?: string,
    @Query() status?: string,
    @Query() dateFrom?: string,
    @Query() dateTo?: string,
    @Query() search?: string,
  ) {
    const filters = validate(GetFmVisitsQuerySchema, {
      propertyId,
      visitType,
      status,
      dateFrom,
      dateTo,
      search,
    });
    const data = await this.service.getVisits(req.user.userId, filters);
    return { success: true, message: "Visits retrieved", data };
  }
}
