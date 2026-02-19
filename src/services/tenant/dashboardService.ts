import { prisma } from "../../config/prisma";
import { DashboardOverviewResponse } from "../../dtos/tenant/dashboard.dto";
import { startOfDay, endOfDay, differenceInDays, subDays } from "date-fns";

export class DashboardService {
  public async getTenantDashboard(
    userId: string,
    daysFilter: number,
  ): Promise<DashboardOverviewResponse> {
    // 1. Fetch User Details
    const user = await prisma.user.findUniqueOrThrow({
      where: { userId: userId },
      select: { userFullName: true, userProfileUrl: true },
    });

    // 2. Fetch Active Lease (For the Rent Card)
    const lease = await prisma.lease.findFirst({
      where: { tenantId: userId, status: "ACTIVE" },
      include: { unit: true },
    });

    // 3. Calculate Rent Card Metrics
    let leaseData: DashboardOverviewResponse["lease"] = {
      isActive: false,
      amount: 0,
      currency: "NGN",
      expiryDate: null,
      daysRemaining: 0,
      progressPercentage: 0,
      status: "NO_LEASE",
    };

    if (lease) {
      const now = new Date();
      const start = new Date(lease.startDate);
      const end = new Date(lease.endDate);
      const totalDuration = differenceInDays(end, start);
      const elapsed = differenceInDays(now, start);

      // Calculate Progress Bar (0% is start, 100% is expiry)
      const progress = Math.min(
        100,
        Math.max(0, (elapsed / totalDuration) * 100),
      );

      leaseData = {
        isActive: true,
        amount: Number(lease.rentAmount),
        currency: "NGN",
        expiryDate: end.toDateString(),
        daysRemaining: differenceInDays(end, now),
        progressPercentage: Math.floor(progress),
        status: differenceInDays(end, now) < 30 ? "EXPIRING_SOON" : "ACTIVE",
      };
    }

    // 4. Fetch Maintenance Stats (Active vs Total)
    const startDate = subDays(new Date(), daysFilter);

    const maintenanceCounts = await prisma.maintenanceRequest.groupBy({
      by: ["status"],
      where: {
        tenantId: userId,
        createdAt: { gte: startDate }, // Only count requests created within the timeframe
      },
      _count: { id: true },
    });

    const activeCount = maintenanceCounts
      .filter((m) => m.status === "PENDING" || m.status === "IN_PROGRESS")
      .reduce((acc, curr) => acc + curr._count.id, 0);

    const completedCount = maintenanceCounts
      .filter((m) => m.status === "RESOLVED")
      .reduce((acc, curr) => acc + curr._count.id, 0);

    // 5. Fetch "Visitors Today"
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    const visitors = await prisma.visitorInvite.findMany({
      where: {
        tenantId: userId,
        validFrom: { gte: todayStart, lte: todayEnd },
      },
      orderBy: { validFrom: "asc" },
    });

    const formattedVisitors = visitors.map((v) => ({
      id: v.id,
      name: v.visitorName,
      phone: v.visitorPhone || "-",
      status: v.status,
      accessType: v.frequency === "ONE_OFF" ? "One-off" : "Recurring",
      timeIn: v.checkedInAt
        ? new Date(v.checkedInAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : null,
      timeOut: v.checkedOutAt
        ? new Date(v.checkedOutAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : null,
    }));

    // 6. Return Aggregated Data
    return {
      user: {
        firstName: user.userFullName?.split(" ")[0] || "Tenant",
        profilePicUrl: user.userProfileUrl || null,
      },
      lease: leaseData,
      maintenance: {
        active: activeCount,
        completed: completedCount,
        total: activeCount + completedCount,
      },
      visitorsToday: {
        walkInCount: visitors.filter((v) => v.frequency === "ONE_OFF").length, // Adjust logic based on your definition of Walk-in
        scheduledCount: visitors.filter((v) => v.frequency !== "ONE_OFF")
          .length,
        list: formattedVisitors,
      },
      recentActivity: [],
    };
  }
}
