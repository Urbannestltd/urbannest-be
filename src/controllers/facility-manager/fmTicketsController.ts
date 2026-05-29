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
import { FmTicketsService } from "../../services/facility-manager/fmTicketsService";

@Route("facility-manager/tickets")
@Tags("Facility Manager")
@Security("jwt", ["FACILITY_MANAGER"])
export class FmTicketsController extends Controller {
  private fmTicketsService = new FmTicketsService();

  /**
   * Returns all maintenance tickets across the FM's assigned properties.
   * Sorted newest first. Supports search by ticket title or tenant name,
   * and filters by status, property, priority, category, and date range.
   */
  @Get()
  public async getTickets(
    @Request() req: any,
    @Query() search?: string,
    @Query() status?: string,
    @Query() propertyId?: string,
    @Query() priority?: string,
    @Query() category?: string,
    @Query() dateFrom?: string,
    @Query() dateTo?: string,
  ) {
    const data = await this.fmTicketsService.getTickets(req.user.userId, {
      search,
      status,
      propertyId,
      priority,
      category,
      dateFrom,
      dateTo,
    });
    return { success: true, message: "Tickets retrieved", data };
  }

  /**
   * Returns full details for a single ticket.
   * Returns 403 if the ticket does not belong to one of the FM's properties.
   */
  @Get("{ticketId}")
  public async getTicketDetail(
    @Path() ticketId: string,
    @Request() req: any,
  ) {
    const data = await this.fmTicketsService.getTicketDetail(
      req.user.userId,
      ticketId,
    );
    return { success: true, message: "Ticket detail retrieved", data };
  }

  /**
   * Sets the priority for a ticket.
   * The FM is the only role that sets priority on tickets raised in their properties.
   */
  @Patch("{ticketId}/priority")
  public async setPriority(
    @Path() ticketId: string,
    @Request() req: any,
    @Body() body: { priority: string },
  ) {
    await this.fmTicketsService.setPriority(
      req.user.userId,
      ticketId,
      body.priority,
    );
    return { success: true, message: "Priority updated" };
  }
}
