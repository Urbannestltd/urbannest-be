import {
  Body,
  Get,
  Post,
  Path,
  Query,
  Route,
  Controller,
  Tags,
  Security,
  Request,
  SuccessResponse,
} from "tsoa";
import { FmWalkInsService } from "../../services/facility-manager/fmWalkInsService";
import {
  RegisterWalkInSchema,
  WalkInListQuerySchema,
  type RegisterWalkInRequest,
  type WalkInListItem,
  type WalkInStatus,
  type RepeatVisitorProfile,
} from "../../dtos/facility-manager/fm.walk-ins.dto";
import { validate } from "../../utils/validate";

@Route("facility-manager/walk-ins")
@Tags("FM - Walk-In Visitors")
@Security("jwt", ["FACILITY_MANAGER"])
export class FmWalkInsController extends Controller {
  private service = new FmWalkInsService();

  /**
   * Registers a walk-in visitor and sends a tenant approval request (email + app).
   * The visit is created with PENDING status. The tenant has 5 minutes to approve or reject.
   */
  @SuccessResponse(201, "Walk-in registered")
  @Post()
  public async registerWalkIn(
    @Request() req: any,
    @Body() body: RegisterWalkInRequest,
  ): Promise<{ success: boolean; message: string; data: WalkInListItem }> {
    const data = validate(RegisterWalkInSchema, body);
    const result = await this.service.registerWalkIn(req.user.userId, data);
    this.setStatus(201);
    return { success: true, message: "Walk-in registered, awaiting tenant approval", data: result };
  }

  /**
   * Checks out a visitor who is currently CHECKED_IN.
   * Sets status to CHECKED_OUT and records the checkout timestamp.
   */
  @Post("{visitId}/checkout")
  public async checkOut(
    @Path() visitId: string,
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    await this.service.checkOut(req.user.userId, visitId);
    return { success: true, message: "Visitor checked out" };
  }

  /**
   * Returns the current approval status and remaining seconds until the approval window closes.
   * Poll this endpoint after registering a walk-in to track real-time status.
   */
  @Get("{visitId}/status")
  public async getWalkInStatus(
    @Path() visitId: string,
    @Request() req: any,
  ): Promise<{ success: boolean; data: WalkInStatus }> {
    const data = await this.service.getWalkInStatus(req.user.userId, visitId);
    return { success: true, data };
  }

  /**
   * Returns all walk-in visits across the FM's managed properties.
   * Supports filtering by status, unit, date range, and searching by visitor name or phone.
   */
  @Get()
  public async listWalkIns(
    @Request() req: any,
    @Query() search?: string,
    @Query() status?: string,
    @Query() unitId?: string,
    @Query() dateFrom?: string,
    @Query() dateTo?: string,
  ): Promise<{ success: boolean; data: WalkInListItem[] }> {
    const filters = validate(WalkInListQuerySchema, { search, status, unitId, dateFrom, dateTo });
    const data = await this.service.listWalkIns(req.user.userId, filters);
    return { success: true, data };
  }

  /**
   * Searches walk-in history by visitor name or phone number.
   * Returns all distinct visitors whose name or phone matches the search string.
   * Use this to pre-fill the registration form for repeat visitors.
   * Each entry reflects the visitor's most recent visit details and total visit count.
   */
  @Get("repeat-visitor")
  public async getRepeatVisitorProfiles(
    @Request() req: any,
    @Query() search: string,
  ): Promise<{ success: boolean; data: RepeatVisitorProfile[] }> {
    const data = await this.service.getRepeatVisitorProfiles(req.user.userId, search);
    return { success: true, data };
  }
}
