import { prisma } from "../../config/prisma";
import {
  DashboardMetricsDto,
  TenantStatusDto,
} from "../../dtos/admin/dashboard.dto";

export class AdminDashboardService {
  public async getDashboardMetrics(): Promise<DashboardMetricsDto> {
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);

    // 1. Total Properties
    const totalProperties = await prisma.property.count();

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

  // --- 2. GET TENANT STATUS LIST ---
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
