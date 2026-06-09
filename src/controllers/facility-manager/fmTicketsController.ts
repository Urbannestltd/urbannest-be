import {
  Body,
  Delete,
  Get,
  Patch,
  Post,
  Put,
  Path,
  Query,
  Route,
  Controller,
  Tags,
  Security,
  Request,
} from "tsoa";
import { FmTicketsService } from "../../services/facility-manager/fmTicketsService";
import {
  FlagExpenseSchema,
  GetTicketsQuerySchema,
  LogExpenseSchema,
  SendMessageSchema,
  SetPrioritySchema,
  UpdateExpenseSchema,
  UpdateStatusSchema,
  type FlagExpenseRequest,
  type GetTicketsQuery,
  type LogExpenseRequest,
  type SendMessageRequest,
  type SetPriorityRequest,
  type UpdateExpenseRequest,
  type UpdateStatusRequest,
} from "../../dtos/facility-manager/fm.tickets.dto";
import { validate } from "../../utils/validate";

@Route("facility-manager/tickets")
@Tags("FM - Tickets")
@Security("jwt", ["FACILITY_MANAGER"])
export class FmTicketsController extends Controller {
  private fmTicketsService = new FmTicketsService();

  /**
   * Returns summary stats for the FM's ticket dashboard header:
   *  - avgResponseMinutes: average time (in minutes) between ticket creation and first FM response
   *  - highPriorityOpenCount: number of HIGH priority tickets with status PENDING
   *  - weeklyResolutionRate: % of this week's tickets that are resolved
   */
  @Get("stats")
  public async getStats(@Request() req: any) {
    const data = await this.fmTicketsService.getStats(req.user.userId);
    return { success: true, message: "Ticket stats retrieved", data };
  }

  /**
   * Returns all maintenance tickets across the FM's assigned properties.
   * Sorted newest first. Supports search by ticket title or tenant name,
   * and filters by status, propertyId, propertyType, priority, category, and date range.
   */
  @Get()
  public async getTickets(
    @Request() req: any,
    @Query() search?: string,
    @Query() status?: string,
    @Query() propertyId?: string,
    @Query() propertyType?: string,
    @Query() priority?: string,
    @Query() category?: string,
    @Query() dateFrom?: string,
    @Query() dateTo?: string,
  ) {
    const filters = validate(GetTicketsQuerySchema, {
      search,
      status,
      propertyId,
      propertyType,
      priority,
      category,
      dateFrom,
      dateTo,
    });
    const data = await this.fmTicketsService.getTickets(
      req.user.userId,
      filters,
    );
    return { success: true, message: "Tickets retrieved", data };
  }

  /**
   * Returns all tickets for a specific property managed by this FM.
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
    const filters = validate(GetTicketsQuerySchema, {
      search,
      status,
      propertyId,
      priority,
      category,
      dateFrom,
      dateTo,
    });
    const data = await this.fmTicketsService.getTicketsByProperty(
      req.user.userId,
      propertyId,
      filters,
    );
    return { success: true, message: "Property tickets retrieved", data };
  }

  /**
   * Returns full details for a single ticket.
   * Returns 403 if the ticket does not belong to one of the FM's properties.
   */
  @Get("{ticketId}")
  public async getTicketDetail(@Path() ticketId: string, @Request() req: any) {
    const data = await this.fmTicketsService.getTicketDetail(
      req.user.userId,
      ticketId,
    );
    return { success: true, message: "Ticket detail retrieved", data };
  }

  /**
   * Sets the priority for a ticket. FM can set LOW, MEDIUM, or HIGH only.
   * EMERGENCY is reserved for admin.
   */
  @Patch("{ticketId}/priority")
  public async setPriority(
    @Path() ticketId: string,
    @Request() req: any,
    @Body() body: SetPriorityRequest,
  ) {
    const { priority } = validate(SetPrioritySchema, body);
    await this.fmTicketsService.setPriority(
      req.user.userId,
      ticketId,
      priority,
    );
    return { success: true, message: "Priority updated" };
  }

  /**
   * Updates the status of a ticket.
   * Allowed transitions: PENDING ↔ IN_PROGRESS, IN_PROGRESS → RESOLVED, RESOLVED → IN_PROGRESS.
   * Returns 409 if the ticket has been closed by admin (CANCELLED).
   */
  @Patch("{ticketId}/status")
  public async updateStatus(
    @Path() ticketId: string,
    @Request() req: any,
    @Body() body: UpdateStatusRequest,
  ) {
    const { status } = validate(UpdateStatusSchema, body);
    await this.fmTicketsService.updateStatus(req.user.userId, ticketId, status);
    return { success: true, message: "Status updated" };
  }

  /**
   * Returns chat messages for a ticket, oldest first.
   * Pass ?since=<ISO timestamp> to fetch only messages newer than that time (for polling).
   */
  @Get("{ticketId}/messages")
  public async getMessages(
    @Path() ticketId: string,
    @Request() req: any,
    @Query() since?: string,
  ) {
    const data = await this.fmTicketsService.getMessages(
      req.user.userId,
      ticketId,
      since,
    );
    return { success: true, message: "Messages retrieved", data };
  }

  /**
   * Marks all unread messages on this ticket (sent by others) as read.
   * Call when FM opens the chat screen to clear the unread badge.
   */
  @Put("{ticketId}/messages/read")
  public async markMessagesRead(@Path() ticketId: string, @Request() req: any) {
    await this.fmTicketsService.markMessagesRead(req.user.userId, ticketId);
    return { success: true, message: "Messages marked as read" };
  }

  /**
   * Sends a chat message on a ticket (text only — no attachments).
   * Pass isInternalNote: true to create an FM-only note hidden from the tenant.
   * Returns 400 if the chat is locked (RESOLVED, FIXED, or CANCELLED).
   */
  @Post("{ticketId}/messages")
  public async sendMessage(
    @Path() ticketId: string,
    @Request() req: any,
    @Body() body: SendMessageRequest,
  ) {
    const { message, isInternalNote } = validate(SendMessageSchema, body);
    const data = await this.fmTicketsService.sendMessage(
      req.user.userId,
      ticketId,
      message,
      isInternalNote,
    );
    return { success: true, message: "Message sent", data };
  }

  /**
   * Returns all expenses logged against this ticket with their current status and action flags.
   */
  @Get("{ticketId}/expenses")
  public async getExpenses(@Path() ticketId: string, @Request() req: any) {
    const data = await this.fmTicketsService.getExpenses(req.user.userId, ticketId);
    return { success: true, message: "Expenses retrieved", data };
  }

  /**
   * Logs a new expense against a ticket.
   * If it would exceed the assigned budget, expense is created as PENDING_APPROVAL
   * and admins are notified by email.
   */
  @Post("{ticketId}/expenses")
  public async logExpense(
    @Path() ticketId: string,
    @Request() req: any,
    @Body() body: LogExpenseRequest,
  ) {
    const validated = validate(LogExpenseSchema, body);
    const data = await this.fmTicketsService.logExpense(
      req.user.userId,
      ticketId,
      validated,
    );
    return { success: true, message: "Expense logged", data };
  }

  /**
   * Updates a LOGGED expense within the 10-minute edit window.
   * Returns 400 after the window has closed or if the expense is not LOGGED.
   */
  @Patch("{ticketId}/expenses/{expenseId}")
  public async updateExpense(
    @Path() ticketId: string,
    @Path() expenseId: string,
    @Request() req: any,
    @Body() body: UpdateExpenseRequest,
  ) {
    const validated = validate(UpdateExpenseSchema, body);
    const data = await this.fmTicketsService.updateExpense(
      req.user.userId,
      ticketId,
      expenseId,
      validated,
    );
    return { success: true, message: "Expense updated", data };
  }

  /**
   * Deletes a LOGGED expense within the 10-minute delete window.
   * Returns 400 after the window has closed or if the expense is not LOGGED.
   */
  @Delete("{ticketId}/expenses/{expenseId}")
  public async deleteExpense(
    @Path() ticketId: string,
    @Path() expenseId: string,
    @Request() req: any,
  ) {
    await this.fmTicketsService.deleteExpense(req.user.userId, ticketId, expenseId);
    return { success: true, message: "Expense deleted" };
  }

  /**
   * Flags a LOGGED expense for admin review. Only allowed after the 10-minute edit window.
   * Admins are notified by email.
   */
  @Post("{ticketId}/expenses/{expenseId}/flag")
  public async flagExpense(
    @Path() ticketId: string,
    @Path() expenseId: string,
    @Request() req: any,
    @Body() body: FlagExpenseRequest,
  ) {
    const { reason } = validate(FlagExpenseSchema, body);
    const data = await this.fmTicketsService.flagExpense(
      req.user.userId,
      ticketId,
      expenseId,
      reason,
    );
    return { success: true, message: "Expense flagged", data };
  }

  /**
   * Accepts the admin's rebuttal on a REBUTTED expense.
   * Expense moves to LOGGED. The budget was already adjusted by admin.
   */
  @Post("{ticketId}/expenses/{expenseId}/accept-rebuttal")
  public async acceptRebuttal(
    @Path() ticketId: string,
    @Path() expenseId: string,
    @Request() req: any,
  ) {
    const data = await this.fmTicketsService.acceptRebuttal(
      req.user.userId,
      ticketId,
      expenseId,
    );
    return { success: true, message: "Rebuttal accepted", data };
  }

  /**
   * Cancels a REBUTTED expense the FM does not wish to proceed with.
   * Sets expense to REJECTED.
   */
  @Post("{ticketId}/expenses/{expenseId}/cancel")
  public async cancelExpense(
    @Path() ticketId: string,
    @Path() expenseId: string,
    @Request() req: any,
  ) {
    const data = await this.fmTicketsService.cancelExpense(
      req.user.userId,
      ticketId,
      expenseId,
    );
    return { success: true, message: "Expense cancelled", data };
  }

  /**
   * Returns full budget summary: assigned budget, total logged expenses (LOGGED + FLAGGED only),
   * remaining budget, all expenses with action flags, and budget adjustment history.
   */
  @Get("{ticketId}/budget")
  public async getBudgetStatus(@Path() ticketId: string, @Request() req: any) {
    const data = await this.fmTicketsService.getBudgetStatus(req.user.userId, ticketId);
    return { success: true, message: "Budget summary retrieved", data };
  }

  /**
   * Returns the full budget adjustment history for a ticket: each admin-driven budget change
   * with old/new amounts, reason, and the expense that triggered the change.
   */
  @Get("{ticketId}/budget/history")
  public async getBudgetAdjustmentHistory(
    @Path() ticketId: string,
    @Request() req: any,
  ) {
    const data = await this.fmTicketsService.getBudgetAdjustmentHistory(
      req.user.userId,
      ticketId,
    );
    return { success: true, message: "Budget adjustment history retrieved", data };
  }
}
