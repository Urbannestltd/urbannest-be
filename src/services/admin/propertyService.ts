import { UnitStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
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
    if (data.noOfFloors > 0 && data.noOfUnitsPerFloor > 0) {
      const unitsToCreate = [];

      for (let floor = 1; floor <= data.noOfFloors; floor++) {
        for (let unitNum = 1; unitNum <= data.noOfUnitsPerFloor; unitNum++) {
          const floorName =
            floor === 1
              ? "First Floor"
              : floor === 2
                ? "Second Floor"
                : floor === 3
                  ? "Third Floor"
                  : `Floor ${floor}`;

          unitsToCreate.push({
            propertyId: property.id,
            name: `Unit ${unitNum}`,
            floor: floorName,
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

  public async getProperties() {
    return await prisma.property.findMany({
      include: {
        _count: { select: { units: true } },
      },
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
        units: {
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
      address: `${property.address}, ${property.state}`,
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

    return updatedProperty;
  }
}
