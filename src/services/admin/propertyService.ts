import { prisma } from "../../config/prisma";
import {
  CreatePropertyAdminDto,
  ManageMemberDto,
} from "../../dtos/admin/property.dto";

export class AdminPropertyService {
  public async createProperty(data: CreatePropertyAdminDto) {
    // Verify the assigned landlord actually exists and has the LANDLORD role
    const landlord = await prisma.user.findFirst({
      where: {
        userId: data.landlordId,
        userRole: { roleName: "LANDLORD" },
      },
    });

    if (!landlord) {
      throw new Error("Invalid Landlord ID or user is not a Landlord.");
    }

    return await prisma.property.create({
      data: {
        name: data.name,
        address: data.address,
        city: data.city,
        state: data.state,
        zip: data.zip,
        type: data.type,
        landlordId: data.landlordId,
      },
    });
  }

  // --- 2. VIEW PROPERTIES (With Dashboard Aggregations!) ---
  public async getPropertiesOverview() {
    const properties = await prisma.property.findMany({
      include: {
        landlord: {
          select: { userFullName: true, userEmail: true, userPhone: true },
        },
        units: {
          include: {
            leases: { where: { status: "ACTIVE" } },
            maintenanceRequests: {
              where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
            },
          },
        },
      },
    });

    // Now we map through the properties to calculate the dashboard stats (Occupancy, Revenue, Complaints)
    return properties.map((property) => {
      const totalUnits = property.units.length;

      // 1. Calculate Occupancy
      const occupiedUnits = property.units.filter(
        (u) => u.status === "OCCUPIED",
      ).length;
      const occupancyRate =
        totalUnits === 0 ? 0 : Math.round((occupiedUnits / totalUnits) * 100);

      // 2. Calculate Active Complaints (Maintenance Requests)
      const totalComplaints = property.units.reduce(
        (sum, unit) => sum + unit.maintenanceRequests.length,
        0,
      );

      // 3. Calculate Expected Income (Sum of active lease rent amounts)
      const expectedIncome = property.units.reduce((sum, unit) => {
        const activeLease = unit.leases[0]; // Assuming 1 active lease per unit
        return sum + (activeLease?.rentAmount || 0);
      }, 0);

      // 4. Calculate Total Tenants (Members)
      const totalTenants = property.units.reduce(
        (sum, unit) => sum + unit.leases.length,
        0,
      );

      return {
        id: property.id,
        name: property.name,
        address: `${property.address}, ${property.city}`,
        type: property.type,
        landlord: property.landlord?.userFullName,
        stats: {
          totalUnits,
          occupiedUnits,
          occupancyRate: `${occupancyRate}%`,
          totalComplaints,
          expectedMonthlyIncome: expectedIncome,
          totalTenants,
        },
      };
    });
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
}
