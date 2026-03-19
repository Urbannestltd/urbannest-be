import { PrismaClient, MaintenanceStatus } from "@prisma/client";
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

    return {
      id: ticket.id,
      subject: ticket.subject || "No Subject provided",
      dateSubmitted: ticket.createdAt,
      status: ticket.status,
      category: ticket.category,
      description: ticket.description,
      images: ticket.attachments || [],

      activity: ticket.messages.map((msg) => ({
        id: msg.id,
        senderName: msg.sender.userFullName || "Unknown User",
        message: msg.message,
        timestamp: msg.createdAt,
        isSystemMessage: false, // You could add logic here later if you create system-generated messages
      })),
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

    // Optional but highly recommended: Automatically add a system message to the chat log!
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
