import { prisma } from "../../config/prisma";
import {
  DashboardMetricsDto,
  TenantStatusDto,
  TenantStatusesResponseDto,
  PropertyOverviewItemDto,
  PropertyOverviewResponseDto,
} from "../../dtos/admin/dashboard.dto";

export class AdminDashboardService {
  public async getDashboardMetrics(): Promise<DashboardMetricsDto> {
    // 1. Total Properties
    const totalProperties = await prisma.property.count({
      where: { isDeleted: false },
    });

    // 2. Total Tenants (Users with an active lease)
    const totalTenants = await prisma.user.count({
      where: {
        userRole: { roleName: "TENANT" },
        leases: { some: { status: "ACTIVE" } },
      },
    });

    // 3. Defaulting Tenants (Tenants with an OVERDUE payment)
    const defaultingTenants = await prisma.user.count({
      where: {
        userRole: { roleName: "TENANT" },
        payments: { some: { status: "OVERDUE" } },
      },
    });

    // 4. Revenue (Expected vs Collected)
    // Expected: Sum of all active lease rent amounts
    const expectedIncomeResult = await prisma.lease.aggregate({
      _sum: { rentAmount: true },
      where: { status: "ACTIVE" },
    });

    // Collected: Sum of all PAID rent payments
    const collectedIncomeResult = await prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: "PAID", type: "RENT" },
    });

    // 5. Maintenance Chart — requests per property
    const propertiesWithRequests = await prisma.property.findMany({
      where: { isDeleted: false },
      select: {
        name: true,
        address: true,
        units: {
          select: {
            _count: { select: { maintenanceRequests: true } },
          },
        },
      },
    });

    const maintenanceChart = propertiesWithRequests.map((p) => ({
      property: p.name ?? p.address,
      count: p.units.reduce((sum, u) => sum + u._count.maintenanceRequests, 0),
    }));

    return {
      totalProperties,
      totalTenants,
      defaultingTenants,
      revenue: {
        expectedIncome: expectedIncomeResult._sum.rentAmount || 0,
        amountCollected: collectedIncomeResult._sum.amount || 0,
        collectedPercent: expectedIncomeResult._sum.rentAmount
          ? Math.round(((collectedIncomeResult._sum.amount ?? 0) / expectedIncomeResult._sum.rentAmount) * 100)
          : 0,
      },
      maintenanceChart,
    };
  }

  // --- 2. GET PROPERTY OVERVIEW TABLE ---
  public async getPropertyOverview(): Promise<PropertyOverviewResponseDto> {
    const properties = await prisma.property.findMany({
      where: { isDeleted: false },
      include: {
        facilityManager: {
          select: { userId: true, userFullName: true, userProfileUrl: true },
        },
        landlord: {
          select: { userId: true, userFullName: true, userProfileUrl: true },
        },
        units: {
          where: { status: { not: "DELETED" } },
          include: {
            leases: {
              where: { status: "ACTIVE" },
              select: {
                endDate: true,
                payments: {
                  where: { type: "RENT" },
                  select: { amount: true, status: true },
                },
              },
            },
            maintenanceRequests: {
              where: { status: { notIn: ["RESOLVED", "FIXED", "CANCELLED"] } },
              select: { priority: true },
            },
            _count: {
              select: { maintenanceRequests: true },
            },
          },
        },
      },
    });

    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const mapped: PropertyOverviewItemDto[] = properties.map((property) => {
      // Column 1: Property name
      const propertyName = property.name ?? property.address;

      // Column 2: Occupancy %
      const totalUnits = property.units.length;
      const occupiedUnits = property.units.filter(
        (u) => u.leases.length > 0,
      ).length;
      const occupancyPercent =
        totalUnits === 0 ? 0 : Math.round((occupiedUnits / totalUnits) * 100);

      // Column 3: Tenant summary + Column 4: Arrears
      // A lease is "defaulting" if it has at least one OVERDUE rent payment
      let activeTenants = 0;
      let defaultingLeases = 0;
      let arrears = 0;

      property.units.forEach((unit) => {
        unit.leases.forEach((lease) => {
          activeTenants += 1;
          const hasOverdue = lease.payments.some((p) => p.status === "OVERDUE");
          if (hasOverdue) defaultingLeases += 1;
          lease.payments.forEach((payment) => {
            if (payment.status === "OVERDUE") arrears += payment.amount;
          });
        });
      });

      // Column 5: Open maintenance + % of total
      const openMaintenance = property.units.reduce(
        (sum, u) => sum + u.maintenanceRequests.length,
        0,
      );
      const totalMaintenance = property.units.reduce(
        (sum, u) => sum + u._count.maintenanceRequests,
        0,
      );
      const openMaintenancePercent =
        totalMaintenance === 0
          ? 0
          : Math.round((openMaintenance / totalMaintenance) * 100);

      // Column 6: FM assigned
      const facilityManager = property.facilityManager
        ? {
            id: property.facilityManager.userId,
            name: property.facilityManager.userFullName ?? "Unknown",
            photoUrl: property.facilityManager.userProfileUrl,
          }
        : null;

      const landlord = property.landlord
        ? {
            id: property.landlord.userId,
            name: property.landlord.userFullName ?? "Unknown",
            photoUrl: property.landlord.userProfileUrl,
          }
        : null;

      // Column 7: Alerts
      const alerts: string[] = [];

      const hasEmergency = property.units.some((u) =>
        u.maintenanceRequests.some((r) => r.priority === "EMERGENCY"),
      );
      if (hasEmergency) alerts.push("Emergency maintenance");

      const hasExpiringLease = property.units.some((u) =>
        u.leases.some((l) => new Date(l.endDate) <= thirtyDaysFromNow),
      );
      if (hasExpiringLease) alerts.push("Lease expiring soon");

      if (arrears > 0) alerts.push("High arrears");

      return {
        propertyId: property.id,
        propertyName,
        occupancyPercent,
        propertyImages: property.images,
        dateListed: property.createdAt,
        tenantSummary: {
          active: activeTenants - defaultingLeases,
          expired: defaultingLeases,
        },
        arrears,
        openMaintenance,
        openMaintenancePercent,
        facilityManager,
        landlord,
        alerts,
      };
    });

    return {
      properties: mapped,
      totalProperties: properties.length,
    };
  }

  // --- 3. GET TENANT STATUS LIST ---
  public async getTenantStatuses(): Promise<TenantStatusesResponseDto> {
    const tenantIncludes = {
      leases: {
        where: { status: "ACTIVE" as const },
        include: { unit: { include: { property: true } } },
      },
      payments: {
        where: { status: "OVERDUE" as const },
        select: { id: true },
      },
    };

    const [expiredTenants, latestTenants] = await Promise.all([
      // All tenants with at least one OVERDUE payment
      prisma.user.findMany({
        where: {
          userRole: { roleName: "TENANT" },
          leases: { some: { status: "ACTIVE" } },
          payments: { some: { status: "OVERDUE" } },
        },
        include: tenantIncludes,
      }),
      // 5 most recently added tenants with an active lease
      prisma.user.findMany({
        where: {
          userRole: { roleName: "TENANT" },
          leases: { some: { status: "ACTIVE" } },
        },
        orderBy: { userCreatedAt: "desc" },
        take: 5,
        include: tenantIncludes,
      }),
    ]);

    const mapTenant = (tenant: any): TenantStatusDto => {
      const activeLease = tenant.leases[0];
      const unit = activeLease?.unit;
      const property = unit?.property;

      let leaseDuration = "Unknown";
      if (activeLease) {
        const diffInMonths =
          (new Date(activeLease.endDate).getFullYear() - new Date(activeLease.startDate).getFullYear()) * 12 +
          (new Date(activeLease.endDate).getMonth() - new Date(activeLease.startDate).getMonth());
        if (diffInMonths >= 12) {
          const years = Math.round(diffInMonths / 12);
          leaseDuration = `${years} year${years > 1 ? "s" : ""}`;
        } else {
          leaseDuration = `${diffInMonths} month${diffInMonths > 1 ? "s" : ""}`;
        }
      }

      const address = unit && property
        ? `${unit.name}, ${property.name || property.address}, ${property.city}`
        : "No Address Assigned";

      return {
        id: tenant.userId,
        name: tenant.userFullName || "Unknown Tenant",
        photoUrl: tenant.userProfileUrl,
        phone: tenant.userPhone,
        propertyName: property?.name ?? "Unassigned",
        unitName: unit?.name ?? "Unassigned",
        propertyImages: property?.images,
        unitId: unit?.id,
        propertyId: property?.id,
        address,
        leaseDuration: `Lease: ${leaseDuration}`,
        status: tenant.payments.length > 0 ? "EXPIRED" : "ACTIVE",
      };
    };

    return {
      expired: expiredTenants.map(mapTenant),
      latest: latestTenants.map(mapTenant),
    };
  }
}
