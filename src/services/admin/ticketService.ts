import { PrismaClient, MaintenanceStatus } from "@prisma/client";
import {
  AddCommentDto,
  TicketDetailResponseDto,
  TicketListResponseDto,
  UpdateTicketStatusDto,
} from "../../dtos/admin/ticket.dto";

const prisma = new PrismaClient();

export class AdminTicketService {
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

    // Automatically add a system message to the chat log
    await prisma.maintenanceMessage.create({
      data: {
        ticketId: ticketId,
        senderId: data.adminId,
        message: `System: Status updated to ${data.status}`,
        attachments: [],
      },
    });

    return updatedTicket;
  }
}
