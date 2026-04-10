import { PrismaClient, MaintenanceStatus } from "@prisma/client";
import { logActivity } from "../../utils/activityLogger";
import {
  AddCommentDto,
  TicketDetailResponseDto,
  TicketListResponseDto,
  UpdateTicketStatusDto,
} from "../../dtos/admin/ticket.dto";

const prisma = new PrismaClient();

export class AdminTicketService {
  // --- 1. GET ALL TICKETS FOR A PROPERTY ---
  public async getPropertyTickets(
    propertyId: string,
  ): Promise<TicketListResponseDto[]> {
    const tickets = await prisma.maintenanceRequest.findMany({
      where: {
        unit: { propertyId: propertyId },
      },
      orderBy: { createdAt: "desc" },
    });

    return tickets.map((ticket) => ({
      id: ticket.id,
      subject: ticket.subject || "No Subject provided",
      category: ticket.category,
      dateSubmitted: ticket.createdAt,
      status: ticket.status,
    }));
  }

  // --- 2. GET SINGLE TICKET DETAILS (FOR THE MODAL) ---
  public async getTicketDetails(
    ticketId: string,
  ): Promise<TicketDetailResponseDto> {
    const ticket = await prisma.maintenanceRequest.findUnique({
      where: { id: ticketId },
      include: {
        messages: {
          include: { sender: true },
          orderBy: { createdAt: "asc" }, // Oldest to newest for chat flow
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
        event: isSystem ? msg.message.replace("System: ", "") : `Response from ${msg.sender.userFullName || "Unknown User"}`,
        timestamp: msg.createdAt,
      });
    }

    // Response metrics
    const firstMessage = messages[0];
    const timeToFirstResponseMinutes = firstMessage
      ? Math.round((firstMessage.createdAt.getTime() - ticket.createdAt.getTime()) / 60000)
      : null;

    const resolutionMessage = messages.find(
      (msg) => msg.message.startsWith("System:") && (msg.message.includes("RESOLVED") || msg.message.includes("FIXED")),
    );
    const timeToResolutionMinutes = resolutionMessage
      ? Math.round((resolutionMessage.createdAt.getTime() - ticket.createdAt.getTime()) / 60000)
      : null;

    return {
      id: ticket.id,
      subject: ticket.subject || "No Subject provided",
      dateSubmitted: ticket.createdAt,
      status: ticket.status,
      category: ticket.category,
      description: ticket.description,
      images: ticket.attachments || [],

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

    await logActivity({
      userId: data.adminId,
      action: "TICKET_STATUS_UPDATED",
      description: `Ticket ${ticketId} status changed to ${data.status}`,
      metadata: { ticketId, status: data.status },
    });

    return updatedTicket;
  }
}
