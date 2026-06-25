import { prisma } from "../../config/prisma";
import { ForbiddenError } from "../../utils/apiError";
import type {
  LandlordUnitsQuery,
  LandlordUnitItem,
} from "../../dtos/landlord/landlord.units.dto";

export class LandlordUnitsService {
  private async assertLandlordOwnsProperty(landlordId: string, propertyId: string) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { landlordId: true, isDeleted: true },
    });
    if (!property || property.isDeleted) throw new ForbiddenError("Property not found");
    if (property.landlordId !== landlordId)
      throw new ForbiddenError("You do not own this property");
  }

  public async getUnits(
    landlordId: string,
    query: LandlordUnitsQuery,
  ): Promise<LandlordUnitItem[]> {
    // If propertyId is specified, verify ownership
    if (query.propertyId) {
      await this.assertLandlordOwnsProperty(landlordId, query.propertyId);
    }

    const units = await prisma.unit.findMany({
      where: {
        ...(query.propertyId ? { propertyId: query.propertyId } : {}),
        property: { landlordId, isDeleted: false },
        status: { not: "DELETED" as any },
        ...(query.status ? { status: query.status as any } : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: "insensitive" } },
                { property: { name: { contains: query.search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        propertyId: true,
        name: true,
        status: true,
        baseRent: true,
        property: { select: { name: true } },
        leases: {
          where: { status: "ACTIVE" },
          select: {
            tenant: { select: { userFullName: true } },
            startDate: true,
            endDate: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    let results: LandlordUnitItem[] = units.map((u) => {
      const activeLease = u.leases[0];
      return {
        id: u.id,
        propertyId: u.propertyId,
        propertyName: u.property.name,
        unitName: u.name,
        status: u.status,
        baseRent: u.baseRent,
        tenantName: activeLease?.tenant?.userFullName ?? null,
        leaseStartDate: activeLease?.startDate ?? null,
        leaseEndDate: activeLease?.endDate ?? null,
      };
    });

    // Sorting
    switch (query.sortBy) {
      case "name_asc":
        results.sort((a, b) => a.unitName.localeCompare(b.unitName));
        break;
      case "name_desc":
        results.sort((a, b) => b.unitName.localeCompare(a.unitName));
        break;
      case "status_asc":
        results.sort((a, b) => a.status.localeCompare(b.status));
        break;
      case "status_desc":
        results.sort((a, b) => b.status.localeCompare(a.status));
        break;
    }

    return results;
  }
}
