import { UnitStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";

// Normalises raw floor strings to a canonical "Floor N" form so that
// "7", "Floor 7", "Seventh Floor" etc. all map to the same bucket.
const WORD_TO_NUM: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

export function normalizeFloor(raw: string | null | undefined): string {
  if (!raw) return "Unassigned";
  const s = raw.trim();
  if (/^Floor \d+$/i.test(s)) return `Floor ${parseInt(s.split(" ")[1]!)}`;
  if (/^\d+$/.test(s)) return `Floor ${parseInt(s)}`;
  const lower = s
    .toLowerCase()
    .replace(/\s*floor\s*/g, "")
    .trim();
  if (WORD_TO_NUM[lower]) return `Floor ${WORD_TO_NUM[lower]}`;
  return s;
}
import {
  CreatePropertyAdminDto,
  ManageMemberDto,
  PropertyDetailsResponseDto,
  UpdatePropertyAdminDto,
} from "../../dtos/admin/property.dto";

export class AdminPropertyService {
  public async createProperty(data: CreatePropertyAdminDto) {
    // 1. Create the base property record with the new UI fields
    const property = await prisma.property.create({
      data: {
        name: data.name,
        type: data.type,
        price: data.price,
        address: data.address,
        state: data.state,
        city: data.city,
        zip: data.zip,
        amenities: data.amenities || [],
        images: data.images || [],
      },
    });

    // 2. Auto-Generate the Units!
    const floors = data.noOfFloors ?? 0;
    const unitsPerFloor = data.noOfUnitsPerFloor ?? 0;
    if (floors > 0 && unitsPerFloor > 0) {
      const unitsToCreate = [];

      for (let floor = 1; floor <= floors; floor++) {
        for (let unitNum = 1; unitNum <= unitsPerFloor; unitNum++) {
          const globalUnitNum = (floor - 1) * unitsPerFloor + unitNum;
          unitsToCreate.push({
            propertyId: property.id,
            name: `Unit ${globalUnitNum}`,
            floor: `Floor ${floor}`,
            baseRent: data.price || 0,
            status: UnitStatus.AVAILABLE,
          });
        }
      }

      await prisma.unit.createMany({
        data: unitsToCreate,
      });
    }

    // 3. Return the property with the unit count
    return await prisma.property.findUnique({
      where: { id: property.id },
      include: {
        _count: { select: { units: true } },
      },
    });
  }

  public async deleteProperty(propertyId: string) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) throw new Error("Property not found");

    await prisma.$transaction([
      prisma.unit.updateMany({
        where: { propertyId, status: { not: UnitStatus.DELETED } },
        data: { status: UnitStatus.DELETED },
      }),
      prisma.property.update({
        where: { id: propertyId },
        data: { isDeleted: true },
      }),
    ]);
  }

  public async getProperties() {
    const properties = await prisma.property.findMany({
      where: { isDeleted: false },
      include: {
        units: {
          where: { status: { not: UnitStatus.DELETED } },
          select: {
            leases: {
              where: { status: "ACTIVE" },
              select: { id: true },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return properties.map((p) => {
      const totalUnits = p.units.length;
      const occupiedUnits = p.units.filter((u) => u.leases.length > 0).length;
      const occupancyPercent =
        totalUnits === 0 ? 0 : Math.round((occupiedUnits / totalUnits) * 100);

      const { units, ...rest } = p;
      return { ...rest, totalUnits, occupancyPercent };
    });
  }

  // --- 2. VIEW PROPERTIES (With Dashboard Aggregations!) ---
  // --- GET SINGLE PROPERTY DETAILS (OVERVIEW TAB) ---
  public async getPropertyDetailsOverview(
    propertyId: string,
  ): Promise<PropertyDetailsResponseDto> {
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);

    // 1. Fetch the core property data and its relations
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        facilityManager: true,
        landlord: true,
        agent: true,
        units: {
          where: { status: { not: UnitStatus.DELETED } },
          include: {
            leases: { where: { status: "ACTIVE" } },
            maintenanceRequests: true,
          },
        },
      },
    });

    if (!property) throw new Error("Property not found");

    // 2. Calculate Top Stats
    const totalUnits = property.units.length;

    // Dynamically calculate the number of floors by looking at unique floor names
    const uniqueFloors = new Set(
      property.units.map((u) => u.floor).filter(Boolean),
    );
    const noOfFloors = uniqueFloors.size;

    // 3. Calculate Health Bars (Occupancy & Complaints)
    const occupiedUnits = property.units.filter(
      (u) => u.leases.length > 0,
    ).length;
    const occupancyRate =
      totalUnits === 0 ? 0 : Math.round((occupiedUnits / totalUnits) * 100);

    let totalComplaints = 0;
    let unresolvedComplaints = 0;

    property.units.forEach((unit) => {
      totalComplaints += unit.maintenanceRequests.length;
      unresolvedComplaints += unit.maintenanceRequests.filter(
        (req) => req.status === "PENDING" || req.status === "IN_PROGRESS",
      ).length;
    });

    const complaintsPercentage =
      totalComplaints === 0
        ? 0
        : Math.round((unresolvedComplaints / totalComplaints) * 100);

    // 4. Calculate Rental Revenue Chart Data (Current Year)
    // Find all PAID rent payments tied to leases that belong to this property's units
    const payments = await prisma.payment.findMany({
      where: {
        status: "PAID",
        type: "RENT",
        paidDate: { gte: startOfYear },
        lease: { unit: { propertyId: propertyId } },
      },
      select: { amount: true, paidDate: true },
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
    const rentalRevenue = monthNames.map((month) => ({ month, revenue: 0 }));

    payments.forEach((payment) => {
      if (payment.paidDate) {
        const monthIndex = payment.paidDate.getMonth();
        rentalRevenue[monthIndex]!.revenue += payment.amount;
      }
    });

    // 5. Construct the final response matching the UI exactly
    return {
      id: property.id,
      name: property.name,
      address: property.address,
      state: property.state,
      city: property.city,
      zip: property.zip,
      lastUpdated: property.updatedAt,

      // Details Card
      rentalPrice: property.price || 0,
      noOfFloors,
      noOfUnits: totalUnits,
      listedOn: property.createdAt,
      occupancyRate: `${occupancyRate}%`,
      complaintsPercentage: `${complaintsPercentage}%`,

      // Content
      images: property.images,
      amenities: property.amenities,

      // People
      facilityManager: property.facilityManager
        ? {
            name: property.facilityManager.userFullName || "Unknown",
            email: property.facilityManager.userEmail,
            photoUrl: property.facilityManager.userProfileUrl,
          }
        : null,

      landlord: property.landlord
        ? {
            name: property.landlord.userFullName || "Unknown",
            email: property.landlord.userEmail,
            photoUrl: property.landlord.userProfileUrl,
          }
        : null,

      agent: property.agent
        ? {
            name: property.agent.userFullName || "Unknown",
            email: property.agent.userEmail,
            photoUrl: property.agent.userProfileUrl,
          }
        : null,

      // Chart
      rentalRevenue,
    };
  }

  public async assignMember(propertyId: string, data: ManageMemberDto) {
    const user = await prisma.user.findUnique({
      where: { userId: data.userId },
    });
    if (!user) throw new Error("User not found");

    if (data.role === "LANDLORD") {
      return await prisma.property.update({
        where: { id: propertyId },
        data: { landlordId: data.userId },
      });
    }

    if (data.role === "FACILITY_MANAGER") {
      return await prisma.property.update({
        where: { id: propertyId },
        data: { facilityManagerId: data.userId },
      });
    }

    if (data.role === "TENANT") {
      if (!data.unitId)
        throw new Error("unitId is required to assign a tenant.");

      const unit = await prisma.unit.findUnique({ where: { id: data.unitId } });
      if (!unit) throw new Error("Unit not found");

      // Calculate lease dates (Default 1 year if not provided)
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + (data.leaseMonths || 12));

      // Create an active lease to officially make them a tenant of this unit
      return await prisma.lease.create({
        data: {
          unitId: data.unitId,
          tenantId: data.userId,
          startDate,
          endDate,
          rentAmount: data.rentAmount || unit.baseRent || 0,
          status: "ACTIVE",
        },
      });
    }

    throw new Error("Invalid role specified");
  }

  // --- REMOVE MEMBER ---
  public async removeMember(propertyId: string, data: ManageMemberDto) {
    if (data.role === "LANDLORD") {
      return await prisma.property.update({
        where: { id: propertyId },
        data: { landlordId: null }, // Disconnect landlord
      });
    }

    if (data.role === "FACILITY_MANAGER") {
      return await prisma.property.update({
        where: { id: propertyId },
        data: { facilityManagerId: null }, // Disconnect facility manager
      });
    }

    if (data.role === "TENANT") {
      if (!data.unitId)
        throw new Error("unitId is required to remove a tenant.");

      // Find the active lease for this tenant in this unit
      const activeLease = await prisma.lease.findFirst({
        where: {
          unitId: data.unitId,
          tenantId: data.userId,
          status: "ACTIVE",
        },
      });

      if (!activeLease)
        throw new Error("No active lease found for this tenant in this unit.");

      // Terminate the lease to "remove" the tenant
      return await prisma.lease.update({
        where: { id: activeLease.id },
        data: { status: "TERMINATED" },
      });
    }
  }

  // --- UPDATE PROPERTY ---
  public async updateProperty(
    propertyId: string,
    data: UpdatePropertyAdminDto,
  ) {
    // 1. Verify property exists
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) throw new Error("Property not found");

    // 2. Update the property details
    const updatedProperty = await prisma.property.update({
      where: { id: propertyId },
      data: {
        name: data.name !== undefined ? data.name : property.name,
        type: data.type !== undefined ? data.type : property.type,
        price: data.price !== undefined ? data.price : property.price,
        address: data.address !== undefined ? data.address : property.address,
        state: data.state !== undefined ? data.state : property.state,
        city: data.city !== undefined ? data.city : property.city,
        zip: data.zip !== undefined ? data.zip : property.zip,

        // Prisma replaces the entire array for PostgreSQL string arrays
        amenities:
          data.amenities !== undefined ? data.amenities : property.amenities,
        images: data.images !== undefined ? data.images : property.images,
      },
    });

    // 3. Smart feature: If the price changed, cascade it to VACANT units
    if (data.price !== undefined && data.price !== property.price) {
      await prisma.unit.updateMany({
        where: {
          propertyId: propertyId,
          status: "AVAILABLE", // Only update vacant units! Active tenants keep their lease price.
        },
        data: {
          baseRent: data.price,
        },
      });
    }

    // 4. Reconcile unit count if floor/unit structure was changed
    if (data.noOfFloors !== undefined || data.noOfUnitsPerFloor !== undefined) {
      const existingUnits = await prisma.unit.findMany({
        where: { propertyId, status: { not: UnitStatus.DELETED } },
        select: { id: true, status: true, floor: true },
        orderBy: { createdAt: "asc" },
      });

      const currentCount = existingUnits.length;

      // Derive the target totals — fall back to current floor/unit counts if only one side changed.
      // Normalise floor names before counting so "Floor 1" and "First Floor" and "1" all count as one.
      const floorNames = existingUnits
        .map((u: any) => u.floor)
        .filter(Boolean)
        .map((f: string) => normalizeFloor(f));
      const currentFloors = new Set(floorNames).size || 1;
      const currentUnitsPerFloor =
        currentFloors > 0
          ? Math.ceil(currentCount / currentFloors)
          : currentCount;

      const targetFloors = data.noOfFloors ?? currentFloors;
      const targetUnitsPerFloor =
        data.noOfUnitsPerFloor ?? currentUnitsPerFloor;
      const targetTotal = targetFloors * targetUnitsPerFloor;

      if (targetTotal > currentCount) {
        // Expand: count existing units per floor, then fill each floor up to targetUnitsPerFloor
        const existingByFloor = new Map<string, number>();
        existingUnits.forEach((u) => {
          const key = normalizeFloor(u.floor);
          existingByFloor.set(key, (existingByFloor.get(key) ?? 0) + 1);
        });

        const unitsToCreate = [];
        let globalUnitNum = currentCount + 1;

        for (let floor = 1; floor <= targetFloors; floor++) {
          const floorKey = `Floor ${floor}`;
          const existingOnFloor = existingByFloor.get(floorKey) ?? 0;
          const unitsNeeded = Math.max(
            0,
            targetUnitsPerFloor - existingOnFloor,
          );

          for (let u = 0; u < unitsNeeded; u++) {
            unitsToCreate.push({
              propertyId,
              name: `Unit ${globalUnitNum}`,
              floor: floorKey,
              baseRent: updatedProperty.price || 0,
              status: UnitStatus.AVAILABLE,
            });
            globalUnitNum++;
          }
        }

        if (unitsToCreate.length > 0) {
          await prisma.unit.createMany({ data: unitsToCreate });
        }
      } else if (targetTotal < currentCount) {
        // Shrink: delete only AVAILABLE units (newest first), never touch occupied units
        const deletableIds = existingUnits
          .filter((u) => u.status === "AVAILABLE")
          .reverse()
          .slice(0, currentCount - targetTotal)
          .map((u) => u.id);

        if (deletableIds.length > 0) {
          await prisma.unit.deleteMany({ where: { id: { in: deletableIds } } });
        }
      }
    }

    return updatedProperty;
  }
}
