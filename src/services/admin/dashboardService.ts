import { prisma } from "../../config/prisma";
import {
  DashboardMetricsDto,
  TenantStatusDto,
  PropertyOverviewItemDto,
  PropertyOverviewResponseDto,
} from "../../dtos/admin/dashboard.dto";

export class AdminDashboardService {
  public async getDashboardMetrics(): Promise<DashboardMetricsDto> {
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);

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

    // 5. Maintenance Chart (Grouped by month for the current year)
    // Note: We fetch the year's data and group in JS for cross-database compatibility
    const yearMaintenance = await prisma.maintenanceRequest.findMany({
      where: { createdAt: { gte: startOfYear } },
      select: { createdAt: true },
    });

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const maintenanceChart = monthNames.map((month) => ({ month, count: 0 }));

    yearMaintenance.forEach((req) => {
      const monthIndex = req.createdAt.getMonth();

      if (maintenanceChart[monthIndex]) {
        maintenanceChart[monthIndex].count += 1;
      }
    });

    return {
      totalProperties,
      totalTenants,
      defaultingTenants,
      revenue: {
        expectedIncome: expectedIncomeResult._sum.rentAmount || 0,
        amountCollected: collectedIncomeResult._sum.amount || 0,
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
          defaulting: defaultingLeases,
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
  public async getTenantStatuses(): Promise<TenantStatusDto[]> {
    // Fetch tenants with their active leases and checking for overdue payments
    const tenants = await prisma.user.findMany({
      where: {
        userRole: { roleName: "TENANT" },
        leases: { some: { status: "ACTIVE" } },
      },
      include: {
        leases: {
          where: { status: "ACTIVE" },
          include: {
            unit: {
              include: { property: true },
            },
          },
        },
        payments: {
          where: { status: "OVERDUE" },
          select: { id: true }, // We only need to know if any exist
        },
      },
    });

    return tenants.map((tenant) => {
      const activeLease = tenant.leases[0]; // Assuming 1 active lease per tenant
      const unit = activeLease?.unit;
      const property = unit?.property;

      // Calculate Lease Duration (e.g., "5 years" or "6 months")
      let leaseDuration = "Unknown";
      if (activeLease) {
        const start = new Date(activeLease.startDate);
        const end = new Date(activeLease.endDate);
        const diffInMonths =
          (end.getFullYear() - start.getFullYear()) * 12 +
          (end.getMonth() - start.getMonth());

        if (diffInMonths >= 12) {
          const years = Math.round(diffInMonths / 12);
          leaseDuration = `${years} year${years > 1 ? "s" : ""}`;
        } else {
          leaseDuration = `${diffInMonths} month${diffInMonths > 1 ? "s" : ""}`;
        }
      }

      // Construct Address (e.g., "Unit 4B, The Wings Court, Lagos")
      const address =
        unit && property
          ? `${unit.name}, ${property.name || property.address}, ${property.city}`
          : "No Address Assigned";

      // Determine Status (If they have any overdue payments, they are defaulting)
      const isDefaulting = tenant.payments.length > 0;

      return {
        id: tenant.userId,
        name: tenant.userFullName || "Unknown Tenant",
        photoUrl: tenant.userProfileUrl,
        phone: tenant.userPhone,
        address,
        leaseDuration: `Lease: ${leaseDuration}`,
        status: isDefaulting ? "DEFAULTING" : "ACTIVE",
      };
    });
  }
}
