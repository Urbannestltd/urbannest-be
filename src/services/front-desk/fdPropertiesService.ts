import { prisma } from "../../config/prisma";
import { ForbiddenError, NotFoundError } from "../../utils/apiError";
import { AdminUnitService } from "../admin/unitService";

type OccupancyRange = "0-20" | "21-40" | "41-60" | "61-80" | "81-100";

function normalizePropertyType(type: string): "RESIDENTIAL" | "COMMERCIAL" {
  return type === "COMMERCIAL" ? "COMMERCIAL" : "RESIDENTIAL";
}

function parseRange(range: string): [number, number] {
  const parts = range.split("-").map(Number);
  return [parts[0]!, parts[1]!];
}

export class FdPropertiesService {
  private adminUnitService = new AdminUnitService();

  /** Throws ForbiddenError (403) when the FD's access has been revoked — the frontend uses this to show the toast and redirect. */
  private async checkFdAccess(userId: string, propertyId: string) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { frontDeskId: true, isDeleted: true },
    });
    if (!property || property.isDeleted)
      throw new NotFoundError("Property not found");
    if (property.frontDeskId !== userId)
      throw new ForbiddenError("You no longer have access to this property.");
  }

  public async getPropertyUnits(
    userId: string,
    propertyId: string,
    search?: string,
  ) {
    await this.checkFdAccess(userId, propertyId);
    return this.adminUnitService.getUnitsByProperty(propertyId, search);
  }

  public async getAssignedProperties(
    userId: string,
    filters?: {
      search?: string;
      type?: string;
      occupancy?: OccupancyRange;
      unitRange?: string;
    },
  ) {
    const q = filters?.search?.trim();

    const properties = await prisma.property.findMany({
      where: {
        frontDeskId: userId,
        isDeleted: false,
        ...(filters?.type && { type: filters.type as any }),
        ...(q && {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { address: { contains: q, mode: "insensitive" } },
          ],
        }),
      },
      include: {
        units: {
          where: { status: { not: "DELETED" } },
          select: {
            id: true,
            name: true,
            status: true,
            leases: {
              where: { status: "ACTIVE" },
              select: { id: true },
            },
            maintenanceRequests: {
              where: { status: { notIn: ["RESOLVED", "FIXED", "CANCELLED"] } },
              select: { id: true },
            },
          },
        },
      },
      orderBy: [{ name: "asc" }, { address: "asc" }],
    });

    const mapped = properties.map((p) => {
      const totalUnits = p.units.length;
      const occupiedUnits = p.units.filter((u) => u.leases.length > 0).length;
      const occupancyRate =
        totalUnits === 0 ? 0 : Math.round((occupiedUnits / totalUnits) * 100);

      const complaints = p.units.reduce(
        (sum, u) => sum + u.maintenanceRequests.length,
        0,
      );

      return {
        id: p.id,
        name: p.name ?? p.address,
        address: p.address,
        state: p.state,
        city: p.city,
        type: normalizePropertyType(p.type),
        images: p.images,
        unitCount: totalUnits,
        occupancyRate,
        complaints,
        createdAt: p.createdAt,
      };
    });

    let result = mapped;

    if (filters?.occupancy) {
      const [lo, hi] = parseRange(filters.occupancy);
      result = result.filter((p) => p.occupancyRate >= lo && p.occupancyRate <= hi);
    }

    if (filters?.unitRange) {
      const [lo, hi] = parseRange(filters.unitRange);
      result = result.filter((p) => p.unitCount >= lo && p.unitCount <= hi);
    }

    return result;
  }
}
