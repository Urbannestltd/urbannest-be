import { MaintenanceCategory, MaintenancePriority, MaintenanceStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/apiError";

const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "EMERGENCY"] as const;
type Priority = (typeof VALID_PRIORITIES)[number];

export interface FmTicketFilters {
  search?: string;
  status?: string;
  propertyId?: string;
  priority?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
}

export class FmTicketsService {
  private readonly SLA = {
    EMERGENCY: { responseHours: 1,  fixHours: 4   },
    HIGH:      { responseHours: 4,  fixHours: 24  },
    MEDIUM:    { responseHours: 24, fixHours: 72  },
    LOW:       { responseHours: 72, fixHours: 168 },
  };

  private buildWhere(userId: string, filters: FmTicketFilters = {}) {
    const q = filters.search?.trim();
    return {
      // Always scope to FM's assigned properties
      unit: {
        property: {
          facilityManagerId: userId,
          isDeleted: false,
          ...(filters.propertyId && { id: filters.propertyId }),
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

  private mapTicketListItem(ticket: any, now: Date) {
    const sla = this.SLA[ticket.priority as keyof typeof this.SLA] ?? this.SLA.MEDIUM;
    const projectedFixDeadline = new Date(
      ticket.createdAt.getTime() + sla.fixHours * 60 * 60 * 1000,
    );
    const isResolved = ["RESOLVED", "FIXED", "CANCELLED"].includes(ticket.status);
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
      isFixLate,
      approvalStatus: ticket.approvalStatus ?? null,
    };
  }

  private get listIncludes() {
    return {
      unit: {
        select: {
          id: true,
          name: true,
          property: { select: { id: true, name: true } },
        },
      },
      tenant: { select: { userFullName: true } },
    };
  }

  public async getTickets(userId: string, filters: FmTicketFilters = {}) {
    const tickets = await prisma.maintenanceRequest.findMany({
      where: this.buildWhere(userId, filters),
      include: this.listIncludes,
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();
    return tickets.map((t) => this.mapTicketListItem(t, now));
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
          include: { sender: { select: { userFullName: true } } },
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

    return {
      id: ticket.id,
      subject: ticket.subject ?? "No subject provided",
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
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
        senderName: m.sender.userFullName ?? "Unknown",
        message: m.message,
        timestamp: m.createdAt,
        isSystemMessage: m.message.startsWith("System:"),
      })),
      timeline,
      responseMetrics: { timeToFirstResponseMinutes, timeToResolutionMinutes },
    };
  }

  public async setPriority(userId: string, ticketId: string, priority: string) {
    if (!VALID_PRIORITIES.includes(priority as Priority)) {
      throw new BadRequestError(
        `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(", ")}`,
      );
    }

    const ticket = await prisma.maintenanceRequest.findUnique({
      where: { id: ticketId },
      select: {
        unit: {
          select: { property: { select: { facilityManagerId: true } } },
        },
      },
    });

    if (!ticket) throw new NotFoundError("Ticket not found");
    if (ticket.unit?.property?.facilityManagerId !== userId)
      throw new ForbiddenError("You do not have access to this ticket");

    await prisma.maintenanceRequest.update({
      where: { id: ticketId },
      data: { priority: priority as Priority },
    });
  }
}
