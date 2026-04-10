import { Body, Get, Post, Query, Route, Security, Tags } from "tsoa";
import { AdminExpenseService } from "../../services/admin/expenseService";
import { CreateExpenseDto } from "../../dtos/admin/expense.dto";

@Route("admin/expenses")
@Tags("Admin - Expenses")
@Security("jwt", ["ADMIN"])
export class AdminExpenseController {
  private expenseService = new AdminExpenseService();

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
}
