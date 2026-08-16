import {
  Controller,
  Post,
  Get,
  Body,
  Middlewares,
  Route,
  Tags,
  Security,
  Request,
  Path,
  Patch,
  Delete,
  Query,
} from "tsoa";
import { MaintenanceService } from "../../services/tenant/maintenanceService";
import {
  CreateMaintenanceSchema,
  CreateMaintenanceRequest,
  AddMessageRequest,
  AddMessageSchema,
  UpdateMaintenanceRequest,
  UpdateMaintenanceSchema,
} from "../../dtos/tenant/maintenance.dto";
import { successResponse } from "../../utils/responseHelper";
import { validate } from "../../utils/validate";
import { Permission } from "@prisma/client";
import { requirePermission } from "../../middlewares/permissionMiddleware";

@Route("tenant/maintenance")
@Tags("Tenant - Maintenance Requests")
@Middlewares(requirePermission(Permission.REQUEST_MAINTENANCE))
export class MaintenanceController extends Controller {
  private maintenanceService = new MaintenanceService();

  /**
   * Submit a New Maintenance Request
   * Supports photos/videos (send as URLs).
   */
  @Post("submit")
  @Security("jwt")
  public async submitRequest(
    @Request() req: any,
    @Body() body: CreateMaintenanceRequest,
  ) {
    const validated = validate(CreateMaintenanceSchema, body);
    const result = await this.maintenanceService.createTicket(
      req.user.userId,
      validated,
    );
    return successResponse(
      result,
      "Maintenance request submitted successfully",
    );
  }

  /**
   * View Request History
   */
  @Get("history")
  @Security("jwt")
  public async getHistory(@Request() req: any) {
    const userId = req.user.userId;
    const history = await this.maintenanceService.getMyTickets(userId);
    return successResponse(history, "Maintenance history retrieved");
  }

  /**
   * Marks a ticket as viewed — clears the "new activity" dot on the list
   * (both a status change like resolved, and any unread replies).
   * Call when the tenant opens the ticket.
   */
  @Post("{ticketId}/viewed")
  @Security("jwt")
  public async markViewed(@Request() req: any, @Path() ticketId: string) {
    await this.maintenanceService.markTicketViewed(req.user.userId, ticketId);
    return successResponse(null, "Ticket marked as viewed");
  }

  /**
   * Send a Message on a specific Ticket
   */
  @Post("{ticketId}/message")
  @Security("jwt")
  public async sendMessage(
    @Request() req: any,
    @Path() ticketId: string,
    @Body() body: AddMessageRequest,
  ) {
    validate(AddMessageSchema, body);
    const userId = req.user.userId;

    const result = await this.maintenanceService.sendMessage(
      ticketId,
      userId,
      body,
    );
    return successResponse(result, "Message sent");
  }

  /**
   * Get Chat History for a Ticket.
   * Pass ?since=<ISO timestamp> to fetch only messages newer than that time (for polling).
   */
  @Get("{ticketId}/messages")
  @Security("jwt")
  public async getMessages(
    @Request() req: any,
    @Path() ticketId: string,
    @Query() since?: string,
  ) {
    const result = await this.maintenanceService.getTicketMessages(ticketId, req.user.userId, since);
    return successResponse(result, "Messages retrieved");
  }

  @Patch("{ticketId}") // Uses PATCH, not PUT (Partial Update)
  @Security("jwt")
  public async updateRequest(
    @Request() req: any,
    @Path() ticketId: string,
    @Body() body: UpdateMaintenanceRequest,
  ) {
    const validated = validate(UpdateMaintenanceSchema, body);

    const result = await this.maintenanceService.updateRequest(
      ticketId,
      req.user.userId,
      validated,
    );

    return successResponse(result, "Maintenance request updated successfully");
  }

  /**
   * Delete a Maintenance Request
   * Constraints: User must be owner + Status must be PENDING.
   */
  @Delete("{requestId}")
  @Security("jwt")
  public async deleteRequest(@Request() req: any, @Path() requestId: string) {
    const result = await this.maintenanceService.deleteRequest(
      requestId,
      req.user.userId,
    );
    return successResponse(result, "Request deleted");
  }
}
