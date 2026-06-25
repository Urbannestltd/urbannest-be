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
    // Fetch tenant with all their leases for this landlord's properties
    const tenant = await prisma.user.findUnique({
      where: { userId: tenantId },
      select: {
        userId: true,
        userFullName: true,
        userEmail: true,
        userPhone: true,
        leases: {
          where: {
            unit: {
              property: { landlordId, isDeleted: false },
            },
          },
          select: {
            id: true,
            status: true,
            rentAmount: true,
            startDate: true,
            endDate: true,
            unit: {
              select: {
                id: true,
                name: true,
                propertyId: true,
                property: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!tenant || tenant.leases.length === 0) {
      throw new NotFoundError("Tenant not found or has no leases with your properties");
    }

    return {
      tenantId: tenant.userId,
      tenantName: tenant.userFullName,
      tenantEmail: tenant.userEmail,
      tenantPhone: tenant.userPhone,
      leases: tenant.leases.map((l) => ({
        leaseId: l.id,
        propertyId: l.unit.propertyId,
        propertyName: l.unit.property.name,
        unitId: l.unit.id,
        unitName: l.unit.name,
        leaseStatus: l.status,
        rentAmount: l.rentAmount,
        leaseStartDate: l.startDate,
        leaseEndDate: l.endDate,
      })),
    };
  }
}
