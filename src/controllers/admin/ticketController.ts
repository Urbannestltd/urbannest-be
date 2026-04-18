import { Body, Get, Path, Post, Put, Route, Security, Tags } from "tsoa";
import { AdminTicketService } from "../../services/admin/ticketService";
import {
  AddCommentDto,
  UpdateTicketStatusDto,
} from "../../dtos/admin/ticket.dto";

@Route("admin/properties")
@Tags("Admin - Tickets")
@Security("jwt", ["ADMIN"])
export class AdminTicketController {
  private ticketService = new AdminTicketService();

  // Get all tickets across all properties
  @Get("tickets")
  public async getAllTickets() {
    const tickets = await this.ticketService.getAllTickets();
    return { success: true, data: tickets };
  }

  // Get list for the "Tickets" tab
  @Get("{propertyId}/tickets")
  public async getPropertyTickets(@Path() propertyId: string) {
    const tickets = await this.ticketService.getPropertyTickets(propertyId);
    return {
      success: true,
      data: tickets,
    };
  }

  // Get details for the specific ticket modal
  @Get("tickets/{ticketId}")
  public async getTicketDetails(@Path() ticketId: string) {
    const ticketDetails = await this.ticketService.getTicketDetails(ticketId);
    return {
      success: true,
      data: ticketDetails,
    };
  }

  // Add a comment to the ticket
  @Post("tickets/{ticketId}/comments")
  public async addComment(
    @Path() ticketId: string,
    @Body() body: AddCommentDto,
  ) {
    const comment = await this.ticketService.addComment(ticketId, body);
    return {
      success: true,
      message: "Comment added successfully",
      data: comment,
    };
  }

  // Change the status (e.g., from "Pending" to "Work Scheduled")
  @Put("tickets/{ticketId}/status")
  public async updateTicketStatus(
    @Path() ticketId: string,
    @Body() body: UpdateTicketStatusDto,
  ) {
    const ticket = await this.ticketService.updateStatus(ticketId, body);
    return {
      success: true,
      message: "Ticket status updated",
      data: ticket,
    };
  }
}
