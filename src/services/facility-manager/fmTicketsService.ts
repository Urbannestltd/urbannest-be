import { ExpenseCategory, ExpenseStatus, MaintenanceCategory, MaintenancePriority, MaintenanceStatus, PropertyType } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../utils/apiError";
import { ZeptoMailService } from "../external/zeptoMailService";
import { getAdminRecipients } from "../../utils/getAdminRecipients";
import { expensePendingApprovalEmail, expenseFlaggedEmail } from "../../config/emailTemplates";
import type { FmExpenseItem, FmBudgetSummary } from "../../dtos/facility-manager/fm.tickets.dto";

// EMERGENCY is reserved for admin — FM can only set LOW/MEDIUM/HIGH
const FM_VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
type FmPriority = (typeof FM_VALID_PRIORITIES)[number];

export interface FmTicketFilters {
  search?: string;
  status?: string;
  propertyId?: string;
  propertyType?: string;
  priority?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
}

const EDIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
// Statuses that count toward total expenses (exclude pending/rejected/rebutted)
const COUNTED_STATUSES: ExpenseStatus[] = [ExpenseStatus.LOGGED, ExpenseStatus.FLAGGED];

export class FmTicketsService {
  private emailService = new ZeptoMailService();
  private readonly SLA = {
    EMERGENCY: { responseHours: 1,  fixHours: 4   },
    HIGH:      { responseHours: 4,  fixHours: 24  },
    MEDIUM:    { responseHours: 24, fixHours: 72  },
    LOW:       { responseHours: 72, fixHours: 168 },
  };

  private buildWhere(userId: string, filters: FmTicketFilters = {}) {
    const q = filters.search?.trim();
    return {
      unit: {
        property: {
          facilityManagerId: userId,
          isDeleted: false,
          ...(filters.propertyId && { id: filters.propertyId }),
          ...(filters.propertyType && {
            type: filters.propertyType === "COMMERCIAL"
              ? PropertyType.COMMERCIAL
              : { in: [PropertyType.MULTI_UNIT, PropertyType.SINGLE_FAMILY] },
          }),
        },
      },
      ...(filters.status && { status: filters.status as MaintenanceStatus }),
      ...(filters.priority && { priority: filters.priority as MaintenancePriority }),
      ...(filters.category && { category: filters.category as MaintenanceCategory }),
      ...((filters.dateFrom || filters.dateTo) && {
        createdAt: {
          ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
          ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
        },
      }),
      ...(q && {
        OR: [
          { subject: { contains: q, mode: "insensitive" as const } },
          { tenant: { userFullName: { contains: q, mode: "insensitive" as const } } },
        ],
      }),
    };
  }

  private mapTicketListItem(ticket: any, now: Date, viewerUserId?: string) {
    const sla = this.SLA[ticket.priority as keyof typeof this.SLA] ?? this.SLA.MEDIUM;

    const projectedFixDeadline = new Date(
      ticket.createdAt.getTime() + sla.fixHours * 60 * 60 * 1000,
    );
    const responseDeadline = new Date(
      ticket.createdAt.getTime() + sla.responseHours * 60 * 60 * 1000,
    );

    const firstMessage = ticket.messages?.[0] ?? null;
    const responseTimeMinutes = firstMessage
      ? Math.round((firstMessage.createdAt.getTime() - ticket.createdAt.getTime()) / 60000)
      : null;

    const isResolved = ["RESOLVED", "FIXED", "CANCELLED"].includes(ticket.status);
    const isResponseLate = firstMessage
      ? firstMessage.createdAt > responseDeadline
      : !isResolved && now > responseDeadline;
    const isFixLate = !isResolved && now > projectedFixDeadline;

    return {
      id: ticket.id,
      subject: ticket.subject ?? "No subject provided",
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      dateSubmitted: ticket.createdAt,
      propertyId: ticket.unit?.property?.id ?? null,
      propertyName: ticket.unit?.property?.name ?? null,
      unitId: ticket.unit?.id ?? null,
      unitName: ticket.unit?.name ?? null,
      tenantName: ticket.tenant?.userFullName ?? "Unknown",
      responseTimeMinutes,
      isResponseLate,
      isFixLate,
      approvalStatus: ticket.approvalStatus ?? null,
      unreadCount: ticket._count?.messages ?? 0,
    };
  }

  private listIncludes(viewerUserId: string) {
    return {
      unit: {
        select: {
          id: true,
          name: true,
          property: { select: { id: true, name: true } },
        },
      },
      tenant: { select: { userFullName: true } },
      messages: {
        orderBy: { createdAt: "asc" as const },
        take: 1,
      },
      _count: {
        select: {
          messages: {
            where: {
              senderId: { not: viewerUserId },
              readAt: null,
              isInternalNote: false,
            },
          },
        },
      },
    };
  }

  public async getStats(userId: string) {
    const propertyScope = { facilityManagerId: userId, isDeleted: false };

    // Start of current week (Monday 00:00:00)
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);

    const [
      highPriorityOpen,
      weeklyTickets,
      weeklyResolved,
      ticketsWithFirstMessage,
    ] = await Promise.all([
      // 1. High priority tickets that are OPEN (PENDING only, not in progress)
      prisma.maintenanceRequest.count({
        where: {
          unit: { property: propertyScope },
          priority: "HIGH",
          status: "PENDING",
        },
      }),

      // 2. Total tickets created this week
      prisma.maintenanceRequest.count({
        where: {
          unit: { property: propertyScope },
          createdAt: { gte: weekStart },
        },
      }),

      // 3. Tickets resolved this week
      prisma.maintenanceRequest.count({
        where: {
          unit: { property: propertyScope },
          createdAt: { gte: weekStart },
          status: { in: ["RESOLVED", "FIXED"] },
        },
      }),

      // 4. All tickets that have at least one message — used to calculate avg response time
      prisma.maintenanceRequest.findMany({
        where: { unit: { property: propertyScope } },
        select: {
          createdAt: true,
          messages: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      }),
    ]);

    // Average response time in minutes (only tickets where a message was sent)
    const responseTimes = ticketsWithFirstMessage
      .filter((t) => t.messages.length > 0)
      .map((t) => (t.messages[0]!.createdAt.getTime() - t.createdAt.getTime()) / 60000);

    const avgResponseMinutes =
      responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : null;

    const weeklyResolutionRate =
      weeklyTickets > 0 ? Math.round((weeklyResolved / weeklyTickets) * 100) : 0;

    return {
      avgResponseMinutes,
      highPriorityOpenCount: highPriorityOpen,
      weeklyResolutionRate,
    };
  }

  public async getTicketsByProperty(userId: string, propertyId: string, filters: Omit<FmTicketFilters, "propertyId"> = {}) {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, facilityManagerId: userId, isDeleted: false },
      select: { id: true, name: true },
    });
    if (!property) throw new NotFoundError("Property not found or not assigned to you");

    const tickets = await prisma.maintenanceRequest.findMany({
      where: this.buildWhere(userId, { ...filters, propertyId }),
      include: this.listIncludes(userId),
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();
    return {
      property,
      tickets: tickets.map((t) => this.mapTicketListItem(t, now, userId)),
    };
  }

  public async getTickets(userId: string, filters: FmTicketFilters = {}) {
    const tickets = await prisma.maintenanceRequest.findMany({
      where: this.buildWhere(userId, filters),
      include: this.listIncludes(userId),
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();
    return tickets.map((t) => this.mapTicketListItem(t, now, userId));
  }

  public async getTicketDetail(userId: string, ticketId: string) {
    const ticket = await prisma.maintenanceRequest.findUnique({
      where: { id: ticketId },
      include: {
        unit: {
          select: {
            id: true,
            name: true,
            property: { select: { id: true, name: true, facilityManagerId: true } },
          },
        },
        tenant: { select: { userId: true, userFullName: true, userPhone: true } },
        messages: {
          include: { sender: { select: { userId: true, userFullName: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!ticket) throw new NotFoundError("Ticket not found");
    if (ticket.unit?.property?.facilityManagerId !== userId)
      throw new ForbiddenError("You do not have access to this ticket");

    const messages = ticket.messages;

    const timeline: { event: string; timestamp: Date }[] = [
      { event: "Ticket submitted", timestamp: ticket.createdAt },
    ];
    for (const msg of messages) {
      const isSystem = msg.message.startsWith("System:");
      timeline.push({
        event: isSystem
          ? msg.message.replace("System: ", "")
          : `Response from ${msg.sender.userFullName ?? "Unknown"}`,
        timestamp: msg.createdAt,
      });
    }

    const firstMessage = messages[0] ?? null;
    const timeToFirstResponseMinutes = firstMessage
      ? Math.round(
          (firstMessage.createdAt.getTime() - ticket.createdAt.getTime()) / 60000,
        )
      : null;

    const resolutionMessage = messages.find(
      (m) =>
        m.message.startsWith("System:") &&
        (m.message.includes("RESOLVED") || m.message.includes("FIXED")),
    );
    const timeToResolutionMinutes = resolutionMessage
      ? Math.round(
          (resolutionMessage.createdAt.getTime() - ticket.createdAt.getTime()) / 60000,
        )
      : null;

    const isClosed = ticket.status === MaintenanceStatus.CANCELLED;
    const isChatLocked =
      ticket.status === MaintenanceStatus.RESOLVED ||
      ticket.status === MaintenanceStatus.FIXED ||
      isClosed;

    const availableActions: string[] =
      isClosed ? [] : (this.ALLOWED_TRANSITIONS[ticket.status] ?? []);

    return {
      id: ticket.id,
      subject: ticket.subject ?? "No subject provided",
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      isClosed,
      isChatLocked,
      availableActions,
      dateSubmitted: ticket.createdAt,
      images: ticket.attachments,
      propertyId: ticket.unit?.property?.id ?? null,
      propertyName: ticket.unit?.property?.name ?? null,
      unitId: ticket.unit?.id ?? null,
      unitName: ticket.unit?.name ?? null,
      tenant: ticket.tenant
        ? { id: ticket.tenant.userId, name: ticket.tenant.userFullName, phone: ticket.tenant.userPhone }
        : null,
      budget: ticket.budget ?? null,
      quotedCost: ticket.quotedCost ?? null,
      approvalStatus: ticket.approvalStatus ?? null,
      rebuttalNote: ticket.rebuttalNote ?? null,
      activity: messages.map((m) => ({
        id: m.id,
        senderId: m.sender.userId,
        senderName: m.sender.userFullName ?? "Unknown",
        message: m.message,
        timestamp: m.createdAt,
        isSystemMessage: m.message.startsWith("System:"),
      })),
      timeline,
      responseMetrics: { timeToFirstResponseMinutes, timeToResolutionMinutes },
    };
  }

  // -----------------------------------------------------------------------
  // Access guard — returns ticket or throws 404/403
  // -----------------------------------------------------------------------
  private async assertFmAccess(userId: string, ticketId: string) {
    const ticket = await prisma.maintenanceRequest.findUnique({
      where: { id: ticketId },
      include: {
        unit: {
          select: {
            id: true,
            property: { select: { id: true, facilityManagerId: true } },
          },
        },
      },
    });
    if (!ticket) throw new NotFoundError("Ticket not found");
    if (ticket.unit?.property?.facilityManagerId !== userId)
      throw new ForbiddenError("You do not have access to this ticket");
    return ticket;
  }

  // -----------------------------------------------------------------------
  // Status transitions
  // -----------------------------------------------------------------------
  private readonly ALLOWED_TRANSITIONS: Partial<Record<MaintenanceStatus, MaintenanceStatus[]>> = {
    PENDING:     ["IN_PROGRESS", "RESOLVED"],
    IN_PROGRESS: ["PENDING",     "RESOLVED"],
    RESOLVED:    ["IN_PROGRESS"],
  };

  public async updateStatus(userId: string, ticketId: string, newStatus: string) {
    const ticket = await this.assertFmAccess(userId, ticketId);

    if (ticket.status === MaintenanceStatus.CANCELLED) {
      throw new ConflictError("This ticket was closed by admin.");
    }

    const allowed = this.ALLOWED_TRANSITIONS[ticket.status] ?? [];
    if (!allowed.includes(newStatus as MaintenanceStatus)) {
      throw new BadRequestError(
        `Cannot transition from ${ticket.status} to ${newStatus}. Allowed: ${allowed.join(", ")}`,
      );
    }

    await prisma.$transaction([
      prisma.maintenanceRequest.update({
        where: { id: ticketId },
        data: { status: newStatus as MaintenanceStatus },
      }),
      prisma.maintenanceMessage.create({
        data: {
          ticketId,
          senderId: userId,
          message: `System: Status changed from ${ticket.status} to ${newStatus}`,
          attachments: [],
        },
      }),
    ]);
  }

  // -----------------------------------------------------------------------
  // Chat
  // -----------------------------------------------------------------------
  private mapMessage(m: any, viewerUserId: string) {
    return {
      id: m.id,
      senderId: m.sender.userId,
      senderName: m.sender.userFullName ?? "Unknown",
      message: m.message,
      timestamp: m.createdAt,
      readAt: m.readAt,
      isSystemMessage: m.message.startsWith("System:"),
      isInternalNote: m.isInternalNote,
      isMine: m.sender.userId === viewerUserId,
    };
  }

  public async getMessages(userId: string, ticketId: string, since?: string) {
    await this.assertFmAccess(userId, ticketId);

    const messages = await prisma.maintenanceMessage.findMany({
      where: {
        ticketId,
        ...(since ? { createdAt: { gt: new Date(since) } } : {}),
      },
      include: { sender: { select: { userId: true, userFullName: true } } },
      orderBy: { createdAt: "asc" },
    });

    return messages.map((m) => this.mapMessage(m, userId));
  }

  public async markMessagesRead(userId: string, ticketId: string) {
    await this.assertFmAccess(userId, ticketId);

    await prisma.maintenanceMessage.updateMany({
      where: {
        ticketId,
        senderId: { not: userId },
        readAt: null,
      },
      data: { readAt: new Date() },
    });
  }

  public async sendMessage(
    userId: string,
    ticketId: string,
    message: string,
    isInternalNote = false,
  ) {
    const ticket = await this.assertFmAccess(userId, ticketId);

    if (
      ticket.status === MaintenanceStatus.RESOLVED ||
      ticket.status === MaintenanceStatus.FIXED ||
      ticket.status === MaintenanceStatus.CANCELLED
    ) {
      throw new BadRequestError("Chat is locked for this ticket.");
    }

    const created = await prisma.maintenanceMessage.create({
      data: { ticketId, senderId: userId, message, attachments: [], isInternalNote },
      include: { sender: { select: { userId: true, userFullName: true } } },
    });

    return this.mapMessage(created, userId);
  }

  // -----------------------------------------------------------------------
  // Expenses — helpers
  // -----------------------------------------------------------------------
  private mapExpense(e: any): FmExpenseItem {
    const now = Date.now();
    const age = now - new Date(e.createdAt).getTime();
    const withinWindow = age < EDIT_WINDOW_MS;
    return {
      id: e.id,
      amount: e.amount,
      category: e.category,
      description: e.description,
      date: e.date,
      status: e.status,
      flagReason: e.flagReason ?? null,
      propertyId: e.propertyId,
      unitId: e.unitId,
      maintenanceRequestId: e.maintenanceRequestId,
      createdAt: e.createdAt,
      canEdit: withinWindow && e.status === ExpenseStatus.LOGGED,
      canDelete: withinWindow && e.status === ExpenseStatus.LOGGED,
      canFlag: !withinWindow && e.status === ExpenseStatus.LOGGED,
      canCancel: e.status === ExpenseStatus.REBUTTED,
      canAcceptRebuttal: e.status === ExpenseStatus.REBUTTED,
    };
  }

  private async calcTotals(ticketId: string) {
    const agg = await prisma.expense.aggregate({
      where: { maintenanceRequestId: ticketId, status: { in: COUNTED_STATUSES } },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0;
  }

  // -----------------------------------------------------------------------
  // Expenses — CRUD
  // -----------------------------------------------------------------------
  public async getExpenses(userId: string, ticketId: string): Promise<FmExpenseItem[]> {
    await this.assertFmAccess(userId, ticketId);

    const expenses = await prisma.expense.findMany({
      where: { maintenanceRequestId: ticketId },
      orderBy: { date: "desc" },
    });
    return expenses.map((e) => this.mapExpense(e));
  }

  public async logExpense(
    userId: string,
    ticketId: string,
    data: { amount: number; category: string; description: string; date?: string },
  ) {
    const ticket = await this.assertFmAccess(userId, ticketId);

    if (!Object.values(ExpenseCategory).includes(data.category as ExpenseCategory)) {
      throw new BadRequestError(
        `Invalid category. Must be one of: ${Object.values(ExpenseCategory).join(", ")}`,
      );
    }

    // Determine if this expense would exceed the ticket budget
    const currentTotal = await this.calcTotals(ticketId);
    const budget = ticket.budget ?? null;
    const wouldExceed = budget !== null && currentTotal + data.amount > budget;
    const status: ExpenseStatus = wouldExceed
      ? ExpenseStatus.PENDING_APPROVAL
      : ExpenseStatus.LOGGED;

    const expense = await prisma.expense.create({
      data: {
        amount: data.amount,
        category: data.category as ExpenseCategory,
        description: data.description,
        date: data.date ? new Date(data.date) : new Date(),
        maintenanceRequestId: ticketId,
        propertyId: ticket.unit?.property?.id ?? null,
        unitId: ticket.unit?.id ?? null,
        status,
        loggedById: userId,
      },
    });

    // Notify admins when over budget
    if (wouldExceed) {
      const [fm, adminRecipients] = await Promise.all([
        prisma.user.findUnique({
          where: { userId },
          select: { userFullName: true },
        }),
        getAdminRecipients("emailMaintenance"),
      ]);
      const propertyName =
        (ticket as any).unit?.property?.name ?? "Unknown Property";
      const ticketSubject = ticket.subject ?? "Maintenance Request";

      for (const admin of adminRecipients) {
        const email = expensePendingApprovalEmail(
          admin.name ?? "Admin",
          fm?.userFullName ?? "Facility Manager",
          ticketSubject,
          data.amount,
          data.description,
          propertyName,
        );
        await this.emailService.sendEmail(
          { email: admin.email, name: admin.name ?? undefined },
          email.subject,
          email.html,
        );
      }
    }

    return this.mapExpense(expense);
  }

  public async updateExpense(
    userId: string,
    ticketId: string,
    expenseId: string,
    data: { amount?: number; category?: string; description?: string; date?: string },
  ) {
    await this.assertFmAccess(userId, ticketId);

    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, maintenanceRequestId: ticketId },
    });
    if (!expense) throw new NotFoundError("Expense not found on this ticket");

    const age = Date.now() - expense.createdAt.getTime();
    if (age >= EDIT_WINDOW_MS) {
      throw new BadRequestError("Expenses can only be edited within 10 minutes of logging");
    }
    if (expense.status !== ExpenseStatus.LOGGED) {
      throw new BadRequestError("Only LOGGED expenses can be edited");
    }

    if (data.category && !Object.values(ExpenseCategory).includes(data.category as ExpenseCategory)) {
      throw new BadRequestError(
        `Invalid category. Must be one of: ${Object.values(ExpenseCategory).join(", ")}`,
      );
    }

    const updated = await prisma.expense.update({
      where: { id: expenseId },
      data: {
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.category && { category: data.category as ExpenseCategory }),
        ...(data.description && { description: data.description }),
        ...(data.date && { date: new Date(data.date) }),
      },
    });
    return this.mapExpense(updated);
  }

  public async deleteExpense(
    userId: string,
    ticketId: string,
    expenseId: string,
  ) {
    await this.assertFmAccess(userId, ticketId);

    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, maintenanceRequestId: ticketId },
    });
    if (!expense) throw new NotFoundError("Expense not found on this ticket");

    const age = Date.now() - expense.createdAt.getTime();
    if (age >= EDIT_WINDOW_MS) {
      throw new BadRequestError("Expenses can only be deleted within 10 minutes of logging");
    }
    if (expense.status !== ExpenseStatus.LOGGED) {
      throw new BadRequestError("Only LOGGED expenses can be deleted");
    }

    await prisma.expense.delete({ where: { id: expenseId } });
  }

  public async flagExpense(
    userId: string,
    ticketId: string,
    expenseId: string,
    reason: string,
  ) {
    await this.assertFmAccess(userId, ticketId);

    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, maintenanceRequestId: ticketId },
    });
    if (!expense) throw new NotFoundError("Expense not found on this ticket");

    const age = Date.now() - expense.createdAt.getTime();
    if (age < EDIT_WINDOW_MS) {
      throw new BadRequestError(
        "Expenses can only be flagged after the 10-minute edit window",
      );
    }
    if (expense.status !== ExpenseStatus.LOGGED) {
      throw new BadRequestError("Only LOGGED expenses can be flagged");
    }

    const updated = await prisma.expense.update({
      where: { id: expenseId },
      data: { status: ExpenseStatus.FLAGGED, flagReason: reason },
    });

    // Notify admins
    const ticket = await this.assertFmAccess(userId, ticketId);
    const [fm, adminRecipients] = await Promise.all([
      prisma.user.findUnique({
        where: { userId },
        select: { userFullName: true },
      }),
      getAdminRecipients("emailMaintenance"),
    ]);
    const propertyName = (ticket as any).unit?.property?.name ?? "Unknown Property";
    for (const admin of adminRecipients) {
      const email = expenseFlaggedEmail(
        admin.name ?? "Admin",
        fm?.userFullName ?? "Facility Manager",
        ticket.subject ?? "Maintenance Request",
        expense.amount,
        reason,
        propertyName,
      );
      await this.emailService.sendEmail(
        { email: admin.email, name: admin.name ?? undefined },
        email.subject,
        email.html,
      );
    }

    return this.mapExpense(updated);
  }

  public async cancelExpense(
    userId: string,
    ticketId: string,
    expenseId: string,
  ) {
    await this.assertFmAccess(userId, ticketId);

    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, maintenanceRequestId: ticketId },
    });
    if (!expense) throw new NotFoundError("Expense not found on this ticket");
    if (expense.status !== ExpenseStatus.REBUTTED) {
      throw new BadRequestError("Only REBUTTED expenses can be cancelled this way");
    }

    const updated = await prisma.expense.update({
      where: { id: expenseId },
      data: { status: ExpenseStatus.REJECTED },
    });
    return this.mapExpense(updated);
  }

  public async acceptRebuttal(
    userId: string,
    ticketId: string,
    expenseId: string,
  ) {
    await this.assertFmAccess(userId, ticketId);

    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, maintenanceRequestId: ticketId },
    });
    if (!expense) throw new NotFoundError("Expense not found on this ticket");
    if (expense.status !== ExpenseStatus.REBUTTED) {
      throw new BadRequestError("No pending rebuttal on this expense");
    }

    // Accept: expense is now logged at the original amount; budget was already adjusted by admin
    const updated = await prisma.expense.update({
      where: { id: expenseId },
      data: { status: ExpenseStatus.LOGGED },
    });

    // Notify admins that FM accepted
    const [ticket, fm, adminRecipients] = await Promise.all([
      prisma.maintenanceRequest.findUnique({
        where: { id: ticketId },
        select: { subject: true, budget: true },
      }),
      prisma.user.findUnique({ where: { userId }, select: { userFullName: true } }),
      getAdminRecipients("emailMaintenance"),
    ]);

    const { fmAcceptedRebuttalEmail } = await import("../../config/emailTemplates");
    for (const admin of adminRecipients) {
      const email = fmAcceptedRebuttalEmail(
        admin.name ?? "Admin",
        fm?.userFullName ?? "Facility Manager",
        ticket?.subject ?? "Maintenance Request",
        ticket?.budget ?? 0,
      );
      await this.emailService.sendEmail(
        { email: admin.email, name: admin.name ?? undefined },
        email.subject,
        email.html,
      );
    }

    return this.mapExpense(updated);
  }

  // -----------------------------------------------------------------------
  // Budget / Approval status
  // -----------------------------------------------------------------------
  public async getBudgetStatus(userId: string, ticketId: string): Promise<FmBudgetSummary> {
    const ticket = await prisma.maintenanceRequest.findUnique({
      where: { id: ticketId },
      include: {
        unit: {
          select: {
            id: true,
            property: { select: { id: true, facilityManagerId: true } },
          },
        },
        expenses: { orderBy: { date: "desc" } },
        budgetAdjustments: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            oldBudget: true,
            newBudget: true,
            reason: true,
            createdAt: true,
          },
        },
      },
    });

    if (!ticket) throw new NotFoundError("Ticket not found");
    if (ticket.unit?.property?.facilityManagerId !== userId) {
      throw new ForbiddenError("You do not have access to this ticket");
    }

    const totalExpenses = ticket.expenses
      .filter((e) => (COUNTED_STATUSES as string[]).includes(e.status))
      .reduce((sum, e) => sum + e.amount, 0);

    const assignedBudget = ticket.budget ?? null;
    const remainingBudget = assignedBudget !== null
      ? assignedBudget - totalExpenses
      : null;

    return {
      assignedBudget,
      totalExpenses,
      remainingBudget,
      quotedCost: ticket.quotedCost ?? null,
      approvalStatus: ticket.approvalStatus ?? null,
      rebuttalNote: ticket.rebuttalNote ?? null,
      expenses: ticket.expenses.map((e) => this.mapExpense(e)),
      budgetAdjustmentHistory: ticket.budgetAdjustments.map((a) => ({
        id: a.id,
        oldBudget: a.oldBudget,
        newBudget: a.newBudget,
        reason: a.reason ?? null,
        adjustedAt: a.createdAt,
      })),
    };
  }

  public async getBudgetAdjustmentHistory(userId: string, ticketId: string) {
    const ticket = await this.assertFmAccess(userId, ticketId);
    const history = await prisma.budgetAdjustment.findMany({
      where: { ticketId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        oldBudget: true,
        newBudget: true,
        reason: true,
        createdAt: true,
        adjustedBy: { select: { userFullName: true } },
        expense: { select: { amount: true, description: true } },
      },
    });

    return history.map((a) => ({
      id: a.id,
      oldBudget: a.oldBudget,
      newBudget: a.newBudget,
      reason: a.reason ?? null,
      adjustedAt: a.createdAt,
      adjustedBy: a.adjustedBy.userFullName ?? "Admin",
      relatedExpenseAmount: a.expense?.amount ?? null,
      relatedExpenseDescription: a.expense?.description ?? null,
    }));
  }

  public async setPriority(userId: string, ticketId: string, priority: string) {
    if (!FM_VALID_PRIORITIES.includes(priority as FmPriority)) {
      throw new BadRequestError(
        `Invalid priority. Must be one of: ${FM_VALID_PRIORITIES.join(", ")}`,
      );
    }

    await this.assertFmAccess(userId, ticketId);

    await prisma.maintenanceRequest.update({
      where: { id: ticketId },
      data: { priority: priority as FmPriority },
    });
  }
}
