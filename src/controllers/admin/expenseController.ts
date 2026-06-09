import { Body, Get, Middlewares, Post, Path, Query, Request, Route, Security, Tags } from "tsoa";
import { AdminExpenseService } from "../../services/admin/expenseService";
import { AdminExpenseApprovalService } from "../../services/admin/adminExpenseService";
import { CreateExpenseDto } from "../../dtos/admin/expense.dto";
import { Permission } from "@prisma/client";
import { requirePermission, requireAnyPermission } from "../../middlewares/permissionMiddleware";
import { z } from "zod";
import { validate } from "../../utils/validate";

const RejectExpenseSchema = z.object({
  reason: z.string().min(1, "Reason is required").max(500),
});
const RebuttalExpenseSchema = z.object({
  newBudget: z.number().positive("New budget must be greater than 0"),
  reason: z.string().min(1, "Reason is required").max(500),
});

@Route("admin/expenses")
@Tags("Admin - Expenses")
@Security("jwt")
@Middlewares(requirePermission(Permission.VIEW_FINANCIALS_AND_REPORTS))
export class AdminExpenseController {
  private expenseService = new AdminExpenseService();
  private approvalService = new AdminExpenseApprovalService();

  @Post("/")
  public async addExpense(@Body() body: CreateExpenseDto) {
    const expense = await this.expenseService.addExpense(body);
    return {
      success: true,
      message: "Expense added successfully",
      data: expense,
    };
  }

  @Get("/")
  public async getExpenses(
    @Query() propertyId?: string,
    @Query() unitId?: string,
  ) {
    const expenses = await this.expenseService.getExpenses({ propertyId, unitId });
    return {
      success: true,
      message: "Expenses retrieved successfully",
      data: expenses,
    };
  }

  /**
   * Returns all expenses with status PENDING_APPROVAL or FLAGGED across all tickets.
   * These require admin action.
   */
  @Get("pending")
  public async getPendingExpenses() {
    const data = await this.approvalService.getPendingExpenses();
    return { success: true, message: "Pending expenses retrieved", data };
  }

  /**
   * Approves a PENDING_APPROVAL or FLAGGED expense.
   * Status moves to LOGGED, running totals update, FM is notified.
   */
  @Post("{expenseId}/approve")
  public async approveExpense(@Path() expenseId: string, @Request() req: any) {
    await this.approvalService.approveExpense(req.user.userId, expenseId);
    return { success: true, message: "Expense approved" };
  }

  /**
   * Rejects a PENDING_APPROVAL or FLAGGED expense.
   * Status moves to REJECTED and FM is notified with the reason.
   */
  @Post("{expenseId}/reject")
  public async rejectExpense(
    @Path() expenseId: string,
    @Request() req: any,
    @Body() body: { reason: string },
  ) {
    const { reason } = validate(RejectExpenseSchema, body);
    await this.approvalService.rejectExpense(req.user.userId, expenseId, reason);
    return { success: true, message: "Expense rejected" };
  }

  /**
   * Issues a rebuttal on a PENDING_APPROVAL expense:
   *  - Expense → REBUTTED (FM must accept or cancel)
   *  - Ticket budget adjusted to newBudget
   *  - BudgetAdjustment record created (old → new budget, reason stored)
   *  - FM notified with proposed new budget and reason
   */
  @Post("{expenseId}/rebuttal")
  public async rebuttalExpense(
    @Path() expenseId: string,
    @Request() req: any,
    @Body() body: { newBudget: number; reason: string },
  ) {
    const { newBudget, reason } = validate(RebuttalExpenseSchema, body);
    await this.approvalService.rebuttalExpense(req.user.userId, expenseId, newBudget, reason);
    return { success: true, message: "Rebuttal issued, FM notified" };
  }
}
