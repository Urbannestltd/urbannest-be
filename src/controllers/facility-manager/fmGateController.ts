import {
  Get,
  Post,
  Path,
  Route,
  Controller,
  Tags,
  Security,
  Request,
} from "tsoa";
import { FmGateService } from "../../services/facility-manager/fmGateService";
import type { PinLookupResult } from "../../dtos/facility-manager/fm.gate.dto";

@Route("facility-manager/gate")
@Tags("FM - Gate Operations")
@Security("jwt", ["FACILITY_MANAGER"])
export class FmGateController extends Controller {
  private service = new FmGateService();

  /**
   * Looks up a visitor by their 6-digit PIN code and returns their full profile.
   * Returns ok:true with profile if valid, or ok:false with a typed error code.
   * Error codes: INVALID | REVOKED | EXPIRED | NOT_YET_ACTIVE | ALREADY_CHECKED_IN | ALREADY_DEPARTED
   * ALREADY_CHECKED_IN still returns the profile so the FM can trigger a departure request.
   */
  @Get("pin/{code}")
  public async lookupByPin(
    @Path() code: string,
    @Request() req: any,
  ): Promise<{ success: boolean; data: PinLookupResult }> {
    const data = await this.service.lookupByPin(req.user.userId, code);
    return { success: true, data };
  }

  /**
   * Checks in a pre-authorized visitor.
   * The invite must have status UPCOMING or ACTIVE and be within its valid time window.
   * Sets status to CHECKED_IN, records checkedInAt, and sends an arrival notification to the tenant.
   */
  @Post("{inviteId}/check-in")
  public async checkIn(
    @Path() inviteId: string,
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    await this.service.checkIn(req.user.userId, inviteId);
    return { success: true, message: "Visitor checked in" };
  }

  /**
   * Checks out a visitor who is currently CHECKED_IN.
   * Sets status to CHECKED_OUT and records checkedOutAt.
   */
  @Post("{inviteId}/checkout")
  public async checkOut(
    @Path() inviteId: string,
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    await this.service.checkOut(req.user.userId, inviteId);
    return { success: true, message: "Visitor checked out" };
  }

  /**
   * Sends a departure confirmation request to the host tenant.
   * Use this when the FM is away from the desk and believes the visitor has already left.
   * The tenant receives an email with a "Confirm Departure" link.
   * Only works for CHECKED_IN visitors. Cannot be requested twice.
   */
  @Post("{inviteId}/request-departure")
  public async requestDeparture(
    @Path() inviteId: string,
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    await this.service.requestDeparture(req.user.userId, inviteId);
    return { success: true, message: "Departure confirmation request sent to tenant" };
  }
}
