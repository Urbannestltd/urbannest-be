import { ExpenseStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { BadRequestError, NotFoundError } from "../../utils/apiError";
import { ZeptoMailService } from "../external/zeptoMailService";
import {
  expenseApprovedEmail,
  expenseRejectedEmail,
  expenseRebuttalEmail,
} from "../../config/emailTemplates";
import { logActivity } from "../../utils/activityLogger";
import { getFmNotificationPrefs } from "../facility-manager/fmSettingsService";

export class AdminExpenseApprovalService {
  private emailService = new ZeptoMailService();

  private async fetchExpenseWithContext(expenseId: string) {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: {
        loggedBy: { select: { userId: true, userFullName: true, userEmail: true } },
        maintenanceRequest: {
          select: {
            id: true,
            subject: true,
            budget: true,
            unit: {
              select: {
                property: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!expense) throw new NotFoundError("Expense not found");
    return expense;
  }

  public async getPendingExpenses() {
    const expenses = await prisma.expense.findMany({
      where: { status: { in: [ExpenseStatus.PENDING_APPROVAL, ExpenseStatus.FLAGGED] } },
      include: {
        loggedBy: { select: { userFullName: true } },
        maintenanceRequest: {
          select: {
            id: true,
            subject: true,
            budget: true,
            unit: {
              select: {
                name: true,
                property: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return expenses.map((e) => ({
      id: e.id,
      amount: e.amount,
      category: e.category,
      description: e.description,
      status: e.status,
      flagReason: e.flagReason,
      loggedBy: e.loggedBy?.userFullName ?? null,
      ticketId: e.maintenanceRequestId,
      ticketSubject: e.maintenanceRequest?.subject ?? null,
      ticketBudget: e.maintenanceRequest?.budget ?? null,
      propertyId: e.maintenanceRequest?.unit?.property?.id ?? null,
      propertyName: e.maintenanceRequest?.unit?.property?.name ?? null,
      unitName: e.maintenanceRequest?.unit?.name ?? null,
      date: e.date,
      createdAt: e.createdAt,
    }));
  }

  public async approveExpense(adminId: string, expenseId: string) {
    const expense = await this.fetchExpenseWithContext(expenseId);

    if (
      expense.status !== ExpenseStatus.PENDING_APPROVAL &&
      expense.status !== ExpenseStatus.FLAGGED
    ) {
      throw new BadRequestError(
        `Cannot approve an expense with status ${expense.status}`,
      );
    }

    await prisma.expense.update({
      where: { id: expenseId },
      data: { status: ExpenseStatus.LOGGED },
    });

    // Notify the FM who logged the expense (respects their notification preferences)
    if (expense.loggedBy) {
      const fmPrefs = await getFmNotificationPrefs(expense.loggedBy.userId);
      if (fmPrefs.fmEmailBudgetResponse) {
        const email = expenseApprovedEmail(
          expense.loggedBy.userFullName ?? "Facility Manager",
          expense.maintenanceRequest?.subject ?? "Maintenance Request",
          expense.amount,
          expense.description,
        );
        await this.emailService.sendEmail(
          {
            email: expense.loggedBy.userEmail,
            name: expense.loggedBy.userFullName ?? undefined,
          },
          email.subject,
          email.html,
        );
      }
    }

    await logActivity({
      userId: adminId,
      action: "EXPENSE_APPROVED",
      description: `Approved expense ${expenseId} of ₦${expense.amount.toLocaleString()}`,
      metadata: { expenseId, ticketId: expense.maintenanceRequestId },
    });
  }

  public async rejectExpense(adminId: string, expenseId: string, reason: string) {
    const expense = await this.fetchExpenseWithContext(expenseId);

    if (
      expense.status !== ExpenseStatus.PENDING_APPROVAL &&
      expense.status !== ExpenseStatus.FLAGGED
    ) {
      throw new BadRequestError(
        `Cannot reject an expense with status ${expense.status}`,
      );
    }

    await prisma.expense.update({
      where: { id: expenseId },
      data: { status: ExpenseStatus.REJECTED },
    });

    if (expense.loggedBy) {
      const fmPrefs = await getFmNotificationPrefs(expense.loggedBy.userId);
      if (fmPrefs.fmEmailBudgetResponse) {
        const email = expenseRejectedEmail(
          expense.loggedBy.userFullName ?? "Facility Manager",
          expense.maintenanceRequest?.subject ?? "Maintenance Request",
          expense.amount,
          reason,
        );
        await this.emailService.sendEmail(
          {
            email: expense.loggedBy.userEmail,
            name: expense.loggedBy.userFullName ?? undefined,
          },
          email.subject,
          email.html,
        );
      }
    }

    await logActivity({
      userId: adminId,
      action: "EXPENSE_REJECTED",
      description: `Rejected expense ${expenseId}: ${reason}`,
      metadata: { expenseId, reason },
    });
  }

  public async rebuttalExpense(
    adminId: string,
    expenseId: string,
    newBudget: number,
    reason: string,
  ) {
    const expense = await this.fetchExpenseWithContext(expenseId);

    if (expense.status !== ExpenseStatus.PENDING_APPROVAL) {
      throw new BadRequestError(
        "Rebuttal is only available for PENDING_APPROVAL expenses",
      );
    }

    const ticketId = expense.maintenanceRequestId;
    if (!ticketId) throw new BadRequestError("Expense is not linked to a ticket");

    const ticket = expense.maintenanceRequest;
    const oldBudget = ticket?.budget ?? 0;

    if (newBudget <= 0) throw new BadRequestError("New budget must be greater than 0");

    await prisma.$transaction([
      // Mark expense as REBUTTED (rejected original amount, FM must respond)
      prisma.expense.update({
        where: { id: expenseId },
        data: { status: ExpenseStatus.REBUTTED },
      }),
      // Adjust ticket budget to the admin's proposed amount
      prisma.maintenanceRequest.update({
        where: { id: ticketId },
        data: { budget: newBudget },
      }),
      // Record the budget adjustment
      prisma.budgetAdjustment.create({
        data: {
          ticketId,
          expenseId,
          oldBudget,
          newBudget,
          reason,
          adjustedById: adminId,
        },
      }),
    ]);

    // Notify the FM (respects their notification preferences)
    if (expense.loggedBy) {
      const fmPrefs = await getFmNotificationPrefs(expense.loggedBy.userId);
      if (fmPrefs.fmEmailBudgetResponse) {
        const email = expenseRebuttalEmail(
          expense.loggedBy.userFullName ?? "Facility Manager",
          ticket?.subject ?? "Maintenance Request",
          expense.amount,
          newBudget,
          reason,
        );
        await this.emailService.sendEmail(
          {
            email: expense.loggedBy.userEmail,
            name: expense.loggedBy.userFullName ?? undefined,
          },
          email.subject,
          email.html,
        );
      }
    }

    await logActivity({
      userId: adminId,
      action: "EXPENSE_REBUTTAL",
      description: `Rebuttal on expense ${expenseId}: budget adjusted from ₦${oldBudget} to ₦${newBudget}`,
      metadata: { expenseId, oldBudget, newBudget, reason },
    });
  }
}
