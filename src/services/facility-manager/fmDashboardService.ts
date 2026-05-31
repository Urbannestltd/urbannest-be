import { prisma } from "../../config/prisma";

export class FmDashboardService {
  private scopedProperty(userId: string) {
    return { facilityManagerId: userId, isDeleted: false };
  }

  public async getSummary(userId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const propertyScope = this.scopedProperty(userId);

    const [
      propertiesManaged,
      openTickets,
      pendingBudgetApprovals,
      todayVisitorCount,
    ] = await Promise.all([
      prisma.property.count({ where: propertyScope }),

      prisma.maintenanceRequest.count({
        where: {
          unit: { property: propertyScope },
          status: { notIn: ["RESOLVED", "FIXED", "CANCELLED"] },
        },
      }),

      prisma.maintenanceRequest.count({
        where: {
          unit: { property: propertyScope },
          approvalStatus: "PENDING_APPROVAL",
        },
      }),

      prisma.visitorInvite.count({
        where: {
          unit: { property: propertyScope },
          validFrom: { lte: todayEnd },
          validUntil: { gte: todayStart },
        },
      }),
    ]);

    return { propertiesManaged, openTickets, pendingBudgetApprovals, todayVisitorCount };
  }

  public async getRecentTickets(userId: string) {
    const propertyScope = this.scopedProperty(userId);

    const tickets = await prisma.maintenanceRequest.findMany({
      where: {
        unit: { property: propertyScope },
        status: { notIn: ["RESOLVED", "FIXED", "CANCELLED"] },
      },
      include: {
        unit: {
          select: {
            name: true,
            property: { select: { id: true, name: true, address: true } },
          },
        },
        tenant: { select: { userId: true, userFullName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return tickets.map((t) => ({
      id: t.id,
      subject: t.subject ?? t.description,
      propertyId: t.unit.property.id,
      propertyName: t.unit.property.name ?? t.unit.property.address,
      unitName: t.unit.name,
      tenantName: t.tenant.userFullName ?? "Unknown",
      category: t.category,
      priority: t.priority,
      status: t.status,
      createdAt: t.createdAt,
    }));
  }

  public async getTodaysVisitors(userId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const propertyScope = this.scopedProperty(userId);

    const visitors = await prisma.visitorInvite.findMany({
      where: {
        unit: { property: propertyScope },
        validFrom: { lte: todayEnd },
        validUntil: { gte: todayStart },
      },
      include: {
        unit: {
          select: {
            name: true,
            property: { select: { id: true, name: true, address: true } },
          },
        },
        tenant: { select: { userFullName: true } },
      },
      orderBy: { validFrom: "asc" },
    });

    return visitors.map((v) => ({
      id: v.id,
      visitorName: v.visitorName,
      propertyId: v.unit.property.id,
      propertyName: v.unit.property.name ?? v.unit.property.address,
      unitName: v.unit.name,
      tenantName: v.tenant.userFullName ?? "Unknown",
      validFrom: v.validFrom,
      validUntil: v.validUntil,
      type: v.type,
      isWalkIn: v.isWalkIn,
      status: v.status,
      checkedInAt: v.checkedInAt,
    }));
  }
}
