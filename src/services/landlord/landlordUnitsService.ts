import { prisma } from "../../config/prisma";
import { ForbiddenError } from "../../utils/apiError";
import { normalizeFloor } from "../admin/propertyService";
import type {
  LandlordUnitsQuery,
  LandlordUnitItem,
  LandlordUnit,
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
  ): Promise<LandlordUnitItem> {
    // If propertyId is specified, verify ownership
    if (query.propertyId) {
      await this.assertLandlordOwnsProperty(landlordId, query.propertyId);
    }

    const units = await prisma.unit.findMany({
      where: {
        ...(query.propertyId ? { propertyId: query.propertyId } : {}),
        ...(query.unitId ? { id: query.unitId } : {}),
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
        floor: true,
        status: true,
        baseRent: true,
        property: { select: { name: true } },
        leases: {
          select: {
            id: true,
            tenant: { select: { userId: true, userFullName: true } },
            startDate: true,
            endDate: true,
            status: true,
          },
          orderBy: { createdAt: "desc" },
        },
        maintenanceRequests: {
          select: { status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const today = new Date();

    // Map units with calculated fields
    const unitsList: LandlordUnit[] = units.map((u) => {
      const activeLease = u.leases.find((l) => l.status === "ACTIVE");

      // Calculate complaints percentage
      const totalComplaints = u.maintenanceRequests.length;
      const unresolvedComplaints = u.maintenanceRequests.filter(
        (m) => m.status !== "RESOLVED" && m.status !== "FIXED" && m.status !== "CANCELLED"
      ).length;
      const complaintsPercentage = totalComplaints === 0
        ? 0
        : Math.round((unresolvedComplaints / totalComplaints) * 100);

      // Calculate lease expiry percentage (how close to expiration)
      let leaseExpiryPercentage = 0;
      if (activeLease) {
        const leaseStart = activeLease.startDate.getTime();
        const leaseEnd = activeLease.endDate.getTime();
        const now = today.getTime();
        const leaseDuration = leaseEnd - leaseStart;
        const timeElapsed = now - leaseStart;
        leaseExpiryPercentage = Math.max(0, Math.min(100, Math.round((timeElapsed / leaseDuration) * 100)));
      }

      // Calculate members (number of active leases = number of occupants)
      const members = u.leases.filter((l) => l.status === "ACTIVE").length;

      return {
        id: u.id,
        propertyId: u.propertyId,
        propertyName: u.property.name,
        unitName: u.name,
        status: u.status,
        baseRent: u.baseRent,
        tenantId: activeLease?.tenant?.userId ?? null,
        tenantName: activeLease?.tenant?.userFullName ?? null,
        leaseStartDate: activeLease?.startDate ?? null,
        leaseEndDate: activeLease?.endDate ?? null,
        floor: normalizeFloor(u.floor),
        complaintsPercentage,
        leaseExpiryPercentage,
        members,
      };
    });

    // Group units by normalized floor
    const grouped = new Map<string, LandlordUnit[]>();
    for (const unit of unitsList) {
      const normalizedFloor = normalizeFloor(units.find(u => u.id === unit.id)?.floor);
      if (!grouped.has(normalizedFloor)) {
        grouped.set(normalizedFloor, []);
      }
      grouped.get(normalizedFloor)!.push(unit);
    }

    // Sort floors numerically
    const sortFloors = (a: string, b: string) => {
      const isUnassignedA = a === "Unassigned";
      const isUnassignedB = b === "Unassigned";

      if (isUnassignedA && !isUnassignedB) return 1;
      if (!isUnassignedA && isUnassignedB) return -1;
      if (isUnassignedA && isUnassignedB) return 0;

      const numA = parseInt(a.match(/\d+/)?.[0] || "999");
      const numB = parseInt(b.match(/\d+/)?.[0] || "999");
      return numA - numB;
    };

    // Sort units within each floor by the requested criteria
    const sortUnitsInFloor = (units: LandlordUnit[]) => {
      switch (query.sortBy) {
        case "name_asc":
          return units.sort((a, b) => a.unitName.localeCompare(b.unitName));
        case "name_desc":
          return units.sort((a, b) => b.unitName.localeCompare(a.unitName));
        case "status_asc":
          return units.sort((a, b) => a.status.localeCompare(b.status));
        case "status_desc":
          return units.sort((a, b) => b.status.localeCompare(a.status));
        default:
          return units;
      }
    };

    // Build the final grouped response
    const floorOrder = Array.from(grouped.keys()).sort(sortFloors);
    return {
      totalUnits: unitsList.length,
      floors: floorOrder.map((floor) => ({
        floor,
        units: sortUnitsInFloor(grouped.get(floor) || []),
      })),
    };
  }
}
