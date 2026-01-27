import {
  Controller,
  Post,
  Body,
  Route,
  Tags,
  Security,
  Request,
  Get,
} from "tsoa";
import { VisitorService } from "../../services/tenant/visitorService";
import {
  CreateInviteSchema,
  CreateBulkInviteSchema,
  CreateInviteRequest,
  CreateBulkInviteRequest,
} from "../../dtos/tenant/visitor.dto";
import { successResponse } from "../../utils/responseHelper";
import { validate } from "../../utils/validate";
import { VerifyCodeSchema } from "../../dtos/tenant/visitor.dto";

@Route("visitors")
@Tags("Visitor Management")
export class VisitorController extends Controller {
  private visitorService = new VisitorService();

  /**
   * Register a Single Visitor
   * Usage: Guest, Delivery, Service Provider
   */
  @Post("invite")
  @Security("jwt")
  public async createInvite(
    @Request() req: any,
    @Body() body: CreateInviteRequest,
  ) {
    validate(CreateInviteSchema, body);
    const result = await this.visitorService.createInvite(
      req.user.userId,
      body,
    );
    return successResponse(result, "Visitor registered");
  }

  /**
   * Register Multiple Visitors (Bulk)
   * Usage: Office Meetings, Parties, Events
   */
  @Post("invite/bulk")
  @Security("jwt")
  public async createBulkInvite(
    @Request() req: any,
    @Body() body: CreateBulkInviteRequest,
  ) {
    validate(CreateBulkInviteSchema, body);
    const result = await this.visitorService.createBulkInvite(
      req.user.userId,
      body,
    );
    return successResponse(result, "Bulk visitors registered");
  }

  /**
   * SECURITY: Verify a code (Is this person allowed?)
   */
  @Post("verify")
  // @Security("jwt") // In real app, restrict to "SECURITY" role
  public async verifyVisitor(@Body() body: { accessCode: string }) {
    validate(VerifyCodeSchema, body);
    const result = await this.visitorService.verifyAccessCode(body.accessCode);
    return successResponse(result, "Code verified");
  }

  /**
   * SECURITY: Check-in (Let them in)
   */
  @Post("check-in")
  // @Security("jwt") // Restrict to "SECURITY" role
  public async checkIn(@Body() body: { accessCode: string }) {
    validate(VerifyCodeSchema, body);
    const result = await this.visitorService.checkInVisitor(body.accessCode);
    return successResponse(result, "Visitor checked in");
  }

  @Get("history")
  @Security("jwt")
  public async getHistory(@Request() req: any) {
    const userId = req.user.userId;
    const history = await this.visitorService.getVisitorHistory(userId);
    return successResponse(history, "Visitor history retrieved");
  }

  /**
   * SECURITY: Check-Out (Exit)
   */
  @Post("check-out")
  // @Security("jwt") // Restrict to Security Role
  public async checkOut(@Body() body: { accessCode: string }) {
    // Basic validation that code exists
    if (!body.accessCode) throw new Error("Access code required");

    const result = await this.visitorService.checkOutVisitor(body.accessCode);
    return successResponse(result, "Visitor checked out");
  }
}
