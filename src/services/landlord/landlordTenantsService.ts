import { prisma } from "../../config/prisma";
import { ForbiddenError, NotFoundError } from "../../utils/apiError";
import type {
  LandlordTenantsQuery,
  LandlordTenantItem,
  LandlordTenantDetail,
} from "../../dtos/landlord/landlord.tenants.dto";

export class LandlordTenantsService {
  private async assertLandlordOwnsProperty(landlordId: string, propertyId: string) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { landlordId: true, isDeleted: true },
    });
    if (!property || property.isDeleted) throw new ForbiddenError("Property not found");
    if (property.landlordId !== landlordId)
      throw new ForbiddenError("You do not own this property");
  }

  public async getTenants(
    landlordId: string,
    query: LandlordTenantsQuery,
  ): Promise<LandlordTenantItem[]> {
    // If propertyId is specified, verify ownership
    if (query.propertyId) {
      await this.assertLandlordOwnsProperty(landlordId, query.propertyId);
    }

    const leases = await prisma.lease.findMany({
      where: {
        unit: {
          ...(query.propertyId ? { propertyId: query.propertyId } : {}),
          property: { landlordId, isDeleted: false },
          status: { not: "DELETED" },
        },
        ...(query.status ? { status: query.status as any } : {}),
        ...(query.search
          ? {
              OR: [
                { tenant: { userFullName: { contains: query.search, mode: "insensitive" } } },
                { tenant: { userEmail: { contains: query.search, mode: "insensitive" } } },
                { unit: { name: { contains: query.search, mode: "insensitive" } } },
                { unit: { property: { name: { contains: query.search, mode: "insensitive" } } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        tenant: {
          select: {
            userId: true,
            userFullName: true,
            userEmail: true,
            userPhone: true,
          },
        },
        unit: {
          select: {
            id: true,
            name: true,
            propertyId: true,
            property: { select: { name: true } },
          },
        },
        status: true,
        rentAmount: true,
        startDate: true,
        endDate: true,
      },
      orderBy: { createdAt: "desc" },
    });

    let results: LandlordTenantItem[] = leases.map((l) => ({
      leaseId: l.id,
      tenantId: l.tenant.userId,
      tenantName: l.tenant.userFullName,
      tenantEmail: l.tenant.userEmail,
      tenantPhone: l.tenant.userPhone,
      propertyId: l.unit.propertyId,
      propertyName: l.unit.property.name,
      unitId: l.unit.id,
      unitName: l.unit.name,
      leaseStatus: l.status,
      rentAmount: l.rentAmount,
      leaseStartDate: l.startDate,
      leaseEndDate: l.endDate,
    }));

    // Sorting
    switch (query.sortBy) {
      case "name_asc":
        results.sort((a, b) => (a.tenantName ?? "").localeCompare(b.tenantName ?? ""));
        break;
      case "name_desc":
        results.sort((a, b) => (b.tenantName ?? "").localeCompare(a.tenantName ?? ""));
        break;
      case "status_asc":
        results.sort((a, b) => a.leaseStatus.localeCompare(b.leaseStatus));
        break;
      case "status_desc":
        results.sort((a, b) => b.leaseStatus.localeCompare(a.leaseStatus));
        break;
      case "startDate_asc":
        results.sort((a, b) => a.leaseStartDate.getTime() - b.leaseStartDate.getTime());
        break;
      case "startDate_desc":
        results.sort((a, b) => b.leaseStartDate.getTime() - a.leaseStartDate.getTime());
        break;
    }

    return results;
  }

  public async getTenantDetail(
    landlordId: string,
    tenantId: string,
  ): Promise<LandlordTenantDetail> {
    const tenant = await prisma.user.findUnique({
      where: { userId: tenantId },
      include: {
        leases: {
          where: { unit: { property: { landlordId, isDeleted: false } } },
          include: { unit: { include: { property: true } } },
          orderBy: { startDate: "desc" },
        },
        payments: {
          where: { lease: { unit: { property: { landlordId, isDeleted: false } } } },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!tenant) {
      throw new NotFoundError("Tenant not found");
    }

    // Separate Active Lease from History
    const activeLease = tenant.leases.find((l) => l.status === "ACTIVE");
    const pastLeases = tenant.leases.filter((l) => l.status !== "ACTIVE");

    // Calculate Current Lease Specifics
    let currentLeaseData = null;
    if (activeLease) {
      const start = new Date(activeLease.startDate).getTime();
      const end = new Date(activeLease.endDate).getTime();
      const now = new Date().getTime();

      // Expiry Circle
      const totalDuration = end - start;
      const remaining = end - now;
      let percentage = totalDuration > 0 ? Math.round((remaining / totalDuration) * 100) : 0;
      percentage = Math.max(0, Math.min(100, percentage));

      // Lease Length String (e.g., "4 years")
      const diffInMonths =
        (new Date(activeLease.endDate).getFullYear() -
          new Date(activeLease.startDate).getFullYear()) *
          12 +
        (new Date(activeLease.endDate).getMonth() -
          new Date(activeLease.startDate).getMonth());
      const leaseLength =
        diffInMonths >= 12
          ? `${Math.round(diffInMonths / 12)} years`
          : `${diffInMonths} months`;

      currentLeaseData = {
        leaseId: activeLease.id,
        propertyId: activeLease.unit.propertyId,
        propertyName: activeLease.unit.property.name,
        unitId: activeLease.unitId,
        unitName: activeLease.unit.name,
        rentAmount: activeLease.rentAmount,
        serviceCharge: activeLease.serviceCharge || 0,
        leaseExpiryPercentage: `${percentage}%`,
        leaseLength,
        startDate: activeLease.startDate,
        endDate: activeLease.endDate,
        moveOutNotice: activeLease.moveOutNotice,
        agreementUrl: activeLease.documentUrl,
      };
    }

    return {
      id: tenant.userId,
      fullName: tenant.userFullName || "Unknown",
      profilePic: tenant.userProfileUrl,
      status: activeLease ? "Active Lease" : "No Active Lease",

      email: tenant.userEmail,
      phone: tenant.userPhone,
      emergencyContact: tenant.userEmergencyContact,
      dateOfBirth: tenant.dateOfBirth,
      occupation: tenant.occupation,
      employer: tenant.employer,

      currentLease: currentLeaseData,

      leaseHistory: pastLeases.map((l) => ({
        leaseId: l.id,
        propertyName: l.unit.property.name,
        unitName: l.unit.name,
        startDate: l.startDate,
        endDate: l.endDate,
        agreementUrl: l.documentUrl,
      })),

      paymentHistory: tenant.payments.map((p) => ({
        type: p.type,
        amount: p.amount,
        date: p.createdAt,
        status: p.status === "PAID" ? "Payment Successful" : p.status,
      })),
    };
  }
}
