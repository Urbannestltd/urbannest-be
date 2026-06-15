import {
  Get,
  Query,
  Route,
  Controller,
  Tags,
  Security,
  Request,
} from "tsoa";
import { FmVisitsService } from "../../services/facility-manager/fmVisitsService";
import {
  GetFmVisitsQuerySchema,
  type FmVisitorStats,
} from "../../dtos/facility-manager/fm.visits.dto";
import { validate } from "../../utils/validate";

@Route("facility-manager/visits")
@Tags("FM - Visits")
@Security("jwt", ["FACILITY_MANAGER"])
export class FmVisitsController extends Controller {
  private service = new FmVisitsService();

  /**
   * Returns visitor statistics for the FM's managed properties.
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
   * across the FM's managed properties, sorted with upcoming visits first.
   *
   * Filters:
   *  - propertyId: restrict to a single property
   *  - visitType: "TENANT" | "AGENT"
   *  - status: "PENDING_APPROVAL" | "UPCOMING" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "REJECTED" | "RESCHEDULED"
   *  - dateFrom / dateTo: ISO 8601 date range on visitDate
   *  - search: partial match on visitor name (tenant visits) or agent name (agent visits)
   *
   * Tenant-created visits are read-only (canApprove/canReject/canReschedule = false).
   * Agent visits with status PENDING_APPROVAL have all three action flags set to true.
   *
   * Sort order:
   *  1. Future visits — PENDING_APPROVAL first, then UPCOMING, sorted by visitDate ASC
   *  2. Past/completed visits — sorted by visitDate DESC
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
