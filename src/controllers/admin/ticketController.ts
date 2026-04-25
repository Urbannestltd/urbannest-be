import { Body, Get, Middlewares, Patch, Path, Post, Put, Query, Request, Route, Security, Tags } from "tsoa";
import { AdminTicketService } from "../../services/admin/ticketService";
import {
  AddCommentDto,
  RebuttalDto,
  RejectTicketDto,
  SetBudgetDto,
  UpdateTicketStatusDto,
} from "../../dtos/admin/ticket.dto";
import { Permission } from "@prisma/client";
import { requireAnyPermission, requirePermission } from "../../middlewares/permissionMiddleware";

@Route("admin/properties")
@Tags("Admin - Tickets")
@Security("jwt")
@Middlewares(requireAnyPermission(Permission.VIEW_MAINTENANCE_TICKETS, Permission.MANAGE_TICKETS))
export class AdminTicketController {
  private ticketService = new AdminTicketService();

  // Maintenance metrics summary
  @Get("tickets/metrics")
  public async getMetrics() {
    const data = await this.ticketService.getMetrics();
    return { success: true, message: "Maintenance metrics retrieved", data };
  }

  // Get all tickets across all properties with optional filters
  @Get("tickets")
  public async getAllTickets(
    @Query() propertyId?: string,
    @Query() status?: string,
    @Query() priority?: string,
    @Query() category?: string,
    @Query() dateFrom?: string,
    @Query() dateTo?: string,
  ) {
    const tickets = await this.ticketService.getAllTickets({
      propertyId,
      status: status as any,
      priority,
      category,
      dateFrom,
      dateTo,
    });
    return { success: true, data: tickets };
  }

  // Export filtered tickets as CSV
  @Get("tickets/export")
  public async exportTickets(
    @Request() req: any,
    @Query() propertyId?: string,
    @Query() status?: string,
    @Query() priority?: string,
    @Query() category?: string,
    @Query() dateFrom?: string,
    @Query() dateTo?: string,
  ) {
    const csv = await this.ticketService.getTicketsForExport({
      propertyId,
      status: status as any,
      priority,
      category,
      dateFrom,
      dateTo,
    });

    const res = req.res;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="tickets.csv"');
    res.send(csv);
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
  @Middlewares(requirePermission(Permission.MANAGE_TICKETS))
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
  @Middlewares(requirePermission(Permission.MANAGE_TICKETS))
  public async updateTicketStatus(
    @Path() ticketId: string,
    @Body() body: UpdateTicketStatusDto,
  ) {
    const ticket = await this.ticketService.updateStatus(ticketId, body);
    return { success: true, message: "Ticket status updated", data: ticket };
  }

  // Set budget (and optionally the quoted cost) for a ticket
  @Patch("tickets/{ticketId}/budget")
  @Middlewares(requirePermission(Permission.MANAGE_TICKETS))
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
