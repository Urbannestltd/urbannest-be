import {
  Body,
  Get,
  Patch,
  Post,
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
@Tags("FM - Tickets")
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
   * Returns all tickets for a specific property managed by this FM.
   * Includes property metadata in the response alongside the ticket list.
   * Supports the same search/filter query params as the main ticket list.
   */
  @Get("property/{propertyId}")
  public async getTicketsByProperty(
    @Path() propertyId: string,
    @Request() req: any,
    @Query() search?: string,
    @Query() status?: string,
    @Query() priority?: string,
    @Query() category?: string,
    @Query() dateFrom?: string,
    @Query() dateTo?: string,
  ) {
    const data = await this.fmTicketsService.getTicketsByProperty(
      req.user.userId,
      propertyId,
      { search, status, priority, category, dateFrom, dateTo },
    );
    return { success: true, message: "Property tickets retrieved", data };
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

  /**
   * Updates the status of a ticket.
   * Allowed transitions: PENDING ↔ IN_PROGRESS, IN_PROGRESS → RESOLVED, RESOLVED → IN_PROGRESS.
   * Returns 409 if the ticket has been closed by admin (CANCELLED).
   * Resolving locks the chat; reverting from RESOLVED to IN_PROGRESS reopens it.
   */
  @Patch("{ticketId}/status")
  public async updateStatus(
    @Path() ticketId: string,
    @Request() req: any,
    @Body() body: { status: string },
  ) {
    await this.fmTicketsService.updateStatus(req.user.userId, ticketId, body.status);
    return { success: true, message: "Status updated" };
  }

  /**
   * Returns all chat messages for a ticket, oldest first.
   */
  @Get("{ticketId}/messages")
  public async getMessages(
    @Path() ticketId: string,
    @Request() req: any,
  ) {
    const data = await this.fmTicketsService.getMessages(req.user.userId, ticketId);
    return { success: true, message: "Messages retrieved", data };
  }

  /**
   * Sends a chat message on a ticket.
   * Returns 400 if the ticket chat is locked (status is RESOLVED or CANCELLED).
   */
  @Post("{ticketId}/messages")
  public async sendMessage(
    @Path() ticketId: string,
    @Request() req: any,
    @Body() body: { message: string; attachments?: string[] },
  ) {
    const data = await this.fmTicketsService.sendMessage(
      req.user.userId,
      ticketId,
      body.message,
      body.attachments,
    );
    return { success: true, message: "Message sent", data };
  }

  /**
   * Returns all expenses logged against this ticket.
   */
  @Get("{ticketId}/expenses")
  public async getExpenses(
    @Path() ticketId: string,
    @Request() req: any,
  ) {
    const data = await this.fmTicketsService.getExpenses(req.user.userId, ticketId);
    return { success: true, message: "Expenses retrieved", data };
  }

  /**
   * Logs a new expense against a ticket.
   * The expense is automatically linked to the ticket's property and unit.
   */
  @Post("{ticketId}/expenses")
  public async logExpense(
    @Path() ticketId: string,
    @Request() req: any,
    @Body() body: { amount: number; category: string; description: string; date?: string },
  ) {
    const data = await this.fmTicketsService.logExpense(req.user.userId, ticketId, body);
    return { success: true, message: "Expense logged", data };
  }

  /**
   * Returns the budget, quoted cost, approval status, and rebuttal note for a ticket.
   */
  @Get("{ticketId}/budget")
  public async getBudgetStatus(
    @Path() ticketId: string,
    @Request() req: any,
  ) {
    const data = await this.fmTicketsService.getBudgetStatus(req.user.userId, ticketId);
    return { success: true, message: "Budget status retrieved", data };
  }
}
