import { randomUUID } from "crypto";
import { prisma } from "../config/prisma";
import { CreateSupportRequest, AddSupportMessageRequest } from "../dtos/support.dto";
import { NotFoundError } from "../utils/apiError";
import { assertOwned } from "../utils/ownership";
import { SupportCategory, SupportPriority, SupportStatus } from "@prisma/client";
import { ZeptoMailService } from "./external/zeptoMailService";
import { supportNewTicketEmail, supportReplyEmail } from "../config/emailTemplates";

const SUPPORT_INBOX = "kctconsultingltd@gmail.com";
const RESOLUTION_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class SupportService {
  private emailService = new ZeptoMailService();

  /**
   * 1. CREATE TICKET
   * Available to any authenticated user (tenant, agent, landlord, facility manager, etc).
   * userId and role are sourced from the caller's JWT, never from the request body.
   */
  public async createTicket(
    userId: string,
    role: string,
    params: CreateSupportRequest,
  ) {
    const submitter = await prisma.user.findUnique({
      where: { userId },
      select: { userId: true, userFullName: true, userEmail: true, userPhone: true },
    });
    if (!submitter) throw new NotFoundError("User not found");

    const resolutionToken = randomUUID();
    const resolutionExpiresAt = new Date(Date.now() + RESOLUTION_TOKEN_TTL_MS);

    const ticket = await prisma.supportTicket.create({
      data: {
        userId,
        category: params.category as SupportCategory,
        subject: params.subject,
        priority: params.priority as SupportPriority,
        status: SupportStatus.OPEN,
        resolutionToken,
        resolutionExpiresAt,
        // Create the first message automatically
        messages: {
          create: {
            senderId: userId,
            message: params.message,
            attachments: params.attachments || [],
          },
        },
      },
    });

    const relatedProperty = await this.resolveRelatedProperty(userId);

    const baseUrl = process.env.API_BASE_URL ?? "http://localhost:3000";
    const resolveUrl = `${baseUrl}/support-ticket/resolve?token=${resolutionToken}`;

    const ticketShortCode = ticket.id.substring(0, 8).toUpperCase();
    const newTicket = supportNewTicketEmail({
      ticketId: ticket.id,
      ticketShortCode,
      userFullName: submitter.userFullName ?? "Unknown",
      userRole: role,
      userEmail: submitter.userEmail,
      userPhone: submitter.userPhone,
      category: params.category,
      relatedProperty,
      submittedAt: ticket.createdAt,
      subject: params.subject,
      message: params.message,
      attachments: params.attachments,
      resolveUrl,
    });

    await this.emailService.sendEmail(
      { email: SUPPORT_INBOX, name: "Urbannest Support" },
      newTicket.subject,
      newTicket.html,
    );

    return ticket;
  }

  /**
   * 2. SEND REPLY (ticket owner OR staff)
   */
  public async replyToTicket(
    ticketId: string,
    senderId: string,
    senderRole: string,
    params: AddSupportMessageRequest,
  ) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: { submitter: true },
    });

    // 404 (not 403) so a guessed ticketId can't be used to confirm another
    // user's ticket exists. Owner or staff (ADMIN) may reply.
    assertOwned(
      ticket,
      (t) => t.userId === senderId || senderRole === "ADMIN",
      "Ticket not found",
    );

    const msg = await prisma.supportMessage.create({
      data: {
        ticketId,
        senderId,
        message: params.message,
        attachments: params.attachments || [],
      },
      include: { sender: true },
    });

    if (senderId !== ticket.userId) {
      // Staff replied -> Notify the ticket submitter
      const reply = supportReplyEmail(
        ticket.submitter.userFullName || "there",
        ticket.subject ?? "",
        params.message.substring(0, 50),
      );
      await this.emailService.sendEmail(
        {
          email: ticket.submitter.userEmail,
          name: ticket.submitter.userFullName ?? undefined,
        },
        reply.subject,
        reply.html,
      );
    }

    return msg;
  }

  /**
   * 3. LIST MY TICKETS
   * All tickets submitted by the calling user, most recent first.
   */
  public async listMyTickets(userId: string) {
    return prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
  }

  /**
   * 4. GET HISTORY (ticket owner OR staff)
   */
  public async getTicketDetails(ticketId: string, requesterId: string, requesterRole: string) {
    const ticket = await prisma.supportTicket.findUnique({
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

    // 404 (not 403) so a guessed ticketId can't be used to confirm another
    // user's ticket exists. Owner or staff (ADMIN) may view it.
    assertOwned(
      ticket,
      (t) => t.userId === requesterId || requesterRole === "ADMIN",
      "Ticket not found",
    );

    return ticket;
  }

  /**
   * Best-effort lookup of a property to surface in the staff notification.
   * Tenants resolve via their active lease; landlords/facility managers/agents
   * resolve via their directly assigned properties.
   */
  private async resolveRelatedProperty(userId: string): Promise<string | null> {
    const lease = await prisma.lease.findFirst({
      where: { tenantId: userId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: { unit: { include: { property: true } } },
    });
    if (lease?.unit) {
      const propertyLabel = lease.unit.property.name ?? lease.unit.property.address;
      return `${propertyLabel} – Unit ${lease.unit.name}`;
    }

    const property = await prisma.property.findFirst({
      where: {
        OR: [{ landlordId: userId }, { facilityManagerId: userId }, { agentId: userId }],
      },
    });
    if (property) return property.name ?? property.address;

    return null;
  }
}
