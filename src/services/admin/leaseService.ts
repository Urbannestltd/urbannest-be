import { PrismaClient, UnitStatus, LeaseStatus } from "@prisma/client";
import {
  CreateLeaseDto,
  UpdateLeaseDto,
  RenewLeaseDto,
} from "../../dtos/admin/lease.dto";
import { BadRequestError } from "../../utils/apiError";

const prisma = new PrismaClient();

export class AdminLeaseService {
  public async createLease(data: CreateLeaseDto) {
    // 1. Verify the tenant exists and has the TENANT role
    const tenant = await prisma.user.findFirst({
      where: {
        userId: data.tenantId,
        userRole: { roleName: "TENANT" },
      },
    });
    if (!tenant)
      throw new BadRequestError("Invalid tenant ID or user is not a Tenant.");

    // 2. Verify the unit exists and is actually available
    const unit = await prisma.unit.findUnique({ where: { id: data.unitId } });
    if (!unit) throw new BadRequestError("Unit not found.");
    if (unit.status === UnitStatus.OCCUPIED) {
      throw new BadRequestError(
        "This unit is already occupied by another active lease.",
      );
    }

    // 3. Create the lease and update the unit status in a single transaction
    const [newLease, updatedUnit] = await prisma.$transaction([
      prisma.lease.create({
        data: {
          tenantId: data.tenantId,
          unitId: data.unitId,
          rentAmount: data.rentAmount,
          serviceCharge: data.serviceCharge || 0,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          moveOutNotice: data.moveOutNotice,
          documentUrl: data.documentUrl,
          status: LeaseStatus.ACTIVE,
        },
      }),
      prisma.unit.update({
        where: { id: data.unitId },
        data: { status: UnitStatus.OCCUPIED },
      }),
    ]);

    return newLease;
  }

  // --- EDIT ACTIVE LEASE ---
  public async updateLease(leaseId: string, data: UpdateLeaseDto) {
    const lease = await prisma.lease.findUnique({ where: { id: leaseId } });
    if (!lease) throw new BadRequestError("Lease not found.");
    if (lease.status !== LeaseStatus.ACTIVE) {
      throw new BadRequestError(
        "Only active leases can be edited. Use renew to create a new lease.",
      );
    }

    return await prisma.lease.update({
      where: { id: leaseId },
      data: {
        ...(data.rentAmount !== undefined && { rentAmount: data.rentAmount }),
        ...(data.serviceCharge !== undefined && {
          serviceCharge: data.serviceCharge,
        }),
        ...(data.startDate !== undefined && {
          startDate: new Date(data.startDate),
        }),
        ...(data.endDate !== undefined && { endDate: new Date(data.endDate) }),
        ...(data.moveOutNotice !== undefined && {
          moveOutNotice: data.moveOutNotice,
        }),
        ...(data.documentUrl !== undefined && {
          documentUrl: data.documentUrl,
        }),
      },
    });
  }

  // --- RENEW INACTIVE LEASE ---
  public async renewLease(leaseId: string, data: RenewLeaseDto) {
    const previousLease = await prisma.lease.findUnique({
      where: { id: leaseId },
    });
    if (!previousLease) throw new BadRequestError("Lease not found.");
    if (previousLease.status === LeaseStatus.ACTIVE) {
      throw new BadRequestError(
        "Lease is still active. Use edit to update it instead.",
      );
    }

    return await prisma.$transaction(async (tx) => {
      const newLease = await tx.lease.create({
        data: {
          tenantId: previousLease.tenantId,
          unitId: previousLease.unitId,
          rentAmount: data.rentAmount ?? previousLease.rentAmount,
          serviceCharge:
            data.serviceCharge ?? previousLease.serviceCharge ?? 0,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          moveOutNotice: data.moveOutNotice ?? previousLease.moveOutNotice,
          documentUrl: data.documentUrl ?? previousLease.documentUrl,
          status: LeaseStatus.ACTIVE,
        },
      });

      await tx.unit.update({
        where: { id: previousLease.unitId },
        data: { status: UnitStatus.OCCUPIED },
      });

      return newLease;
    });
  }
}
