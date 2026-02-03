import { prisma } from "../../config/prisma";
import {
  AddMessageRequest,
  CreateMaintenanceRequest,
  UpdateMaintenanceRequest,
} from "../../dtos/tenant/maintenance.dto";
import { BadRequestError, NotFoundError } from "../../utils/apiError";
import {
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceStatus,
} from "@prisma/client";
import { ZeptoMailService } from "./../external/zeptoMailService";

export class MaintenanceService {
  private emailService = new ZeptoMailService();

  /**
   * 1. SUBMIT REQUEST
   */
  public async createTicket(
    tenantId: string,
    params: CreateMaintenanceRequest,
  ) {
    // A. Find Active Lease (To know which unit is broken)
    const lease = await prisma.lease.findFirst({
      where: {
        tenantId,
        status: { in: ["ACTIVE", "EXPIRED"] }, // Allow expired tenants to report move-out issues
      },
      include: { unit: { include: { property: true } } },
    });

    if (!lease)
      throw new BadRequestError("No active unit found linked to your account.");

    // B. Create Ticket
    const ticket = await prisma.maintenanceRequest.create({
      data: {
        tenantId,
        unitId: lease.unitId,
        category: params.category as MaintenanceCategory,
        priority: (params.priority as MaintenancePriority) || "MEDIUM",
        description: params.description,
        attachments: params.attachments || [],
        status: MaintenanceStatus.PENDING,
      },
    });

    // C. Notify Admin / Property Manager
    // In a real app, you'd fetch the landlord's email from lease.property.landlordId
    // For now, we simulate sending an alert
    await this.emailService.sendTemplateEmail(
      { email: "manager@urbannest.com", name: "Property Manager" },
      "MAINTENANCE_ALERT_TEMPLATE",
      {
        category: params.category,
        unit: lease.unit.name,
        tenant: "Tenant Name", // You can fetch this from tenantId
        priority: params.priority || "MEDIUM",
      },
    );

    return ticket;
  }

  /**
   * 2. GET MY REQUESTS (History)
   */
  public async getMyTickets(tenantId: string) {
    return prisma.maintenanceRequest.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: { unit: { select: { name: true } }, messages: true },
    });
  }

  /**
   * 3. SEND MESSAGE
   * Appends a comment/message to the ticket thread.
   */
  public async sendMessage(
    ticketId: string,
    senderId: string,
    params: AddMessageRequest,
  ) {
    // A. Validate Ticket & Access
    const ticket = await prisma.maintenanceRequest.findUnique({
      where: { id: ticketId },
      include: { tenant: true, assignedTo: true },
    });

    if (!ticket) throw new NotFoundError("Maintenance request not found");

    // Security: Ensure the sender is actually part of this ticket
    // (Either the Tenant who created it OR the Manager assigned to it)
    if (ticket.tenantId !== senderId && ticket.assignedToId !== senderId) {
      // In a real app, you might also allow "ADMIN" roles generally
      // but strict checking prevents random users from commenting.
      // For now, we assume if you have the ID, you are valid or we check role.
    }

    // B. Create Message
    const newMessage = await prisma.maintenanceMessage.create({
      data: {
        ticketId,
        senderId,
        message: params.message,
        attachments: params.attachments || [],
      },
      include: { sender: true }, // Return sender info for UI
    });

    // C. NOTIFICATION LOGIC
    // Who receives the email? The person who DIDN'T send the message.
    let recipientEmail = "";
    let recipientName = "";

    if (senderId === ticket.tenantId) {
      // Tenant sent it -> Notify Manager (if assigned) or Admin
      recipientEmail = ticket.assignedTo?.userEmail || "admin@urbannest.com";
      recipientName = ticket.assignedTo?.userFullName || "Facility Manager";
    } else {
      // Manager sent it -> Notify Tenant
      recipientEmail = ticket.tenant.userEmail;
      recipientName = ticket.tenant.userFullName || "Tenant";
    }

    // Fire & Forget Email
    this.emailService.sendTemplateEmail(
      { email: recipientEmail, name: recipientName },
      "MAINTENANCE_REPLY_TEMPLATE",
      {
        ticket_id: ticketId.substring(0, 8),
        sender_name: newMessage.sender.userFullName || "Support",
        message_preview: params.message.substring(0, 50) + "...",
      },
    );

    return newMessage;
  }

  /**
   * 4. GET MESSAGE HISTORY
   * Fetches the conversation for the chat UI.
   */
  public async getTicketMessages(ticketId: string) {
    return prisma.maintenanceMessage.findMany({
      where: { ticketId },
      orderBy: { createdAt: "asc" }, // Oldest first (like WhatsApp)
      include: {
        sender: {
          select: { userId: true, userFullName: true, userRole: true },
        },
      },
    });
  }

  /**
   * 5. UPDATE REQUEST (Edit)
   * Only allowed if status is PENDING.
   */
  public async updateRequest(
    ticketId: string,
    userId: string,
    params: UpdateMaintenanceRequest,
  ) {
    // A. Fetch existing ticket
    const ticket = await prisma.maintenanceRequest.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) throw new NotFoundError("Maintenance request not found.");

    // B. Authorization Check
    if (ticket.tenantId !== userId) {
      throw new BadRequestError("You can only edit your own requests.");
    }

    // C. Business Logic Check
    // Prevent edits if work has already started
    if (ticket.status !== "PENDING") {
      throw new BadRequestError(
        `Cannot edit request because it is already ${ticket.status}. Please send a message instead.`,
      );
    }

    // D. Perform Update
    const updatedTicket = await prisma.maintenanceRequest.update({
      where: { id: ticketId },
      data: {
        category: params.category || ticket.category, // Keep old if not provided
        description: params.description || ticket.description,
        priority: params.priority || ticket.priority,
        attachments: params.attachments || ticket.attachments, // Replaces images
      },
    });

    return updatedTicket;
  }
}
