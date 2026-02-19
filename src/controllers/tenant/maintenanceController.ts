import {
  Controller,
  Post,
  Get,
  Body,
  Route,
  Tags,
  Security,
  Request,
  Path,
  Patch,
  Delete,
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

@Route("maintenance")
@Tags("Maintenance Requests")
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
    validate(CreateMaintenanceSchema, body);
    const result = await this.maintenanceService.createTicket(
      req.user.userId,
      body,
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
   * Get Chat History for a Ticket
   */
  @Get("{ticketId}/messages")
  @Security("jwt")
  public async getMessages(@Request() req: any, @Path() ticketId: string) {
    // Optional: Add logic here to ensure req.user.userId is allowed to view this ticket
    const result = await this.maintenanceService.getTicketMessages(ticketId);
    return successResponse(result, "Messages retrieved");
  }

  @Patch("{ticketId}") // Uses PATCH, not PUT (Partial Update)
  @Security("jwt")
  public async updateRequest(
    @Request() req: any,
    @Path() ticketId: string,
    @Body() body: UpdateMaintenanceRequest,
  ) {
    validate(UpdateMaintenanceSchema, body);

    const result = await this.maintenanceService.updateRequest(
      ticketId,
      req.user.userId,
      body,
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
