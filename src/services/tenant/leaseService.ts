// src/services/leaseService.ts
import { prisma } from "../../config/prisma";
import { NotFoundError, ForbiddenError } from "../../utils/apiError";
import { LeaseResponse } from "../../dtos/tenant/lease.dto";

export class LeaseService {
  /**
   * Scenario: Tenant Dashboard -> "My Lease"
   * Traverses: Lease -> Unit -> Property
   */
  public async getMyActiveLease(userId: string): Promise<LeaseResponse> {
    // 1. Fetch Lease with Hierarchy
    const lease = await prisma.lease.findFirst({
      where: {
        tenantId: userId, // Refactored from 'leaseTenantId'
        status: "ACTIVE", // Refactored from 'leaseStatus'
      },
      include: {
        unit: {
          // Refactored from 'leaseUnit'
          include: {
            property: true, // Refactored from 'unitProperty'
          },
        },
      },
      orderBy: { startDate: "desc" },
    });

    if (!lease) {
      throw new NotFoundError("No active lease found.");
    }

    // 2. Extract Relation Data
    const unit = lease.unit;
    const property = unit.property;

    // 3. Calculate Logic (Days Remaining)
    const today = new Date();
    const daysRemaining = Math.ceil(
      (lease.endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    // 4. Return Clean DTO
    return {
      id: lease.id,
      status: lease.status as "ACTIVE",

      property: {
        name: property.name,
        unit: unit.name,
        unitId: unit.id,
        address: property.address,
        fullAddress: `${property.address}, ${unit.name}, ${property.city}`,
      },

      contract: {
        startDate: lease.startDate,
        endDate: lease.endDate,
        daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
        rentAmount: lease.rentAmount,
        currency: "NGN",
      },

      document: {
        url: lease.documentUrl,
        canDownload: !!lease.documentUrl,
      },
    };
  }

  /**
   * Scenario: "Download PDF" Button
   * Checks security to ensure user owns the lease
   */
  public async getLeaseDownloadUrl(leaseId: string, userId: string) {
    const lease = await prisma.lease.findUnique({
      where: { id: leaseId },
    });

    if (!lease) throw new NotFoundError("Lease not found");

    // SECURITY: Ensure the requester is the actual tenant
    if (lease.tenantId !== userId) {
      throw new ForbiddenError("Access denied");
    }

    if (!lease.documentUrl) {
      throw new NotFoundError("Digital document unavailable");
    }

    return { url: lease.documentUrl };
  }
}
