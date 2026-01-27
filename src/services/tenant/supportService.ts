import { prisma } from "../../config/prisma";
import {
  CreateSupportRequest,
  AddSupportMessageRequest,
} from "../../dtos/tenant/support.dto";
import { NotFoundError } from "../../utils/apiError";
import {
  SupportCategory,
  SupportPriority,
  SupportStatus,
} from "@prisma/client";
import { ZeptoMailService } from "./../external/zeptoMailService";

export class SupportService {
  private emailService = new ZeptoMailService();

  /**
   * 1. CREATE TICKET
   * Creates the ticket AND the first message in one go.
   */
  public async createTicket(tenantId: string, params: CreateSupportRequest) {
    const ticket = await prisma.supportTicket.create({
      data: {
        tenantId,
        category: params.category as SupportCategory,
        subject: params.subject,
        priority: params.priority as SupportPriority,
        status: SupportStatus.OPEN,
        // Create the first message automatically
        messages: {
          create: {
            senderId: tenantId,
            message: params.message,
            attachments: params.attachments || [],
          },
        },
      },
    });

    // Notify Admins
    await this.emailService.sendTemplateEmail(
      { email: "support@urbannest.com", name: "Support Team" },
      "SUPPORT_NEW_TICKET",
      { id: ticket.id, subject: ticket.subject, user_id: tenantId },
    );

    return ticket;
  }

  /**
   * 2. SEND REPLY (Tenant OR Admin)
   */
  public async replyToTicket(
    ticketId: string,
    senderId: string,
    params: AddSupportMessageRequest,
  ) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: { tenant: true },
    });

    if (!ticket) throw new NotFoundError("Ticket not found");

    // Create Message
    const msg = await prisma.supportMessage.create({
      data: {
        ticketId,
        senderId,
        message: params.message,
        attachments: params.attachments || [],
      },
      include: { sender: true },
    });

    // Determine Notification Recipient
    if (senderId === ticket.tenantId) {
      // Tenant replied -> Notify Admin
      // In a real app, maybe notify specific assigned admin
    } else {
      // Admin replied -> Notify Tenant
      await this.emailService.sendTemplateEmail(
        {
          email: ticket.tenant.userEmail,
          name: ticket.tenant.userFullName || "Tenant",
        },
        "SUPPORT_REPLY_RECEIVED",
        {
          ticket_subject: ticket.subject,
          reply_preview: params.message.substring(0, 50),
        },
      );
    }

    return msg;
  }

  /**
   * 3. GET HISTORY
   */
  public async getTicketDetails(ticketId: string) {
    return prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            sender: {
              select: { userId: true, userFullName: true, userRole: true },
            },
          },
        },
      },
    });
  }
}
