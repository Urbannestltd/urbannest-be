import { prisma } from "../../config/prisma";
import { ForbiddenError, NotFoundError } from "../../utils/apiError";
import { AdminPropertyService } from "../admin/propertyService";
import type {
  LandlordPropertiesQuery,
  LandlordPropertyItem,
} from "../../dtos/landlord/landlord.properties.dto";
import type { PropertyDetailsResponseDto } from "../../dtos/admin/property.dto";

export class LandlordPropertiesService {
  private adminPropertyService = new AdminPropertyService();

  private async assertOwnership(landlordId: string, propertyId: string) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { landlordId: true, isDeleted: true },
    });
    if (!property || property.isDeleted) throw new NotFoundError("Property not found");
    if (property.landlordId !== landlordId)
      throw new ForbiddenError("You do not own this property");
  }

  public async getPropertyDetail(
    landlordId: string,
    propertyId: string,
  ): Promise<PropertyDetailsResponseDto> {
    await this.assertOwnership(landlordId, propertyId);
    return this.adminPropertyService.getPropertyDetailsOverview(propertyId);
  }

  public async getProperties(
    landlordId: string,
    query: LandlordPropertiesQuery,
  ): Promise<LandlordPropertyItem[]> {
    const properties = await prisma.property.findMany({
      where: {
        landlordId,
        isDeleted: false,
        ...(query.type ? { type: query.type as any } : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: "insensitive" } },
                { address: { contains: query.search, mode: "insensitive" } },
                { city: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        type: true,
        address: true,
        city: true,
        state: true,
        units: {
          where: { status: { not: "DELETED" } },
          select: { status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    let results: LandlordPropertyItem[] = properties.map((p) => {
      const totalUnits = p.units.length;
      const occupiedUnits = p.units.filter((u) => u.status === "OCCUPIED").length;
      const occupancyRate =
        totalUnits === 0 ? 0 : Math.round((occupiedUnits / totalUnits) * 100);
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        address: p.address,
        city: p.city,
        state: p.state,
        totalUnits,
        occupancyRate,
      };
    });

    // Unit count filter (applied after fetch since it's a derived value)
    if (query.minUnits !== undefined) {
      results = results.filter((p) => p.totalUnits >= query.minUnits!);
    }
    if (query.maxUnits !== undefined) {
      results = results.filter((p) => p.totalUnits <= query.maxUnits!);
    }

    // Occupancy rate filter
    if (query.minOccupancy !== undefined) {
      results = results.filter((p) => p.occupancyRate >= query.minOccupancy!);
    }
    if (query.maxOccupancy !== undefined) {
      results = results.filter((p) => p.occupancyRate <= query.maxOccupancy!);
    }

    // Sorting
    switch (query.sortBy) {
      case "name_asc":
        results.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
        break;
      case "name_desc":
        results.sort((a, b) => (b.name ?? "").localeCompare(a.name ?? ""));
        break;
      case "occupancy_asc":
        results.sort((a, b) => a.occupancyRate - b.occupancyRate);
        break;
      case "occupancy_desc":
        results.sort((a, b) => b.occupancyRate - a.occupancyRate);
        break;
      case "units_asc":
        results.sort((a, b) => a.totalUnits - b.totalUnits);
        break;
      case "units_desc":
        results.sort((a, b) => b.totalUnits - a.totalUnits);
        break;
    }

    return results;
  }
}
