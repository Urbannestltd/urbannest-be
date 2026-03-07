import { prisma } from "../../config/prisma";
import { CreatePropertyAdminDto } from "../../dtos/admin/property.dto";

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
        landlord: property.landlord.userFullName,
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
}
