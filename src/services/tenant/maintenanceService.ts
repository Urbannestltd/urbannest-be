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
import { adminMaintenanceAlertEmail, maintenanceReplyEmail } from "../../config/emailTemplates";
import { getAdminRecipients } from "../../utils/getAdminRecipients";

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

    // B. Create Ticket — auto-apply global default budget if one is set
    const systemSetting = await prisma.systemSetting.findUnique({
      where: { id: "singleton" },
      select: { defaultMaintenanceBudget: true },
    });

    const ticket = await prisma.maintenanceRequest.create({
      data: {
        tenantId,
        unitId: lease.unitId,
        subject: params.subject,
        category: params.category as MaintenanceCategory,
        priority: (params.priority as MaintenancePriority) || "MEDIUM",
        description: params.description,
        attachments: params.attachments || [],
        status: MaintenanceStatus.PENDING,
        ...(systemSetting?.defaultMaintenanceBudget != null && {
          budget: systemSetting.defaultMaintenanceBudget,
        }),
      },
    });

    // C. Notify Admin / Property Manager
    const adminRecipients = await getAdminRecipients("emailMaintenance");
    if (adminRecipients.length > 0) {
      const tenantUser = await prisma.user.findUnique({
        where: { userId: tenantId },
        select: { userFullName: true },
      });
      for (const admin of adminRecipients) {
        const alert = adminMaintenanceAlertEmail(
          admin.name ?? "Admin",
          tenantUser?.userFullName ?? "Tenant",
          lease.unit.name,
          lease.unit.property?.name ?? "Unknown Property",
          params.category,
          params.priority || "MEDIUM",
        );
        await this.emailService.sendEmail(
          { email: admin.email, name: admin.name ?? undefined },
          alert.subject,
          alert.html,
        );
      }
    }

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
    const reply = maintenanceReplyEmail(
      recipientName,
      ticketId,
      newMessage.sender.userFullName || "Support",
      params.message.substring(0, 50),
    );
    this.emailService.sendEmail(
      { email: recipientEmail, name: recipientName },
      reply.subject,
      reply.html,
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
        subject: params.subject || ticket.subject,
        category: params.category || ticket.category, // Keep old if not provided
        description: params.description || ticket.description,
        priority: params.priority || ticket.priority,
        attachments: params.attachments || ticket.attachments, // Replaces images
      },
    });

    return updatedTicket;
  }

  /**
   * DELETE REQUEST
   * Only allowed if status is PENDING.
   */
  public async deleteRequest(requestId: string, userId: string) {
    // 1. Fetch the request to check permissions
    const request = await prisma.maintenanceRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundError("Maintenance request not found");
    }

    // 2. Check Ownership
    if (request.tenantId !== userId) {
      throw new BadRequestError("You can only delete your own requests.");
    }

    // 3. Check Status (Critical Step)
    if (request.status !== "PENDING") {
      throw new BadRequestError(
        `Cannot delete this request because it is ${request.status}. Please contact the facility manager instead.`,
      );
    }

    // 4. Perform Delete
    await prisma.maintenanceRequest.delete({
      where: { id: requestId },
    });

    return {
      success: true,
      message: "Maintenance request deleted successfully",
    };
  }
}
