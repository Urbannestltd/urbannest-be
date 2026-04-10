import { prisma } from "../../config/prisma";
import { CreateExpenseDto, ExpenseResponseDto } from "../../dtos/admin/expense.dto";
import { BadRequestError } from "../../utils/apiError";

export class AdminExpenseService {
  public async addExpense(data: CreateExpenseDto): Promise<ExpenseResponseDto> {
    if (!data.propertyId && !data.unitId) {
      throw new BadRequestError("Either propertyId or unitId must be provided");
    }

    const expense = await prisma.expense.create({
      data: {
        amount: data.amount,
        category: data.category,
        description: data.description,
        date: data.date ? new Date(data.date) : new Date(),
        propertyId: data.propertyId || null,
        unitId: data.unitId || null,
      },
    });

    return expense;
  }

  public async getExpenses(filters: {
    propertyId?: string;
    unitId?: string;
  }): Promise<ExpenseResponseDto[]> {
    const expenses = await prisma.expense.findMany({
      where: {
        ...(filters.propertyId && { propertyId: filters.propertyId }),
        ...(filters.unitId && { unitId: filters.unitId }),
      },
      orderBy: { date: "desc" },
    });

    return expenses;
  }
}
