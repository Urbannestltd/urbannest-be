import { Body, Get, Middlewares, Patch, Path, Post, Put, Request, Route, Security, Tags } from "tsoa";
import { AdminTicketService } from "../../services/admin/ticketService";
import {
  AddCommentDto,
  RebuttalDto,
  RejectTicketDto,
  SetBudgetDto,
  UpdateTicketStatusDto,
} from "../../dtos/admin/ticket.dto";
import { Permission } from "@prisma/client";
import { requirePermission } from "../../middlewares/permissionMiddleware";

@Route("admin/properties")
@Tags("Admin - Tickets")
@Security("jwt")
@Middlewares(requirePermission(Permission.VIEW_MAINTENANCE_TICKETS))
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
    return { success: true, message: "Ticket status updated", data: ticket };
  }

  // Set budget (and optionally the quoted cost) for a ticket
  @Patch("tickets/{ticketId}/budget")
  public async setBudget(
    @Path() ticketId: string,
    @Body() body: SetBudgetDto,
  ) {
    const ticket = await this.ticketService.setBudget(ticketId, body);
    return { success: true, message: "Budget set successfully", data: ticket };
  }

  // Approve a ticket (even if quoted cost exceeds budget)
  @Post("tickets/{ticketId}/approve")
  @Middlewares(requirePermission(Permission.APPROVE_MAJOR_MAINTENANCE))
  public async approveTicket(
    @Path() ticketId: string,
    @Request() req: any,
  ) {
    const ticket = await this.ticketService.approveTicket(ticketId, req.user.userId);
    return { success: true, message: "Ticket approved", data: ticket };
  }

  // Reject a ticket with a mandatory reason
  @Post("tickets/{ticketId}/reject")
  @Middlewares(requirePermission(Permission.APPROVE_MAJOR_MAINTENANCE))
  public async rejectTicket(
    @Path() ticketId: string,
    @Request() req: any,
    @Body() body: RejectTicketDto,
  ) {
    const ticket = await this.ticketService.rejectTicket(ticketId, req.user.userId, body);
    return { success: true, message: "Ticket rejected", data: ticket };
  }

  // Send a rebuttal / counter-message on the quoted cost
  @Post("tickets/{ticketId}/rebuttal")
  @Middlewares(requirePermission(Permission.APPROVE_MAJOR_MAINTENANCE))
  public async sendRebuttal(
    @Path() ticketId: string,
    @Request() req: any,
    @Body() body: RebuttalDto,
  ) {
    const ticket = await this.ticketService.sendRebuttal(ticketId, req.user.userId, body);
    return { success: true, message: "Rebuttal sent", data: ticket };
  }
}
