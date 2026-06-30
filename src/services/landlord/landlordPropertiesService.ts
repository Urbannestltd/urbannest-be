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

  private mapPropertyType(dbType: string): string {
    const typeMap: Record<string, string> = {
      MULTI_UNIT: "RESIDENTIAL",
      SINGLE_FAMILY: "RESIDENTIAL",
      COMMERCIAL: "COMMERCIAL",
      RESIDENTIAL: "RESIDENTIAL",
    };
    return typeMap[dbType] || dbType;
  }

  private mapPropertyTypeToDb(displayType: string): string[] {
    const typeMap: Record<string, string[]> = {
      RESIDENTIAL: ["MULTI_UNIT", "SINGLE_FAMILY"],
      COMMERCIAL: ["COMMERCIAL"],
    };
    return typeMap[displayType] || [displayType];
  }

  private async assertOwnership(landlordId: string, propertyId: string) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { landlordId: true, isDeleted: true },
    });
    if (!property || property.isDeleted) throw new NotFoundError("Property not found");
    if (property.landlordId !== landlordId)
      throw new ForbiddenError("You do not own this property");
  }

  private monthsOverlap(start: Date, end: Date, yearStart: Date, yearEnd: Date): number {
    const overlapStart = start > yearStart ? start : yearStart;
    const overlapEnd = end < yearEnd ? end : yearEnd;
    if (overlapStart >= overlapEnd) return 0;
    const months =
      (overlapEnd.getFullYear() - overlapStart.getFullYear()) * 12 +
      (overlapEnd.getMonth() - overlapStart.getMonth()) +
      (overlapEnd.getDate() - overlapStart.getDate()) / 30;
    return Math.max(0, months);
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
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59, 999);

    const dbTypes = query.type ? this.mapPropertyTypeToDb(query.type) : undefined;

    const properties = await prisma.property.findMany({
      where: {
        landlordId,
        isDeleted: false,
        ...(dbTypes ? { type: { in: dbTypes as any } } : {}),
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
          select: {
            id: true,
            status: true,
            leases: {
              where: { status: "ACTIVE", startDate: { lte: yearEnd }, endDate: { gte: yearStart } },
              select: { rentAmount: true, startDate: true, endDate: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Fetch payments for collected rent
    const payments = await prisma.payment.findMany({
      where: {
        type: "RENT",
        status: "PAID",
        createdAt: { gte: yearStart, lte: yearEnd },
        lease: { unit: { property: { landlordId, isDeleted: false } } },
      },
      select: { amount: true, lease: { select: { unit: { select: { propertyId: true } } } } },
    });

    const collectedByProperty = new Map<string, number>();
    for (const p of payments) {
      const propId = p.lease?.unit?.propertyId;
      if (propId) {
        collectedByProperty.set(propId, (collectedByProperty.get(propId) ?? 0) + p.amount);
      }
    }

    let results: LandlordPropertyItem[] = properties.map((prop) => {
      const totalUnits = prop.units.length;
      // Count units with active leases (actual occupancy)
      const occupiedUnits = prop.units.filter((u) => u.leases.length > 0).length;
      const occupancyRate =
        totalUnits === 0 ? 0 : Math.round((occupiedUnits / totalUnits) * 100);

      // Calculate expected rent for this property
      let expectedRent = 0;
      for (const unit of prop.units) {
        for (const lease of unit.leases) {
          const months = this.monthsOverlap(lease.startDate, lease.endDate, yearStart, yearEnd);
          expectedRent += lease.rentAmount * months;
        }
      }

      return {
        id: prop.id,
        name: prop.name,
        type: this.mapPropertyType(prop.type),
        address: prop.address,
        city: prop.city,
        state: prop.state,
        totalUnits,
        occupiedUnits,
        occupancyRate,
        expectedRent: Math.round(expectedRent),
        collectedRent: Math.round(collectedByProperty.get(prop.id) ?? 0),
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
