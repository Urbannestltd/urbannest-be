import { PrismaClient, MaintenanceStatus } from "@prisma/client";
import {
  AddCommentDto,
  RebuttalDto,
  RejectTicketDto,
  SetBudgetDto,
  TicketDetailResponseDto,
  TicketListResponseDto,
  UpdateTicketStatusDto,
} from "../../dtos/admin/ticket.dto";
import { ZeptoMailService } from "../external/zeptoMailService";
import {
  ticketApprovedEmail,
  ticketRejectedEmail,
  ticketRebuttalEmail,
} from "../../config/emailTemplates";

const prisma = new PrismaClient();

export class AdminTicketService {
  private emailService = new ZeptoMailService();
  // SLA windows by priority (in hours)
  private readonly SLA = {
    EMERGENCY: { responseHours: 1,  fixHours: 4   },
    HIGH:      { responseHours: 4,  fixHours: 24  },
    MEDIUM:    { responseHours: 24, fixHours: 72  },
    LOW:       { responseHours: 72, fixHours: 168 },
  };

  // --- SHARED: maps a raw maintenanceRequest (with includes) to TicketListResponseDto ---
  private mapTicket(ticket: any, now: Date): TicketListResponseDto {
    const sla = this.SLA[ticket.priority as keyof typeof this.SLA] ?? this.SLA.MEDIUM;
    const projectedFixDeadline = new Date(
      ticket.createdAt.getTime() + sla.fixHours * 60 * 60 * 1000,
    );
    const responseDeadline = new Date(
      ticket.createdAt.getTime() + sla.responseHours * 60 * 60 * 1000,
    );

    const firstMessage = ticket.messages[0] ?? null;
    const responseTimeMinutes = firstMessage
      ? Math.round(
          (firstMessage.createdAt.getTime() - ticket.createdAt.getTime()) / 60000,
        )
      : null;

    const isResolved = ["RESOLVED", "FIXED", "CANCELLED"].includes(ticket.status);
    const isResponseLate = firstMessage
      ? firstMessage.createdAt > responseDeadline
      : !isResolved && now > responseDeadline;
    const isFixLate = !isResolved && now > projectedFixDeadline;

    return {
      id: ticket.id,
      subject: ticket.subject || "No Subject provided",
      priority: ticket.priority,
      category: ticket.category,
      dateSubmitted: ticket.createdAt,
      status: ticket.status,
      assignedTo: ticket.assignedTo
        ? { id: ticket.assignedTo.userId, name: ticket.assignedTo.userFullName }
        : null,
      unit: ticket.unit ? { id: ticket.unit.id, name: ticket.unit.name } : null,
      property: ticket.unit?.property
        ? { id: ticket.unit.property.id, name: ticket.unit.property.name }
        : null,
      responseTimeMinutes,
      projectedFixDeadline,
      isResponseLate,
      isFixLate,
      budget: ticket.budget ?? null,
      quotedCost: ticket.quotedCost ?? null,
      approvalStatus: ticket.approvalStatus ?? null,
    };
  }

  private get ticketIncludes() {
    return {
      assignedTo: true,
      unit: {
        select: {
          id: true,
          name: true,
          property: { select: { id: true, name: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" as const },
        take: 1,
      },
    };
  }

  // --- 0. GET ALL TICKETS (across all properties) ---
  public async getAllTickets(): Promise<TicketListResponseDto[]> {
    const tickets = await prisma.maintenanceRequest.findMany({
      orderBy: { createdAt: "desc" },
      include: this.ticketIncludes,
    });

    const now = new Date();
    return tickets.map((t) => this.mapTicket(t, now));
  }

  // --- 1. GET ALL TICKETS FOR A PROPERTY ---
  public async getPropertyTickets(
    propertyId: string,
  ): Promise<TicketListResponseDto[]> {
    const tickets = await prisma.maintenanceRequest.findMany({
      where: { unit: { propertyId } },
      orderBy: { createdAt: "desc" },
      include: this.ticketIncludes,
    });

    const now = new Date();
    return tickets.map((t) => this.mapTicket(t, now));
  }

  // --- 2. GET SINGLE TICKET DETAILS (FOR THE MODAL) ---
  public async getTicketDetails(
    ticketId: string,
  ): Promise<TicketDetailResponseDto> {
    const ticket = await prisma.maintenanceRequest.findUnique({
      where: { id: ticketId },
      include: {
        tenant: {
          select: { userFullName: true, userPhone: true },
        },
        unit: {
          select: {
            id: true,
            name: true,
            property: { select: { id: true, name: true } },
          },
        },
        messages: {
          include: { sender: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!ticket) throw new Error("Ticket not found");

    const messages = ticket.messages;

    // Build timeline
    const timeline: { event: string; timestamp: Date }[] = [
      { event: "Ticket submitted", timestamp: ticket.createdAt },
    ];

    for (const msg of messages) {
      const isSystem = msg.message.startsWith("System:");
      timeline.push({
        event: isSystem
          ? msg.message.replace("System: ", "")
          : `Response from ${msg.sender.userFullName || "Unknown User"}`,
        timestamp: msg.createdAt,
      });
    }

    // Response metrics
    const firstMessage = messages[0];
    const timeToFirstResponseMinutes = firstMessage
      ? Math.round(
          (firstMessage.createdAt.getTime() - ticket.createdAt.getTime()) /
            60000,
        )
      : null;

    const resolutionMessage = messages.find(
      (msg) =>
        msg.message.startsWith("System:") &&
        (msg.message.includes("RESOLVED") || msg.message.includes("FIXED")),
    );
    const timeToResolutionMinutes = resolutionMessage
      ? Math.round(
          (resolutionMessage.createdAt.getTime() - ticket.createdAt.getTime()) /
            60000,
        )
      : null;

    return {
      id: ticket.id,
      subject: ticket.subject || "No Subject provided",
      dateSubmitted: ticket.createdAt,
      status: ticket.status,
      category: ticket.category,
      description: ticket.description,
      images: ticket.attachments || [],

      unit: ticket.unit ? { id: ticket.unit.id, name: ticket.unit.name } : null,
      property: ticket.unit?.property
        ? { id: ticket.unit.property.id, name: ticket.unit.property.name }
        : null,
      tenant: ticket.tenant
        ? { name: ticket.tenant.userFullName, phone: ticket.tenant.userPhone }
        : null,

      activity: messages.map((msg) => ({
        id: msg.id,
        senderName: msg.sender.userFullName || "Unknown User",
        message: msg.message,
        timestamp: msg.createdAt,
        isSystemMessage: msg.message.startsWith("System:"),
      })),

      responseMetrics: {
        timeToFirstResponseMinutes,
        timeToResolutionMinutes,
      },

      timeline,

      budget: ticket.budget ?? null,
      quotedCost: ticket.quotedCost ?? null,
      approvalStatus: ticket.approvalStatus ?? null,
      rebuttalNote: ticket.rebuttalNote ?? null,
    };
  }

  // --- 3. ADD COMMENT TO TICKET ---
  public async addComment(ticketId: string, data: AddCommentDto) {
    // 1. Verify ticket exists
    const ticket = await prisma.maintenanceRequest.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new Error("Ticket not found");

    // 2. Add the message
    return await prisma.maintenanceMessage.create({
      data: {
        ticketId: ticketId,
        senderId: data.senderId,
        message: data.message,
        attachments: [],
      },
    });
  }

  // --- 4. UPDATE TICKET STATUS ---
  public async updateStatus(ticketId: string, data: UpdateTicketStatusDto) {
    const ticket = await prisma.maintenanceRequest.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new Error("Ticket not found");

    const updatedTicket = await prisma.maintenanceRequest.update({
      where: { id: ticketId },
      data: { status: data.status },
    });

    await prisma.maintenanceMessage.create({
      data: {
        ticketId,
        senderId: data.adminId,
        message: `System: Status updated to ${data.status}`,
        attachments: [],
      },
    });

    return updatedTicket;
  }

  // --- 5. SET BUDGET ---
  public async setBudget(ticketId: string, data: SetBudgetDto) {
    const ticket = await prisma.maintenanceRequest.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new Error("Ticket not found");

    const needsApproval =
      data.quotedCost != null && data.quotedCost > data.budget;

    return await prisma.maintenanceRequest.update({
      where: { id: ticketId },
      data: {
        budget: data.budget,
        ...(data.quotedCost != null && { quotedCost: data.quotedCost }),
        ...(needsApproval && { approvalStatus: "PENDING_APPROVAL" }),
      },
    });
  }

  // --- 6. APPROVE TICKET ---
  public async approveTicket(ticketId: string, adminId: string) {
    const ticket = await prisma.maintenanceRequest.findUnique({
      where: { id: ticketId },
      include: {
        tenant: { select: { userEmail: true, userFullName: true } },
      },
    });
    if (!ticket) throw new Error("Ticket not found");

    const updated = await prisma.maintenanceRequest.update({
      where: { id: ticketId },
      data: { approvalStatus: "APPROVED" },
    });

    await prisma.maintenanceMessage.create({
      data: {
        ticketId,
        senderId: adminId,
        message: `System: Request approved${ticket.budget != null ? ` with a budget of ₦${ticket.budget.toLocaleString()}` : ""}`,
        attachments: [],
      },
    });

    if (ticket.tenant) {
      const { subject, html } = ticketApprovedEmail(
        ticket.tenant.userFullName ?? "there",
        ticket.subject ?? "Maintenance Request",
        ticket.budget,
      );
      this.emailService.sendEmail(
        { email: ticket.tenant.userEmail, name: ticket.tenant.userFullName ?? undefined },
        subject,
        html,
      );
    }

    return updated;
  }

  // --- 7. REJECT TICKET ---
  public async rejectTicket(
    ticketId: string,
    adminId: string,
    data: RejectTicketDto,
  ) {
    const ticket = await prisma.maintenanceRequest.findUnique({
      where: { id: ticketId },
      include: {
        tenant: { select: { userEmail: true, userFullName: true } },
      },
    });
    if (!ticket) throw new Error("Ticket not found");

    const updated = await prisma.maintenanceRequest.update({
      where: { id: ticketId },
      data: { approvalStatus: "REJECTED", rebuttalNote: data.reason },
    });

    await prisma.maintenanceMessage.create({
      data: {
        ticketId,
        senderId: adminId,
        message: `System: Request rejected — ${data.reason}`,
        attachments: [],
      },
    });

    if (ticket.tenant) {
      const { subject, html } = ticketRejectedEmail(
        ticket.tenant.userFullName ?? "there",
        ticket.subject ?? "Maintenance Request",
        data.reason,
      );
      this.emailService.sendEmail(
        { email: ticket.tenant.userEmail, name: ticket.tenant.userFullName ?? undefined },
        subject,
        html,
      );
    }

    return updated;
  }

  // --- 8. SEND REBUTTAL ---
  public async sendRebuttal(
    ticketId: string,
    adminId: string,
    data: RebuttalDto,
  ) {
    const ticket = await prisma.maintenanceRequest.findUnique({
      where: { id: ticketId },
      include: {
        tenant: { select: { userEmail: true, userFullName: true } },
      },
    });
    if (!ticket) throw new Error("Ticket not found");

    const updated = await prisma.maintenanceRequest.update({
      where: { id: ticketId },
      data: {
        approvalStatus: "REBUTTAL_SENT",
        rebuttalNote: data.message,
      },
    });

    await prisma.maintenanceMessage.create({
      data: {
        ticketId,
        senderId: adminId,
        message: `System: Rebuttal sent — ${data.message}${data.suggestedAmount != null ? ` (suggested: ₦${data.suggestedAmount.toLocaleString()})` : ""}`,
        attachments: [],
      },
    });

    if (ticket.tenant) {
      const { subject, html } = ticketRebuttalEmail(
        ticket.tenant.userFullName ?? "there",
        ticket.subject ?? "Maintenance Request",
        data.message,
        data.suggestedAmount,
      );
      this.emailService.sendEmail(
        { email: ticket.tenant.userEmail, name: ticket.tenant.userFullName ?? undefined },
        subject,
        html,
      );
    }

    return updated;
  }
}
