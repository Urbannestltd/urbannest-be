import { prisma } from "../../config/prisma";
import { CreateUnitAdminDto } from "../../dtos/admin/property.dto";

export class AdminUnitService {
  // --- 1. ADD UNIT TO PROPERTY ---
  public async addUnit(propertyId: string, data: CreateUnitAdminDto) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) throw new Error("Property not found");

    return await prisma.unit.create({
      data: {
        propertyId,
        name: data.name,
        floor: data.floor,
        baseRent: data.baseRent,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        status: data.status,
      },
    });
  }

  // --- 2. GET UNITS FOR A PROPERTY (Formatted for the UI) ---
  public async getUnitsByProperty(propertyId: string) {
    const units = await prisma.unit.findMany({
      where: { propertyId },
      include: {
        leases: {
          where: { status: "ACTIVE" },
          include: { tenant: true },
        },
        maintenanceRequests: true,
      },
      orderBy: [
        { floor: "asc" }, // Group by floor conceptually
        { name: "asc" },
      ],
    });

    // Map the Prisma data directly into the shape your Figma UI expects
    const formattedUnits = units.map((unit) => {
      const activeLease = unit.leases[0]; // Assuming 1 active lease per unit
      const tenant = activeLease?.tenant;

      // Calculate complaints (e.g., total vs unresolved) to feed that UI progress bar
      const totalComplaints = unit.maintenanceRequests.length;
      const unresolvedComplaints = unit.maintenanceRequests.filter(
        (req) => req.status === "PENDING" || req.status === "IN_PROGRESS",
      ).length;

      // Mock percentage for the UI bar (Open / Total * 100)
      const complaintPercentage =
        totalComplaints === 0
          ? 0
          : Math.round((unresolvedComplaints / totalComplaints) * 100);

      return {
        id: unit.id,
        name: unit.name,
        floor: unit.floor || "Unassigned",
        status: unit.status, // "AVAILABLE" (Vacant) or "OCCUPIED"
        rentAmount: activeLease?.rentAmount || unit.baseRent || 0,

        // Tenant Details
        tenantName: tenant ? tenant.userFullName : null,
        tenantProfilePic: tenant ? tenant.userProfileUrl : null,
        moveInDate: activeLease ? activeLease.startDate : null,

        // Stats
        members: activeLease ? 1 : 0, // Currently schema only supports 1 tenant per lease, can be updated later
        complaints: {
          total: totalComplaints,
          unresolved: unresolvedComplaints,
          percentage: `${complaintPercentage}%`, // Feeds the red/green/yellow bar in the UI
        },
      };
    });

    // Optional: Group them by floor for the frontend right here in the backend
    const groupedByFloor = formattedUnits.reduce(
      (acc, unit) => {
        const floor = unit.floor;
        if (!acc[floor]) acc[floor] = [];
        acc[floor].push(unit);
        return acc;
      },
      {} as Record<string, typeof formattedUnits>,
    );

    return {
      totalUnits: units.length,
      grouped: groupedByFloor,
    };
  }
}
