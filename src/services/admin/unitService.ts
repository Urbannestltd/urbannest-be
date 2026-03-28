import { UnitStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { CreateUnitAdminDto } from "../../dtos/admin/property.dto";
import { TenantProfileResponseDto } from "../../dtos/admin/tenant.dto";
import { BadRequestError } from "../../utils/apiError";

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
        floor: data.floor || "Unassigned",
        baseRent: data.baseRent || 0,
        bedrooms: data.bedrooms || 1,
        bathrooms: data.bathrooms || 1,
        status: data.status || UnitStatus.AVAILABLE,
      },
    });
  }

  // --- 2. GET UNITS FOR A PROPERTY (Formatted for the UI) ---
  // public async getUnitsByProperty(propertyId: string) {
  //   const units = await prisma.unit.findMany({
  //     where: { propertyId },
  //     include: {
  //       leases: {
  //         where: { status: "ACTIVE" },
  //         include: { tenant: true },
  //       },
  //       maintenanceRequests: true,
  //     },
  //     orderBy: [
  //       { floor: "asc" }, // Group by floor conceptually
  //       { name: "asc" },
  //     ],
  //   });

  //   // Map the Prisma data directly into the shape your Figma UI expects
  //   const formattedUnits = units.map((unit) => {
  //     const activeLease = unit.leases[0]; // Assuming 1 active lease per unit
  //     const tenant = activeLease?.tenant;

  //     // Calculate complaints (e.g., total vs unresolved) to feed that UI progress bar
  //     const totalComplaints = unit.maintenanceRequests.length;
  //     const unresolvedComplaints = unit.maintenanceRequests.filter(
  //       (req) => req.status === "PENDING" || req.status === "IN_PROGRESS",
  //     ).length;

  //     // Mock percentage for the UI bar (Open / Total * 100)
  //     const complaintPercentage =
  //       totalComplaints === 0
  //         ? 0
  //         : Math.round((unresolvedComplaints / totalComplaints) * 100);

  //     return {
  //       id: unit.id,
  //       name: unit.name,
  //       floor: unit.floor || "Unassigned",
  //       status: unit.status, // "AVAILABLE" (Vacant) or "OCCUPIED"
  //       rentAmount: activeLease?.rentAmount || unit.baseRent || 0,

  //       // Tenant Details
  //       tenantName: tenant ? tenant.userFullName : null,
  //       tenantProfilePic: tenant ? tenant.userProfileUrl : null,
  //       moveInDate: activeLease ? activeLease.startDate : null,

  //       // Stats
  //       members: activeLease ? 1 : 0, // Currently schema only supports 1 tenant per lease, can be updated later
  //       complaints: {
  //         total: totalComplaints,
  //         unresolved: unresolvedComplaints,
  //         percentage: `${complaintPercentage}%`, // Feeds the red/green/yellow bar in the UI
  //       },
  //     };
  //   });

  //   // Optional: Group them by floor for the frontend right here in the backend
  //   const groupedByFloor = formattedUnits.reduce(
  //     (acc, unit) => {
  //       const floor = unit.floor;
  //       if (!acc[floor]) acc[floor] = [];
  //       acc[floor].push(unit);
  //       return acc;
  //     },
  //     {} as Record<string, typeof formattedUnits>,
  //   );

  //   return {
  //     totalUnits: units.length,
  //     grouped: groupedByFloor,
  //   };
  // }

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
      orderBy: [{ floor: "asc" }, { name: "asc" }],
    });

    // Map Prisma data exactly to the Figma UI table columns
    const formattedUnits = units.map((unit) => {
      const activeLease = unit.leases[0];
      const tenant = activeLease?.tenant;

      // 1. Calculate Complaints Percentage (UI Red/Green/Yellow Bar)
      const totalComplaints = unit.maintenanceRequests.length;
      const unresolvedComplaints = unit.maintenanceRequests.filter(
        (req) => req.status === "PENDING" || req.status === "IN_PROGRESS",
      ).length;

      const complaintPercentage =
        totalComplaints === 0
          ? 0
          : Math.round((unresolvedComplaints / totalComplaints) * 100);

      // 2. Calculate Lease Expiry Percentage (UI Circular Progress Bar)
      let leaseExpiryPercentage = null;
      if (activeLease) {
        const start = new Date(activeLease.startDate).getTime();
        const end = new Date(activeLease.endDate).getTime();
        const now = new Date().getTime();

        const totalDuration = end - start;
        const elapsed = now - start;

        if (totalDuration > 0) {
          let percentage = Math.round((elapsed / totalDuration) * 100);
          percentage = Math.max(0, Math.min(100, percentage)); // Ensure it stays between 0-100
          leaseExpiryPercentage = `${percentage}%`;
        }
      }

      return {
        id: unit.id,
        name: unit.name,
        floor: unit.floor || "Unassigned",
        status: unit.status, // "AVAILABLE" (Vacant) or "OCCUPIED"
        rentAmount: activeLease?.rentAmount || unit.baseRent || 0,

        // Tenant Details
        tenantId: tenant ? tenant.userId : null,
        tenantName: tenant ? tenant.userFullName : null,
        tenantProfilePic: tenant ? tenant.userProfileUrl : null,
        moveInDate: activeLease ? activeLease.startDate : null,

        // Expiry Circle
        leaseExpiry: leaseExpiryPercentage,

        // Stats
        members: activeLease ? 1 : 0,
        complaints: {
          total: totalComplaints,
          unresolved: unresolvedComplaints,
          percentage: `${complaintPercentage}%`,
        },
      };
    });

    // 3. Group by Floor so the frontend can easily render the distinct sections
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

  public async getTenantProfile(
    tenantId: string,
  ): Promise<TenantProfileResponseDto> {
    const tenant = await prisma.user.findUnique({
      where: { userId: tenantId },
      include: {
        // Fetch all leases (past and present) and the property names they belong to
        leases: {
          include: { unit: { include: { property: true } } },
          orderBy: { startDate: "desc" },
        },
        // Fetch payment history
        payments: {
          orderBy: { createdAt: "desc" },
          take: 10, // Limit for the UI snippet
        },
        // Fetch visitor history
        visitorInvites: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!tenant) throw new BadRequestError("Tenant not found");

    // 1. Separate Active Lease from History
    const activeLease = tenant.leases.find((l) => l.status === "ACTIVE");
    const pastLeases = tenant.leases.filter((l) => l.status !== "ACTIVE");

    // 2. Calculate Current Lease Specifics
    let currentLeaseData = null;
    if (activeLease) {
      const start = new Date(activeLease.startDate).getTime();
      const end = new Date(activeLease.endDate).getTime();
      const now = new Date().getTime();

      // Expiry Circle
      const totalDuration = end - start;
      const elapsed = now - start;
      let percentage =
        totalDuration > 0 ? Math.round((elapsed / totalDuration) * 100) : 0;
      percentage = Math.max(0, Math.min(100, percentage));

      // Lease Length String (e.g., "4 years")
      const diffInMonths =
        (new Date(activeLease.endDate).getFullYear() -
          new Date(activeLease.startDate).getFullYear()) *
          12 +
        (new Date(activeLease.endDate).getMonth() -
          new Date(activeLease.startDate).getMonth());
      const leaseLength =
        diffInMonths >= 12
          ? `${Math.round(diffInMonths / 12)} years`
          : `${diffInMonths} months`;

      currentLeaseData = {
        rentAmount: activeLease.rentAmount,
        serviceCharge: activeLease.serviceCharge || 0,
        leaseExpiryPercentage: `${percentage}%`,
        leaseLength,
        startDate: activeLease.startDate,
        endDate: activeLease.endDate,
        moveOutNotice: activeLease.moveOutNotice,
        agreementUrl: activeLease.documentUrl,
      };
    }

    // 3. Map Data to the DTO
    return {
      id: tenant.userId,
      fullName: tenant.userFullName || "Unknown",
      profilePic: tenant.userProfileUrl,
      status: activeLease ? "Active Lease" : "No Active Lease",

      email: tenant.userEmail,
      phone: tenant.userPhone,
      emergencyContact: tenant.userEmergencyContact,
      dateOfBirth: tenant.dateOfBirth,
      occupation: tenant.occupation,
      employer: tenant.employer,

      currentLease: currentLeaseData,

      leaseHistory: pastLeases.map((l) => ({
        reference: l.unit.property.name || "Unknown Property",
        startDate: l.startDate,
        endDate: l.endDate,
        agreementUrl: l.documentUrl,
      })),

      visitorHistory: tenant.visitorInvites.map((v) => ({
        name: v.visitorName,
        phone: v.visitorPhone,
        status: v.status, // e.g., "CHECKED_IN", "ACTIVE"
        frequency: v.frequency,
      })),

      paymentHistory: tenant.payments.map((p) => ({
        type: p.utilityType || p.type, // e.g., "ELECTRICITY" or "RENT"
        amount: p.amount,
        date: p.createdAt,
        status: p.status === "PAID" ? "Payment Successful" : p.status,
      })),

      cohabitants: [], // Empty for now, can be populated if schema is updated to support multi-tenant leases
    };
  }
}
